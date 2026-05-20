import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import type { DB } from './schema'
import { runMigrations } from './migrations'

/**
 * Opens (or creates) a SQLite database file at `path` and wraps it in a
 * typed Kysely client. Pass ':memory:' for an ephemeral in-memory DB
 * (used by tests).
 *
 * Migrations are NOT run here — call `openAndMigrate` if you want both.
 * Splitting them out keeps the test surface explicit.
 */
export function createDb(path: string): Kysely<DB> {
  const sqlite = new Database(path)
  // WAL improves concurrent reads and crash safety on macOS.
  // Skip for in-memory: WAL is meaningless and SQLite warns about it.
  if (path !== ':memory:') {
    sqlite.pragma('journal_mode = WAL')
  }
  sqlite.pragma('foreign_keys = ON')

  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: sqlite })
  })
}

export async function openAndMigrate(path: string): Promise<Kysely<DB>> {
  const db = createDb(path)
  await runMigrations(db)
  return db
}
