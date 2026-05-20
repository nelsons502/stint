import { useState } from 'react'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { formatHMS } from '../../../shared/format'

export interface ContextRowProps {
  id: string
  name: string
  liveSeconds: number
  isActive: boolean
  /** 1-based position in the displayed list (drives the ⌘⇧N hotkey hint). */
  position: number
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

export function ContextRow({
  id,
  name,
  liveSeconds: live,
  isActive,
  position,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDelete
}: ContextRowProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const startEdit = (): void => {
    setEditValue(formatHMS(live))
    setEditing(true)
  }

  const commitEdit = async (): Promise<void> => {
    setEditing(false)
    const parsed = parseHMS(editValue)
    if (parsed === null) return
    await window.api.setContextSeconds(id, parsed)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border px-3 py-2 transition-colors',
        isActive
          ? 'border-primary/40 bg-primary/5'
          : 'border-transparent hover:bg-secondary/40'
      )}
    >
      <button
        type="button"
        onClick={() => void window.api.switchTo(id)}
        className="flex flex-1 items-center gap-3 text-left"
      >
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            isActive ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
        />
        <span className="text-sm font-medium">{name}</span>
        {position <= 9 && (
          <span className="text-xs text-muted-foreground">⌘⇧{position}</span>
        )}
      </button>

      {editing ? (
        <input
          type="text"
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => void commitEdit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-24 rounded-md border bg-background px-2 py-1 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          title="Click to edit"
          className="rounded-md px-2 py-1 font-mono text-sm tabular-nums text-muted-foreground hover:bg-secondary"
        >
          {formatHMS(live)}
        </button>
      )}

      {isActive ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void window.api.pause()}
        >
          Pause
        </Button>
      ) : null}

      <div className="flex items-center text-muted-foreground">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Move up"
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Move down"
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          <ChevronDown />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${name}`}
          onClick={onDelete}
          className="hover:text-destructive"
        >
          <X />
        </Button>
      </div>
    </div>
  )
}

/** Parses "H:MM:SS", "M:SS", or just seconds; returns null on invalid input. */
export function parseHMS(s: string): number | null {
  const trimmed = s.trim()
  if (trimmed === '') return null
  const parts = trimmed.split(':').map((p) => p.trim())
  if (parts.some((p) => !/^\d+$/.test(p))) return null
  const nums = parts.map((p) => parseInt(p, 10))
  if (nums.length === 1) return nums[0]!
  if (nums.length === 2) return nums[0]! * 60 + nums[1]!
  if (nums.length === 3) return nums[0]! * 3600 + nums[1]! * 60 + nums[2]!
  return null
}
