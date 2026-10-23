import SettingsShell from './SettingsShell';
import { SettingsControllerContext } from './model/SettingsControllerContext';
import type { SettingsController } from './model/types';
import { settingsCategories, settingsSections } from './registry';

interface SettingsPanelProps {
  controller: SettingsController;
  mobile?: boolean;
  sectionIds?: string[];
}

export default function SettingsPanel({
  controller,
  mobile = false,
  sectionIds,
}: SettingsPanelProps) {
  const sections = settingsSections.filter((section) => (!sectionIds || sectionIds.includes(section.id))
    && (!mobile || section.id !== 'workspace'));
  const activeSection = sections.find((section) => section.id === controller.activeSectionId)
    ?? sections[0];
  if (!activeSection) return null;
  const ActiveSection = activeSection.component;

  return (
    <SettingsControllerContext.Provider value={controller}>
      <SettingsShell
        open={controller.open}
        mobile={mobile}
        categories={settingsCategories}
        sections={sections}
        activeSectionId={controller.activeSectionId}
        onSectionChange={controller.selectSection}
        onClose={controller.closeSettings}
      >
        <ActiveSection />
      </SettingsShell>
    </SettingsControllerContext.Provider>
  );
}
