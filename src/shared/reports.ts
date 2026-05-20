// Pure aggregation helpers for the Reports tab. No DB, no Electron — given
// a date string and (later) log entries, compute period bounds and totals.

export type WeekStart = 'sunday' | 'monday'

export interface PeriodBounds {
  /** YYYY-MM-DD inclusive. */
  start: string
  /** YYYY-MM-DD inclusive. */
  end: string
}

function parseDateLocal(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) throw new Error(`Invalid date: ${s}`)
  return new Date(
    parseInt(m[1]!, 10),
    parseInt(m[2]!, 10) - 1,
    parseInt(m[3]!, 10)
  )
}

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + n)
  return out
}

/** Returns the [start, end] of the week containing `dateStr`. */
export function weekBoundsFor(
  dateStr: string,
  weekStart: WeekStart = 'sunday'
): PeriodBounds {
  const d = parseDateLocal(dateStr)
  const dow = d.getDay() // 0 = Sun, …, 6 = Sat
  const offsetToStart = weekStart === 'sunday' ? dow : (dow + 6) % 7
  const start = addDays(d, -offsetToStart)
  const end = addDays(start, 6)
  return { start: toDateString(start), end: toDateString(end) }
}

/** Returns the [first-day, last-day] of the month containing `dateStr`. */
export function monthBoundsFor(dateStr: string): PeriodBounds {
  const d = parseDateLocal(dateStr)
  const start = new Date(d.getFullYear(), d.getMonth(), 1)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { start: toDateString(start), end: toDateString(end) }
}

/** Shifts a period by N units. */
export function shiftWeek(
  bounds: PeriodBounds,
  n: number,
  weekStart: WeekStart = 'sunday'
): PeriodBounds {
  const start = addDays(parseDateLocal(bounds.start), n * 7)
  void weekStart
  return weekBoundsFor(toDateString(start), weekStart)
}

export function shiftMonth(bounds: PeriodBounds, n: number): PeriodBounds {
  const d = parseDateLocal(bounds.start)
  const shifted = new Date(d.getFullYear(), d.getMonth() + n, 1)
  return monthBoundsFor(toDateString(shifted))
}

export interface ContextTotal {
  contextName: string
  durationSeconds: number
}

/** Sums per-context durations across a list of log entries. */
export function totalsByContext(
  entries: { contextName: string; durationSeconds: number }[]
): ContextTotal[] {
  const map = new Map<string, number>()
  for (const e of entries) {
    map.set(e.contextName, (map.get(e.contextName) ?? 0) + e.durationSeconds)
  }
  return Array.from(map.entries())
    .map(([contextName, durationSeconds]) => ({ contextName, durationSeconds }))
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
}

/** Formats a PeriodBounds as a human-readable range (e.g. "May 11 – 17"). */
export function formatPeriodLabel(bounds: PeriodBounds): string {
  const start = parseDateLocal(bounds.start)
  const end = parseDateLocal(bounds.end)
  const fmt = (d: Date): string =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return `${fmt(start)} – ${end.getDate()}, ${end.getFullYear()}`
  }
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`
}
