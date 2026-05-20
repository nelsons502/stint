import { create } from 'zustand'

export interface Context {
  id: string
  name: string
  /** committed accumulated time today, in seconds */
  todaySeconds: number
  /** display order; drives the Cmd+Shift+1..9 hotkey mapping */
  order: number
  /** recurring (defined in settings) vs ad-hoc (added on the fly) */
  recurring: boolean
}

export interface TimerState {
  /** null when paused */
  activeContextId: string | null
  /** unix ms when the current run began; null when paused */
  activeStartedAtMs: number | null
  contexts: Context[]
}

const initialState: TimerState = {
  activeContextId: null,
  activeStartedAtMs: null,
  contexts: []
}

// The renderer-side cache of state owned by the main process.
// Updates flow in one direction: main -> IPC -> setState here.
// All mutations originate from main; we never setState from React event handlers.
export const useTimerStore = create<TimerState>(() => initialState)
