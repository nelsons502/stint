import { create } from 'zustand'
import type { TimerSnapshot } from '../../../shared/api'

const initialState: TimerSnapshot = {
  activeContextId: null,
  activeStartedAtMs: null,
  sessionDate: '',
  contexts: []
}

// The renderer-side cache of state owned by the main process.
// Updates flow in one direction: main -> IPC -> setState here.
// Components dispatch commands through window.api.* (which goes back to main);
// they never setState directly.
export const useTimerStore = create<TimerSnapshot>(() => initialState)

/**
 * Computes live "today" seconds for a context, including the in-progress
 * run if it is the active one. Pure function so it can be called from
 * components without state churn.
 */
export function liveSeconds(
  contextId: string,
  contextTodaySeconds: number,
  state: Pick<TimerSnapshot, 'activeContextId' | 'activeStartedAtMs'>,
  now: number
): number {
  if (
    contextId === state.activeContextId &&
    state.activeStartedAtMs !== null
  ) {
    return contextTodaySeconds + (now - state.activeStartedAtMs) / 1000
  }
  return contextTodaySeconds
}

/** Wires the IPC bridge into the store. Call once on app mount. */
export function bindIpcToStore(): () => void {
  // Push the initial snapshot in.
  void window.api.getSnapshot().then((snap) => useTimerStore.setState(snap))
  // Subscribe to subsequent broadcasts.
  return window.api.onStateChanged((snap) => useTimerStore.setState(snap))
}
