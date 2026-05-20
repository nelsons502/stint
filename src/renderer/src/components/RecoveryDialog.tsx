import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import type { RecoveryInfo, RecoveryChoice } from '../../../shared/api'
import { formatHMS } from '../../../shared/format'

export interface RecoveryDialogProps {
  recovery: RecoveryInfo | null
  onResolve: (choice: RecoveryChoice) => void
}

export function RecoveryDialog({
  recovery,
  onResolve
}: RecoveryDialogProps): React.JSX.Element {
  const open = recovery !== null
  const elapsed = recovery ? formatHMS(recovery.elapsedSinceStartSeconds) : ''
  const name = recovery?.activeContextName ?? ''

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md"
        // No close button — user must choose.
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Resume timer?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{name}</span> was
            running when Stint last quit.{' '}
            <span className="font-mono tabular-nums">{elapsed}</span> have
            elapsed since.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button onClick={() => onResolve('resume-since')} className="w-full">
            Resume — count the time since {name} last started
          </Button>
          <Button
            variant="secondary"
            onClick={() => onResolve('resume-now')}
            className="w-full"
          >
            Resume from now — discard the time gap
          </Button>
          <Button
            variant="outline"
            onClick={() => onResolve('discard')}
            className="w-full"
          >
            Discard — leave paused
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
