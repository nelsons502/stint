import { describe, it, expect } from 'vitest'
import { parseHMS } from './ContextRow'

describe('parseHMS', () => {
  it('parses HH:MM:SS', () => {
    expect(parseHMS('1:02:03')).toBe(1 * 3600 + 2 * 60 + 3)
    expect(parseHMS('10:00:00')).toBe(36000)
  })

  it('parses MM:SS', () => {
    expect(parseHMS('5:30')).toBe(330)
  })

  it('parses a plain seconds count', () => {
    expect(parseHMS('120')).toBe(120)
  })

  it('returns null on garbage input', () => {
    expect(parseHMS('abc')).toBeNull()
    expect(parseHMS('1:b:3')).toBeNull()
    expect(parseHMS('')).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(parseHMS('  1:30  ')).toBe(90)
  })
})
