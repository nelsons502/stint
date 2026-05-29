import { Kysely } from 'kysely'
import type { DB } from './schema'
import type {
  AppSettings,
  HotkeysConfig,
  WeekStartDay
} from '../../shared/api'
import { DEFAULT_APP_SETTINGS, DEFAULT_HOTKEYS } from '../../shared/api'

/** Known setting keys. Centralized so the codebase has one source. */
export const SettingsKeys = {
  AutoSaveEnabled: 'autoSaveEnabled',
  /** HH:MM in 24-hour local time, e.g., "03:00". */
  AutoSaveTime: 'autoSaveTime',
  /**
   * Honor-system paywall for weekly goals. 'true' = paid (or simulated paid),
   * anything else = locked. The architecture is designed so this gate can be
   * swapped for a server-side check later without touching the UI.
   */
  GoalsUnlocked: 'goalsUnlocked',
  StartAtLogin: 'startAtLogin',
  ShowInDock: 'showInDock',
  WeekStart: 'weekStart',
  NewContextStartImmediately: 'newContextStartImmediately',
  PromptBeforeSave: 'promptBeforeSave',
  /** JSON-encoded HotkeysConfig. */
  Hotkeys: 'hotkeys'
} as const

export type SettingsKey = (typeof SettingsKeys)[keyof typeof SettingsKeys]

/** Typed snapshot of all auto-save-related settings with sensible defaults. */
export interface AutoSaveConfig {
  enabled: boolean
  /** HH:MM local time. */
  time: string
}

export const DEFAULT_AUTO_SAVE: AutoSaveConfig = {
  enabled: false,
  time: '03:00'
}

export async function getSetting(
  db: Kysely<DB>,
  key: string
): Promise<string | null> {
  const row = await db
    .selectFrom('app_settings')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst()
  return row?.value ?? null
}

export async function setSetting(
  db: Kysely<DB>,
  key: string,
  value: string
): Promise<void> {
  await db
    .insertInto('app_settings')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute()
}

export async function getAllSettings(
  db: Kysely<DB>
): Promise<Record<string, string>> {
  const rows = await db.selectFrom('app_settings').selectAll().execute()
  const out: Record<string, string> = {}
  for (const r of rows) out[r.key] = r.value
  return out
}

export async function getAutoSaveConfig(
  db: Kysely<DB>
): Promise<AutoSaveConfig> {
  const enabled = await getSetting(db, SettingsKeys.AutoSaveEnabled)
  const time = await getSetting(db, SettingsKeys.AutoSaveTime)
  return {
    enabled: enabled === 'true',
    time: time ?? DEFAULT_AUTO_SAVE.time
  }
}

export async function setAutoSaveConfig(
  db: Kysely<DB>,
  config: AutoSaveConfig
): Promise<void> {
  if (!/^\d{2}:\d{2}$/.test(config.time)) {
    throw new Error(`Invalid time format (expected HH:MM): ${config.time}`)
  }
  await setSetting(db, SettingsKeys.AutoSaveEnabled, String(config.enabled))
  await setSetting(db, SettingsKeys.AutoSaveTime, config.time)
}

export async function getGoalsUnlocked(db: Kysely<DB>): Promise<boolean> {
  return (await getSetting(db, SettingsKeys.GoalsUnlocked)) === 'true'
}

export async function setGoalsUnlocked(
  db: Kysely<DB>,
  unlocked: boolean
): Promise<void> {
  await setSetting(db, SettingsKeys.GoalsUnlocked, String(unlocked))
}

function parseHotkeys(raw: string | null): HotkeysConfig {
  if (raw === null) return DEFAULT_HOTKEYS
  try {
    const parsed = JSON.parse(raw) as Partial<HotkeysConfig>
    const merged = { ...DEFAULT_HOTKEYS, ...parsed }
    // quickSwitch must contain the {N} placeholder; reset if corrupted.
    if (!merged.quickSwitch.includes('{N}')) {
      merged.quickSwitch = DEFAULT_HOTKEYS.quickSwitch
    }
    return merged
  } catch {
    return DEFAULT_HOTKEYS
  }
}

/** Reads every setting, falling back to defaults for any that are unset. */
export async function getAppSettings(db: Kysely<DB>): Promise<AppSettings> {
  const all = await getAllSettings(db)
  const autoSave = await getAutoSaveConfig(db)
  const weekStart =
    all[SettingsKeys.WeekStart] === 'monday'
      ? ('monday' as WeekStartDay)
      : ('sunday' as WeekStartDay)
  return {
    autoSave,
    startAtLogin: all[SettingsKeys.StartAtLogin] === 'true',
    showInDock: all[SettingsKeys.ShowInDock] === 'true',
    weekStart,
    newContextStartImmediately:
      all[SettingsKeys.NewContextStartImmediately] === 'true',
    promptBeforeSave: all[SettingsKeys.PromptBeforeSave] !== 'false',
    hotkeys: parseHotkeys(all[SettingsKeys.Hotkeys] ?? null)
  }
}

/**
 * Persists a patch of settings. Returns the full merged settings after the
 * write. Side effects (login item, dock visibility, hotkey re-registration,
 * etc.) are NOT applied here — the caller (main entry / IPC handler) owns
 * those because they depend on Electron's app/dock APIs which can't be
 * touched from a pure persistence layer.
 */
export async function updateAppSettings(
  db: Kysely<DB>,
  patch: Partial<AppSettings>
): Promise<AppSettings> {
  if (patch.autoSave !== undefined) {
    await setAutoSaveConfig(db, patch.autoSave)
  }
  if (patch.startAtLogin !== undefined) {
    await setSetting(db, SettingsKeys.StartAtLogin, String(patch.startAtLogin))
  }
  if (patch.showInDock !== undefined) {
    await setSetting(db, SettingsKeys.ShowInDock, String(patch.showInDock))
  }
  if (patch.weekStart !== undefined) {
    await setSetting(db, SettingsKeys.WeekStart, patch.weekStart)
  }
  if (patch.newContextStartImmediately !== undefined) {
    await setSetting(
      db,
      SettingsKeys.NewContextStartImmediately,
      String(patch.newContextStartImmediately)
    )
  }
  if (patch.promptBeforeSave !== undefined) {
    await setSetting(
      db,
      SettingsKeys.PromptBeforeSave,
      String(patch.promptBeforeSave)
    )
  }
  if (patch.hotkeys !== undefined) {
    await setSetting(db, SettingsKeys.Hotkeys, JSON.stringify(patch.hotkeys))
  }
  return getAppSettings(db)
}

/** Hardcoded defaults exported here for tests that compare snapshots. */
export const APP_SETTINGS_DEFAULTS = DEFAULT_APP_SETTINGS
