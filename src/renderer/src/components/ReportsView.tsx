import { useEffect, useMemo, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
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
import type { DailyLogEntry, GoalProgress } from '../../../shared/api'
import { useSettingsStore } from '@renderer/store/settings'
import { PaywallDialog } from './PaywallDialog'
import { SetGoalDialog } from './SetGoalDialog'

type Mode = 'week' | 'month' | 'history'

function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function ReportsView(): React.JSX.Element {
  const weekStart = useSettingsStore((s) => s.weekStart)
  const [mode, setMode] = useState<Mode>('week')
  const [bounds, setBounds] = useState<PeriodBounds>(() =>
    weekBoundsFor(todayLocal(), weekStart)
  )
  const [entries, setEntries] = useState<DailyLogEntry[] | null>(null)
  const [unlocked, setUnlocked] = useState<boolean | null>(null)
  const [paywallOpen, setPaywallOpen] = useState(false)

  useEffect(() => {
    void window.api.getGoalsUnlocked().then(setUnlocked)
  }, [])

  useEffect(() => {
    if (mode === 'week') {
      setBounds((b) => weekBoundsFor(b.start, weekStart))
    }
  }, [weekStart, mode])

  const setModeAndPeriod = (next: Mode): void => {
    setMode(next)
    if (next === 'week') setBounds(weekBoundsFor(bounds.start, weekStart))
    else if (next === 'month') setBounds(monthBoundsFor(bounds.start))
  }

  const shift = (n: number): void => {
    setBounds((b) =>
      mode === 'week' ? shiftWeek(b, n, weekStart) : shiftMonth(b, n)
    )
  }

  useEffect(() => {
    if (mode === 'history') return
    let cancelled = false
    void window.api
      .getLogsByDateRange(bounds.start, bounds.end)
      .then((e) => {
        if (!cancelled) setEntries(e)
      })
    return () => {
      cancelled = true
    }
  }, [bounds.start, bounds.end, mode])

  const totals = useMemo(() => totalsByContext(entries ?? []), [entries])
  const grandTotal = totals.reduce((s, t) => s + t.durationSeconds, 0)

  const exportPeriod = async (): Promise<void> => {
    if (!entries || !unlocked) return
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
          {(['week', 'month', 'history'] as const).map((m) => (
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

        {mode !== 'history' && (
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
        )}

        {mode !== 'history' && (
          <Button
            variant="outline"
            size="sm"
            disabled={!entries || entries.length === 0 || !unlocked}
            onClick={unlocked ? () => void exportPeriod() : () => setPaywallOpen(true)}
            title={!unlocked ? 'Unlock premium to export CSV' : undefined}
          >
            {!unlocked && <Lock className="mr-1 h-3 w-3" />}
            Export CSV
          </Button>
        )}

        {mode === 'history' && <div />}
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {mode === 'history' ? (
          <HistoryChart
            unlocked={unlocked}
            weekStart={weekStart}
            onPaywall={() => setPaywallOpen(true)}
          />
        ) : (
          <>
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Totals
              </h3>
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
                      grandTotal === 0
                        ? 0
                        : (t.durationSeconds / grandTotal) * 100
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
            </section>

            {mode === 'week' && (
              <GoalsPanel
                unlocked={unlocked}
                onUnlocked={() => setUnlocked(true)}
              />
            )}
          </>
        )}
      </div>

      <PaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        onUnlocked={() => setUnlocked(true)}
      />
    </div>
  )
}

// ---------------------------------------------------------------- HistoryChart

interface HistoryChartProps {
  unlocked: boolean | null
  weekStart: string
  onPaywall: () => void
}

const HISTORY_WEEKS = 6

function HistoryChart({ unlocked, weekStart, onPaywall }: HistoryChartProps): React.JSX.Element {
  const [entries, setEntries] = useState<DailyLogEntry[] | null>(null)

  useEffect(() => {
    if (!unlocked) return
    const today = todayLocal()
    const current = weekBoundsFor(today, weekStart as 'sunday' | 'monday')
    // Shift back HISTORY_WEEKS - 1 from the current week start
    let earliest = current
    for (let i = 1; i < HISTORY_WEEKS; i++) {
      earliest = shiftWeek(earliest, -1, weekStart as 'sunday' | 'monday')
    }
    let cancelled = false
    void window.api
      .getLogsByDateRange(earliest.start, current.end)
      .then((e) => { if (!cancelled) setEntries(e) })
    return () => { cancelled = true }
  }, [unlocked, weekStart])

  if (unlocked === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (!unlocked) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        History charts are a premium feature.{' '}
        <button
          type="button"
          onClick={onPaywall}
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Unlock for $6
        </button>
        .
      </div>
    )
  }

  if (entries === null) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No tracked time in the last {HISTORY_WEEKS} weeks.
      </p>
    )
  }

  // Build week buckets
  const today = todayLocal()
  const weeks: PeriodBounds[] = []
  let w = weekBoundsFor(today, weekStart as 'sunday' | 'monday')
  for (let i = 0; i < HISTORY_WEEKS; i++) {
    weeks.unshift(w)
    w = shiftWeek(w, -1, weekStart as 'sunday' | 'monday')
  }

  // Per-context, per-week totals
  const contextNames = [...new Set(entries.map((e) => e.contextName))].sort()
  const data: Record<string, number[]> = {}
  for (const name of contextNames) {
    data[name] = weeks.map((wk) =>
      entries
        .filter(
          (e) => e.contextName === name && e.date >= wk.start && e.date <= wk.end
        )
        .reduce((s, e) => s + e.durationSeconds, 0)
    )
  }

  // Max seconds in any single (context, week) cell for bar scaling
  const maxSec = Math.max(
    1,
    ...contextNames.flatMap((n) => data[n])
  )

  return (
    <section className="space-y-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Last {HISTORY_WEEKS} weeks
      </h3>

      {/* Week labels */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `120px repeat(${HISTORY_WEEKS}, 1fr)` }}>
        <div />
        {weeks.map((wk, i) => (
          <div key={i} className="text-center text-xs text-muted-foreground">
            {wk.start.slice(5)}
          </div>
        ))}
      </div>

      {contextNames.map((name) => (
        <div
          key={name}
          className="grid items-center gap-2"
          style={{ gridTemplateColumns: `120px repeat(${HISTORY_WEEKS}, 1fr)` }}
        >
          <span className="truncate text-sm" title={name}>{name}</span>
          {data[name].map((sec, i) => {
            const pct = (sec / maxSec) * 100
            return (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <div className="h-10 w-full rounded-sm bg-secondary">
                  <div
                    className="w-full rounded-sm bg-primary transition-all"
                    style={{ height: `${pct}%`, marginTop: `${100 - pct}%` }}
                    title={formatHMS(sec)}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {sec > 0 ? formatHMS(sec) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}

// ---------------------------------------------------------------- GoalsPanel

interface GoalsPanelProps {
  unlocked: boolean | null
  onUnlocked: () => void
}

function GoalsPanel({ unlocked, onUnlocked }: GoalsPanelProps): React.JSX.Element {
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [editing, setEditing] = useState<{
    contextId: string
    targetSecondsPerWeek: number
    targetSecondsPerDay?: number | null
  } | null>(null)
  const [progress, setProgress] = useState<GoalProgress[]>([])

  const refresh = useCallback(async () => {
    const p = await window.api.listGoalProgress()
    setProgress(p)
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 30_000)
    return () => clearInterval(id)
  }, [refresh])

  const openAdd = (): void => {
    if (!unlocked) {
      setPaywallOpen(true)
      return
    }
    setEditing(null)
    setGoalDialogOpen(true)
  }

  const openEdit = (g: GoalProgress): void => {
    setEditing({
      contextId: g.contextId,
      targetSecondsPerWeek: g.targetSecondsPerWeek,
      targetSecondsPerDay: g.targetSecondsPerDay
    })
    setGoalDialogOpen(true)
  }

  const remove = async (g: GoalProgress): Promise<void> => {
    if (!confirm(`Remove the goal for "${g.contextName}"?`)) return
    await window.api.deleteGoal(g.contextId)
    await refresh()
  }

  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Goals
        </h3>
        <Button size="sm" variant="outline" onClick={openAdd}>
          {unlocked === false && <Lock className="mr-1" />}
          Add goal
        </Button>
      </header>

      {unlocked === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !unlocked && progress.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Goals (weekly + daily) are a one-time unlock.{' '}
          <button
            type="button"
            onClick={() => setPaywallOpen(true)}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Unlock for $6
          </button>
          .
        </div>
      ) : progress.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No goals yet. Click &ldquo;Add goal&rdquo; to set one.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {progress.map((g) => {
            const weekPct = Math.min(
              100,
              (g.currentSeconds / g.targetSecondsPerWeek) * 100
            )
            const dayPct =
              g.targetSecondsPerDay !== null && g.dailyCurrentSeconds !== null
                ? Math.min(100, (g.dailyCurrentSeconds / g.targetSecondsPerDay) * 100)
                : null
            return (
              <li key={g.contextId} className="px-3 py-2.5">
                <div className="mb-1.5 flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate">{g.contextName}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatHMS(g.currentSeconds)} /{' '}
                    {formatHMS(g.targetSecondsPerWeek)}
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => openEdit(g)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void remove(g)}
                    className="hover:text-destructive"
                  >
                    Remove
                  </Button>
                </div>

                {/* Weekly bar */}
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                  aria-label={`Weekly: ${Math.round(weekPct)}% complete`}
                >
                  <div
                    className={cn(
                      'h-full transition-all',
                      g.hit ? 'bg-emerald-500' : 'bg-primary'
                    )}
                    style={{ width: `${weekPct}%` }}
                  />
                </div>

                {/* Daily bar — only shown when a daily goal is set */}
                {dayPct !== null && g.dailyCurrentSeconds !== null && g.targetSecondsPerDay !== null && (
                  <div className="mt-1.5">
                    <div className="mb-0.5 flex justify-between text-xs text-muted-foreground">
                      <span>Today</span>
                      <span className="font-mono tabular-nums">
                        {formatHMS(g.dailyCurrentSeconds)} / {formatHMS(g.targetSecondsPerDay)}
                      </span>
                    </div>
                    <div
                      className="h-1 w-full overflow-hidden rounded-full bg-secondary"
                      aria-label={`Daily: ${Math.round(dayPct)}% complete`}
                    >
                      <div
                        className={cn(
                          'h-full transition-all',
                          g.dailyHit ? 'bg-emerald-400' : 'bg-primary/60'
                        )}
                        style={{ width: `${dayPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <PaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        onUnlocked={() => {
          onUnlocked()
          setEditing(null)
          setGoalDialogOpen(true)
        }}
      />
      <SetGoalDialog
        open={goalDialogOpen}
        onOpenChange={setGoalDialogOpen}
        editing={editing}
        excludeContextIds={progress.map((p) => p.contextId)}
        onSaved={() => void refresh()}
      />
    </section>
  )
}
