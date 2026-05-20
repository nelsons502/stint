import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { useTimerStore, liveSeconds } from '@renderer/store/timer'
import { useTick } from '@renderer/hooks/useTick'
import { formatHMS } from '../../../shared/format'
import type { AutoSaveConfig } from '../../../shared/api'

export interface SaveAndResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SaveAndResetDialog({
  open,
  onOpenChange
}: SaveAndResetDialogProps): React.JSX.Element {
  const snap = useTimerStore()
  const tick = useTick(1000)
  const [date, setDate] = useState(snap.sessionDate)
  const [busy, setBusy] = useState(false)
  const [autoSave, setAutoSave] = useState<AutoSaveConfig | null>(null)

  useEffect(() => {
    if (open) {
      setDate(snap.sessionDate)
      void window.api.getAutoSaveConfig().then(setAutoSave)
    }
  }, [open, snap.sessionDate])

  const entries = useMemo(
    () =>
      snap.contexts
        .map((c) => ({
          id: c.id,
          name: c.name,
          seconds: Math.floor(liveSeconds(c.id, c.todaySeconds, snap, tick))
        }))
        .filter((e) => e.seconds > 0)
        .sort((a, b) => b.seconds - a.seconds),
    [snap, tick]
  )

  const total = entries.reduce((sum, e) => sum + e.seconds, 0)

  const confirm = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.saveAndReset(date)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const updateAutoSave = async (next: AutoSaveConfig): Promise<void> => {
    setAutoSave(next)
    await window.api.setAutoSaveConfig(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save &amp; Reset</DialogTitle>
          <DialogDescription>
            Archive today&apos;s times to the log, then clear everything and
            reload recurring contexts at zero.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Save as</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="font-mono"
            />
          </label>

          <div className="rounded-md border">
            {entries.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No tracked time today.
              </p>
            ) : (
              <ul className="divide-y">
                {entries.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between px-3 py-1.5 text-sm"
                  >
                    <span>{e.name}</span>
                    <span className="font-mono tabular-nums">
                      {formatHMS(e.seconds)}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between bg-secondary/40 px-3 py-1.5 text-sm font-medium">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">
                    {formatHMS(total)}
                  </span>
                </li>
              </ul>
            )}
          </div>

          {autoSave && (
            <div className="rounded-md border border-dashed p-3 text-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Auto-save
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoSave.enabled}
                  onChange={(e) =>
                    void updateAutoSave({
                      ...autoSave,
                      enabled: e.target.checked
                    })
                  }
                  className="accent-primary"
                />
                <span>Automatically save &amp; reset daily at</span>
                <Input
                  type="time"
                  value={autoSave.time}
                  disabled={!autoSave.enabled}
                  onChange={(e) =>
                    void updateAutoSave({
                      ...autoSave,
                      time: e.target.value
                    })
                  }
                  className="w-28 font-mono"
                />
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Saving…' : 'Save & Reset'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
