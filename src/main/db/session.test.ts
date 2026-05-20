// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from './schema'
import { openAndMigrate } from './open'
import { getSession, setSession } from './session'
import { createContext } from './contexts'

let db: Kysely<DB>

beforeEach(async () => {
  db = await openAndMigrate(':memory:')
})

describe('session repo', () => {
  it('returns null when no session row exists yet', async () => {
    expect(await getSession(db)).toBeNull()
  })

  it('inserts a session row on first setSession', async () => {
    await setSession(db, {
      activeContextId: null,
      activeStartedAtMs: null,
      sessionDate: '2026-05-19'
    })
    const s = await getSession(db)
    expect(s).toEqual({
      activeContextId: null,
      activeStartedAtMs: null,
      sessionDate: '2026-05-19'
    })
  })

  it('updates the same row on subsequent setSession calls', async () => {
    const ctx = await createContext(db, {
      name: 'Main Job',
      isRecurring: true
    })
    await setSession(db, {
      activeContextId: null,
      activeStartedAtMs: null,
      sessionDate: '2026-05-19'
    })
    await setSession(db, {
      activeContextId: ctx.id,
      activeStartedAtMs: 1_700_000_000_000,
      sessionDate: '2026-05-19'
    })
    expect(await getSession(db)).toEqual({
      activeContextId: ctx.id,
      activeStartedAtMs: 1_700_000_000_000,
      sessionDate: '2026-05-19'
    })
  })

  it('clears active_context_id when its context is deleted (FK set null)', async () => {
    const ctx = await createContext(db, {
      name: 'Ad-hoc',
      isRecurring: false
    })
    await setSession(db, {
      activeContextId: ctx.id,
      activeStartedAtMs: 1_700_000_000_000,
      sessionDate: '2026-05-19'
    })
    await db.deleteFrom('contexts').where('id', '=', ctx.id).execute()
    const s = await getSession(db)
    expect(s?.activeContextId).toBeNull()
  })
})
