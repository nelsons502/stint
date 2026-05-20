import { describe, it, expect } from 'vitest'
import { toCsv, parseCsv } from './csv'

describe('toCsv', () => {
  it('writes the canonical header and a formatted column', () => {
    const out = toCsv([
      { date: '2026-05-14', context: 'Main Job', durationSeconds: 21664 }
    ])
    expect(out).toBe(
      'date,context,duration_seconds,duration_formatted\n' +
        '2026-05-14,Main Job,21664,6:01:04\n'
    )
  })

  it('quotes fields containing commas or quotes', () => {
    const out = toCsv([
      { date: '2026-05-14', context: 'Foo, Bar', durationSeconds: 60 },
      { date: '2026-05-14', context: 'She said "hi"', durationSeconds: 90 }
    ])
    expect(out).toContain('"Foo, Bar"')
    expect(out).toContain('"She said ""hi"""')
  })
})

describe('parseCsv', () => {
  it('round-trips with toCsv', () => {
    const rows = [
      { date: '2026-05-14', context: 'Main Job', durationSeconds: 21664 },
      { date: '2026-05-14', context: 'Foo, Bar', durationSeconds: 60 }
    ]
    const csv = toCsv(rows)
    const result = parseCsv(csv)
    expect(result.errors).toEqual([])
    expect(result.rows).toEqual(rows)
  })

  it('ignores the optional duration_formatted column', () => {
    const csv = 'date,context,duration_seconds\n2026-05-14,Main Job,300\n'
    const result = parseCsv(csv)
    expect(result.rows).toEqual([
      { date: '2026-05-14', context: 'Main Job', durationSeconds: 300 }
    ])
  })

  it('skips invalid rows but keeps valid ones, reporting both', () => {
    const csv =
      'date,context,duration_seconds\n' +
      '2026-05-14,Main Job,300\n' +
      'not-a-date,Bad,100\n' +
      '2026-05-15,,200\n' +
      '2026-05-15,OK,-50\n'
    const result = parseCsv(csv)
    expect(result.rows.map((r) => r.context)).toEqual(['Main Job'])
    expect(result.errors.map((e) => e.line)).toEqual([3, 4, 5])
  })

  it('errors out when required columns are missing', () => {
    const result = parseCsv('foo,bar\nx,y\n')
    expect(result.rows).toEqual([])
    expect(result.errors[0]!.line).toBe(1)
  })

  it('tolerates BOM and CRLF line endings', () => {
    const csv =
      '﻿date,context,duration_seconds\r\n2026-05-14,A,60\r\n'
    const result = parseCsv(csv)
    expect(result.rows).toEqual([
      { date: '2026-05-14', context: 'A', durationSeconds: 60 }
    ])
  })
})
