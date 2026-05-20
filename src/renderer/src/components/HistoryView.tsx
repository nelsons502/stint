import { useEffect, useState, useCallback } from 'react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { formatHMS } from '../../../shared/format'
import type { DailyLogEntry } from '../../../shared/api'
import { parseHMS } from './ContextRow'

export function HistoryView(): React.JSX.Element {
  const [dates, setDates] = useState<string[] | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [entries, setEntries] = useState<DailyLogEntry[] | null>(null)

  const refreshDates = useCallback(async () => {
    const d = await window.api.getLogDates()
    setDates(d)
    // Auto-select most recent if nothing's selected (or selected day was deleted).
    setSelectedDate((prev) => {
      if (prev && d.includes(prev)) return prev
      return d[0] ?? null
    })
  }, [])

  const refreshEntries = useCallback(async (date: string | null) => {
    if (date === null) {
      setEntries(null)
      return
    }
    const e = await window.api.getLogsByDate(date)
    setEntries(e)
  }, [])

  useEffect(() => {
    void refreshDates()
  }, [refreshDates])

  useEffect(() => {
    void refreshEntries(selectedDate)
  }, [selectedDate, refreshEntries])

  if (dates === null) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (dates.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No archived days yet. Save &amp; Reset on the Today tab to create a log.
      </div>
    )
  }

  const total = (entries ?? []).reduce((s, e) => s + e.durationSeconds, 0)

  return (
    <div className="flex h-full">
      <aside className="w-44 shrink-0 overflow-y-auto border-r">
        <ul className="py-1">
          {dates.map((d) => (
            <li key={d}>
              <button
                type="button"
                onClick={() => setSelectedDate(d)}
                className={cn(
                  'block w-full px-4 py-1.5 text-left text-sm font-mono tabular-nums transition-colors',
                  selectedDate === d
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/40'
                )}
              >
                {d}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex-1 overflow-y-auto px-5 py-4">
        {selectedDate === null ? (
          <p className="text-sm text-muted-foreground">Select a day.</p>
        ) : (
          <DayEntries
            date={selectedDate}
            entries={entries}
            total={total}
            onRefresh={async () => {
              await refreshEntries(selectedDate)
            }}
            onDayDeleted={async () => {
              await refreshDates()
            }}
          />
        )}
      </section>
    </div>
  )
}

interface DayEntriesProps {
  date: string
  entries: DailyLogEntry[] | null
  total: number
  onRefresh: () => Promise<void>
  onDayDeleted: () => Promise<void>
}

function DayEntries({
  date,
  entries,
  total,
  onRefresh,
  onDayDeleted
}: DayEntriesProps): React.JSX.Element {
  const handleDeleteDay = async (): Promise<void> => {
    if (!confirm(`Delete the entire log for ${date}? This can't be undone.`)) {
      return
    }
    await window.api.deleteLogsForDate(date)
    await onDayDeleted()
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-sm tabular-nums">{date}</h2>
          <p className="text-xs text-muted-foreground">
            Total: <span className="font-mono tabular-nums">{formatHMS(total)}</span>
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => void handleDeleteDay()}>
          Delete day
        </Button>
      </header>

      {entries === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries for this day.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {entries.map((e) => (
            <LogEntryRow
              key={`${e.date}-${e.contextName}`}
              entry={e}
              onRefresh={onRefresh}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface LogEntryRowProps {
  entry: DailyLogEntry
  onRefresh: () => Promise<void>
}

function LogEntryRow({ entry, onRefresh }: LogEntryRowProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const startEdit = (): void => {
    setEditValue(formatHMS(entry.durationSeconds))
    setEditing(true)
  }

  const commitEdit = async (): Promise<void> => {
    setEditing(false)
    const parsed = parseHMS(editValue)
    if (parsed === null) return
    await window.api.updateLogDuration(entry.date, entry.contextName, parsed)
    await onRefresh()
  }

  const handleDelete = async (): Promise<void> => {
    await window.api.deleteLogEntry(entry.date, entry.contextName)
    await onRefresh()
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className="flex-1 truncate">{entry.contextName}</span>
      {editing ? (
        <input
          type="text"
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => void commitEdit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-24 rounded-md border bg-background px-2 py-1 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="rounded-md px-2 py-1 font-mono text-sm tabular-nums text-muted-foreground hover:bg-secondary"
          title="Click to edit"
        >
          {formatHMS(entry.durationSeconds)}
        </button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void handleDelete()}
      >
        Delete
      </Button>
    </li>
  )
}
