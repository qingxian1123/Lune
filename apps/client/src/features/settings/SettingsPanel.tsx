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

  if (embedded) {
    if (!controller.open) return null;
    return <SettingsControllerContext.Provider value={controller}>
      <section className="workspace-settings-view" aria-labelledby="workspace-settings-heading">
        <header className="workspace-section-heading"><h2 id="workspace-settings-heading">设置</h2>
          <button type="button" className="workspace-settings-back" onClick={controller.closeSettings}>返回</button>
        </header>
        <div className="workspace-settings-layout">
          <nav className="workspace-settings-nav" aria-label="设置项目">
            {sections.map((section) => <button key={section.id} type="button" aria-current={section.id === activeSection.id ? 'page' : undefined}
              onClick={() => controller.selectSection(section.id)}>{section.label}</button>)}
          </nav>
          <div className="workspace-settings-content"><ActiveSection /></div>
        </div>
      </section>
    </SettingsControllerContext.Provider>;
  }

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
