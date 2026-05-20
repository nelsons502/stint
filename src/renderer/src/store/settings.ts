import { create } from 'zustand'
import type { AppSettings } from '../../../shared/api'
import { DEFAULT_APP_SETTINGS } from '../../../shared/api'

// Renderer-side cache of AppSettings. Populated on app mount via
// bindSettingsToStore(); refreshed only when the renderer mutates via
// updateSetting() (main is the only source of truth for these values).
export const useSettingsStore = create<AppSettings>(() => DEFAULT_APP_SETTINGS)

export async function loadSettings(): Promise<void> {
  const s = await window.api.getAppSettings()
  useSettingsStore.setState(s)
}

export async function updateSetting(
  patch: Partial<AppSettings>
): Promise<void> {
  const next = await window.api.updateAppSettings(patch)
  useSettingsStore.setState(next)
}
