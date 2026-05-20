// Kysely table-shape declarations for Stint's SQLite schema. The DB interface
// is what Kysely binds to for typed queries. Booleans live as INTEGER (0/1)
// because SQLite has no native boolean.

export interface ContextsTable {
  id: string
  name: string
  /** Display order; drives the Cmd+Shift+1..9 hotkey mapping. */
  sort_order: number
  /** 1 = recurring (reloaded each day); 0 = ad-hoc (cleared on Save & Reset). */
  is_recurring: number
  /** Unix ms. */
  created_at: number
}

export interface SessionTable {
  /** Always 1. The session table holds at most a single row. */
  id: number
  active_context_id: string | null
  /** Unix ms when the current run started; null while paused. */
  active_started_at_ms: number | null
  /** YYYY-MM-DD — the logical date this session belongs to. */
  session_date: string
}

export interface TodaySecondsTable {
  context_id: string
  /** Accumulated committed seconds for the current day (excludes in-progress run). */
  seconds: number
}

export interface DailyLogsTable {
  /** YYYY-MM-DD. */
  date: string
  /** Denormalized so log history survives context rename/delete. */
  context_name: string
  duration_seconds: number
  /** FK to contexts.id; null if the context has been deleted. */
  context_id: string | null
  /** Unix ms; when Save & Reset wrote this row. */
  created_at: number
}

export interface MigrationsAppliedTable {
  name: string
  applied_at: number
}

export interface DB {
  contexts: ContextsTable
  session: SessionTable
  today_seconds: TodaySecondsTable
  daily_logs: DailyLogsTable
  migrations_applied: MigrationsAppliedTable
}
