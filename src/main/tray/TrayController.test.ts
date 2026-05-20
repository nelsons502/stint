// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { liveSeconds } from './TrayController'

describe('liveSeconds', () => {
  const baseSnap = {
    activeContextId: 'a',
    activeStartedAtMs: 1000
  }

  it('adds elapsed since activeStartedAtMs for the active context', () => {
    expect(liveSeconds('a', 100, baseSnap, 11_000)).toBe(110)
  })

  it('returns todaySeconds unchanged for a non-active context', () => {
    expect(liveSeconds('b', 200, baseSnap, 11_000)).toBe(200)
  })

  it('returns todaySeconds unchanged when timer is paused', () => {
    expect(
      liveSeconds(
        'a',
        300,
        { activeContextId: null, activeStartedAtMs: null },
        99_999
      )
    ).toBe(300)
  })
})
