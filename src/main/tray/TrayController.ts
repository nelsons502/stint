import {
  Tray,
  Menu,
  nativeImage,
  type MenuItemConstructorOptions
} from 'electron'
import path from 'node:path'
import type {
  TimerService,
  TimerSnapshot
} from '../timer/TimerService'
import { formatHMS, formatTitle } from '../../shared/format'

/**
 * Computes live total seconds for a single context, including the in-progress
 * run if it's the active one. Exported (and pure) so it can be reused by IPC
 * and tested cheaply.
 */
export function liveSeconds(
  contextId: string,
  contextTodaySeconds: number,
  snap: { activeContextId: string | null; activeStartedAtMs: number | null },
  now: number
): number {
  if (
    contextId === snap.activeContextId &&
    snap.activeStartedAtMs !== null
  ) {
    return contextTodaySeconds + (now - snap.activeStartedAtMs) / 1000
  }
  return contextTodaySeconds
}

export interface TrayActions {
  switchTo: (contextId: string) => void
  pause: () => void
  openMain: () => void
  openSettings: () => void
  addContext: () => void
  saveAndReset: () => void
  quit: () => void
}

/**
 * Owns the menubar Tray instance: the template icon, the live title text
 * (updated every second from local tick), and the dropdown menu rebuilt on
 * every state change so context times stay fresh.
 */
export class TrayController {
  private tray: Tray | null = null
  private tickHandle: NodeJS.Timeout | null = null
  private currentSnapshot: TimerSnapshot | null = null

  constructor(
    private readonly timer: TimerService,
    private readonly actions: TrayActions,
    private readonly resourcesPath: string
  ) {}

  start(): void {
    const iconPath = path.join(
      this.resourcesPath,
      'tray',
      'iconTemplate.png'
    )
    const icon = nativeImage.createFromPath(iconPath)
    icon.setTemplateImage(true)
    this.tray = new Tray(icon)
    this.tray.setToolTip('Stint')

    this.currentSnapshot = this.timer.getSnapshot()
    this.timer.on('state-changed', this.onStateChanged)
    this.rebuildMenu()
    this.refreshTitle()
    this.tickHandle = setInterval(() => this.refreshTitle(), 1000)
  }

  stop(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle)
      this.tickHandle = null
    }
    this.timer.off('state-changed', this.onStateChanged)
    if (this.tray) {
      this.tray.destroy()
      this.tray = null
    }
  }

  private onStateChanged = (snap: TimerSnapshot): void => {
    this.currentSnapshot = snap
    this.rebuildMenu()
    this.refreshTitle()
  }

  private refreshTitle(): void {
    if (!this.tray || !this.currentSnapshot) return
    const snap = this.currentSnapshot
    if (snap.activeContextId === null) {
      this.tray.setTitle(' Paused')
      return
    }
    const active = snap.contexts.find((c) => c.id === snap.activeContextId)
    if (!active) {
      this.tray.setTitle(' Paused')
      return
    }
    const live = liveSeconds(active.id, active.todaySeconds, snap, Date.now())
    this.tray.setTitle(` ${formatTitle(active.name, live)}`)
  }

  private rebuildMenu(): void {
    if (!this.tray || !this.currentSnapshot) return
    const snap = this.currentSnapshot
    const now = Date.now()

    const contextItems: MenuItemConstructorOptions[] = snap.contexts.map(
      (c, idx) => {
        const live = liveSeconds(c.id, c.todaySeconds, snap, now)
        const accel = idx < 9 ? `CommandOrControl+Shift+${idx + 1}` : undefined
        return {
          label: `${c.name}    ${formatHMS(live)}`,
          type: 'checkbox',
          checked: c.id === snap.activeContextId,
          accelerator: accel,
          click: () => this.actions.switchTo(c.id)
        }
      }
    )

    const menu = Menu.buildFromTemplate([
      ...(contextItems.length > 0
        ? contextItems
        : [
            {
              label: 'No contexts yet — add one below',
              enabled: false
            } as MenuItemConstructorOptions
          ]),
      { type: 'separator' },
      {
        label: 'Pause',
        accelerator: 'CommandOrControl+Shift+P',
        enabled: snap.activeContextId !== null,
        click: () => this.actions.pause()
      },
      { type: 'separator' },
      {
        label: 'Add context…',
        click: () => this.actions.addContext()
      },
      {
        label: 'Open Stint…',
        accelerator: 'CommandOrControl+Shift+L',
        click: () => this.actions.openMain()
      },
      {
        label: 'Settings…',
        click: () => this.actions.openSettings()
      },
      { type: 'separator' },
      {
        label: 'Save & Reset…',
        click: () => this.actions.saveAndReset()
      },
      { type: 'separator' },
      {
        label: 'Quit Stint',
        accelerator: 'CommandOrControl+Q',
        click: () => this.actions.quit()
      }
    ])

    this.tray.setContextMenu(menu)
  }
}
