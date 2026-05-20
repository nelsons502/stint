// Single source of truth for IPC channel names. Imported by main, preload,
// and (via the shared types in src/shared/api.ts) the renderer.

export const CMD = {
  GetSnapshot: 'stint:cmd:getSnapshot',
  SwitchTo: 'stint:cmd:switchTo',
  Pause: 'stint:cmd:pause',
  AddContext: 'stint:cmd:addContext',
  ReorderContexts: 'stint:cmd:reorderContexts',
  DeleteContext: 'stint:cmd:deleteContext',
  SetContextSeconds: 'stint:cmd:setContextSeconds',
  SaveAndReset: 'stint:cmd:saveAndReset',
  FinalizeRecovery: 'stint:cmd:finalizeRecovery',
  GetPendingRecovery: 'stint:cmd:getPendingRecovery',
  GetAutoSaveConfig: 'stint:cmd:getAutoSaveConfig',
  SetAutoSaveConfig: 'stint:cmd:setAutoSaveConfig',
  GetLogDates: 'stint:cmd:getLogDates',
  GetLogsByDate: 'stint:cmd:getLogsByDate',
  GetLogsByDateRange: 'stint:cmd:getLogsByDateRange',
  UpdateLogDuration: 'stint:cmd:updateLogDuration',
  DeleteLogEntry: 'stint:cmd:deleteLogEntry',
  DeleteLogsForDate: 'stint:cmd:deleteLogsForDate',
  ExportCsv: 'stint:cmd:exportCsv',
  ImportCsv: 'stint:cmd:importCsv',
  ListGoalProgress: 'stint:cmd:listGoalProgress',
  SetGoal: 'stint:cmd:setGoal',
  DeleteGoal: 'stint:cmd:deleteGoal',
  GetGoalsUnlocked: 'stint:cmd:getGoalsUnlocked',
  SetGoalsUnlocked: 'stint:cmd:setGoalsUnlocked'
} as const

export const EVT = {
  StateChanged: 'stint:evt:stateChanged'
} as const
