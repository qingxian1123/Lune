import ServerSettingsSection from './sections/ServerSettingsSection';
import type { SettingsSectionDefinition } from './model/types';

export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: 'server',
    label: '服务器',
    order: 10,
    component: ServerSettingsSection,
  },
].sort((left, right) => left.order - right.order);
