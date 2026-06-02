import { Kysely } from 'kysely'
import type { DB } from './schema'

export interface Goal {
  contextId: string
  targetSecondsPerWeek: number
  lastHitWeek: string | null
  targetSecondsPerDay: number | null
  lastHitDay: string | null
  createdAt: number
}

function rowToGoal(r: {
  context_id: string
  target_seconds_per_week: number
  last_hit_week: string | null
  target_seconds_per_day: number | null
  last_hit_day: string | null
  created_at: number
}): Goal {
  return {
    contextId: r.context_id,
    targetSecondsPerWeek: r.target_seconds_per_week,
    lastHitWeek: r.last_hit_week,
    targetSecondsPerDay: r.target_seconds_per_day,
    lastHitDay: r.last_hit_day,
    createdAt: r.created_at
  }
}

export async function listGoals(db: Kysely<DB>): Promise<Goal[]> {
  const rows = await db.selectFrom('goals').selectAll().execute()
  return rows.map(rowToGoal)
}

export async function getGoal(
  db: Kysely<DB>,
  contextId: string
): Promise<Goal | null> {
  const r = await db
    .selectFrom('goals')
    .selectAll()
    .where('context_id', '=', contextId)
    .executeTakeFirst()
  if (!r) return null
  return rowToGoal(r)
}

export async function setGoal(
  db: Kysely<DB>,
  contextId: string,
  targetSecondsPerWeek: number,
  targetSecondsPerDay?: number | null
): Promise<void> {
  if (targetSecondsPerWeek <= 0) {
    throw new Error('target must be positive')
  }
  const daily =
    targetSecondsPerDay != null && targetSecondsPerDay > 0
      ? Math.round(targetSecondsPerDay)
      : null
  await db
    .insertInto('goals')
    .values({
      context_id: contextId,
      target_seconds_per_week: Math.round(targetSecondsPerWeek),
      last_hit_week: null,
      target_seconds_per_day: daily,
      last_hit_day: null,
      created_at: Date.now()
    })
    .onConflict((oc) =>
      oc.column('context_id').doUpdateSet({
        target_seconds_per_week: Math.round(targetSecondsPerWeek),
        target_seconds_per_day: daily
      })
    )
    .execute()
}

export async function deleteGoal(
  db: Kysely<DB>,
  contextId: string
): Promise<void> {
  await db.deleteFrom('goals').where('context_id', '=', contextId).execute()
}

/** Marks a goal as hit for the given week-start (YYYY-MM-DD). */
export async function markGoalHit(
  db: Kysely<DB>,
  contextId: string,
  weekStart: string
): Promise<void> {
  await db
    .updateTable('goals')
    .set({ last_hit_week: weekStart })
    .where('context_id', '=', contextId)
    .execute()
}

/** Marks a daily goal as hit for the given date (YYYY-MM-DD). */
export async function markDailyGoalHit(
  db: Kysely<DB>,
  contextId: string,
  date: string
): Promise<void> {
  await db
    .updateTable('goals')
    .set({ last_hit_day: date })
    .where('context_id', '=', contextId)
    .execute()
}
