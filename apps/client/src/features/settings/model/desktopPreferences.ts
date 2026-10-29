import { create } from 'zustand';
import {
  migrateDesktopPreferences,
  type DesktopPreferenceState,
  type InterfaceMode,
} from './preferenceMigration';

const currentKey = 'lune.desktop-preferences.v2';
const legacyKey = 'lune.desktop-preferences.v1';

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persist(preferences: DesktopPreferenceState): boolean {
  try {
    localStorage.setItem(currentKey, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

function loadPreferences(): DesktopPreferenceState {
  const current = readJson(currentKey);
  const validCurrent = migrateDesktopPreferences(current, undefined);
  const currentRecord = current && typeof current === 'object'
    ? current as { interfaceMode?: unknown; stagePanelOpen?: unknown }
    : null;
  if (currentRecord
    && (currentRecord.interfaceMode === 'full' || currentRecord.interfaceMode === 'stage')
    && typeof currentRecord.stagePanelOpen === 'boolean') {
    return validCurrent;
  }
  const legacy = readJson(legacyKey);
  const migrated = migrateDesktopPreferences(undefined, legacy);
  if (current !== undefined || legacy !== undefined) persist(migrated);
  return migrated;
}

interface DesktopPreferences extends DesktopPreferenceState {
  setInterfaceMode: (mode: InterfaceMode) => string | null;
  setStagePanelOpen: (open: boolean) => void;
}

export const useDesktopPreferences = create<DesktopPreferences>((set, get) => ({
  ...loadPreferences(),
  setInterfaceMode: (interfaceMode) => {
    if (!persist({ interfaceMode, stagePanelOpen: get().stagePanelOpen })) {
      return '无法保存界面模式，请检查本机存储权限后重试。';
    }
    set({ interfaceMode });
    return null;
  },
  setStagePanelOpen: (stagePanelOpen) => {
    persist({ interfaceMode: get().interfaceMode, stagePanelOpen });
    set({ stagePanelOpen });
  },
}));
