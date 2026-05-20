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
import type { AddContextInput, AutoSaveConfig } from '../../shared/api'
import { parseCsv } from '../../shared/csv'

/**
 * Wires command handlers and state broadcasts between TimerService and the
 * renderer process(es). `getPendingRecovery` returns the RecoveryInfo from
 * the most recent init() until finalizeRecovery() is called.
 */
export function registerIpcBridge(
  timer: TimerService,
  db: Kysely<DB>,
  autoSaver: AutoSaver,
  pendingRecovery: { current: RecoveryInfo | null }
): () => void {
  // Timer commands
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

  // CSV
  ipcMain.handle(
    CMD.ExportCsv,
    async (
      _e,
      args: { suggestedFilename: string; content: string }
    ): Promise<string | null> => {
      const focused = BrowserWindow.getFocusedWindow()
      const result = focused
        ? await dialog.showSaveDialog(focused, {
            defaultPath: args.suggestedFilename,
            filters: [{ name: 'CSV', extensions: ['csv'] }]
          })
        : await dialog.showSaveDialog({
            defaultPath: args.suggestedFilename,
            filters: [{ name: 'CSV', extensions: ['csv'] }]
          })
      if (result.canceled || !result.filePath) return null
      await fs.writeFile(result.filePath, args.content, 'utf8')
      return result.filePath
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
      // Group by date so archiveDay can upsert atomically per date.
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
