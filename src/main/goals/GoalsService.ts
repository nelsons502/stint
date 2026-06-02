import type { Kysely } from 'kysely'
import type { DB } from '../db/schema'
import type { TimerService, TimerSnapshot } from '../timer/TimerService'
import {
  listGoals,
  setGoal as repoSetGoal,
  deleteGoal as repoDeleteGoal,
  markGoalHit,
  markDailyGoalHit
} from '../db/goals'
import {
  getLogsByDateRange
} from '../db/logs'
import { weekBoundsFor, type WeekStart } from '../../shared/reports'

export interface GoalProgress {
  contextId: string
  contextName: string
  targetSecondsPerWeek: number
  currentSeconds: number
  weekStart: string
  weekEnd: string
  /** True iff currentSeconds >= weekly target. */
  hit: boolean
  targetSecondsPerDay: number | null
  dailyCurrentSeconds: number | null
  dailyHit: boolean
}

export interface GoalHitEvent {
  contextName: string
  targetSecondsPerWeek: number
}

export interface DailyGoalHitEvent {
  contextName: string
  targetSecondsPerDay: number
}

export type Notifier = (event: GoalHitEvent) => void
export type DailyNotifier = (event: DailyGoalHitEvent) => void

/**
 * Owns goal evaluation. Listens to TimerService for state changes; on each,
 * computes per-goal progress for the current week and today, and fires
 * notifications for goals that cross their target threshold. Tracks
 * last_hit_week / last_hit_day in the DB to avoid double-notifying.
 */
export class GoalsService {
  private subscribed = false
  private weekStart: WeekStart = 'sunday'

  constructor(
    private readonly db: Kysely<DB>,
    private readonly timer: TimerService,
    private readonly notify: Notifier,
    private readonly clock: () => number = Date.now,
    private readonly notifyDaily: DailyNotifier = () => {}
  ) {}

  start(): void {
    if (this.subscribed) return
    this.timer.on('state-changed', this.onStateChanged)
    this.subscribed = true
    // Evaluate once on start to catch the case where the app launches
    // already past the target without a fresh state-changed event.
    void this.evaluate()
  }

  stop(): void {
    if (!this.subscribed) return
    this.timer.off('state-changed', this.onStateChanged)
    this.subscribed = false
  }

  setWeekStart(ws: WeekStart): void {
    this.weekStart = ws
  }

  async listProgress(): Promise<GoalProgress[]> {
    const snap = this.timer.getSnapshot()
    return this.computeProgress(snap)
  }

  async setGoal(
    contextId: string,
    targetSecondsPerWeek: number,
    targetSecondsPerDay?: number | null
  ): Promise<void> {
    await repoSetGoal(this.db, contextId, targetSecondsPerWeek, targetSecondsPerDay)
    await this.evaluate()
  }

  async deleteGoal(contextId: string): Promise<void> {
    await repoDeleteGoal(this.db, contextId)
  }

  private onStateChanged = (): void => {
    void this.evaluate()
  }

  private async evaluate(): Promise<void> {
    const snap = this.timer.getSnapshot()
    const progress = await this.computeProgress(snap)
    const goals = await listGoals(this.db)
    for (const p of progress) {
      const g = goals.find((x) => x.contextId === p.contextId)
      if (!g) continue

      if (p.hit && g.lastHitWeek !== p.weekStart) {
        await markGoalHit(this.db, p.contextId, p.weekStart)
        this.notify({
          contextName: p.contextName,
          targetSecondsPerWeek: p.targetSecondsPerWeek
        })
      }

      if (p.dailyHit && p.targetSecondsPerDay !== null) {
        const today = localDateString(new Date(this.clock()))
        if (g.lastHitDay !== today) {
          await markDailyGoalHit(this.db, p.contextId, today)
          this.notifyDaily({
            contextName: p.contextName,
            targetSecondsPerDay: p.targetSecondsPerDay
          })
        }
      }
    }
  }

  private async computeProgress(snap: TimerSnapshot): Promise<GoalProgress[]> {
    const goals = await listGoals(this.db)
    if (goals.length === 0) return []
    const now = this.clock()
    const today = localDateString(new Date(now))
    const bounds = weekBoundsFor(today, this.weekStart)
    const logs = await getLogsByDateRange(this.db, bounds.start, bounds.end)

    // Per-context committed seconds across the week's archived logs.
    const archivedTotals = new Map<string, number>()
    for (const l of logs) {
      // Match by name (preserved across rename) and id when available.
      const key = l.contextId ?? l.contextName
      archivedTotals.set(key, (archivedTotals.get(key) ?? 0) + l.durationSeconds)
    }

    // Add the in-progress live time for the active context.
    const liveByContext = new Map<string, number>()
    for (const c of snap.contexts) {
      const archived = archivedTotals.get(c.id) ?? 0
      const live =
        c.id === snap.activeContextId && snap.activeStartedAtMs !== null
          ? (now - snap.activeStartedAtMs) / 1000
          : 0
      // If today falls in this week (which is always true here), include
      // today's accumulated seconds too.
      const today = c.todaySeconds
      // But today's seconds may overlap with the archived day for today.
      // Today is not yet archived (saveAndReset hasn't run), so it's fine
      // to sum: archived covers all already-saved days in the week, today
      // covers the current in-flight day, live covers the in-flight run.
      liveByContext.set(c.id, archived + today + live)
    }

    return goals
      .map((g) => {
        const ctx = snap.contexts.find((c) => c.id === g.contextId)
        if (!ctx) return null
        const current = liveByContext.get(g.contextId) ?? 0
        const dailySeconds = ctx.todaySeconds +
          (ctx.id === snap.activeContextId && snap.activeStartedAtMs !== null
            ? (now - snap.activeStartedAtMs) / 1000
            : 0)
        return {
          contextId: g.contextId,
          contextName: ctx.name,
          targetSecondsPerWeek: g.targetSecondsPerWeek,
          currentSeconds: current,
          weekStart: bounds.start,
          weekEnd: bounds.end,
          hit: current >= g.targetSecondsPerWeek,
          targetSecondsPerDay: g.targetSecondsPerDay,
          dailyCurrentSeconds: g.targetSecondsPerDay !== null ? dailySeconds : null,
          dailyHit: g.targetSecondsPerDay !== null && dailySeconds >= g.targetSecondsPerDay
        } as GoalProgress
      })
      .filter((x): x is GoalProgress => x !== null)
  }
}

function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
