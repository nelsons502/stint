import { useEffect, useState } from 'react'
import { useTimerStore, bindIpcToStore, liveSeconds } from '@renderer/store/timer'
import { useTick } from '@renderer/hooks/useTick'
import { formatTitle } from '../../shared/format'
import type { RecoveryInfo, RecoveryChoice } from '../../shared/api'
import { Button } from '@renderer/components/ui/button'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@renderer/components/ui/tabs'
import { TodayView } from '@renderer/components/TodayView'
import { HistoryView } from '@renderer/components/HistoryView'
import { SaveAndResetDialog } from '@renderer/components/SaveAndResetDialog'
import { RecoveryDialog } from '@renderer/components/RecoveryDialog'

function App(): React.JSX.Element {
  const snap = useTimerStore()
  const tick = useTick(1000)

  const [saveOpen, setSaveOpen] = useState(false)
  const [recovery, setRecovery] = useState<RecoveryInfo | null>(null)

  useEffect(() => {
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

      <Tabs defaultValue="today" className="flex flex-1 flex-col gap-0 overflow-hidden">
        <TabsList className="mx-5 mt-3 self-start">
          <TabsTrigger value="today">Today</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="flex-1 overflow-hidden">
          <TodayView />
        </TabsContent>
        <TabsContent value="history" className="flex-1 overflow-hidden">
          <HistoryView />
        </TabsContent>
      </Tabs>

      <SaveAndResetDialog open={saveOpen} onOpenChange={setSaveOpen} />
      <RecoveryDialog
        recovery={recovery}
        onResolve={(c) => void resolveRecovery(c)}
      />
    </div>
  )
}

export default App
