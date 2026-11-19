import ServerSettingsSection from './sections/ServerSettingsSection';
import AppearanceSettingsSection from './sections/AppearanceSettingsSection';
import InterfaceModeSettingsSection from './sections/InterfaceModeSettingsSection';
import BilibiliSettingsSection from './sections/BilibiliSettingsSection';
import type { SettingsCategoryDefinition, SettingsSectionDefinition } from './model/types';

export const settingsCategories: SettingsCategoryDefinition[] = [
  { id: 'connection', label: '连接', order: 10 },
  { id: 'sources', label: '音源', order: 20 },
  { id: 'appearance', label: '外观', order: 25 },
  { id: 'system', label: '系统', order: 30 },
].sort((left, right) => left.order - right.order);

export const roomSettingsSectionIds = ['interface', 'appearance', 'bilibili', 'server'];

export const settingsSections: SettingsSectionDefinition[] = [
  { id: 'bilibili', label: '哔哩哔哩', categoryId: 'sources', order: 20, component: BilibiliSettingsSection },
  {
    id: 'interface',
    label: '房间布局',
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
    label: '服务器',
    categoryId: 'connection',
    order: 10,
    component: ServerSettingsSection,
  },
].sort((left, right) => left.order - right.order);
