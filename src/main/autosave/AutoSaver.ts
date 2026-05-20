import type { Kysely } from 'kysely'
import type { DB } from '../db/schema'
import { getAutoSaveConfig, setAutoSaveConfig, type AutoSaveConfig } from '../db/settings'
import type { TimerService } from '../timer/TimerService'
import { computeNextFireTime } from './scheduling'

function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Schedules timer.saveAndReset() at the configured wall-clock time each day.
 *
 * On start(), also handles the "missed window" case: if the app was closed
 * past the configured save time, AutoSaver triggers a save now under the
 * session's logical date so yesterday's work doesn't bleed into today's log.
 *
 * setTimeout uses real elapsed time; if the system sleeps through the
 * scheduled instant, the timeout fires when the system wakes. The active
 * run is committed at that wake-up moment by saveAndReset(), which is
 * the correct accounting for "the timer was running through the sleep".
 */
export class AutoSaver {
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null
  private config: AutoSaveConfig | null = null

  constructor(
    private readonly db: Kysely<DB>,
    private readonly timer: TimerService,
    private readonly clock: () => number = Date.now
  ) {}

  async start(): Promise<void> {
    this.config = await getAutoSaveConfig(this.db)
    if (this.config.enabled) {
      await this.checkMissedWindow()
    }
    this.schedule()
  }

  /** Returns the current config snapshot (used by IPC for getSettings). */
  getConfig(): AutoSaveConfig {
    return this.config ?? { enabled: false, time: '03:00' }
  }

  async updateConfig(next: AutoSaveConfig): Promise<void> {
    await setAutoSaveConfig(this.db, next)
    this.config = next
    this.schedule()
  }

  stop(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
  }

  private schedule(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle)
      this.timeoutHandle = null
    }
    if (!this.config?.enabled) return
    const now = this.clock()
    const next = computeNextFireTime(this.config.time, now)
    const delay = Math.max(0, next - now)
    this.timeoutHandle = setTimeout(() => {
      void this.fire()
    }, delay)
  }

  private async fire(): Promise<void> {
    try {
      await this.timer.saveAndReset()
    } finally {
      // Reschedule for the next day's fire regardless of save outcome —
      // we don't want a one-shot failure to disable auto-save.
      this.schedule()
    }
  }

  /**
   * If the session's logical date is in the past (the app was closed across
   * an auto-save instant), archive that day's accumulated time now, under
   * its own date, so it doesn't bleed into today.
   */
  private async checkMissedWindow(): Promise<void> {
    const snap = this.timer.getSnapshot()
    const today = localDateString(new Date(this.clock()))
    if (snap.sessionDate === today) return
    // saveAndReset filters zero-duration contexts, so the no-activity case
    // becomes a silent date-bump rather than a blank log.
    await this.timer.saveAndReset(snap.sessionDate)
  }
}
