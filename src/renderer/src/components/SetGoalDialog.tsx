import { useEffect, useState } from 'react'
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
import { useTimerStore } from '@renderer/store/timer'

export interface SetGoalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Existing context id to edit, or null when creating a new goal. */
  editing: {
    contextId: string
    targetSecondsPerWeek: number
  } | null
  /** Context ids that already have goals — disabled when creating. */
  excludeContextIds: string[]
  onSaved: () => void
}

export function SetGoalDialog({
  open,
  onOpenChange,
  editing,
  excludeContextIds,
  onSaved
}: SetGoalDialogProps): React.JSX.Element {
  const { contexts } = useTimerStore()
  const [contextId, setContextId] = useState(editing?.contextId ?? '')
  const [hoursStr, setHoursStr] = useState(
    editing ? (editing.targetSecondsPerWeek / 3600).toString() : ''
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setContextId(editing?.contextId ?? '')
      setHoursStr(
        editing ? (editing.targetSecondsPerWeek / 3600).toString() : ''
      )
    }
  }, [open, editing])

  const eligibleContexts = editing
    ? contexts.filter((c) => c.id === editing.contextId)
    : contexts.filter((c) => !excludeContextIds.includes(c.id))

  const hours = Number(hoursStr)
  const canSave =
    contextId !== '' && Number.isFinite(hours) && hours > 0 && !busy

  const save = async (): Promise<void> => {
    if (!canSave) return
    setBusy(true)
    try {
      await window.api.setGoal(contextId, Math.round(hours * 3600))
      onSaved()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit goal' : 'Set weekly goal'}
          </DialogTitle>
          <DialogDescription>
            Stint will notify you when you hit this target during the current
            week.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">Context</span>
            <select
              value={contextId}
              onChange={(e) => setContextId(e.target.value)}
              disabled={editing !== null}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {editing === null && (
                <option value="" disabled>
                  Choose a context…
                </option>
              )}
              {eligibleContexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">
              Hours per week
            </span>
            <Input
              type="number"
              min="0.1"
              step="0.5"
              value={hoursStr}
              onChange={(e) => setHoursStr(e.target.value)}
              className="font-mono"
            />
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!canSave}>
            {busy ? 'Saving…' : 'Save goal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
