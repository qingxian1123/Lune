import SettingsShell from './SettingsShell';
import { SettingsControllerContext } from './model/SettingsControllerContext';
import type { SettingsController } from './model/types';
import { settingsSections } from './registry';

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
  const sections = sectionIds ? settingsSections.filter((section) => sectionIds.includes(section.id)) : settingsSections;
  const activeSection = sections.find((section) => section.id === controller.activeSectionId)
    ?? sections[0];
  if (!activeSection) return null;
  const ActiveSection = activeSection.component;

  return (
    <SettingsControllerContext.Provider value={controller}>
      <SettingsShell
        open={controller.open}
        mobile={mobile}
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
