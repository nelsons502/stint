import { useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { useSettingsStore, updateSetting } from '@renderer/store/settings'
import type { AppSettings, HotkeysConfig } from '../../../shared/api'

export function SettingsView(): React.JSX.Element {
  const settings = useSettingsStore()
  const update = updateSetting

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
      <TimerSection settings={settings} update={update} />
      <HotkeysSection settings={settings} update={update} />
      <AppSection settings={settings} update={update} />
      <DataSection />
      <AboutSection />
    </div>
  )
}

// ---------------------------------------------------------------- primitives

interface SectionProps {
  title: string
  description?: string
  children: React.ReactNode
}

function Section({ title, description, children }: SectionProps): React.JSX.Element {
  return (
    <section>
      <header className="mb-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            {description}
          </p>
        )}
      </header>
      <div className="space-y-2 rounded-md border p-3">{children}</div>
    </section>
  )
}

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled
}: ToggleRowProps): React.JSX.Element {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span className="flex-1">
        <span className="block">{label}</span>
        {description && (
          <span className="block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-primary"
      />
    </label>
  )
}

// ---------------------------------------------------------------- Timer

interface TimerSectionProps {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}

function TimerSection({
  settings,
  update
}: TimerSectionProps): React.JSX.Element {
  return (
    <Section title="Timer">
      <ToggleRow
        label="Auto-save & reset daily"
        description="At the configured time each day, automatically archive today's times and start fresh."
        checked={settings.autoSave.enabled}
        onChange={(enabled) =>
          void update({ autoSave: { ...settings.autoSave, enabled } })
        }
      />
      <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
        <span className="flex-1">Auto-save time</span>
        <Input
          type="time"
          value={settings.autoSave.time}
          disabled={!settings.autoSave.enabled}
          onChange={(e) =>
            void update({
              autoSave: { ...settings.autoSave, time: e.target.value }
            })
          }
          className="w-28 font-mono"
        />
      </label>
      <ToggleRow
        label="Prompt before Save & Reset"
        description="Show today's totals and let you edit the date before saving."
        checked={settings.promptBeforeSave}
        onChange={(promptBeforeSave) => void update({ promptBeforeSave })}
      />
      <ToggleRow
        label="New contexts start immediately"
        description='Default to the "Add & Start" button on the inline add form.'
        checked={settings.newContextStartImmediately}
        onChange={(newContextStartImmediately) =>
          void update({ newContextStartImmediately })
        }
      />
      <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
        <span className="flex-1">Week starts on</span>
        <select
          value={settings.weekStart}
          onChange={(e) =>
            void update({
              weekStart: e.target.value as 'sunday' | 'monday'
            })
          }
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="sunday">Sunday</option>
          <option value="monday">Monday</option>
        </select>
      </label>
    </Section>
  )
}

// ---------------------------------------------------------------- Hotkeys

interface HotkeysSectionProps {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}

function HotkeysSection({
  settings,
  update
}: HotkeysSectionProps): React.JSX.Element {
  const setHotkey = (key: keyof HotkeysConfig, value: string | boolean): void => {
    void update({ hotkeys: { ...settings.hotkeys, [key]: value } })
  }

  return (
    <Section
      title="Hotkeys"
      description="Combos use Electron's accelerator syntax (e.g. CommandOrControl+Shift+T)."
    >
      <ToggleRow
        label="Enable global hotkeys"
        checked={settings.hotkeys.enabled}
        onChange={(enabled) => setHotkey('enabled', enabled)}
      />
      <HotkeyInput
        label="Open dropdown"
        value={settings.hotkeys.openDropdown}
        disabled={!settings.hotkeys.enabled}
        onChange={(v) => setHotkey('openDropdown', v)}
      />
      <HotkeyInput
        label="Pause / resume"
        value={settings.hotkeys.pause}
        disabled={!settings.hotkeys.enabled}
        onChange={(v) => setHotkey('pause', v)}
      />
      <HotkeyInput
        label="Open Stint window"
        value={settings.hotkeys.openMain}
        disabled={!settings.hotkeys.enabled}
        onChange={(v) => setHotkey('openMain', v)}
      />
      <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
        <span className="flex-1">
          Quick-switch 1..9
          <span className="ml-1 text-xs text-muted-foreground">
            (template — {'{N}'} becomes 1..9)
          </span>
        </span>
        <Input
          value={settings.hotkeys.quickSwitch}
          disabled={!settings.hotkeys.enabled}
          onChange={(e) => setHotkey('quickSwitch', e.target.value)}
          className="w-64 font-mono text-xs"
        />
      </label>
    </Section>
  )
}

interface HotkeyInputProps {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

function HotkeyInput({
  label,
  value,
  disabled,
  onChange
}: HotkeyInputProps): React.JSX.Element {
  const [recording, setRecording] = useState(false)

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!recording) return
    // Don't capture modifier-only keys; wait for a real key.
    if (
      e.key === 'Meta' ||
      e.key === 'Shift' ||
      e.key === 'Alt' ||
      e.key === 'Control'
    ) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    const parts: string[] = []
    if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')
    parts.push(formatKey(e.key))
    onChange(parts.join('+'))
    setRecording(false)
  }

  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="flex-1">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setRecording((r) => !r)}
        onKeyDown={onKeyDown}
        className={cn(
          'min-w-48 rounded-md border bg-background px-3 py-1 text-left font-mono text-xs',
          recording && 'border-primary ring-2 ring-ring',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        {recording ? 'Press a key combo…' : value || '(none)'}
      </button>
    </label>
  )
}

function formatKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

// ---------------------------------------------------------------- App

interface AppSectionProps {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}

function AppSection({
  settings,
  update
}: AppSectionProps): React.JSX.Element {
  return (
    <Section title="App">
      <ToggleRow
        label="Start at login"
        description="Stint launches automatically when you log in."
        checked={settings.startAtLogin}
        onChange={(startAtLogin) => void update({ startAtLogin })}
      />
      <ToggleRow
        label="Show in Dock"
        description="When off, Stint runs as a menubar-only app with no Dock icon."
        checked={settings.showInDock}
        onChange={(showInDock) => void update({ showInDock })}
      />
    </Section>
  )
}

// ---------------------------------------------------------------- Data

function DataSection(): React.JSX.Element {
  const exportAll = async (): Promise<void> => {
    const path = await window.api.exportAllCsv()
    if (path) alert(`Exported to ${path}`)
  }
  const importCsv = async (): Promise<void> => {
    const result = await window.api.importCsv()
    if (result.path === null) return
    const msg =
      result.errors.length === 0
        ? `Imported ${result.imported} rows.`
        : `Imported ${result.imported} rows; skipped ${result.errors.length} (see console).`
    if (result.errors.length > 0) console.warn('CSV import errors:', result.errors)
    alert(msg)
  }
  const backupDb = async (): Promise<void> => {
    const path = await window.api.backupDatabase()
    if (path) alert(`Backed up to ${path}`)
  }
  const clearAll = async (): Promise<void> => {
    const confirmText = 'DELETE'
    const answer = prompt(
      `This deletes every context, log, and goal. The app will restart.\n\nType "${confirmText}" to confirm:`
    )
    if (answer !== confirmText) return
    await window.api.clearAllData()
  }

  return (
    <Section
      title="Data"
      description="Manage your locally-stored history."
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void exportAll()}>
          Export all as CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => void importCsv()}>
          Import CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => void backupDb()}>
          Backup database
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void clearAll()}
          className="ml-auto"
        >
          Clear all data…
        </Button>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- About

function AboutSection(): React.JSX.Element {
  const [unlocked, setUnlocked] = useState<boolean | null>(null)

  useEffect(() => {
    void window.api.getGoalsUnlocked().then(setUnlocked)
  }, [])

  const resetPaywall = async (): Promise<void> => {
    if (!confirm('Re-lock weekly goals? You can re-unlock from the Reports tab.')) {
      return
    }
    await window.api.setGoalsUnlocked(false)
    setUnlocked(false)
  }

  return (
    <Section title="About">
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">Stint</span> — a menubar
          time tracker.
        </p>
        <p className="text-xs text-muted-foreground">
          Weekly goals:{' '}
          {unlocked === null ? (
            '…'
          ) : unlocked ? (
            <span className="font-medium text-foreground">unlocked</span>
          ) : (
            <span className="font-medium text-foreground">locked</span>
          )}
          {unlocked && (
            <>
              {' '}
              ·{' '}
              <button
                type="button"
                onClick={() => void resetPaywall()}
                className="underline-offset-2 hover:underline"
              >
                re-lock
              </button>
            </>
          )}
        </p>
      </div>
    </Section>
  )
}
