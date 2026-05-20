import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CMD, EVT } from '../main/ipc/channels'
import type {
  StintAPI,
  TimerSnapshot,
  AddContextInput,
  RecoveryChoice
} from '../shared/api'

const api: StintAPI = {
  getSnapshot: () => ipcRenderer.invoke(CMD.GetSnapshot),
  switchTo: (contextId) => ipcRenderer.invoke(CMD.SwitchTo, contextId),
  pause: () => ipcRenderer.invoke(CMD.Pause),
  addContext: (input: AddContextInput) =>
    ipcRenderer.invoke(CMD.AddContext, input),
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
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  ;(window as unknown as { api: StintAPI }).api = api
}
