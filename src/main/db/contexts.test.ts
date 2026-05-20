// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from './schema'
import { openAndMigrate } from './open'
import {
  listContexts,
  createContext,
  deleteNonRecurring,
  deleteContextById,
  setSortOrder,
  renormalizeSortOrders
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

  it('deleteContextById removes one row', async () => {
    const a = await createContext(db, { name: 'A', isRecurring: true })
    await createContext(db, { name: 'B', isRecurring: true })
    await deleteContextById(db, a.id)
    expect((await listContexts(db)).map((c) => c.name)).toEqual(['B'])
  })

  it('setSortOrder updates only the targeted row', async () => {
    const a = await createContext(db, { name: 'A', isRecurring: true })
    const b = await createContext(db, { name: 'B', isRecurring: true })
    await setSortOrder(db, a.id, 5)
    await setSortOrder(db, b.id, 2)
    // listContexts orders by sort_order ascending
    expect((await listContexts(db)).map((c) => c.name)).toEqual(['B', 'A'])
  })

  it('renormalizeSortOrders compacts the order densely starting at 0', async () => {
    await createContext(db, { name: 'A', isRecurring: true, sortOrder: 0 })
    await createContext(db, { name: 'B', isRecurring: true, sortOrder: 5 })
    await createContext(db, { name: 'C', isRecurring: true, sortOrder: 9 })
    await renormalizeSortOrders(db)
    const list = await listContexts(db)
    expect(list.map((c) => [c.name, c.sortOrder])).toEqual([
      ['A', 0],
      ['B', 1],
      ['C', 2]
    ])
  })
})
