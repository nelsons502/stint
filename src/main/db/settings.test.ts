// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from './schema'
import { openAndMigrate } from './open'
import {
  getSetting,
  setSetting,
  getAllSettings,
  getAutoSaveConfig,
  setAutoSaveConfig,
  DEFAULT_AUTO_SAVE
} from './settings'

let db: Kysely<DB>

beforeEach(async () => {
  db = await openAndMigrate(':memory:')
})

describe('settings repo', () => {
  it('getSetting returns null for an unknown key', async () => {
    expect(await getSetting(db, 'nope')).toBeNull()
  })

  it('setSetting upserts the value', async () => {
    await setSetting(db, 'k', 'v1')
    expect(await getSetting(db, 'k')).toBe('v1')
    await setSetting(db, 'k', 'v2')
    expect(await getSetting(db, 'k')).toBe('v2')
  })

  it('getAllSettings returns every row as a record', async () => {
    await setSetting(db, 'a', '1')
    await setSetting(db, 'b', '2')
    expect(await getAllSettings(db)).toEqual({ a: '1', b: '2' })
  })

  it('getAutoSaveConfig returns defaults when nothing is set', async () => {
    expect(await getAutoSaveConfig(db)).toEqual(DEFAULT_AUTO_SAVE)
  })

  it('setAutoSaveConfig + getAutoSaveConfig round-trip', async () => {
    await setAutoSaveConfig(db, { enabled: true, time: '00:30' })
    expect(await getAutoSaveConfig(db)).toEqual({
      enabled: true,
      time: '00:30'
    })
  })

  it('setAutoSaveConfig rejects malformed time strings', async () => {
    await expect(
      setAutoSaveConfig(db, { enabled: true, time: '3am' })
    ).rejects.toThrow(/Invalid time/)
    await expect(
      setAutoSaveConfig(db, { enabled: true, time: '0:0' })
    ).rejects.toThrow(/Invalid time/)
  })
})
