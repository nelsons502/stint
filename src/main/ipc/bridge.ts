import { ipcMain, BrowserWindow, webContents } from 'electron'
import type {
  TimerService,
  TimerSnapshot,
  RecoveryInfo,
  RecoveryChoice
} from '../timer/TimerService'
import { CMD, EVT } from './channels'
import type { AddContextInput } from '../../shared/api'

/**
 * Wires command handlers and state broadcasts between TimerService and the
 * renderer process(es). `getPendingRecovery` returns the RecoveryInfo from
 * the most recent init() until finalizeRecovery() is called.
 */
export function registerIpcBridge(
  timer: TimerService,
  pendingRecovery: { current: RecoveryInfo | null }
): () => void {
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

  const broadcast = (snap: TimerSnapshot): void => {
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed()) wc.send(EVT.StateChanged, snap)
    }
  }
  timer.on('state-changed', broadcast)

  return () => {
    timer.off('state-changed', broadcast)
    ipcMain.removeHandler(CMD.GetSnapshot)
    ipcMain.removeHandler(CMD.SwitchTo)
    ipcMain.removeHandler(CMD.Pause)
    ipcMain.removeHandler(CMD.AddContext)
    ipcMain.removeHandler(CMD.SetContextSeconds)
    ipcMain.removeHandler(CMD.SaveAndReset)
    ipcMain.removeHandler(CMD.GetPendingRecovery)
    ipcMain.removeHandler(CMD.FinalizeRecovery)
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
