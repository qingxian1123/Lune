import type { ComponentType } from 'react';
import type { ConnectionState } from '../../../hooks/useServerConfig';

export interface SettingsController {
  open: boolean;
  activeSectionId: string;
  serverUrl: string;
  serverState: ConnectionState;
  serverError?: string;
  openSettings: () => void;
  closeSettings: () => void;
  selectSection: (sectionId: string) => void;
  setServerUrl: (value: string) => void;
  saveServer: () => Promise<void>;
  ensureServerConfigured: () => boolean;
  verifyServerForAccess: () => Promise<boolean>;
}

export interface SettingsSectionDefinition {
  id: string;
  label: string;
  order: number;
  component: ComponentType;
}
