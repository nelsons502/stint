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

export interface HotkeysConfig {
  openDropdown: string
  pause: string
  openMain: string
  /** Template with literal '{N}', replaced 1..9 at registration time. */
  quickSwitch: string
  /** Master switch — if false, no global shortcuts get registered. */
  enabled: boolean
}

export type WeekStartDay = 'sunday' | 'monday'

export interface AppSettings {
  autoSave: AutoSaveConfig
  startAtLogin: boolean
  showInDock: boolean
  weekStart: WeekStartDay
  /** Default action of the inline Add form: false = Add only, true = Add & Start. */
  newContextStartImmediately: boolean
  /** Whether Save & Reset should show its confirmation dialog. */
  promptBeforeSave: boolean
  hotkeys: HotkeysConfig
}

export const DEFAULT_HOTKEYS: HotkeysConfig = {
  openDropdown: 'CommandOrControl+Shift+T',
  pause: 'CommandOrControl+Shift+P',
  openMain: 'CommandOrControl+Shift+L',
  quickSwitch: 'CommandOrControl+Shift+{N}',
  enabled: true
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  autoSave: { enabled: false, time: '03:00' },
  startAtLogin: false,
  showInDock: false,
  weekStart: 'sunday',
  newContextStartImmediately: false,
  promptBeforeSave: true,
  hotkeys: DEFAULT_HOTKEYS
}

export interface GoalProgress {
  contextId: string
  contextName: string
  targetSecondsPerWeek: number
  currentSeconds: number
  weekStart: string
  weekEnd: string
  hit: boolean
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
  getAppSettings(): Promise<AppSettings>
  updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings>
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

  // Goals + paywall
  listGoalProgress(): Promise<GoalProgress[]>
  setGoal(contextId: string, targetSecondsPerWeek: number): Promise<void>
  deleteGoal(contextId: string): Promise<void>
  getGoalsUnlocked(): Promise<boolean>
  setGoalsUnlocked(unlocked: boolean): Promise<void>

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

  // Data management
  exportAllCsv(): Promise<string | null>
  backupDatabase(): Promise<string | null>
  /** Wipes contexts/logs/goals/session and triggers an app relaunch. */
  clearAllData(): Promise<void>
}

declare global {
  interface Window {
    api: StintAPI
  }
}
