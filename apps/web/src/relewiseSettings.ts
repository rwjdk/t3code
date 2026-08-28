import { useCallback, useSyncExternalStore } from "react";

export interface RelewiseSettingsData {
  readonly userEmail: string;
  readonly showOpenInEditor: boolean;
  readonly showCommitAndPush: boolean;
}

export type RelewiseSettingsPatch = Partial<RelewiseSettingsData>;

export const RELEWISE_SETTINGS_STORAGE_KEY = "relewise:t3code-settings:v1";
export const DEFAULT_RELEWISE_SETTINGS: RelewiseSettingsData = {
  userEmail: "",
  showOpenInEditor: true,
  showCommitAndPush: true,
};

const listeners = new Set<() => void>();

export function decodeRelewiseSettings(value: unknown): RelewiseSettingsData {
  if (!value || typeof value !== "object") return DEFAULT_RELEWISE_SETTINGS;
  const record = value as Record<string, unknown>;
  return {
    userEmail: typeof record.userEmail === "string" ? record.userEmail.trim() : "",
    showOpenInEditor: typeof record.showOpenInEditor === "boolean" ? record.showOpenInEditor : true,
    showCommitAndPush:
      typeof record.showCommitAndPush === "boolean" ? record.showCommitAndPush : true,
  };
}

function readPersistedSettings(): RelewiseSettingsData {
  if (typeof window === "undefined") return DEFAULT_RELEWISE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(RELEWISE_SETTINGS_STORAGE_KEY);
    return raw === null ? DEFAULT_RELEWISE_SETTINGS : decodeRelewiseSettings(JSON.parse(raw));
  } catch (error) {
    console.error("Could not read persisted Relewise settings.", error);
    return DEFAULT_RELEWISE_SETTINGS;
  }
}

let snapshot = readPersistedSettings();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function updateRelewiseSettings(patch: RelewiseSettingsPatch) {
  snapshot = decodeRelewiseSettings({ ...snapshot, ...patch });
  try {
    window.localStorage.setItem(RELEWISE_SETTINGS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.error("Could not persist Relewise settings.", error);
  }
  for (const listener of listeners) listener();
}

export function useRelewiseSettings(): RelewiseSettingsData {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => DEFAULT_RELEWISE_SETTINGS,
  );
}

export function useUpdateRelewiseSettings() {
  return useCallback(updateRelewiseSettings, []);
}
