export type ColorScheme = 'dark' | 'light';
export type InterfaceMode = 'full' | 'stage';

export interface DesktopPreferenceState {
  interfaceMode: InterfaceMode;
  stagePanelOpen: boolean;
}

export const defaultDesktopPreferences: DesktopPreferenceState = {
  interfaceMode: 'full',
  stagePanelOpen: true,
};

/** Idempotent. moonlight and frosted become dark; daylight and apple-music become light. */
export function migrateColorScheme(saved: string | null): ColorScheme {
  if (saved === 'light' || saved === 'daylight' || saved === 'apple-music') return 'light';
  return 'dark';
}

function isInterfaceMode(value: unknown): value is InterfaceMode {
  return value === 'full' || value === 'stage';
}

function parseCurrent(value: unknown): DesktopPreferenceState | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as { interfaceMode?: unknown; stagePanelOpen?: unknown };
  if (!isInterfaceMode(saved.interfaceMode) || typeof saved.stagePanelOpen !== 'boolean') return null;
  return { interfaceMode: saved.interfaceMode, stagePanelOpen: saved.stagePanelOpen };
}

function parseLegacy(value: unknown): DesktopPreferenceState | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as { libraryLayout?: unknown; libraryOpen?: unknown };
  if (saved.libraryLayout === undefined && saved.libraryOpen === undefined) return null;
  return {
    interfaceMode: saved.libraryLayout === 'workspace' ? 'full' : 'stage',
    stagePanelOpen: typeof saved.libraryOpen === 'boolean' ? saved.libraryOpen : true,
  };
}

/**
 * Prefer a valid current record. Otherwise map the legacy layout once.
 * A missing record uses the new-user default. Corrupt values never throw.
 * Legacy shortcut bindings are ignored.
 */
export function migrateDesktopPreferences(current: unknown, legacy: unknown): DesktopPreferenceState {
  return parseCurrent(current) ?? parseLegacy(legacy) ?? defaultDesktopPreferences;
}
