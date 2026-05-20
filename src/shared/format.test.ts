// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { formatHMS, formatTitle } from './format'

describe('formatHMS', () => {
  it('formats seconds under an hour', () => {
    expect(formatHMS(0)).toBe('0:00:00')
    expect(formatHMS(59)).toBe('0:00:59')
    expect(formatHMS(60)).toBe('0:01:00')
    expect(formatHMS(3599)).toBe('0:59:59')
  })

  it('formats over an hour without padding the hour', () => {
    expect(formatHMS(3600)).toBe('1:00:00')
    expect(formatHMS(3661)).toBe('1:01:01')
    expect(formatHMS(36000)).toBe('10:00:00')
  })

  it('floors fractional seconds and clamps negatives to 0', () => {
    expect(formatHMS(59.9)).toBe('0:00:59')
    expect(formatHMS(-5)).toBe('0:00:00')
  })
})

describe('formatTitle', () => {
  it('joins name and HMS with an em-dash', () => {
    expect(formatTitle('Main Job', 3661)).toBe('Main Job — 1:01:01')
  })
})
