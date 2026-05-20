import { app, BrowserWindow, Notification, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is } from '@electron-toolkit/utils'
import { openAndMigrate } from './db/open'
import { TimerService, type RecoveryInfo } from './timer/TimerService'
import { TrayController } from './tray/TrayController'
import { ShortcutManager, DEFAULT_SHORTCUTS } from './shortcuts/ShortcutManager'
import { registerIpcBridge, sendInitialSnapshot } from './ipc/bridge'
import { AutoSaver } from './autosave/AutoSaver'
import { GoalsService } from './goals/GoalsService'
import { formatHMS } from '../shared/format'

let mainWindow: BrowserWindow | null = null
let tray: TrayController | null = null
let shortcuts: ShortcutManager | null = null
let timer: TimerService | null = null
let autoSaver: AutoSaver | null = null
let goalsService: GoalsService | null = null
let teardownIpc: (() => void) | null = null
const pendingRecovery: { current: RecoveryInfo | null } = { current: null }

function getResourcesPath(): string {
  // In dev, resources/ sits at the project root. In production,
  // electron-builder.yml's extraResources copies the directory under
  // process.resourcesPath/resources.
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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.nelsonschnepf.stint')

  // Stint is a menubar app — no Dock icon by default. (Configurable later.)
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  const dbPath = is.dev
    ? join(app.getPath('userData'), 'stint.dev.db')
    : join(app.getPath('userData'), 'stint.db')
  const db = await openAndMigrate(dbPath)

  timer = new TimerService(db)
  pendingRecovery.current = await timer.init()

  autoSaver = new AutoSaver(db, timer)
  await autoSaver.start()

  goalsService = new GoalsService(db, timer, (event) => {
    new Notification({
      title: 'Goal hit!',
      body: `${event.contextName} — ${formatHMS(event.targetSecondsPerWeek)} this week`,
      silent: false
    }).show()
  })
  goalsService.start()

  teardownIpc = registerIpcBridge(
    timer,
    db,
    autoSaver,
    goalsService,
    pendingRecovery
  )

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
        // Settings UI isn't built yet in Phase 1 — open main window for now.
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
      // No popup window without a custom dropdown — open main window instead.
      createMainWindow()
    },
    pause: () => {
      void timer!.pause()
    },
    openMain: () => {
      createMainWindow()
    }
  })
  shortcuts.applyConfig(DEFAULT_SHORTCUTS)

  // If recovery is pending, surface the main window so the user can choose.
  if (pendingRecovery.current) {
    createMainWindow()
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
