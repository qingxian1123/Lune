import SettingsShell from './SettingsShell';
import { SettingsControllerContext } from './model/SettingsControllerContext';
import type { SettingsController } from './model/types';
import { settingsCategories, settingsSections } from './registry';

interface SettingsPanelProps {
  controller: SettingsController;
  mobile?: boolean;
  sectionIds?: string[];
  embedded?: boolean;
}

export default function SettingsPanel({
  controller,
  mobile = false,
  sectionIds,
  embedded = false,
}: SettingsPanelProps) {
  const sections = settingsSections.filter((section) => (!sectionIds || sectionIds.includes(section.id))
    && (!mobile || section.id !== 'interface'));
  const activeSection = sections.find((section) => section.id === controller.activeSectionId)
    ?? sections[0];
  if (!activeSection) return null;
  const ActiveSection = activeSection.component;
  const desktopOrder = sectionIds ?? ['server', 'appearance', 'interface'];
  const desktopSections = desktopOrder.map((id) => {
    const Section = sections.find((section) => section.id === id)?.component;
    return Section ? <Section key={id} /> : null;
  });

  if (embedded) {
    if (!controller.open) return null;
    return <SettingsControllerContext.Provider value={controller}>
      <section className="workspace-settings-view" aria-labelledby="workspace-settings-heading">
        <header className="workspace-section-heading"><h2 id="workspace-settings-heading">设置</h2>
          <button type="button" className="workspace-settings-back" onClick={controller.closeSettings}>返回房间</button>
        </header>
        <div className="workspace-settings-content settings-overview lune-scrollbar">{desktopSections}</div>
      </section>
    </SettingsControllerContext.Provider>;
  }

  return (
    <SettingsControllerContext.Provider value={controller}>
      <SettingsShell
        open={controller.open}
        mobile={mobile}
        categories={settingsCategories}
        sections={mobile ? sections : []}
        activeSectionId={controller.activeSectionId}
        onSectionChange={controller.selectSection}
        onClose={controller.closeSettings}
      >
        {mobile ? <ActiveSection /> : <div className="settings-overview">{desktopSections}</div>}
      </SettingsShell>
    </SettingsControllerContext.Provider>
  );
}
