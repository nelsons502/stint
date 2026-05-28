// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { TimerSnapshot, ContextWithSeconds } from '../../shared/api'
import type { TimerService } from '../timer/TimerService'

// Track registered state to give the mock realistic behavior.
let _registeredCombos: Set<string>

vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn((combo: string) => {
      if (_registeredCombos.has(combo)) return false
      _registeredCombos.add(combo)
      return true
    }),
    unregister: vi.fn((combo: string) => {
      _registeredCombos.delete(combo)
    }),
    isRegistered: vi.fn((combo: string) => _registeredCombos.has(combo)),
  }
}))

// Import AFTER mock is hoisted.
import { globalShortcut } from 'electron'
import { ShortcutManager } from './ShortcutManager'
import { DEFAULT_HOTKEYS } from '../../shared/api'

const gs = globalShortcut as {
  register: ReturnType<typeof vi.fn>
  unregister: ReturnType<typeof vi.fn>
  isRegistered: ReturnType<typeof vi.fn>
}

function makeCtx(
  id: string,
  name: string,
  sortOrder = 0
): ContextWithSeconds {
  return { id, name, sortOrder, isRecurring: true, createdAt: 0, todaySeconds: 0 }
}

function makeFakeTimer(contexts: ContextWithSeconds[] = []) {
  const emitter = new EventEmitter()
  const snap: TimerSnapshot = {
    activeContextId: null,
    activeStartedAtMs: null,
    sessionDate: '2026-05-19',
    contexts
  }
  return {
    getSnapshot: () => ({ ...snap, contexts: [...snap.contexts] }),
    setContexts: (ctxs: ContextWithSeconds[]) => {
      snap.contexts = ctxs
    },
    fire: () => emitter.emit('state-changed', { ...snap, contexts: [...snap.contexts] }),
    on: (event: string, fn: (...args: unknown[]) => void) => emitter.on(event, fn),
    off: (event: string, fn: (...args: unknown[]) => void) => emitter.off(event, fn),
    switchTo: vi.fn().mockResolvedValue(undefined)
  }
}

const handlers = {
  openDropdown: vi.fn(),
  pause: vi.fn(),
  openMain: vi.fn()
}

beforeEach(() => {
  _registeredCombos = new Set()
  vi.clearAllMocks()
  // Re-wire implementations after clearAllMocks wipes them.
  ;(gs.register as ReturnType<typeof vi.fn>).mockImplementation(
    (combo: string) => {
      if (_registeredCombos.has(combo)) return false
      _registeredCombos.add(combo)
      return true
    }
  )
  ;(gs.unregister as ReturnType<typeof vi.fn>).mockImplementation(
    (combo: string) => {
      _registeredCombos.delete(combo)
    }
  )
  ;(gs.isRegistered as ReturnType<typeof vi.fn>).mockImplementation(
    (combo: string) => _registeredCombos.has(combo)
  )
})

describe('ShortcutManager.applyConfig — master switch', () => {
  it('registers nothing when enabled=false', () => {
    const timer = makeFakeTimer([makeCtx('a', 'Work')])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig({ ...DEFAULT_HOTKEYS, enabled: false })
    expect(gs.register).not.toHaveBeenCalled()
  })
})

describe('ShortcutManager.applyConfig — fixed combos', () => {
  it('registers the three fixed combos', () => {
    const timer = makeFakeTimer()
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)
    const registered = gs.register.mock.calls.map(
      (c: unknown[]) => c[0]
    ) as string[]
    expect(registered).toContain(DEFAULT_HOTKEYS.openDropdown)
    expect(registered).toContain(DEFAULT_HOTKEYS.pause)
    expect(registered).toContain(DEFAULT_HOTKEYS.openMain)
  })

  it('reports failed combo when it is already registered by another app', () => {
    // Pre-register one combo so it appears taken.
    _registeredCombos.add(DEFAULT_HOTKEYS.pause)
    const timer = makeFakeTimer()
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    const { registered, failed } = sm.applyConfig(DEFAULT_HOTKEYS)
    expect(failed).toContain(DEFAULT_HOTKEYS.pause)
    expect(registered).not.toContain(DEFAULT_HOTKEYS.pause)
  })
})

describe('ShortcutManager.applyConfig — quick-switch', () => {
  it('registers Cmd+Shift+1 for the first context and Cmd+Shift+2 for the second', () => {
    const timer = makeFakeTimer([
      makeCtx('ctx1', 'Work'),
      makeCtx('ctx2', 'Slack')
    ])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)
    const combos = gs.register.mock.calls.map((c: unknown[]) => c[0]) as string[]
    expect(combos).toContain('CommandOrControl+Shift+1')
    expect(combos).toContain('CommandOrControl+Shift+2')
    expect(combos).not.toContain('CommandOrControl+Shift+3')
  })

  it('registers nothing beyond the first 9 contexts', () => {
    const tenContexts = Array.from({ length: 10 }, (_, i) =>
      makeCtx(`c${i}`, `Ctx ${i}`, i)
    )
    const timer = makeFakeTimer(tenContexts)
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)
    const combos = gs.register.mock.calls.map((c: unknown[]) => c[0]) as string[]
    expect(combos).toContain('CommandOrControl+Shift+9')
    expect(combos).not.toContain('CommandOrControl+Shift+10')
  })

  it('quick-switch handler calls switchTo with the correct context id', () => {
    const ctx = makeCtx('ctx1', 'Work')
    const timer = makeFakeTimer([ctx])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)
    // Invoke the registered handler for Cmd+Shift+1.
    const call = gs.register.mock.calls.find(
      (c: unknown[]) => c[0] === 'CommandOrControl+Shift+1'
    ) as [string, () => void] | undefined
    expect(call).toBeDefined()
    call![1]()
    expect(timer.switchTo).toHaveBeenCalledWith('ctx1')
  })
})

describe('ShortcutManager — quick-switch updates on state-changed', () => {
  it('re-registers numbered combos when a new context is added', () => {
    const timer = makeFakeTimer([makeCtx('ctx1', 'Work')])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)

    // Simulate adding a second context.
    timer.setContexts([makeCtx('ctx1', 'Work'), makeCtx('ctx2', 'Slack')])
    timer.fire()

    expect(_registeredCombos.has('CommandOrControl+Shift+1')).toBe(true)
    expect(_registeredCombos.has('CommandOrControl+Shift+2')).toBe(true)
  })

  it('re-maps combos to the correct contexts after a reorder', () => {
    const ctxA = makeCtx('ctxA', 'Alpha', 0)
    const ctxB = makeCtx('ctxB', 'Beta', 1)
    const timer = makeFakeTimer([ctxA, ctxB])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)

    // Reverse order: Beta first, Alpha second.
    timer.setContexts([
      { ...ctxB, sortOrder: 0 },
      { ...ctxA, sortOrder: 1 }
    ])
    timer.fire()

    // Verify Cmd+Shift+1 now calls switchTo(ctxB).
    const calls = gs.register.mock.calls.filter(
      (c: unknown[]) => c[0] === 'CommandOrControl+Shift+1'
    ) as [string, () => void][]
    // The last registration of Cmd+Shift+1 should be for ctxB.
    const latest = calls[calls.length - 1]!
    latest[1]()
    expect(timer.switchTo).toHaveBeenLastCalledWith('ctxB')
  })

  it('unregisters a numbered combo when a context is removed', () => {
    const timer = makeFakeTimer([makeCtx('ctx1', 'Work'), makeCtx('ctx2', 'Slack')])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)

    expect(_registeredCombos.has('CommandOrControl+Shift+2')).toBe(true)

    // Remove the second context.
    timer.setContexts([makeCtx('ctx1', 'Work')])
    timer.fire()

    expect(_registeredCombos.has('CommandOrControl+Shift+2')).toBe(false)
    expect(_registeredCombos.has('CommandOrControl+Shift+1')).toBe(true)
  })

  it('does not re-register if currentConfig is null (disabled between calls)', () => {
    const timer = makeFakeTimer([makeCtx('ctx1', 'Work')])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)
    sm.unregisterAll() // sets currentConfig to null

    const prevCallCount = gs.register.mock.calls.length
    timer.fire() // Should be a no-op now.
    expect(gs.register.mock.calls.length).toBe(prevCallCount)
  })
})

describe('ShortcutManager.unregisterAll', () => {
  it('unregisters all registered combos', () => {
    const timer = makeFakeTimer([makeCtx('ctx1', 'Work'), makeCtx('ctx2', 'Slack')])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)

    expect(_registeredCombos.size).toBeGreaterThan(0)
    sm.unregisterAll()
    expect(_registeredCombos.size).toBe(0)
  })

  it('stops responding to state-changed after unregisterAll', () => {
    const timer = makeFakeTimer([makeCtx('ctx1', 'Work')])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)
    sm.unregisterAll()

    // Add a context and fire — should not re-register anything.
    timer.setContexts([makeCtx('ctx1', 'Work'), makeCtx('ctx2', 'Slack')])
    timer.fire()
    expect(_registeredCombos.has('CommandOrControl+Shift+2')).toBe(false)
  })
})

describe('ShortcutManager — re-applying config', () => {
  it('clears old combos and registers new ones when applyConfig is called twice', () => {
    const timer = makeFakeTimer([makeCtx('ctx1', 'Work')])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)

    const newConfig = {
      ...DEFAULT_HOTKEYS,
      openDropdown: 'Alt+T',
      pause: 'Alt+P',
      openMain: 'Alt+L',
      quickSwitch: 'Alt+{N}'
    }
    sm.applyConfig(newConfig)

    // Old combos gone, new ones registered.
    expect(_registeredCombos.has(DEFAULT_HOTKEYS.openDropdown)).toBe(false)
    expect(_registeredCombos.has('Alt+T')).toBe(true)
    expect(_registeredCombos.has('Alt+1')).toBe(true)
  })

  it('does not double-subscribe to state-changed across multiple applyConfig calls', () => {
    const timer = makeFakeTimer([makeCtx('ctx1', 'Work')])
    const sm = new ShortcutManager(timer as unknown as TimerService, handlers)
    sm.applyConfig(DEFAULT_HOTKEYS)
    sm.applyConfig(DEFAULT_HOTKEYS)
    sm.applyConfig(DEFAULT_HOTKEYS)

    // After three applies there should be exactly one listener for state-changed.
    // EventEmitter warns at >10 listeners; we verify via unregister call count.
    // If there were 3 listeners, firing once would call registerQuickSwitch 3×,
    // causing double-registration (register returns false the 2nd time).
    timer.setContexts([makeCtx('ctx1', 'Work'), makeCtx('ctx2', 'New')])
    timer.fire()

    // Cmd+Shift+2 should be registered exactly once.
    const registrations = gs.register.mock.calls.filter(
      (c: unknown[]) => c[0] === 'CommandOrControl+Shift+2'
    )
    expect(registrations.length).toBe(1)
  })
})
