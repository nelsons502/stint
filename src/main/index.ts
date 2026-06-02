import { app, BrowserWindow, Notification, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'node:path'
import { electronApp, is } from '@electron-toolkit/utils'
import { openAndMigrate } from './db/open'
import { TimerService, type RecoveryInfo } from './timer/TimerService'
import { TrayController } from './tray/TrayController'
import { ShortcutManager } from './shortcuts/ShortcutManager'
import { registerIpcBridge, sendInitialSnapshot } from './ipc/bridge'
import { AutoSaver } from './autosave/AutoSaver'
import { GoalsService } from './goals/GoalsService'
import { getAppSettings, getSetting, setGoalsUnlocked, SettingsKeys } from './db/settings'
import { verifyLicenseKey } from './license/verify'
import { formatHMS } from '../shared/format'
import type { AppSettings } from '../shared/api'

let mainWindow: BrowserWindow | null = null
let tray: TrayController | null = null
let shortcuts: ShortcutManager | null = null
let timer: TimerService | null = null
let autoSaver: AutoSaver | null = null
let goalsService: GoalsService | null = null
let teardownIpc: (() => void) | null = null
const pendingRecovery: { current: RecoveryInfo | null } = { current: null }

function getResourcesPath(): string {
  return is.dev
    ? join(app.getAppPath(), 'resources')
    : join(process.resourcesPath, 'resources')
}

function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 780,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (timer) sendInitialSnapshot(mainWindow, timer)
  return mainWindow
}

function applyDockVisibility(showInDock: boolean): void {
  if (process.platform !== 'darwin') return
  if (showInDock) {
    app.dock?.show().catch(() => {
      // dock.show is async in newer Electron; ignore reject
    })
  } else {
    app.dock?.hide()
  }
}

function applyStartAtLogin(startAtLogin: boolean): void {
  // setLoginItemSettings is a no-op on Linux but supported on macOS + Windows.
  app.setLoginItemSettings({ openAtLogin: startAtLogin })
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.nelsonschnepf.stint')

  const dbPath = is.dev
    ? join(app.getPath('userData'), 'stint.dev.db')
    : join(app.getPath('userData'), 'stint.db')
  const db = await openAndMigrate(dbPath)

  // Re-verify the stored license key on every launch. If it's absent or
  // doesn't match the embedded public key, re-lock premium features. This
  // prevents unlocking by editing the SQLite DB directly.
  const storedKey = await getSetting(db, SettingsKeys.LicenseKey)
  if (!storedKey || !verifyLicenseKey(storedKey)) {
    await setGoalsUnlocked(db, false)
  }

  // Read settings up front so we apply them before any UI exists.
  const settings = await getAppSettings(db)
  applyDockVisibility(settings.showInDock)
  applyStartAtLogin(settings.startAtLogin)

  timer = new TimerService(db)
  pendingRecovery.current = await timer.init()

  autoSaver = new AutoSaver(db, timer)
  await autoSaver.start()

  let goalNotificationSilent = settings.goalNotificationSilent
  goalsService = new GoalsService(
    db,
    timer,
    (event) => {
      new Notification({
        title: 'Weekly goal hit!',
        body: `${event.contextName} — ${formatHMS(event.targetSecondsPerWeek)} this week`,
        silent: goalNotificationSilent
      }).show()
    },
    Date.now,
    (event) => {
      new Notification({
        title: 'Daily goal hit!',
        body: `${event.contextName} — ${formatHMS(event.targetSecondsPerDay)} today`,
        silent: goalNotificationSilent
      }).show()
    }
  )
  goalsService.setWeekStart(settings.weekStart)
  goalsService.start()

  tray = new TrayController(
    timer,
    {
      switchTo: (id) => {
        void timer!.switchTo(id)
      },
      pause: () => {
        void timer!.pause()
      },
      openMain: () => {
        createMainWindow()
      },
      openSettings: () => {
        createMainWindow()
      },
      addContext: () => {
        createMainWindow()
      },
      saveAndReset: () => {
        createMainWindow()
      },
      quit: () => {
        app.quit()
      }
    },
    getResourcesPath()
  )
  tray.start()

  shortcuts = new ShortcutManager(timer, {
    openDropdown: () => {
      // Programmatically open the tray's native NSMenu — same dropdown
      // you'd get from clicking the menubar icon.
      tray?.popUp()
    },
    pause: () => {
      void timer!.pause()
    },
    openMain: () => {
      createMainWindow()
    }
  })
  shortcuts.applyConfig(settings.hotkeys)

  const onSettingsApplied = async (
    next: AppSettings,
    patch: Partial<AppSettings>
  ): Promise<void> => {
    if (patch.startAtLogin !== undefined) applyStartAtLogin(next.startAtLogin)
    if (patch.showInDock !== undefined) applyDockVisibility(next.showInDock)
    if (patch.weekStart !== undefined) goalsService?.setWeekStart(next.weekStart)
    if (patch.hotkeys !== undefined) shortcuts?.applyConfig(next.hotkeys)
    if (patch.goalNotificationSilent !== undefined) {
      goalNotificationSilent = next.goalNotificationSilent
    }
    if (patch.autoSave !== undefined && autoSaver) {
      await autoSaver.updateConfig(next.autoSave)
    }
  }

  const onClearAllData = (): void => {
    // Clean shutdown of all services, then relaunch so the fresh DB state
    // is loaded by a new TimerService init().
    app.relaunch()
    app.exit(0)
  }

  teardownIpc = registerIpcBridge(
    {
      timer,
      db,
      dbPath,
      autoSaver,
      goalsService,
      onSettingsApplied,
      onClearAllData
    },
    pendingRecovery
  )

  if (pendingRecovery.current) {
    createMainWindow()
  }

  // --- Auto-updates -----------------------------------------------------
  // electron-updater downloads in the background. With autoInstallOnAppQuit,
  // updates apply only when the user quits the app naturally — so an active
  // timer is never interrupted. We don't proactively quitAndInstall.
  if (!is.dev) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-downloaded', () => {
      new Notification({
        title: 'Stint update ready',
        body: 'The update will install the next time you quit Stint.',
        silent: true
      }).show()
    })
    autoUpdater.on('error', (err) => {
      console.error('autoUpdater error:', err)
    })
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('checkForUpdatesAndNotify failed:', err)
    })
  }
})

app.on('window-all-closed', () => {
  // Stay alive on macOS — Stint is a menubar app. Quitting goes through
  // the tray's Quit item (or Cmd+Q from a focused window).
})

app.on('before-quit', () => {
  shortcuts?.unregisterAll()
  tray?.stop()
  autoSaver?.stop()
  goalsService?.stop()
  teardownIpc?.()
})
