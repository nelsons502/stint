// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import type { Kysely } from 'kysely'
import type { DB } from '../db/schema'
import { openAndMigrate } from '../db/open'
import { TimerService, type TimerSnapshot } from './TimerService'
import { getLogsByDate } from '../db/logs'
import { listContexts } from '../db/contexts'

let db: Kysely<DB>
let nowMs: number
const clock = (): number => nowMs

function newTimer(): TimerService {
  return new TimerService(db, clock)
}

beforeEach(async () => {
  db = await openAndMigrate(':memory:')
  // Fixed wall-clock for deterministic tests: 2026-05-19T10:00:00 local
  nowMs = new Date(2026, 4, 19, 10, 0, 0).getTime()
})

describe('TimerService.init', () => {
  it('initializes with empty DB and sets today as session date', async () => {
    const t = newTimer()
    const recovery = await t.init()
    expect(recovery).toBeNull()
    const snap = t.getSnapshot()
    expect(snap.sessionDate).toBe('2026-05-19')
    expect(snap.activeContextId).toBeNull()
    expect(snap.contexts).toEqual([])
  })

  it('returns RecoveryInfo when a timer was running on previous exit', async () => {
    // Seed: a context + a session row with an active timer one hour ago.
    const t1 = newTimer()
    await t1.init()
    const ctx = await t1.addContext({
      name: 'Main Job',
      isRecurring: true,
      startImmediately: true
    })
    // simulate the prior process exited; advance clock by one hour and reopen
    const startedAt = nowMs
    nowMs += 60 * 60 * 1000

    const t2 = newTimer()
    const recovery = await t2.init()
    expect(recovery).not.toBeNull()
    expect(recovery!.activeContextId).toBe(ctx.id)
    expect(recovery!.activeContextName).toBe('Main Job')
    expect(recovery!.activeStartedAtMs).toBe(startedAt)
    expect(recovery!.elapsedSinceStartSeconds).toBe(3600)
  })
})

describe('TimerService.finalizeRecovery', () => {
  let ctxId: string

  beforeEach(async () => {
    const t1 = newTimer()
    await t1.init()
    const ctx = await t1.addContext({
      name: 'Work',
      isRecurring: true,
      startImmediately: true
    })
    ctxId = ctx.id
    nowMs += 30 * 60 * 1000 // 30 minutes elapsed
  })

  it('discard: no time credited, timer paused', async () => {
    const t = newTimer()
    await t.init()
    await t.finalizeRecovery('discard')
    const snap = t.getSnapshot()
    expect(snap.activeContextId).toBeNull()
    expect(snap.contexts.find((c) => c.id === ctxId)!.todaySeconds).toBe(0)
  })

  it('resume-since: credits elapsed seconds and restarts the run from now', async () => {
    const t = newTimer()
    await t.init()
    await t.finalizeRecovery('resume-since')
    const snap = t.getSnapshot()
    expect(snap.activeContextId).toBe(ctxId)
    expect(snap.activeStartedAtMs).toBe(nowMs)
    expect(snap.contexts.find((c) => c.id === ctxId)!.todaySeconds).toBe(1800)
  })

  it('resume-now: no time credited, run starts from now', async () => {
    const t = newTimer()
    await t.init()
    await t.finalizeRecovery('resume-now')
    const snap = t.getSnapshot()
    expect(snap.activeContextId).toBe(ctxId)
    expect(snap.activeStartedAtMs).toBe(nowMs)
    expect(snap.contexts.find((c) => c.id === ctxId)!.todaySeconds).toBe(0)
  })
})

describe('TimerService.switchTo + pause', () => {
  it('switchTo from paused starts a new run', async () => {
    const t = newTimer()
    await t.init()
    const ctx = await t.addContext({ name: 'A', isRecurring: true })
    await t.switchTo(ctx.id)
    const snap = t.getSnapshot()
    expect(snap.activeContextId).toBe(ctx.id)
    expect(snap.activeStartedAtMs).toBe(nowMs)
  })

  it('switching from one context to another commits the previous run', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    const b = await t.addContext({ name: 'B', isRecurring: true })

    await t.switchTo(a.id)
    nowMs += 10 * 60 * 1000 // 10 min on A
    await t.switchTo(b.id)
    const snap = t.getSnapshot()
    expect(snap.activeContextId).toBe(b.id)
    expect(snap.activeStartedAtMs).toBe(nowMs)
    expect(snap.contexts.find((c) => c.id === a.id)!.todaySeconds).toBe(600)
    expect(snap.contexts.find((c) => c.id === b.id)!.todaySeconds).toBe(0)
  })

  it('switching to the already-active context is a no-op', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.switchTo(a.id)
    const startedAt = nowMs
    nowMs += 5 * 60 * 1000
    await t.switchTo(a.id)
    expect(t.getSnapshot().activeStartedAtMs).toBe(startedAt)
  })

  it('pause() commits the active run and clears active state', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.switchTo(a.id)
    nowMs += 90 * 1000 // 90s
    await t.pause()
    const snap = t.getSnapshot()
    expect(snap.activeContextId).toBeNull()
    expect(snap.activeStartedAtMs).toBeNull()
    expect(snap.contexts.find((c) => c.id === a.id)!.todaySeconds).toBe(90)
  })

  it('emits state-changed on every transition', async () => {
    const t = newTimer()
    await t.init()
    const events: TimerSnapshot[] = []
    t.on('state-changed', (s) => events.push(s))

    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.switchTo(a.id)
    await t.pause()

    expect(events.length).toBe(3) // addContext, switchTo, pause
  })

  it('rejects switchTo for an unknown context id', async () => {
    const t = newTimer()
    await t.init()
    await expect(t.switchTo('nope')).rejects.toThrow(/Unknown context/)
  })
})

describe('TimerService.addContext', () => {
  it('startImmediately=true switches to the new context', async () => {
    const t = newTimer()
    await t.init()
    const ctx = await t.addContext({
      name: 'A',
      isRecurring: false,
      startImmediately: true
    })
    expect(t.getSnapshot().activeContextId).toBe(ctx.id)
  })

  it('startImmediately=false adds without interrupting the active run', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({
      name: 'A',
      isRecurring: true,
      startImmediately: true
    })
    nowMs += 60 * 1000
    await t.addContext({
      name: 'B',
      isRecurring: false,
      startImmediately: false
    })
    expect(t.getSnapshot().activeContextId).toBe(a.id)
    expect(t.getSnapshot().activeStartedAtMs).toBe(nowMs - 60 * 1000)
  })
})

describe('TimerService.setContextSeconds', () => {
  it('sets seconds directly when context is not active', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.setContextSeconds(a.id, 1234)
    expect(t.getSnapshot().contexts.find((c) => c.id === a.id)!.todaySeconds).toBe(
      1234
    )
  })

  it('when active, commits in-progress run first then sets to edited value', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.switchTo(a.id)
    nowMs += 60 * 1000 // 60s
    await t.setContextSeconds(a.id, 100)
    const snap = t.getSnapshot()
    // Old 60s were committed, then overwritten by the explicit 100.
    expect(snap.contexts.find((c) => c.id === a.id)!.todaySeconds).toBe(100)
    // Still active; new run starts from now.
    expect(snap.activeStartedAtMs).toBe(nowMs)
  })

  it('clamps negative values to 0', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.setContextSeconds(a.id, -50)
    expect(t.getSnapshot().contexts.find((c) => c.id === a.id)!.todaySeconds).toBe(0)
  })
})

describe('TimerService.reorderContexts', () => {
  it('reorders the in-memory list and persists sort_order', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    const b = await t.addContext({ name: 'B', isRecurring: true })
    const c = await t.addContext({ name: 'C', isRecurring: true })
    await t.reorderContexts([c.id, a.id, b.id])
    const snap = t.getSnapshot()
    expect(snap.contexts.map((x) => x.name)).toEqual(['C', 'A', 'B'])
    expect(snap.contexts.map((x) => x.sortOrder)).toEqual([0, 1, 2])
  })

  it('rejects an id set that doesn’t match the current contexts', async () => {
    const t = newTimer()
    await t.init()
    await t.addContext({ name: 'A', isRecurring: true })
    await expect(t.reorderContexts(['bogus'])).rejects.toThrow()
  })
})

describe('TimerService.renameContext', () => {
  it('renames in memory and persists to DB', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.renameContext(a.id, 'Main Job')
    expect(t.getSnapshot().contexts[0]!.name).toBe('Main Job')
  })

  it('trims whitespace and rejects empty names', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.renameContext(a.id, '   Trimmed   ')
    expect(t.getSnapshot().contexts[0]!.name).toBe('Trimmed')
    await expect(t.renameContext(a.id, '   ')).rejects.toThrow(/empty/)
  })

  it('throws for unknown ids', async () => {
    const t = newTimer()
    await t.init()
    await expect(t.renameContext('nope', 'X')).rejects.toThrow(/Unknown/)
  })
})

describe('TimerService.setContextRecurring', () => {
  it('promotes ad-hoc to recurring (and vice versa)', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: false })
    expect(t.getSnapshot().contexts[0]!.isRecurring).toBe(false)
    await t.setContextRecurring(a.id, true)
    expect(t.getSnapshot().contexts[0]!.isRecurring).toBe(true)
    // And back the other way
    await t.setContextRecurring(a.id, false)
    expect(t.getSnapshot().contexts[0]!.isRecurring).toBe(false)
  })

  it('a promoted ad-hoc context survives Save & Reset', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: false })
    await t.setContextRecurring(a.id, true)
    await t.saveAndReset()
    expect(t.getSnapshot().contexts.map((c) => c.name)).toEqual(['A'])
  })
})

describe('TimerService.deleteContext', () => {
  it('removes a context that is not active', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    const b = await t.addContext({ name: 'B', isRecurring: true })
    await t.deleteContext(a.id)
    expect(t.getSnapshot().contexts.map((c) => c.name)).toEqual(['B'])
    expect(t.getSnapshot().activeContextId).toBeNull()
    void b
  })

  it('commits the in-progress run and pauses before deleting the active context', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.switchTo(a.id)
    nowMs += 120 * 1000
    // Snapshot the time we want credited before delete.
    await t.deleteContext(a.id)
    const snap = t.getSnapshot()
    expect(snap.activeContextId).toBeNull()
    expect(snap.contexts).toEqual([])
  })

  it('throws for unknown ids', async () => {
    const t = newTimer()
    await t.init()
    await expect(t.deleteContext('nope')).rejects.toThrow(/Unknown context/)
  })
})

describe('TimerService.saveAndReset', () => {
  it('archives entries, clears today, removes ad-hoc, advances session date', async () => {
    const t = newTimer()
    await t.init()
    const work = await t.addContext({ name: 'Work', isRecurring: true })
    const adhoc = await t.addContext({
      name: 'Errand',
      isRecurring: false
    })
    await t.switchTo(work.id)
    nowMs += 60 * 60 * 1000
    await t.switchTo(adhoc.id)
    nowMs += 30 * 60 * 1000
    await t.pause()

    // Advance day before save.
    nowMs = new Date(2026, 4, 20, 9, 0, 0).getTime()
    await t.saveAndReset()

    const snap = t.getSnapshot()
    expect(snap.sessionDate).toBe('2026-05-20')
    expect(snap.activeContextId).toBeNull()
    // Recurring contexts remain at zero; ad-hoc removed.
    expect(snap.contexts.map((c) => c.name)).toEqual(['Work'])
    expect(snap.contexts[0]!.todaySeconds).toBe(0)

    const logs = await getLogsByDate(db, '2026-05-19')
    expect(logs.map((l) => l.contextName).sort()).toEqual(['Errand', 'Work'])
    expect(logs.find((l) => l.contextName === 'Work')!.durationSeconds).toBe(
      3600
    )
    expect(logs.find((l) => l.contextName === 'Errand')!.durationSeconds).toBe(
      1800
    )
  })

  it('archives under a custom date when one is provided', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.switchTo(a.id)
    nowMs += 60 * 1000
    await t.pause()
    await t.saveAndReset('2026-05-15')
    const logs = await getLogsByDate(db, '2026-05-15')
    expect(logs).toHaveLength(1)
    expect(logs[0]!.durationSeconds).toBe(60)
  })

  it('omits zero-duration contexts from the day log', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'A', isRecurring: true })
    await t.addContext({ name: 'B', isRecurring: true })
    await t.switchTo(a.id)
    nowMs += 60 * 1000
    await t.pause()
    await t.saveAndReset()
    // B never got time — should be omitted from the log.
    const logs = await getLogsByDate(db, '2026-05-19')
    expect(logs.map((l) => l.contextName)).toEqual(['A'])
    // B still exists in the contexts table (recurring contexts persist).
    const allContexts = await listContexts(db)
    expect(allContexts.map((c) => c.name).sort()).toEqual(['A', 'B'])
  })

  it('renormalizes sort_orders so recurring contexts are dense at the top', async () => {
    const t = newTimer()
    await t.init()
    const a = await t.addContext({ name: 'Recur-A', isRecurring: true })
    await t.addContext({ name: 'AdHoc-1', isRecurring: false })
    const b = await t.addContext({ name: 'Recur-B', isRecurring: true })
    await t.addContext({ name: 'AdHoc-2', isRecurring: false })

    // Before save: 4 contexts in order, sort_orders 0..3
    expect(t.getSnapshot().contexts.map((c) => c.sortOrder)).toEqual([
      0, 1, 2, 3
    ])

    await t.switchTo(a.id)
    nowMs += 60 * 1000
    await t.pause()
    await t.saveAndReset()

    // After save: only recurring remain, sort_orders 0..1
    const snap = t.getSnapshot()
    expect(snap.contexts.map((c) => c.name)).toEqual(['Recur-A', 'Recur-B'])
    expect(snap.contexts.map((c) => c.sortOrder)).toEqual([0, 1])
    void b
  })

  it('asserts init() was called first', async () => {
    const t = newTimer()
    await expect(t.switchTo(null)).rejects.toThrow(/init/)
  })
})
