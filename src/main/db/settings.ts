import { Kysely } from 'kysely'
import type { DB } from './schema'

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
  GoalsUnlocked: 'goalsUnlocked'
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
