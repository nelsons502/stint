// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createDb, openAndMigrate } from './open'
import { runMigrations } from './migrations'

describe('createDb + runMigrations', () => {
  it('creates an in-memory DB and runs the initial migration', async () => {
    const db = await openAndMigrate(':memory:')
    const tables = await db.introspection.getTables()
    const names = tables.map((t) => t.name).sort()
    expect(names).toEqual([
      'contexts',
      'daily_logs',
      'migrations_applied',
      'session',
      'today_seconds'
    ])
    await db.destroy()
  })

  it('is idempotent — re-running migrations applies nothing new', async () => {
    const db = createDb(':memory:')
    await runMigrations(db)
    await runMigrations(db)
    const applied = await db
      .selectFrom('migrations_applied')
      .select('name')
      .execute()
    expect(applied.map((r) => r.name)).toEqual(['0001_initial'])
    await db.destroy()
  })

  it('enforces the session table single-row check constraint', async () => {
    const db = await openAndMigrate(':memory:')
    await db
      .insertInto('session')
      .values({
        id: 1,
        active_context_id: null,
        active_started_at_ms: null,
        session_date: '2026-05-19'
      })
      .execute()

    // id != 1 should be rejected by the CHECK constraint
    await expect(
      db
        .insertInto('session')
        .values({
          id: 2,
          active_context_id: null,
          active_started_at_ms: null,
          session_date: '2026-05-19'
        })
        .execute()
    ).rejects.toThrow()
    await db.destroy()
  })
})
