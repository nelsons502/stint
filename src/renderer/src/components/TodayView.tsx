import { useTimerStore, liveSeconds } from '@renderer/store/timer'
import { useTick } from '@renderer/hooks/useTick'
import { ContextRow } from '@renderer/components/ContextRow'
import { AddContextRow } from '@renderer/components/AddContextRow'

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = arr.slice()
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

export function TodayView(): React.JSX.Element {
  const snap = useTimerStore()
  const tick = useTick(1000)

  const move = (i: number, dir: -1 | 1): void => {
    const j = i + dir
    if (j < 0 || j >= snap.contexts.length) return
    const ids = swap(
      snap.contexts.map((c) => c.id),
      i,
      j
    )
    void window.api.reorderContexts(ids)
  }

  const remove = (id: string, name: string): void => {
    if (!confirm(`Delete "${name}"? Today's accumulated time for it is lost.`)) {
      return
    }
    void window.api.deleteContext(id)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {snap.contexts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No contexts yet. Add one below to start tracking.
          </p>
        ) : (
          snap.contexts.map((c, idx) => (
            <ContextRow
              key={c.id}
              id={c.id}
              name={c.name}
              isActive={c.id === snap.activeContextId}
              isRecurring={c.isRecurring}
              liveSeconds={liveSeconds(c.id, c.todaySeconds, snap, tick)}
              position={idx + 1}
              canMoveUp={idx > 0}
              canMoveDown={idx < snap.contexts.length - 1}
              onMoveUp={() => move(idx, -1)}
              onMoveDown={() => move(idx, 1)}
              onDelete={() => remove(c.id, c.name)}
            />
          ))
        )}
        <AddContextRow />
      </div>
    </div>
  )
}
