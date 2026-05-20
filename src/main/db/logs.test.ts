// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from './schema'
import { openAndMigrate } from './open'
import { createContext } from './contexts'
import { archiveDay, getLogsByDate, getLogsByDateRange } from './logs'

let db: Kysely<DB>

beforeEach(async () => {
  db = await openAndMigrate(':memory:')
})

describe('logs repo', () => {
  it('archives only entries with positive duration', async () => {
    const a = await createContext(db, { name: 'A', isRecurring: true })
    const b = await createContext(db, { name: 'B', isRecurring: true })
    await archiveDay(db, '2026-05-19', [
      { contextId: a.id, contextName: 'A', durationSeconds: 300 },
      { contextId: b.id, contextName: 'B', durationSeconds: 0 }
    ])
    const logs = await getLogsByDate(db, '2026-05-19')
    expect(logs.map((l) => l.contextName)).toEqual(['A'])
  })

  it('upserts on (date, context_name) — a re-archive replaces the row', async () => {
    const a = await createContext(db, { name: 'A', isRecurring: true })
    await archiveDay(db, '2026-05-19', [
      { contextId: a.id, contextName: 'A', durationSeconds: 300 }
    ])
    await archiveDay(db, '2026-05-19', [
      { contextId: a.id, contextName: 'A', durationSeconds: 450 }
    ])
    const logs = await getLogsByDate(db, '2026-05-19')
    expect(logs).toHaveLength(1)
    expect(logs[0]!.durationSeconds).toBe(450)
  })

  it('preserves context_name after the context is later deleted', async () => {
    const a = await createContext(db, { name: 'TempName', isRecurring: false })
    await archiveDay(db, '2026-05-19', [
      { contextId: a.id, contextName: 'TempName', durationSeconds: 600 }
    ])
    await db.deleteFrom('contexts').where('id', '=', a.id).execute()
    const logs = await getLogsByDate(db, '2026-05-19')
    expect(logs).toHaveLength(1)
    expect(logs[0]!.contextName).toBe('TempName')
    // FK set null on delete
    expect(logs[0]!.contextId).toBeNull()
  })

  it('getLogsByDateRange is inclusive on both bounds and ordered', async () => {
    const a = await createContext(db, { name: 'A', isRecurring: true })
    await archiveDay(db, '2026-05-17', [
      { contextId: a.id, contextName: 'A', durationSeconds: 100 }
    ])
    await archiveDay(db, '2026-05-18', [
      { contextId: a.id, contextName: 'A', durationSeconds: 200 }
    ])
    await archiveDay(db, '2026-05-19', [
      { contextId: a.id, contextName: 'A', durationSeconds: 300 }
    ])
    const logs = await getLogsByDateRange(db, '2026-05-17', '2026-05-18')
    expect(logs.map((l) => l.date)).toEqual(['2026-05-17', '2026-05-18'])
  })

  it('handles an empty entries array without erroring', async () => {
    await archiveDay(db, '2026-05-19', [])
    expect(await getLogsByDate(db, '2026-05-19')).toEqual([])
  })
})
