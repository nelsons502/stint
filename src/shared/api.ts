// Types shared between main, preload, and renderer. This module is the
// contract surface — keep it self-contained (no imports from main/* or
// renderer/*) so all three sides can include it cleanly.

export interface ContextWithSeconds {
  id: string
  name: string
  sortOrder: number
  isRecurring: boolean
  createdAt: number
  /** Committed seconds for today (excludes the in-progress run). */
  todaySeconds: number
}

export interface TimerSnapshot {
  activeContextId: string | null
  activeStartedAtMs: number | null
  sessionDate: string
  contexts: ContextWithSeconds[]
}

export interface RecoveryInfo {
  activeContextId: string
  activeContextName: string
  activeStartedAtMs: number
  elapsedSinceStartSeconds: number
}

export type RecoveryChoice = 'discard' | 'resume-since' | 'resume-now'

export interface AddContextInput {
  name: string
  isRecurring: boolean
  startImmediately?: boolean
}

export interface AutoSaveConfig {
  enabled: boolean
  /** HH:MM in 24-hour local time. */
  time: string
}

export interface DailyLogEntry {
  date: string
  contextName: string
  durationSeconds: number
  contextId: string | null
  createdAt: number
}

export interface StintAPI {
  // Timer commands
  getSnapshot(): Promise<TimerSnapshot>
  switchTo(contextId: string): Promise<void>
  pause(): Promise<void>
  addContext(input: AddContextInput): Promise<void>
  reorderContexts(orderedIds: string[]): Promise<void>
  deleteContext(contextId: string): Promise<void>
  setContextSeconds(contextId: string, seconds: number): Promise<void>
  saveAndReset(date?: string): Promise<void>
  finalizeRecovery(choice: RecoveryChoice): Promise<void>
  getPendingRecovery(): Promise<RecoveryInfo | null>
  /** Subscribe to state-changed events. Returns an unsubscribe function. */
  onStateChanged(handler: (snap: TimerSnapshot) => void): () => void

  // Settings
  getAutoSaveConfig(): Promise<AutoSaveConfig>
  setAutoSaveConfig(config: AutoSaveConfig): Promise<void>

  // History / logs
  getLogDates(): Promise<string[]>
  getLogsByDate(date: string): Promise<DailyLogEntry[]>
  getLogsByDateRange(start: string, end: string): Promise<DailyLogEntry[]>
  updateLogDuration(
    date: string,
    contextName: string,
    durationSeconds: number
  ): Promise<void>
  deleteLogEntry(date: string, contextName: string): Promise<void>
  deleteLogsForDate(date: string): Promise<void>

  // CSV
  exportCsv(args: {
    suggestedFilename: string
    content: string
  }): Promise<string | null>
  importCsv(): Promise<{
    imported: number
    errors: { line: number; message: string }[]
    path: string | null
  }>
}

declare global {
  interface Window {
    api: StintAPI
  }
}
