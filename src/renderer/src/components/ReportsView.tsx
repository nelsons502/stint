import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { formatHMS } from '../../../shared/format'
import {
  weekBoundsFor,
  monthBoundsFor,
  shiftWeek,
  shiftMonth,
  totalsByContext,
  formatPeriodLabel,
  type PeriodBounds
} from '../../../shared/reports'
import { toCsv } from '../../../shared/csv'
import type { DailyLogEntry } from '../../../shared/api'

type Mode = 'week' | 'month'

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ReportsView(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('week')
  const [bounds, setBounds] = useState<PeriodBounds>(() =>
    weekBoundsFor(todayLocal())
  )
  const [entries, setEntries] = useState<DailyLogEntry[] | null>(null)

  // When toggling mode, snap to the current period containing `bounds.start`.
  const setModeAndPeriod = (next: Mode): void => {
    setMode(next)
    setBounds(
      next === 'week' ? weekBoundsFor(bounds.start) : monthBoundsFor(bounds.start)
    )
  }

  const shift = (n: number): void => {
    setBounds((b) => (mode === 'week' ? shiftWeek(b, n) : shiftMonth(b, n)))
  }

  useEffect(() => {
    let cancelled = false
    void window.api
      .getLogsByDateRange(bounds.start, bounds.end)
      .then((e) => {
        if (!cancelled) setEntries(e)
      })
    return () => {
      cancelled = true
    }
  }, [bounds.start, bounds.end])

  const totals = useMemo(
    () => totalsByContext(entries ?? []),
    [entries]
  )
  const grandTotal = totals.reduce((s, t) => s + t.durationSeconds, 0)

  const exportPeriod = async (): Promise<void> => {
    if (!entries) return
    const csv = toCsv(
      entries.map((e) => ({
        date: e.date,
        context: e.contextName,
        durationSeconds: e.durationSeconds
      }))
    )
    const tag = mode === 'week' ? 'week' : 'month'
    const file = `stint-${tag}-${bounds.start}-to-${bounds.end}.csv`
    await window.api.exportCsv({ suggestedFilename: file, content: csv })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div className="inline-flex rounded-md border bg-background p-0.5">
          {(['week', 'month'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModeAndPeriod(m)}
              className={cn(
                'rounded-sm px-3 py-1 text-xs font-medium capitalize transition-colors',
                mode === m
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous period"
            onClick={() => shift(-1)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm">{formatPeriodLabel(bounds)}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next period"
            onClick={() => shift(1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!entries || entries.length === 0}
          onClick={() => void exportPeriod()}
        >
          Export CSV
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {entries === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : totals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No tracked time in this period.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {totals.map((t) => {
              const pct =
                grandTotal === 0 ? 0 : (t.durationSeconds / grandTotal) * 100
              return (
                <li
                  key={t.contextName}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate">{t.contextName}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatHMS(t.durationSeconds)}
                  </span>
                </li>
              )
            })}
            <li className="flex items-center justify-between bg-secondary/40 px-3 py-2 text-sm font-medium">
              <span>Total</span>
              <span className="font-mono tabular-nums">
                {formatHMS(grandTotal)}
              </span>
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}
