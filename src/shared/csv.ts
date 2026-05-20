// Minimal RFC 4180 CSV helpers. Used for both daily-log export and import.
// Format produced/consumed:
//   date,context,duration_seconds,duration_formatted
//   2026-05-14,Main Job,21664,06:01:04

import { formatHMS } from './format'

export interface CsvRow {
  date: string
  context: string
  durationSeconds: number
}

const HEADER = 'date,context,duration_seconds,duration_formatted'

function escape(field: string): string {
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

export function toCsv(rows: CsvRow[]): string {
  const lines = [HEADER]
  for (const r of rows) {
    lines.push(
      [
        escape(r.date),
        escape(r.context),
        String(r.durationSeconds),
        formatHMS(r.durationSeconds)
      ].join(',')
    )
  }
  return lines.join('\n') + '\n'
}

export interface ParseResult {
  rows: CsvRow[]
  errors: { line: number; message: string }[]
}

/**
 * Parses a CSV produced by toCsv() (or any compatible file). Tolerates
 * trailing newlines, BOM, and an optional duration_formatted column. The
 * minimum required columns are date, context, duration_seconds.
 *
 * Rows that fail validation are skipped with an error message; valid rows
 * are returned regardless. The caller decides how to surface errors.
 */
export function parseCsv(input: string): ParseResult {
  const rows: CsvRow[] = []
  const errors: { line: number; message: string }[] = []
  // Strip BOM if present
  const text = input.replace(/^﻿/, '')
  const records = splitRecords(text)
  if (records.length === 0) return { rows, errors }

  const header = records[0]!.map((s) => s.trim().toLowerCase())
  const dateIdx = header.indexOf('date')
  const contextIdx = header.indexOf('context')
  const durationIdx = header.indexOf('duration_seconds')
  if (dateIdx < 0 || contextIdx < 0 || durationIdx < 0) {
    errors.push({
      line: 1,
      message:
        'Header must include date, context, duration_seconds columns'
    })
    return { rows, errors }
  }

  for (let i = 1; i < records.length; i++) {
    const fields = records[i]!
    const line = i + 1
    if (fields.length === 1 && fields[0] === '') continue
    const date = fields[dateIdx]?.trim() ?? ''
    const context = fields[contextIdx]?.trim() ?? ''
    const durationStr = fields[durationIdx]?.trim() ?? ''

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ line, message: `Invalid date "${date}"` })
      continue
    }
    if (context === '') {
      errors.push({ line, message: 'Empty context name' })
      continue
    }
    const duration = Number(durationStr)
    if (!Number.isFinite(duration) || duration < 0) {
      errors.push({
        line,
        message: `Invalid duration_seconds "${durationStr}"`
      })
      continue
    }
    rows.push({ date, context, durationSeconds: Math.round(duration) })
  }

  return { rows, errors }
}

/** Splits a CSV string into records (rows), each an array of unquoted fields. */
function splitRecords(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\n' || ch === '\r') {
      row.push(field)
      field = ''
      out.push(row)
      row = []
      // Skip a paired \r\n.
      if (ch === '\r' && text[i + 1] === '\n') i++
      i++
      continue
    }
    field += ch
    i++
  }
  // Flush the last field/row if the file doesn't end in a newline.
  if (field !== '' || row.length > 0) {
    row.push(field)
    out.push(row)
  }
  return out
}
