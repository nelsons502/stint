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

export interface StintAPI {
  getSnapshot(): Promise<TimerSnapshot>
  switchTo(contextId: string): Promise<void>
  pause(): Promise<void>
  addContext(input: AddContextInput): Promise<void>
  setContextSeconds(contextId: string, seconds: number): Promise<void>
  saveAndReset(date?: string): Promise<void>
  finalizeRecovery(choice: RecoveryChoice): Promise<void>
  getPendingRecovery(): Promise<RecoveryInfo | null>
  /** Subscribe to state-changed events. Returns an unsubscribe function. */
  onStateChanged(handler: (snap: TimerSnapshot) => void): () => void
}

declare global {
  interface Window {
    api: StintAPI
  }
}
