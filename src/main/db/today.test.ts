// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from './schema'
import { openAndMigrate } from './open'
import { createContext } from './contexts'
import {
  getAllTodaySeconds,
  addTodaySeconds,
  setTodaySeconds,
  resetAllTodaySeconds
} from './today'

let db: Kysely<DB>

beforeEach(async () => {
  db = await openAndMigrate(':memory:')
})

describe('today_seconds repo', () => {
  it('returns an empty map initially', async () => {
    expect(await getAllTodaySeconds(db)).toEqual(new Map())
  })

  it('addTodaySeconds inserts then increments', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await addTodaySeconds(db, c.id, 30)
    await addTodaySeconds(db, c.id, 45)
    const map = await getAllTodaySeconds(db)
    expect(map.get(c.id)).toBe(75)
  })

  it('rounds fractional seconds to the nearest int', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await addTodaySeconds(db, c.id, 30.4)
    await addTodaySeconds(db, c.id, 30.6)
    expect((await getAllTodaySeconds(db)).get(c.id)).toBe(61)
  })

  it('addTodaySeconds is a no-op for delta=0', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await addTodaySeconds(db, c.id, 0)
    expect((await getAllTodaySeconds(db)).has(c.id)).toBe(false)
  })

  it('setTodaySeconds overwrites and clamps negatives to 0', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await addTodaySeconds(db, c.id, 100)
    await setTodaySeconds(db, c.id, 42)
    expect((await getAllTodaySeconds(db)).get(c.id)).toBe(42)
    await setTodaySeconds(db, c.id, -5)
    expect((await getAllTodaySeconds(db)).get(c.id)).toBe(0)
  })

  it('resetAllTodaySeconds clears every row', async () => {
    const a = await createContext(db, { name: 'A', isRecurring: true })
    const b = await createContext(db, { name: 'B', isRecurring: true })
    await addTodaySeconds(db, a.id, 60)
    await addTodaySeconds(db, b.id, 120)
    await resetAllTodaySeconds(db)
    expect(await getAllTodaySeconds(db)).toEqual(new Map())
  })

  it('today_seconds row cascades when its context is deleted', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await addTodaySeconds(db, c.id, 60)
    await db.deleteFrom('contexts').where('id', '=', c.id).execute()
    expect((await getAllTodaySeconds(db)).has(c.id)).toBe(false)
  })
})
