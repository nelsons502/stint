import { useState, type FormEvent } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

export function AddContextRow(): React.JSX.Element {
  const [name, setName] = useState('')
  const [isRecurring, setIsRecurring] = useState(true)
  const [busy, setBusy] = useState(false)

  const submit = async (
    e: FormEvent,
    startImmediately: boolean
  ): Promise<void> => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await window.api.addContext({
        name: trimmed,
        isRecurring,
        startImmediately
      })
      setName('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => void submit(e, false)}
      className="flex items-center gap-2 border-t pt-3"
    >
      <Input
        placeholder="Add a context…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
        className="flex-1"
      />
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
          className="accent-primary"
        />
        recurring
      </label>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={busy || name.trim().length === 0}
      >
        Add
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={busy || name.trim().length === 0}
        onClick={(e) => void submit(e, true)}
      >
        Add &amp; Start
      </Button>
    </form>
  )
}
