/** Formats a seconds count as H:MM:SS (no leading zero on hours). */
export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60
  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

/** Formats elapsed for the menubar title. Same as formatHMS for now. */
export function formatTitle(name: string, totalSeconds: number): string {
  return `${name} — ${formatHMS(totalSeconds)}`
}
