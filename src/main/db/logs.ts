import { Kysely } from 'kysely'
import type { DB } from './schema'

export interface DailyLogEntry {
  date: string
  contextName: string
  durationSeconds: number
  contextId: string | null
  createdAt: number
}

export interface ArchiveEntry {
  /** FK to contexts.id; null when importing CSV with no matching context. */
  contextId: string | null
  contextName: string
  durationSeconds: number
}

/**
 * Writes all per-context times for a given day to daily_logs in one
 * transaction. Entries with durationSeconds <= 0 are skipped (the spec says
 * contexts with no tracked time should be omitted from the day's log).
 *
 * If a log row for (date, contextName) already exists, the new duration is
 * ADDED to the existing one. This makes Save & Reset additive across
 * multiple runs in the same day, and means CSV import merges with existing
 * data rather than overwriting it. Manual edits in the History tab go
 * through `updateLogDuration` (set-to-value) and are unaffected.
 */
export async function archiveDay(
  db: Kysely<DB>,
  date: string,
  entries: ArchiveEntry[]
): Promise<void> {
  const kept = entries.filter((e) => e.durationSeconds > 0)
  if (kept.length === 0) return
  const now = Date.now()
  await db
    .insertInto('daily_logs')
    .values(
      kept.map((e) => ({
        date,
        context_name: e.contextName,
        duration_seconds: e.durationSeconds,
        context_id: e.contextId,
        created_at: now
      }))
    )
    .onConflict((oc) =>
      oc.columns(['date', 'context_name']).doUpdateSet((eb) => ({
        duration_seconds: eb(
          'daily_logs.duration_seconds',
          '+',
          eb.ref('excluded.duration_seconds')
        ),
        // Don't clobber an existing context_id with null from an import.
        context_id: eb.fn.coalesce(
          eb.ref('daily_logs.context_id'),
          eb.ref('excluded.context_id')
        ),
        created_at: eb.ref('excluded.created_at')
      }))
    )
    .execute()
}

export async function getLogsByDate(
  db: Kysely<DB>,
  date: string
): Promise<DailyLogEntry[]> {
  const rows = await db
    .selectFrom('daily_logs')
    .selectAll()
    .where('date', '=', date)
    .orderBy('context_name', 'asc')
    .execute()
  return rows.map((r) => ({
    date: r.date,
    contextName: r.context_name,
    durationSeconds: r.duration_seconds,
    contextId: r.context_id,
    createdAt: r.created_at
  }))
}

export async function getLogsByDateRange(
  db: Kysely<DB>,
  start: string,
  end: string
): Promise<DailyLogEntry[]> {
  const rows = await db
    .selectFrom('daily_logs')
    .selectAll()
    .where('date', '>=', start)
    .where('date', '<=', end)
    .orderBy('date', 'asc')
    .orderBy('context_name', 'asc')
    .execute()
  return rows.map((r) => ({
    date: r.date,
    contextName: r.context_name,
    durationSeconds: r.duration_seconds,
    contextId: r.context_id,
    createdAt: r.created_at
  }))
}

/** Returns distinct log dates, newest first. */
export async function getLogDates(db: Kysely<DB>): Promise<string[]> {
  const rows = await db
    .selectFrom('daily_logs')
    .select('date')
    .distinct()
    .orderBy('date', 'desc')
    .execute()
  return rows.map((r) => r.date)
}

/** Edits a single log row's duration. Negative values clamp to 0. */
export async function updateLogDuration(
  db: Kysely<DB>,
  date: string,
  contextName: string,
  durationSeconds: number
): Promise<void> {
  const clamped = Math.max(0, Math.round(durationSeconds))
  await db
    .updateTable('daily_logs')
    .set({ duration_seconds: clamped })
    .where('date', '=', date)
    .where('context_name', '=', contextName)
    .execute()
}

/** Deletes every log row for the given date. */
export async function deleteLogsForDate(
  db: Kysely<DB>,
  date: string
): Promise<number> {
  const result = await db
    .deleteFrom('daily_logs')
    .where('date', '=', date)
    .executeTakeFirst()
  return Number(result.numDeletedRows ?? 0)
}

/** Deletes a single (date, context_name) row. */
export async function deleteLogEntry(
  db: Kysely<DB>,
  date: string,
  contextName: string
): Promise<void> {
  await db
    .deleteFrom('daily_logs')
    .where('date', '=', date)
    .where('context_name', '=', contextName)
    .execute()
}
