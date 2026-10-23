import { useState } from 'react';
import { useDesktopPreferences, type LibraryLayout } from '../model/desktopPreferences';
import './workspace-settings.css';

const layouts: { id: LibraryLayout; title: string }[] = [
  { id: 'compact', title: '简约功能区' },
  { id: 'workspace', title: '完整工作区' },
];

export default function WorkspaceSettingsSection() {
  const layout = useDesktopPreferences((state) => state.libraryLayout);
  const setLayout = useDesktopPreferences((state) => state.setLibraryLayout);
  const [error, setError] = useState<string | null>(null);

  return <section className="settings-form workspace-settings" aria-labelledby="workspace-settings-title">
    <h2 id="workspace-settings-title">功能区样式</h2>
    <div className="workspace-layout-options" role="group" aria-label="功能区样式">
      {layouts.map((choice) => <button key={choice.id} type="button"
        className={`workspace-layout-option${layout === choice.id ? ' is-selected' : ''}`}
        aria-pressed={layout === choice.id} onClick={() => setError(setLayout(choice.id))}>
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
