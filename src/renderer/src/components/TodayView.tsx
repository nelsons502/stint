import { useTimerStore, liveSeconds } from '@renderer/store/timer'
import { useTick } from '@renderer/hooks/useTick'
import { ContextRow } from '@renderer/components/ContextRow'
import { AddContextRow } from '@renderer/components/AddContextRow'

export function TodayView(): React.JSX.Element {
  const snap = useTimerStore()
  const tick = useTick(1000)

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
              liveSeconds={liveSeconds(c.id, c.todaySeconds, snap, tick)}
              position={idx + 1}
            />
          ))
        )}
        <AddContextRow />
      </div>
    </div>
  )
}
