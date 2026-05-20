import { Kysely } from 'kysely'
import type { DB } from './schema'

export interface Goal {
  contextId: string
  targetSecondsPerWeek: number
  lastHitWeek: string | null
  createdAt: number
}

export async function listGoals(db: Kysely<DB>): Promise<Goal[]> {
  const rows = await db.selectFrom('goals').selectAll().execute()
  return rows.map((r) => ({
    contextId: r.context_id,
    targetSecondsPerWeek: r.target_seconds_per_week,
    lastHitWeek: r.last_hit_week,
    createdAt: r.created_at
  }))
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
  return {
    contextId: r.context_id,
    targetSecondsPerWeek: r.target_seconds_per_week,
    lastHitWeek: r.last_hit_week,
    createdAt: r.created_at
  }
}

export async function setGoal(
  db: Kysely<DB>,
  contextId: string,
  targetSecondsPerWeek: number
): Promise<void> {
  if (targetSecondsPerWeek <= 0) {
    throw new Error('target must be positive')
  }
  await db
    .insertInto('goals')
    .values({
      context_id: contextId,
      target_seconds_per_week: Math.round(targetSecondsPerWeek),
      last_hit_week: null,
      created_at: Date.now()
    })
    .onConflict((oc) =>
      oc.column('context_id').doUpdateSet({
        target_seconds_per_week: Math.round(targetSecondsPerWeek)
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
