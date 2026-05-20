// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from '../db/schema'
import { openAndMigrate } from '../db/open'
import { TimerService } from '../timer/TimerService'
import { AutoSaver } from './AutoSaver'
import { setAutoSaveConfig } from '../db/settings'
import { getLogsByDate, getLogDates } from '../db/logs'

let db: Kysely<DB>
let nowMs: number
const clock = (): number => nowMs

beforeEach(async () => {
  db = await openAndMigrate(':memory:')
  nowMs = new Date(2026, 4, 19, 10, 0, 0).getTime()
})

describe('AutoSaver.start — missed window detection', () => {
  it('does nothing when sessionDate is today (no miss)', async () => {
    const timer = new TimerService(db, clock)
    await timer.init()
    const ctx = await timer.addContext({ name: 'A', isRecurring: true })
    await timer.switchTo(ctx.id)
    nowMs += 60 * 1000
    await timer.pause()

    await setAutoSaveConfig(db, { enabled: true, time: '03:00' })
    const saver = new AutoSaver(db, timer, clock)
    await saver.start()
    saver.stop()

    expect(await getLogDates(db)).toEqual([])
  })

  it('archives yesterday when session_date is in the past and time was tracked', async () => {
    const timer = new TimerService(db, clock)
    await timer.init()
    const ctx = await timer.addContext({ name: 'Work', isRecurring: true })
    await timer.switchTo(ctx.id)
    nowMs += 2 * 60 * 60 * 1000 // 2 hours
    await timer.pause()
    // App "closes" — advance wall clock into the next day.
    nowMs = new Date(2026, 4, 20, 11, 0, 0).getTime()

    await setAutoSaveConfig(db, { enabled: true, time: '03:00' })
    const saver = new AutoSaver(db, timer, clock)
    await saver.start()
    saver.stop()

    const logs = await getLogsByDate(db, '2026-05-19')
    expect(logs).toHaveLength(1)
    expect(logs[0]!.durationSeconds).toBe(7200)
  })

  it('skips when disabled even if session is stale', async () => {
    const timer = new TimerService(db, clock)
    await timer.init()
    const ctx = await timer.addContext({ name: 'A', isRecurring: true })
    await timer.switchTo(ctx.id)
    nowMs += 60 * 1000
    await timer.pause()
    nowMs = new Date(2026, 4, 20, 11, 0, 0).getTime()

    await setAutoSaveConfig(db, { enabled: false, time: '03:00' })
    const saver = new AutoSaver(db, timer, clock)
    await saver.start()
    saver.stop()

    expect(await getLogDates(db)).toEqual([])
  })

  it('silently bumps session date when stale but no time tracked', async () => {
    const timer = new TimerService(db, clock)
    await timer.init()
    await timer.addContext({ name: 'A', isRecurring: true })
    nowMs = new Date(2026, 4, 20, 11, 0, 0).getTime()

    await setAutoSaveConfig(db, { enabled: true, time: '03:00' })
    const saver = new AutoSaver(db, timer, clock)
    await saver.start()
    saver.stop()

    expect(await getLogDates(db)).toEqual([])
    expect(timer.getSnapshot().sessionDate).toBe('2026-05-20')
  })
})

describe('AutoSaver.updateConfig', () => {
  it('persists the change and reschedules', async () => {
    const timer = new TimerService(db, clock)
    await timer.init()
    const saver = new AutoSaver(db, timer, clock)
    await saver.start()
    await saver.updateConfig({ enabled: true, time: '23:45' })
    expect(saver.getConfig()).toEqual({ enabled: true, time: '23:45' })
    saver.stop()
  })
})
