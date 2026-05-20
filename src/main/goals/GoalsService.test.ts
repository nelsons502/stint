// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from '../db/schema'
import { openAndMigrate } from '../db/open'
import { TimerService } from '../timer/TimerService'
import { GoalsService, type GoalHitEvent } from './GoalsService'

let db: Kysely<DB>
let nowMs: number
const clock = (): number => nowMs

beforeEach(async () => {
  db = await openAndMigrate(':memory:')
  // 2026-05-19 Tuesday at 10am; week bounds Sun 05-17 to Sat 05-23
  nowMs = new Date(2026, 4, 19, 10, 0, 0).getTime()
})

function newServices(): {
  timer: TimerService
  goals: GoalsService
  notifications: GoalHitEvent[]
} {
  const timer = new TimerService(db, clock)
  const notifications: GoalHitEvent[] = []
  const notify = (e: GoalHitEvent): void => {
    notifications.push(e)
  }
  const goals = new GoalsService(db, timer, notify, clock)
  return { timer, goals, notifications }
}

describe('GoalsService.listProgress', () => {
  it('returns nothing when no goals are set', async () => {
    const { timer, goals } = newServices()
    await timer.init()
    expect(await goals.listProgress()).toEqual([])
  })

  it('reports progress for the current week including in-progress run', async () => {
    const { timer, goals } = newServices()
    await timer.init()
    const a = await timer.addContext({ name: 'A', isRecurring: true })
    await goals.setGoal(a.id, 3600) // 1h
    await timer.switchTo(a.id)
    nowMs += 30 * 60 * 1000 // 30 minutes
    const list = await goals.listProgress()
    expect(list).toHaveLength(1)
    expect(list[0]!.currentSeconds).toBe(1800)
    expect(list[0]!.targetSecondsPerWeek).toBe(3600)
    expect(list[0]!.hit).toBe(false)
    expect(list[0]!.weekStart).toBe('2026-05-17')
    expect(list[0]!.weekEnd).toBe('2026-05-23')
  })

  it('counts archived days from the same week', async () => {
    const { timer, goals } = newServices()
    await timer.init()
    const a = await timer.addContext({ name: 'A', isRecurring: true })
    await goals.setGoal(a.id, 7200) // 2h
    await timer.switchTo(a.id)
    nowMs += 60 * 60 * 1000 // 1h on monday (well, same day since today is Tuesday)
    await timer.pause()
    // Advance one day to Monday and save under yesterday's date
    // Actually simpler — saveAndReset uses sessionDate, but we need to put a
    // log under '2026-05-18' for this test. Use saveAndReset with date:
    await timer.saveAndReset('2026-05-18')

    // Add more time today
    await timer.switchTo(a.id)
    nowMs += 30 * 60 * 1000 // 30 minutes today
    const [p] = await goals.listProgress()
    // 1h archived under 05-18 + 30min live = 5400
    expect(p!.currentSeconds).toBe(5400)
  })
})

describe('GoalsService.start — notifications', () => {
  it('fires once when a goal newly hits its target', async () => {
    const { timer, goals, notifications } = newServices()
    await timer.init()
    const a = await timer.addContext({ name: 'A', isRecurring: true })
    await goals.setGoal(a.id, 1800) // 30min
    goals.start()
    await timer.switchTo(a.id)
    nowMs += 30 * 60 * 1000 // exactly 30 minutes
    await timer.pause() // commits the run → state-changed → evaluation
    // Async evaluation kicked off by event; let microtasks settle.
    await new Promise((resolve) => setImmediate(resolve))
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toEqual({
      contextName: 'A',
      targetSecondsPerWeek: 1800
    })
    goals.stop()
  })

  it('does not re-notify within the same week', async () => {
    const { timer, goals, notifications } = newServices()
    await timer.init()
    const a = await timer.addContext({ name: 'A', isRecurring: true })
    await goals.setGoal(a.id, 1800)
    goals.start()
    await timer.switchTo(a.id)
    nowMs += 30 * 60 * 1000
    await timer.pause()
    await new Promise((resolve) => setImmediate(resolve))
    // More work, still in same week
    nowMs += 60 * 1000
    await timer.switchTo(a.id)
    nowMs += 60 * 1000
    await timer.pause()
    await new Promise((resolve) => setImmediate(resolve))
    expect(notifications).toHaveLength(1)
    goals.stop()
  })

  it('does not notify before the target is reached', async () => {
    const { timer, goals, notifications } = newServices()
    await timer.init()
    const a = await timer.addContext({ name: 'A', isRecurring: true })
    await goals.setGoal(a.id, 3600)
    goals.start()
    await timer.switchTo(a.id)
    nowMs += 30 * 60 * 1000
    await timer.pause()
    await new Promise((resolve) => setImmediate(resolve))
    expect(notifications).toEqual([])
    goals.stop()
  })
})

describe('GoalsService.deleteGoal', () => {
  it('removes the goal so it no longer appears in progress', async () => {
    const { timer, goals } = newServices()
    await timer.init()
    const a = await timer.addContext({ name: 'A', isRecurring: true })
    await goals.setGoal(a.id, 3600)
    expect(await goals.listProgress()).toHaveLength(1)
    await goals.deleteGoal(a.id)
    expect(await goals.listProgress()).toHaveLength(0)
  })
})

describe('GoalsService — vi.fn notifier sanity', () => {
  it('passes through arbitrary notifiers (smoke)', async () => {
    const { timer } = newServices()
    await timer.init()
    const fn = vi.fn()
    const g = new GoalsService(db, timer, fn, clock)
    g.start()
    g.stop()
    expect(fn).not.toHaveBeenCalled()
  })
})
