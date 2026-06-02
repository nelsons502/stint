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
import { Input } from '@renderer/components/ui/input'

export interface PaywallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUnlocked: () => void
}

const CONTACT_EMAIL = 'nelson@focus-coding.com'
const PRICE_USD = 6

export function PaywallDialog({
  open,
  onOpenChange,
  onUnlocked
}: PaywallDialogProps): React.JSX.Element {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const handleOpenChange = (next: boolean): void => {
    if (!next) {
      setKey('')
      setError(false)
    }
    onOpenChange(next)
  }

  const submit = async (): Promise<void> => {
    if (!key.trim() || busy) return
    setBusy(true)
    setError(false)
    try {
      const valid = await window.api.validateLicenseKey(key.trim())
      if (valid) {
        onUnlocked()
        handleOpenChange(false)
      } else {
        setError(true)
      }
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') void submit()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unlock premium features</DialogTitle>
          <DialogDescription>
            Weekly goals, daily goals, history charts, and CSV export.
            One-time ${PRICE_USD} payment, yours forever.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-secondary/40 p-4 text-sm">
            <p className="text-muted-foreground">
              Email{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Stint%20unlock`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>{' '}
              with subject <span className="font-mono">&ldquo;Stint unlock&rdquo;</span>.
              You&apos;ll receive a license key after payment.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-muted-foreground">License key</label>
            <Input
              placeholder="Paste your license key here…"
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setError(false)
              }}
              onKeyDown={onKeyDown}
              className={error ? 'border-destructive focus-visible:ring-destructive' : ''}
              disabled={busy}
            />
            {error && (
              <p className="text-xs text-destructive">
                Invalid license key. Check for typos or contact {CONTACT_EMAIL}.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!key.trim() || busy}
          >
            {busy ? 'Verifying…' : 'Unlock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
