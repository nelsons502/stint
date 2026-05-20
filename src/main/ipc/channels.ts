// Single source of truth for IPC channel names. Imported by main, preload,
// and (via the shared types in src/shared/api.ts) the renderer.

export const CMD = {
  GetSnapshot: 'stint:cmd:getSnapshot',
  SwitchTo: 'stint:cmd:switchTo',
  Pause: 'stint:cmd:pause',
  AddContext: 'stint:cmd:addContext',
  SetContextSeconds: 'stint:cmd:setContextSeconds',
  SaveAndReset: 'stint:cmd:saveAndReset',
  FinalizeRecovery: 'stint:cmd:finalizeRecovery',
  GetPendingRecovery: 'stint:cmd:getPendingRecovery',
  GetAutoSaveConfig: 'stint:cmd:getAutoSaveConfig',
  SetAutoSaveConfig: 'stint:cmd:setAutoSaveConfig',
  GetLogDates: 'stint:cmd:getLogDates',
  GetLogsByDate: 'stint:cmd:getLogsByDate',
  UpdateLogDuration: 'stint:cmd:updateLogDuration',
  DeleteLogEntry: 'stint:cmd:deleteLogEntry',
  DeleteLogsForDate: 'stint:cmd:deleteLogsForDate'
} as const

export const EVT = {
  StateChanged: 'stint:evt:stateChanged'
} as const
