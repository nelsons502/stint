import { ipcMain, BrowserWindow, webContents } from 'electron'
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
  updateLogDuration,
  deleteLogEntry,
  deleteLogsForDate
} from '../db/logs'
import { CMD, EVT } from './channels'
import type { AddContextInput, AutoSaveConfig } from '../../shared/api'

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
