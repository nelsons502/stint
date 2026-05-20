import { EventEmitter } from 'node:events'
import type { Kysely } from 'kysely'
import type { DB } from '../db/schema'
import {
  listContexts,
  createContext,
  deleteNonRecurring
} from '../db/contexts'
import { getSession, setSession, type Session } from '../db/session'
import {
  getAllTodaySeconds,
  addTodaySeconds,
  setTodaySeconds,
  resetAllTodaySeconds
} from '../db/today'
import { archiveDay, type ArchiveEntry } from '../db/logs'
import type {
  ContextWithSeconds,
  TimerSnapshot,
  RecoveryInfo,
  RecoveryChoice
} from '../../shared/api'

export type {
  ContextWithSeconds,
  TimerSnapshot,
  RecoveryInfo,
  RecoveryChoice
}

/** Format a Date as YYYY-MM-DD in local time. */
function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export interface TimerServiceEvents {
  'state-changed': [TimerSnapshot]
}

export class TimerService extends EventEmitter<TimerServiceEvents> {
  private contexts: ContextWithSeconds[] = []
  private activeContextId: string | null = null
  private activeStartedAtMs: number | null = null
  private sessionDate: string = ''
  private initialized = false

  constructor(
    private readonly db: Kysely<DB>,
    private readonly clock: () => number = Date.now
  ) {
    super()
  }

  /**
   * Loads persisted state into memory. If a timer was active when the previous
   * process exited, returns RecoveryInfo and leaves the timer paused locally
   * (the DB session row is left as-is until finalizeRecovery() is called).
   */
  async init(): Promise<RecoveryInfo | null> {
    const [contexts, secondsMap, session] = await Promise.all([
      listContexts(this.db),
      getAllTodaySeconds(this.db),
      getSession(this.db)
    ])

    this.contexts = contexts.map((c) => ({
      ...c,
      todaySeconds: secondsMap.get(c.id) ?? 0
    }))

    const today = localDateString(new Date(this.clock()))
    if (!session) {
      this.sessionDate = today
      this.activeContextId = null
      this.activeStartedAtMs = null
      await setSession(this.db, this.toSessionRow())
      this.initialized = true
      return null
    }

    this.sessionDate = session.sessionDate

    if (
      session.activeContextId !== null &&
      session.activeStartedAtMs !== null
    ) {
      const ctx = this.contexts.find((c) => c.id === session.activeContextId)
      if (ctx) {
        const recovery: RecoveryInfo = {
          activeContextId: ctx.id,
          activeContextName: ctx.name,
          activeStartedAtMs: session.activeStartedAtMs,
          elapsedSinceStartSeconds:
            (this.clock() - session.activeStartedAtMs) / 1000
        }
        // Hold the recovery state in DB but report it. The local activeContextId
        // stays null until the caller resolves recovery.
        this.activeContextId = null
        this.activeStartedAtMs = null
        this.initialized = true
        return recovery
      }
    }

    this.activeContextId = null
    this.activeStartedAtMs = null
    this.initialized = true
    return null
  }

  async finalizeRecovery(choice: RecoveryChoice): Promise<void> {
    this.assertInit()
    const session = await getSession(this.db)
    if (
      !session ||
      session.activeContextId === null ||
      session.activeStartedAtMs === null
    ) {
      // Nothing to recover. Idempotent no-op.
      return
    }
    const now = this.clock()
    const ctx = this.contexts.find((c) => c.id === session.activeContextId)
    if (!ctx) {
      // The context was deleted between sessions — drop the recovery.
      await setSession(this.db, this.toSessionRow())
      this.emitSnapshot()
      return
    }

    if (choice === 'discard') {
      this.activeContextId = null
      this.activeStartedAtMs = null
      await setSession(this.db, this.toSessionRow())
      this.emitSnapshot()
      return
    }

    if (choice === 'resume-since') {
      // Credit the time between the previous start and now to the context,
      // then immediately start a fresh run from now.
      const elapsed = (now - session.activeStartedAtMs) / 1000
      await addTodaySeconds(this.db, ctx.id, elapsed)
      ctx.todaySeconds += Math.round(elapsed)
      this.activeContextId = ctx.id
      this.activeStartedAtMs = now
      await setSession(this.db, this.toSessionRow())
      this.emitSnapshot()
      return
    }

    // resume-now: forfeit the gap, start a fresh run from now.
    this.activeContextId = ctx.id
    this.activeStartedAtMs = now
    await setSession(this.db, this.toSessionRow())
    this.emitSnapshot()
  }

  getSnapshot(): TimerSnapshot {
    this.assertInit()
    return {
      activeContextId: this.activeContextId,
      activeStartedAtMs: this.activeStartedAtMs,
      sessionDate: this.sessionDate,
      contexts: this.contexts.map((c) => ({ ...c }))
    }
  }

  /**
   * Switches to a context. If `contextId` is already active, this is a no-op.
   * If `contextId` is null, pauses (same as pause()).
   */
  async switchTo(contextId: string | null): Promise<void> {
    this.assertInit()
    if (contextId === this.activeContextId) return
    if (contextId !== null) {
      const exists = this.contexts.find((c) => c.id === contextId)
      if (!exists) throw new Error(`Unknown context: ${contextId}`)
    }
    const now = this.clock()
    await this.commitActiveRun(now)
    this.activeContextId = contextId
    this.activeStartedAtMs = contextId === null ? null : now
    await setSession(this.db, this.toSessionRow())
    this.emitSnapshot()
  }

  async pause(): Promise<void> {
    await this.switchTo(null)
  }

  async addContext(input: {
    name: string
    isRecurring: boolean
    startImmediately?: boolean
  }): Promise<ContextWithSeconds> {
    this.assertInit()
    const created = await createContext(this.db, {
      name: input.name,
      isRecurring: input.isRecurring
    })
    const withSeconds: ContextWithSeconds = { ...created, todaySeconds: 0 }
    this.contexts.push(withSeconds)
    this.contexts.sort((a, b) =>
      a.sortOrder === b.sortOrder
        ? a.createdAt - b.createdAt
        : a.sortOrder - b.sortOrder
    )
    if (input.startImmediately) {
      await this.switchTo(created.id)
    } else {
      this.emitSnapshot()
    }
    return withSeconds
  }

  /** Manually edits a context's today seconds (Today tab inline edit). */
  async setContextSeconds(
    contextId: string,
    seconds: number
  ): Promise<void> {
    this.assertInit()
    const ctx = this.contexts.find((c) => c.id === contextId)
    if (!ctx) throw new Error(`Unknown context: ${contextId}`)

    // If this is the active context, commit the in-progress run first so the
    // edit is unambiguous. The new run resets from the edited baseline.
    if (this.activeContextId === contextId) {
      const now = this.clock()
      await this.commitActiveRun(now)
      this.activeStartedAtMs = now
      await setSession(this.db, this.toSessionRow())
    }
    const clamped = Math.max(0, Math.round(seconds))
    await setTodaySeconds(this.db, contextId, clamped)
    ctx.todaySeconds = clamped
    this.emitSnapshot()
  }

  /**
   * Archives the day, clears today_seconds, removes ad-hoc contexts, and
   * leaves the session paused on the new date. The caller passes `date` to
   * support archiving as a different date (the spec allows editing the date
   * before confirming Save & Reset).
   */
  async saveAndReset(date?: string): Promise<void> {
    this.assertInit()
    const now = this.clock()
    await this.commitActiveRun(now)
    this.activeContextId = null
    this.activeStartedAtMs = null

    const archiveDate = date ?? this.sessionDate
    const entries: ArchiveEntry[] = this.contexts
      .filter((c) => c.todaySeconds > 0)
      .map((c) => ({
        contextId: c.id,
        contextName: c.name,
        durationSeconds: c.todaySeconds
      }))

    await this.db.transaction().execute(async (trx) => {
      await archiveDay(trx, archiveDate, entries)
      await resetAllTodaySeconds(trx)
      await deleteNonRecurring(trx)
      this.sessionDate = localDateString(new Date(now))
      await setSession(trx, this.toSessionRow())
    })

    // Reload from DB to pick up the post-reset state.
    const [contexts, secondsMap] = await Promise.all([
      listContexts(this.db),
      getAllTodaySeconds(this.db)
    ])
    this.contexts = contexts.map((c) => ({
      ...c,
      todaySeconds: secondsMap.get(c.id) ?? 0
    }))
    this.emitSnapshot()
  }

  private async commitActiveRun(now: number): Promise<void> {
    if (this.activeContextId === null || this.activeStartedAtMs === null) {
      return
    }
    const ctx = this.contexts.find((c) => c.id === this.activeContextId)
    if (!ctx) return
    const elapsed = (now - this.activeStartedAtMs) / 1000
    if (elapsed <= 0) return
    await addTodaySeconds(this.db, ctx.id, elapsed)
    ctx.todaySeconds += Math.round(elapsed)
  }

  private toSessionRow(): Session {
    return {
      activeContextId: this.activeContextId,
      activeStartedAtMs: this.activeStartedAtMs,
      sessionDate: this.sessionDate
    }
  }

  private emitSnapshot(): void {
    this.emit('state-changed', this.getSnapshot())
  }

  private assertInit(): void {
    if (!this.initialized) {
      throw new Error('TimerService.init() must be called first')
    }
  }
}
