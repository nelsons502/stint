/**
 * Given an HH:MM target (local time) and a "now" timestamp, returns the
 * unix ms of the next occurrence of that time-of-day. If today's instance
 * is still in the future, returns it; otherwise returns tomorrow's.
 *
 * Uses local-time Date arithmetic, so DST transitions don't drift the
 * scheduled wall-clock time.
 */
export function computeNextFireTime(targetHM: string, nowMs: number): number {
  const m = /^(\d{2}):(\d{2})$/.exec(targetHM)
  if (!m) throw new Error(`Invalid time format: ${targetHM}`)
  const h = parseInt(m[1]!, 10)
  const mins = parseInt(m[2]!, 10)
  if (h > 23 || mins > 59) throw new Error(`Invalid time value: ${targetHM}`)

  const d = new Date(nowMs)
  const target = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    h,
    mins,
    0,
    0
  )
  if (target.getTime() <= nowMs) {
    target.setDate(target.getDate() + 1)
  }
  return target.getTime()
}
