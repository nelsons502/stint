import { Kysely } from 'kysely'
import type { DB } from './schema'

/** Returns a map of contextId -> committed seconds for the current day. */
export async function getAllTodaySeconds(
  db: Kysely<DB>
): Promise<Map<string, number>> {
  const rows = await db.selectFrom('today_seconds').selectAll().execute()
  return new Map(rows.map((r) => [r.context_id, r.seconds]))
}

/**
 * Adds `delta` seconds to the given context's accumulator for today. Creates
 * the row if it doesn't exist. `delta` is rounded to the nearest second.
 */
export async function addTodaySeconds(
  db: Kysely<DB>,
  contextId: string,
  delta: number
): Promise<void> {
  const rounded = Math.round(delta)
  if (rounded === 0) return
  await db
    .insertInto('today_seconds')
    .values({ context_id: contextId, seconds: rounded })
    .onConflict((oc) =>
      oc.column('context_id').doUpdateSet((eb) => ({
        seconds: eb('today_seconds.seconds', '+', rounded)
      }))
    )
    .execute()
}

/** Directly sets a context's today seconds (e.g. when user edits a value). */
export async function setTodaySeconds(
  db: Kysely<DB>,
  contextId: string,
  seconds: number
): Promise<void> {
  const rounded = Math.max(0, Math.round(seconds))
  await db
    .insertInto('today_seconds')
    .values({ context_id: contextId, seconds: rounded })
    .onConflict((oc) =>
      oc.column('context_id').doUpdateSet({ seconds: rounded })
    )
    .execute()
}

/** Clears all today_seconds rows (Save & Reset). */
export async function resetAllTodaySeconds(db: Kysely<DB>): Promise<void> {
  await db.deleteFrom('today_seconds').execute()
}
