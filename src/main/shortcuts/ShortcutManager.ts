import { globalShortcut } from 'electron'
import type { TimerService, TimerSnapshot } from '../timer/TimerService'
import type { HotkeysConfig } from '../../shared/api'
import { DEFAULT_HOTKEYS } from '../../shared/api'

/** Alias kept for historical call sites; the canonical type lives in shared/api. */
export type ShortcutConfig = HotkeysConfig

export const DEFAULT_SHORTCUTS: ShortcutConfig = DEFAULT_HOTKEYS

export interface ShortcutHandlers {
  openDropdown: () => void
  pause: () => void
  openMain: () => void
}

export interface RegistrationResult {
  registered: string[]
  failed: string[]
}

export class ShortcutManager {
  private currentConfig: ShortcutConfig | null = null
  private registered: string[] = []
  private onContextsChanged = (snap: TimerSnapshot): void => {
    // Re-register the numbered hotkeys to match the new context list.
    if (this.currentConfig === null) return
    this.registerQuickSwitch(this.currentConfig, snap)
  }

  constructor(
    private readonly timer: TimerService,
    private readonly handlers: ShortcutHandlers
  ) {}

  applyConfig(config: ShortcutConfig): RegistrationResult {
    this.unregisterAll()
    this.currentConfig = config
    const registered: string[] = []
    const failed: string[] = []

    // Master switch — when disabled, persist the config but don't register
    // anything. Users can flip it back on to restore without losing combos.
    if (config.enabled === false) {
      return { registered, failed }
    }

    const tryReg = (combo: string, fn: () => void): void => {
      if (globalShortcut.isRegistered(combo)) {
        failed.push(combo)
        return
      }
      const ok = globalShortcut.register(combo, fn)
      if (ok) {
        registered.push(combo)
      } else {
        failed.push(combo)
      }
    }

    tryReg(config.openDropdown, this.handlers.openDropdown)
    tryReg(config.pause, this.handlers.pause)
    tryReg(config.openMain, this.handlers.openMain)

    this.registered = registered

    // Quick-switch (1..9) follows current context order.
    const snap = this.timer.getSnapshot()
    this.registerQuickSwitch(config, snap)

    // Subscribe to keep numbered hotkeys aligned with reorder/add/delete.
    this.timer.on('state-changed', this.onContextsChanged)

    return { registered, failed }
  }

  private registerQuickSwitch(
    config: ShortcutConfig,
    snap: TimerSnapshot
  ): void {
    // Unregister the existing numbered combos first.
    for (let i = 1; i <= 9; i++) {
      const combo = config.quickSwitch.replace('{N}', String(i))
      if (globalShortcut.isRegistered(combo)) {
        // Only unregister combos we registered.
        if (this.registered.includes(combo)) {
          globalShortcut.unregister(combo)
          this.registered = this.registered.filter((c) => c !== combo)
        }
      }
    }
    // Re-register according to current context order.
    snap.contexts.slice(0, 9).forEach((c, idx) => {
      const combo = config.quickSwitch.replace('{N}', String(idx + 1))
      if (globalShortcut.isRegistered(combo)) return
      const ok = globalShortcut.register(combo, () => {
        void this.timer.switchTo(c.id)
      })
      if (ok) this.registered.push(combo)
    })
  }

  unregisterAll(): void {
    this.timer.off('state-changed', this.onContextsChanged)
    for (const combo of this.registered) {
      globalShortcut.unregister(combo)
    }
    this.registered = []
    this.currentConfig = null
  }
}
