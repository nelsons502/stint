import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

export interface PaywallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUnlocked: () => void
}

const VENMO_HANDLE = '@nelson'
const PRICE_USD = 4

export function PaywallDialog({
  open,
  onOpenChange,
  onUnlocked
}: PaywallDialogProps): React.JSX.Element {
  const [confirming, setConfirming] = useState(false)

  const confirmPaid = async (): Promise<void> => {
    setConfirming(true)
    try {
      await window.api.setGoalsUnlocked(true)
      onUnlocked()
      onOpenChange(false)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unlock weekly goals</DialogTitle>
          <DialogDescription>
            Set per-context weekly hour targets and get a notification when you
            hit them. One-time, honor-system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border bg-secondary/40 p-4 text-sm">
          <p>
            <span className="text-muted-foreground">Send</span>{' '}
            <span className="font-mono font-medium">${PRICE_USD}</span>{' '}
            <span className="text-muted-foreground">via Venmo to</span>{' '}
            <span className="font-mono font-medium">{VENMO_HANDLE}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Note: &ldquo;Stint&rdquo; so it&apos;s easy to find later.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
          >
            Cancel
          </Button>
          <Button onClick={() => void confirmPaid()} disabled={confirming}>
            {confirming ? 'Unlocking…' : "I've sent it — unlock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
