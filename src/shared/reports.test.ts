import { describe, it, expect } from 'vitest'
import {
  weekBoundsFor,
  monthBoundsFor,
  shiftWeek,
  shiftMonth,
  totalsByContext
} from './reports'

describe('weekBoundsFor (Sunday start, default)', () => {
  it('returns Sun..Sat containing a given date', () => {
    // 2026-05-19 is a Tuesday
    expect(weekBoundsFor('2026-05-19')).toEqual({
      start: '2026-05-17',
      end: '2026-05-23'
    })
  })

  it('returns the same week when called on the start day', () => {
    expect(weekBoundsFor('2026-05-17')).toEqual({
      start: '2026-05-17',
      end: '2026-05-23'
    })
  })

  it('honors Monday start when requested', () => {
    expect(weekBoundsFor('2026-05-19', 'monday')).toEqual({
      start: '2026-05-18',
      end: '2026-05-24'
    })
  })
})

describe('monthBoundsFor', () => {
  it('returns the first and last day of the month', () => {
    expect(monthBoundsFor('2026-05-19')).toEqual({
      start: '2026-05-01',
      end: '2026-05-31'
    })
  })

  it('handles February correctly', () => {
    expect(monthBoundsFor('2026-02-15')).toEqual({
      start: '2026-02-01',
      end: '2026-02-28'
    })
  })
})

describe('shiftWeek / shiftMonth', () => {
  it('shifts a week by N (negative = backward)', () => {
    const w = weekBoundsFor('2026-05-19')
    expect(shiftWeek(w, -1)).toEqual({
      start: '2026-05-10',
      end: '2026-05-16'
    })
    expect(shiftWeek(w, 2)).toEqual({
      start: '2026-05-31',
      end: '2026-06-06'
    })
  })

  it('shifts a month by N', () => {
    const m = monthBoundsFor('2026-05-19')
    expect(shiftMonth(m, -1)).toEqual({
      start: '2026-04-01',
      end: '2026-04-30'
    })
    expect(shiftMonth(m, 1)).toEqual({
      start: '2026-06-01',
      end: '2026-06-30'
    })
  })
})

describe('totalsByContext', () => {
  it('sums durations per context and sorts descending', () => {
    const out = totalsByContext([
      { contextName: 'A', durationSeconds: 100 },
      { contextName: 'B', durationSeconds: 50 },
      { contextName: 'A', durationSeconds: 200 }
    ])
    expect(out).toEqual([
      { contextName: 'A', durationSeconds: 300 },
      { contextName: 'B', durationSeconds: 50 }
    ])
  })

  it('returns [] for empty input', () => {
    expect(totalsByContext([])).toEqual([])
  })
})
