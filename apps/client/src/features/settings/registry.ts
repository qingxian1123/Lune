import ServerSettingsSection from './sections/ServerSettingsSection';
import ShortcutSettingsSection from './sections/ShortcutSettingsSection';
import AppearanceSettingsSection from './sections/AppearanceSettingsSection';
import type { SettingsCategoryDefinition, SettingsSectionDefinition } from './model/types';

export const settingsCategories: SettingsCategoryDefinition[] = [
  { id: 'connection', label: '连接', order: 10 },
  { id: 'controls', label: '控制', order: 20 },
  { id: 'appearance', label: '外观', order: 25 },
  // 后续系统级设置统一注册到此分类；没有设置项时不会出现在导航中。
  { id: 'system', label: '系统', order: 30 },
].sort((left, right) => left.order - right.order);

export const settingsSections: SettingsSectionDefinition[] = [
  {
    id: 'appearance',
    label: '界面样式',
    categoryId: 'appearance',
    order: 10,
    component: AppearanceSettingsSection,
  },
  {
    id: 'shortcuts',
    label: '快捷键',
    categoryId: 'controls',
    order: 20,
    component: ShortcutSettingsSection,
  },
  {
    id: 'server',
    label: '服务连接',
    categoryId: 'connection',
    order: 10,
    component: ServerSettingsSection,
  },
].sort((left, right) => left.order - right.order);
