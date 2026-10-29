import { useState } from 'react';
import { useDesktopPreferences } from '../model/desktopPreferences';
import type { InterfaceMode } from '../model/preferenceMigration';
import './workspace-settings.css';

const modes: { id: InterfaceMode; title: string }[] = [
  { id: 'full', title: '完整功能' },
  { id: 'stage', title: '观赏播放' },
];

export default function InterfaceModeSettingsSection() {
  const mode = useDesktopPreferences((state) => state.interfaceMode);
  const setMode = useDesktopPreferences((state) => state.setInterfaceMode);
  const [error, setError] = useState<string | null>(null);

  return <section className="settings-form workspace-settings" aria-labelledby="interface-mode-title">
    <h2 id="interface-mode-title">界面模式</h2>
    <div className="workspace-layout-options" role="group" aria-label="界面模式">
      {modes.map((choice) => <button key={choice.id} type="button"
        className={`workspace-layout-option${mode === choice.id ? ' is-selected' : ''}`}
        aria-pressed={mode === choice.id} onClick={() => setError(setMode(choice.id))}>
        <span className={`workspace-layout-preview is-${choice.id}`} aria-hidden="true">
          <span className="layout-preview-stage"><i /><span><i /><i /><i /></span></span>
          <span className="layout-preview-panel"><span className="layout-preview-nav"><i /><i /><i /></span><span className="layout-preview-content"><i /><i /><i /><i /></span></span>
          <span className="layout-preview-player"><i /><i /><i /></span>
        </span>
        <span className="workspace-layout-title"><strong>{choice.title}</strong><span className="workspace-layout-radio" aria-hidden="true" /></span>
      </button>)}
    </div>
    {error && <p className="workspace-settings-error" role="alert">{error}</p>}
  </section>;
}
