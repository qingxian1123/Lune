import ServerSettingsSection from './sections/ServerSettingsSection';
import AppearanceSettingsSection from './sections/AppearanceSettingsSection';
import InterfaceModeSettingsSection from './sections/InterfaceModeSettingsSection';
import type { SettingsCategoryDefinition, SettingsSectionDefinition } from './model/types';

export const settingsCategories: SettingsCategoryDefinition[] = [
  { id: 'connection', label: '连接', order: 10 },
  { id: 'appearance', label: '外观', order: 25 },
  { id: 'system', label: '系统', order: 30 },
].sort((left, right) => left.order - right.order);

export const roomSettingsSectionIds = ['server', 'appearance', 'interface'];

export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: 'interface',
    label: '界面模式',
    categoryId: 'appearance',
    order: 20,
    component: InterfaceModeSettingsSection,
  },
  {
    id: 'appearance',
    label: '配色',
    categoryId: 'appearance',
    order: 10,
    component: AppearanceSettingsSection,
  },
  {
    id: 'server',
    label: '服务连接',
    categoryId: 'connection',
    order: 10,
    component: ServerSettingsSection,
  },
].sort((left, right) => left.order - right.order);
