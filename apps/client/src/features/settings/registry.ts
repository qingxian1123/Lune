import ServerSettingsSection from './sections/ServerSettingsSection';
import ShortcutSettingsSection from './sections/ShortcutSettingsSection';
import type { SettingsSectionDefinition } from './model/types';

export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: 'shortcuts',
    label: '快捷键',
    order: 20,
    component: ShortcutSettingsSection,
  },
  {
    id: 'server',
    label: '服务器',
    order: 10,
    component: ServerSettingsSection,
  },
].sort((left, right) => left.order - right.order);
