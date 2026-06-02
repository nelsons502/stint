import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CMD, EVT } from '../main/ipc/channels'
import type {
  StintAPI,
  TimerSnapshot,
  AddContextInput,
  RecoveryChoice,
  AutoSaveConfig
} from '../shared/api'

const api: StintAPI = {
  // Timer
  getSnapshot: () => ipcRenderer.invoke(CMD.GetSnapshot),
  switchTo: (contextId) => ipcRenderer.invoke(CMD.SwitchTo, contextId),
  pause: () => ipcRenderer.invoke(CMD.Pause),
  addContext: (input: AddContextInput) =>
    ipcRenderer.invoke(CMD.AddContext, input),
  reorderContexts: (ids) => ipcRenderer.invoke(CMD.ReorderContexts, ids),
  deleteContext: (id) => ipcRenderer.invoke(CMD.DeleteContext, id),
  renameContext: (id, name) => ipcRenderer.invoke(CMD.RenameContext, id, name),
  setContextRecurring: (id, recurring) =>
    ipcRenderer.invoke(CMD.SetContextRecurring, id, recurring),
  setContextSeconds: (id, seconds) =>
    ipcRenderer.invoke(CMD.SetContextSeconds, id, seconds),
  saveAndReset: (date) => ipcRenderer.invoke(CMD.SaveAndReset, date),
  finalizeRecovery: (choice: RecoveryChoice) =>
    ipcRenderer.invoke(CMD.FinalizeRecovery, choice),
  getPendingRecovery: () => ipcRenderer.invoke(CMD.GetPendingRecovery),
  onStateChanged: (handler) => {
    const wrapped = (_e: IpcRendererEvent, snap: TimerSnapshot): void =>
      handler(snap)
    ipcRenderer.on(EVT.StateChanged, wrapped)
    return () => ipcRenderer.removeListener(EVT.StateChanged, wrapped)
  },

  // Settings
  getAppSettings: () => ipcRenderer.invoke(CMD.GetAppSettings),
  updateAppSettings: (patch) => ipcRenderer.invoke(CMD.UpdateAppSettings, patch),
  getAutoSaveConfig: () => ipcRenderer.invoke(CMD.GetAutoSaveConfig),
  setAutoSaveConfig: (c: AutoSaveConfig) =>
    ipcRenderer.invoke(CMD.SetAutoSaveConfig, c),

  // History
  getLogDates: () => ipcRenderer.invoke(CMD.GetLogDates),
  getLogsByDate: (date) => ipcRenderer.invoke(CMD.GetLogsByDate, date),
  getLogsByDateRange: (start, end) =>
    ipcRenderer.invoke(CMD.GetLogsByDateRange, start, end),
  updateLogDuration: (date, name, seconds) =>
    ipcRenderer.invoke(CMD.UpdateLogDuration, date, name, seconds),
  deleteLogEntry: (date, name) =>
    ipcRenderer.invoke(CMD.DeleteLogEntry, date, name),
  deleteLogsForDate: (date) =>
    ipcRenderer.invoke(CMD.DeleteLogsForDate, date),

  // Goals + paywall
  listGoalProgress: () => ipcRenderer.invoke(CMD.ListGoalProgress),
  setGoal: (id, weekly, daily) => ipcRenderer.invoke(CMD.SetGoal, id, weekly, daily),
  deleteGoal: (id) => ipcRenderer.invoke(CMD.DeleteGoal, id),
  getGoalsUnlocked: () => ipcRenderer.invoke(CMD.GetGoalsUnlocked),
  setGoalsUnlocked: (u) => ipcRenderer.invoke(CMD.SetGoalsUnlocked, u),
  validateLicenseKey: (key) => ipcRenderer.invoke(CMD.ValidateLicenseKey, key),

  // CSV
  exportCsv: (args) => ipcRenderer.invoke(CMD.ExportCsv, args),
  importCsv: () => ipcRenderer.invoke(CMD.ImportCsv),

  // Data management
  exportAllCsv: () => ipcRenderer.invoke(CMD.ExportAllCsv),
  backupDatabase: () => ipcRenderer.invoke(CMD.BackupDatabase),
  clearAllData: () => ipcRenderer.invoke(CMD.ClearAllData)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  ;(window as unknown as { api: StintAPI }).api = api
}
