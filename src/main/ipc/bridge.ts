import { ipcMain, BrowserWindow, dialog, webContents } from 'electron'
import { promises as fs } from 'node:fs'
import type { Kysely } from 'kysely'
import type {
  TimerService,
  TimerSnapshot,
  RecoveryInfo,
  RecoveryChoice
} from '../timer/TimerService'
import type { DB } from '../db/schema'
import type { AutoSaver } from '../autosave/AutoSaver'
import type { GoalsService } from '../goals/GoalsService'
import {
  getLogDates,
  getLogsByDate,
  getLogsByDateRange,
  updateLogDuration,
  deleteLogEntry,
  deleteLogsForDate,
  archiveDay
} from '../db/logs'
import { CMD, EVT } from './channels'
import {
  getAppSettings,
  updateAppSettings,
  getGoalsUnlocked,
  setGoalsUnlocked
} from '../db/settings'
import type {
  AddContextInput,
  AppSettings,
  AutoSaveConfig
} from '../../shared/api'
import { parseCsv, toCsv } from '../../shared/csv'

export interface IpcDeps {
  timer: TimerService
  db: Kysely<DB>
  dbPath: string
  autoSaver: AutoSaver
  goalsService: GoalsService
  onSettingsApplied: (
    next: AppSettings,
    patch: Partial<AppSettings>
  ) => Promise<void>
  /** Called after ClearAllData; expected to relaunch the app. */
  onClearAllData: () => void
}

/**
 * Wires every IPC channel against the corresponding service. Returns a
 * teardown that removes every handler.
 */
export function registerIpcBridge(
  deps: IpcDeps,
  pendingRecovery: { current: RecoveryInfo | null }
): () => void {
  const { timer, db, dbPath, autoSaver, goalsService, onSettingsApplied, onClearAllData } =
    deps

  // Timer
  ipcMain.handle(CMD.GetSnapshot, () => timer.getSnapshot())
  ipcMain.handle(CMD.SwitchTo, (_e, contextId: string) =>
    timer.switchTo(contextId)
  )
  ipcMain.handle(CMD.Pause, () => timer.pause())
  ipcMain.handle(CMD.AddContext, (_e, input: AddContextInput) =>
    timer.addContext(input).then(() => undefined)
  )
  ipcMain.handle(CMD.ReorderContexts, (_e, orderedIds: string[]) =>
    timer.reorderContexts(orderedIds)
  )
  ipcMain.handle(CMD.DeleteContext, (_e, contextId: string) =>
    timer.deleteContext(contextId)
  )
  ipcMain.handle(
    CMD.RenameContext,
    (_e, contextId: string, newName: string) =>
      timer.renameContext(contextId, newName)
  )
  ipcMain.handle(
    CMD.SetContextRecurring,
    (_e, contextId: string, isRecurring: boolean) =>
      timer.setContextRecurring(contextId, isRecurring)
  )
  ipcMain.handle(
    CMD.SetContextSeconds,
    (_e, contextId: string, seconds: number) =>
      timer.setContextSeconds(contextId, seconds)
  )
  ipcMain.handle(CMD.SaveAndReset, (_e, date?: string) =>
    timer.saveAndReset(date)
  )
  ipcMain.handle(CMD.GetPendingRecovery, () => pendingRecovery.current)
  ipcMain.handle(CMD.FinalizeRecovery, async (_e, choice: RecoveryChoice) => {
    await timer.finalizeRecovery(choice)
    pendingRecovery.current = null
  })

  // Settings
  ipcMain.handle(CMD.GetAppSettings, () => getAppSettings(db))
  ipcMain.handle(
    CMD.UpdateAppSettings,
    async (_e, patch: Partial<AppSettings>): Promise<AppSettings> => {
      const next = await updateAppSettings(db, patch)
      await onSettingsApplied(next, patch)
      return next
    }
  )
  ipcMain.handle(CMD.GetAutoSaveConfig, () => autoSaver.getConfig())
  ipcMain.handle(CMD.SetAutoSaveConfig, (_e, c: AutoSaveConfig) =>
    autoSaver.updateConfig(c)
  )

  // History / logs
  ipcMain.handle(CMD.GetLogDates, () => getLogDates(db))
  ipcMain.handle(CMD.GetLogsByDate, (_e, date: string) =>
    getLogsByDate(db, date)
  )
  ipcMain.handle(
    CMD.GetLogsByDateRange,
    (_e, start: string, end: string) => getLogsByDateRange(db, start, end)
  )
  ipcMain.handle(
    CMD.UpdateLogDuration,
    (_e, date: string, contextName: string, durationSeconds: number) =>
      updateLogDuration(db, date, contextName, durationSeconds)
  )
  ipcMain.handle(CMD.DeleteLogEntry, (_e, date: string, contextName: string) =>
    deleteLogEntry(db, date, contextName)
  )
  ipcMain.handle(CMD.DeleteLogsForDate, async (_e, date: string) => {
    await deleteLogsForDate(db, date)
  })

  // Goals + paywall
  ipcMain.handle(CMD.ListGoalProgress, () => goalsService.listProgress())
  ipcMain.handle(
    CMD.SetGoal,
    (_e, contextId: string, targetSecondsPerWeek: number) =>
      goalsService.setGoal(contextId, targetSecondsPerWeek)
  )
  ipcMain.handle(CMD.DeleteGoal, (_e, contextId: string) =>
    goalsService.deleteGoal(contextId)
  )
  ipcMain.handle(CMD.GetGoalsUnlocked, () => getGoalsUnlocked(db))
  ipcMain.handle(CMD.SetGoalsUnlocked, (_e, unlocked: boolean) =>
    setGoalsUnlocked(db, unlocked)
  )

  // CSV
  ipcMain.handle(
    CMD.ExportCsv,
    async (
      _e,
      args: { suggestedFilename: string; content: string }
    ): Promise<string | null> => {
      return showSaveDialogAndWrite(args.suggestedFilename, args.content)
    }
  )
  ipcMain.handle(
    CMD.ImportCsv,
    async (): Promise<{
      imported: number
      errors: { line: number; message: string }[]
      path: string | null
    }> => {
      const focused = BrowserWindow.getFocusedWindow()
      const result = focused
        ? await dialog.showOpenDialog(focused, {
            filters: [{ name: 'CSV', extensions: ['csv'] }],
            properties: ['openFile']
          })
        : await dialog.showOpenDialog({
            filters: [{ name: 'CSV', extensions: ['csv'] }],
            properties: ['openFile']
          })
      if (result.canceled || result.filePaths.length === 0) {
        return { imported: 0, errors: [], path: null }
      }
      const path = result.filePaths[0]!
      const content = await fs.readFile(path, 'utf8')
      const parsed = parseCsv(content)
      const byDate = new Map<
        string,
        { contextId: string | null; contextName: string; durationSeconds: number }[]
      >()
      for (const row of parsed.rows) {
        const list = byDate.get(row.date) ?? []
        list.push({
          contextId: null,
          contextName: row.context,
          durationSeconds: row.durationSeconds
        })
        byDate.set(row.date, list)
      }
      let imported = 0
      for (const [date, entries] of byDate) {
        await archiveDay(db, date, entries)
        imported += entries.length
      }
      return { imported, errors: parsed.errors, path }
    }
  )

  // Data management
  ipcMain.handle(CMD.ExportAllCsv, async (): Promise<string | null> => {
    const all = await db
      .selectFrom('daily_logs')
      .selectAll()
      .orderBy('date', 'asc')
      .orderBy('context_name', 'asc')
      .execute()
    const csv = toCsv(
      all.map((l) => ({
        date: l.date,
        context: l.context_name,
        durationSeconds: l.duration_seconds
      }))
    )
    return showSaveDialogAndWrite('stint-all.csv', csv)
  })

  ipcMain.handle(CMD.BackupDatabase, async (): Promise<string | null> => {
    const focused = BrowserWindow.getFocusedWindow()
    const ts = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[:T]/g, '-')
    const suggested = `stint-backup-${ts}.db`
    const result = focused
      ? await dialog.showSaveDialog(focused, {
          defaultPath: suggested,
          filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
        })
      : await dialog.showSaveDialog({
          defaultPath: suggested,
          filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
        })
    if (result.canceled || !result.filePath) return null
    await fs.copyFile(dbPath, result.filePath)
    return result.filePath
  })

  ipcMain.handle(CMD.ClearAllData, async (): Promise<void> => {
    await db.transaction().execute(async (trx) => {
      // Order matters for FK constraints, but all our FKs cascade/set-null
      // so any order works. Preserve app_settings (auto-save config, paywall
      // unlock, hotkeys, etc.) so the user doesn't lose their preferences.
      await trx.deleteFrom('goals').execute()
      await trx.deleteFrom('daily_logs').execute()
      await trx.deleteFrom('today_seconds').execute()
      await trx.deleteFrom('contexts').execute()
      await trx.deleteFrom('session').execute()
    })
    onClearAllData()
  })

  // State broadcast
  const broadcast = (snap: TimerSnapshot): void => {
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) wc.send(EVT.StateChanged, snap)
    }
  }
  timer.on('state-changed', broadcast)

  return () => {
    timer.off('state-changed', broadcast)
    for (const ch of Object.values(CMD)) ipcMain.removeHandler(ch)
  }
}

async function showSaveDialogAndWrite(
  suggestedFilename: string,
  content: string
): Promise<string | null> {
  const focused = BrowserWindow.getFocusedWindow()
  const result = focused
    ? await dialog.showSaveDialog(focused, {
        defaultPath: suggestedFilename,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
    : await dialog.showSaveDialog({
        defaultPath: suggestedFilename,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
  if (result.canceled || !result.filePath) return null
  await fs.writeFile(result.filePath, content, 'utf8')
  return result.filePath
}

/** Helper to send an initial snapshot to a freshly-created window. */
export function sendInitialSnapshot(
  win: BrowserWindow,
  timer: TimerService
): void {
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.webContents.send(EVT.StateChanged, timer.getSnapshot())
    }
  })
}
