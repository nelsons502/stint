import { Kysely } from 'kysely'
import type { DB } from './schema'

export interface Session {
  activeContextId: string | null
  activeStartedAtMs: number | null
  sessionDate: string
}

export async function getSession(db: Kysely<DB>): Promise<Session | null> {
  const row = await db
    .selectFrom('session')
    .selectAll()
    .where('id', '=', 1)
    .executeTakeFirst()
  if (!row) return null
  return {
    activeContextId: row.active_context_id,
    activeStartedAtMs: row.active_started_at_ms,
    sessionDate: row.session_date
  }
}

/**
 * Upserts the singleton session row. Pass `null` for active fields to record
 * a paused state.
 */
export async function setSession(
  db: Kysely<DB>,
  s: Session
): Promise<void> {
  await db
    .insertInto('session')
    .values({
      id: 1,
      active_context_id: s.activeContextId,
      active_started_at_ms: s.activeStartedAtMs,
      session_date: s.sessionDate
    })
    .onConflict((oc) =>
      oc.column('id').doUpdateSet({
        active_context_id: s.activeContextId,
        active_started_at_ms: s.activeStartedAtMs,
        session_date: s.sessionDate
      })
    )
    .execute()
}
