import { useEffect, useState } from 'react'
import { useTimerStore, bindIpcToStore, liveSeconds } from '@renderer/store/timer'
import { useTick } from '@renderer/hooks/useTick'
import { formatTitle } from '../../shared/format'
import type { RecoveryInfo, RecoveryChoice } from '../../shared/api'
import { Button } from '@renderer/components/ui/button'
import { ContextRow } from '@renderer/components/ContextRow'
import { AddContextRow } from '@renderer/components/AddContextRow'
import { SaveAndResetDialog } from '@renderer/components/SaveAndResetDialog'
import { RecoveryDialog } from '@renderer/components/RecoveryDialog'

function App(): React.JSX.Element {
  const snap = useTimerStore()
  const tick = useTick(1000)

  const [saveOpen, setSaveOpen] = useState(false)
  const [recovery, setRecovery] = useState<RecoveryInfo | null>(null)

  useEffect(() => {
    // Apply dark mode based on system preference.
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      document.documentElement.classList.toggle('dark', mql.matches)
    }
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const unbind = bindIpcToStore()
    void window.api.getPendingRecovery().then((r) => setRecovery(r))
    return unbind
  }, [])

  const resolveRecovery = async (choice: RecoveryChoice): Promise<void> => {
    await window.api.finalizeRecovery(choice)
    setRecovery(null)
  }

  const activeContext = snap.contexts.find(
    (c) => c.id === snap.activeContextId
  )
  const headerLine = activeContext
    ? formatTitle(
        activeContext.name,
        liveSeconds(activeContext.id, activeContext.todaySeconds, snap, tick)
      )
    : 'Paused'

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Stint</h1>
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {headerLine}
            <span className="mx-2 text-muted-foreground/50">·</span>
            {snap.sessionDate || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void window.api.pause()}
            disabled={snap.activeContextId === null}
          >
            Pause
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSaveOpen(true)}
          >
            Save &amp; Reset…
          </Button>
        </div>
      </header>

      <main className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
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
      </main>

      <SaveAndResetDialog open={saveOpen} onOpenChange={setSaveOpen} />
      <RecoveryDialog recovery={recovery} onResolve={(c) => void resolveRecovery(c)} />
    </div>
  )
}

export default App
