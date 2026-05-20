// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { computeNextFireTime } from './scheduling'

function at(y: number, m: number, d: number, h: number, mins: number): number {
  return new Date(y, m - 1, d, h, mins, 0, 0).getTime()
}

describe('computeNextFireTime', () => {
  it('returns today when target is still in the future', () => {
    const now = at(2026, 5, 19, 8, 0)
    const next = computeNextFireTime('15:30', now)
    expect(next).toBe(at(2026, 5, 19, 15, 30))
  })

  it('returns tomorrow when target has already passed today', () => {
    const now = at(2026, 5, 19, 16, 0)
    const next = computeNextFireTime('03:00', now)
    expect(next).toBe(at(2026, 5, 20, 3, 0))
  })

  it('returns tomorrow when target equals now exactly', () => {
    const now = at(2026, 5, 19, 3, 0)
    const next = computeNextFireTime('03:00', now)
    expect(next).toBe(at(2026, 5, 20, 3, 0))
  })

  it('handles midnight (00:00)', () => {
    const now = at(2026, 5, 19, 23, 30)
    const next = computeNextFireTime('00:00', now)
    expect(next).toBe(at(2026, 5, 20, 0, 0))
  })

  it('rejects malformed input', () => {
    expect(() => computeNextFireTime('3:00', 0)).toThrow(/Invalid time format/)
    expect(() => computeNextFireTime('25:00', 0)).toThrow(/Invalid time value/)
    expect(() => computeNextFireTime('12:60', 0)).toThrow(/Invalid time value/)
  })
})
