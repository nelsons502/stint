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

type Mode = 'week' | 'month'

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

  // When the user changes Week starts in Settings, re-snap the current
  // weekly view to the matching bounds.
  useEffect(() => {
    if (mode === 'week') {
      setBounds((b) => weekBoundsFor(b.start, weekStart))
    }
  }, [weekStart, mode])

  const setModeAndPeriod = (next: Mode): void => {
    setMode(next)
    setBounds(
      next === 'week'
        ? weekBoundsFor(bounds.start, weekStart)
        : monthBoundsFor(bounds.start)
    )
  }

  const shift = (n: number): void => {
    setBounds((b) =>
      mode === 'week' ? shiftWeek(b, n, weekStart) : shiftMonth(b, n)
    )
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

  const totals = useMemo(() => totalsByContext(entries ?? []), [entries])
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

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
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

        {mode === 'week' && <GoalsPanel />}
      </div>
    </div>
  )
}

function GoalsPanel(): React.JSX.Element {
  const [unlocked, setUnlocked] = useState<boolean | null>(null)
  const [paywallOpen, setPaywallOpen] = useState(false)
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [editing, setEditing] = useState<{
    contextId: string
    targetSecondsPerWeek: number
  } | null>(null)
  const [progress, setProgress] = useState<GoalProgress[]>([])

  const refresh = useCallback(async () => {
    const [u, p] = await Promise.all([
      window.api.getGoalsUnlocked(),
      window.api.listGoalProgress()
    ])
    setUnlocked(u)
    setProgress(p)
  }, [])

  useEffect(() => {
    void refresh()
    // Refresh progress every 30s so a long-open Reports tab stays current.
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
      targetSecondsPerWeek: g.targetSecondsPerWeek
    })
    setGoalDialogOpen(true)
  }

  const remove = async (g: GoalProgress): Promise<void> => {
    if (!confirm(`Remove the weekly goal for "${g.contextName}"?`)) return
    await window.api.deleteGoal(g.contextId)
    await refresh()
  }

  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Weekly goals
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
          Weekly goals are a one-time unlock.{' '}
          <button
            type="button"
            onClick={() => setPaywallOpen(true)}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Unlock for $4
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
            const pct = Math.min(
              100,
              (g.currentSeconds / g.targetSecondsPerWeek) * 100
            )
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
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                  aria-label={`${Math.round(pct)}% complete`}
                >
                  <div
                    className={cn(
                      'h-full transition-all',
                      g.hit ? 'bg-emerald-500' : 'bg-primary'
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <PaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        onUnlocked={() => {
          setUnlocked(true)
          // Open the add-goal dialog right after unlocking for momentum.
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
