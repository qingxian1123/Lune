import SettingsShell from './SettingsShell';
import { SettingsControllerContext } from './model/SettingsControllerContext';
import type { SettingsController } from './model/types';
import { settingsSections } from './registry';

interface SettingsPanelProps {
  controller: SettingsController;
  mobile?: boolean;
}

export default function SettingsPanel({
  controller,
  mobile = false,
}: SettingsPanelProps) {
  const activeSection = settingsSections.find((section) => section.id === controller.activeSectionId)
    ?? settingsSections[0];
  const ActiveSection = activeSection.component;

  return (
    <SettingsControllerContext.Provider value={controller}>
      <SettingsShell
        open={controller.open}
        mobile={mobile}
        sections={settingsSections}
        activeSectionId={controller.activeSectionId}
        onSectionChange={controller.selectSection}
        onClose={controller.closeSettings}
      >
        <ActiveSection />
      </SettingsShell>
    </SettingsControllerContext.Provider>
  );
}
