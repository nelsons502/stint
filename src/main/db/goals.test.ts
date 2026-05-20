// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from './schema'
import { openAndMigrate } from './open'
import { createContext } from './contexts'
import {
  listGoals,
  getGoal,
  setGoal,
  deleteGoal,
  markGoalHit
} from './goals'

let db: Kysely<DB>
beforeEach(async () => {
  db = await openAndMigrate(':memory:')
})

describe('goals repo', () => {
  it('listGoals returns empty initially', async () => {
    expect(await listGoals(db)).toEqual([])
  })

  it('setGoal inserts then updates the target on conflict', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await setGoal(db, c.id, 7200) // 2h
    expect((await getGoal(db, c.id))?.targetSecondsPerWeek).toBe(7200)
    await setGoal(db, c.id, 14400) // 4h
    expect((await getGoal(db, c.id))?.targetSecondsPerWeek).toBe(14400)
  })

  it('setGoal rejects non-positive targets', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await expect(setGoal(db, c.id, 0)).rejects.toThrow(/positive/)
    await expect(setGoal(db, c.id, -10)).rejects.toThrow(/positive/)
  })

  it('deleteGoal removes it', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await setGoal(db, c.id, 3600)
    await deleteGoal(db, c.id)
    expect(await getGoal(db, c.id)).toBeNull()
  })

  it('markGoalHit sets last_hit_week', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await setGoal(db, c.id, 3600)
    await markGoalHit(db, c.id, '2026-05-17')
    expect((await getGoal(db, c.id))?.lastHitWeek).toBe('2026-05-17')
  })

  it('cascades when its context is deleted', async () => {
    const c = await createContext(db, { name: 'A', isRecurring: true })
    await setGoal(db, c.id, 3600)
    await db.deleteFrom('contexts').where('id', '=', c.id).execute()
    expect(await getGoal(db, c.id)).toBeNull()
  })
})
