// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from './schema'
import { openAndMigrate } from './open'
import {
  listContexts,
  createContext,
  deleteNonRecurring
} from './contexts'

let db: Kysely<DB>

beforeEach(async () => {
  db = await openAndMigrate(':memory:')
})

describe('contexts repo', () => {
  it('returns an empty list initially', async () => {
    expect(await listContexts(db)).toEqual([])
  })

  it('creates a context with a uuid id and the provided fields', async () => {
    const ctx = await createContext(db, {
      name: 'Main Job',
      isRecurring: true
    })
    expect(ctx.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(ctx.name).toBe('Main Job')
    expect(ctx.isRecurring).toBe(true)
    expect(ctx.sortOrder).toBe(0)
  })

  it('auto-assigns sort_order to one past the current max', async () => {
    await createContext(db, { name: 'A', isRecurring: true })
    await createContext(db, { name: 'B', isRecurring: true })
    const list = await listContexts(db)
    expect(list.map((c) => c.sortOrder)).toEqual([0, 1])
  })

  it('honors explicit sortOrder when provided', async () => {
    const c = await createContext(db, {
      name: 'C',
      isRecurring: true,
      sortOrder: 42
    })
    expect(c.sortOrder).toBe(42)
  })

  it('lists contexts ordered by sort_order then created_at', async () => {
    await createContext(db, {
      name: 'B',
      isRecurring: true,
      sortOrder: 1
    })
    await createContext(db, {
      name: 'A',
      isRecurring: true,
      sortOrder: 0
    })
    const list = await listContexts(db)
    expect(list.map((c) => c.name)).toEqual(['A', 'B'])
  })

  it('deleteNonRecurring removes only ad-hoc contexts', async () => {
    await createContext(db, { name: 'R1', isRecurring: true })
    await createContext(db, { name: 'A1', isRecurring: false })
    await createContext(db, { name: 'A2', isRecurring: false })

    const deleted = await deleteNonRecurring(db)
    expect(deleted).toBe(2)
    const list = await listContexts(db)
    expect(list.map((c) => c.name)).toEqual(['R1'])
  })
})
