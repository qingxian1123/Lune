import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { SettingsSectionDefinition } from './model/types';
import { useClientRuntime } from '../../app/ClientRuntimeProvider';
import WindowTitlebar from '../../desktop/WindowTitlebar';

interface SettingsShellProps {
  open: boolean;
  mobile: boolean;
  sections: SettingsSectionDefinition[];
  activeSectionId: string;
  onSectionChange: (sectionId: string) => void;
  onClose: () => void;
  children: ReactNode;
}

export default function SettingsShell({
  open,
  mobile,
  sections,
  activeSectionId,
  onSectionChange,
  onClose,
  children,
}: SettingsShellProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isWindows = useClientRuntime().kind === 'windows';
  const showNavigation = sections.length > 1;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className={`settings-layer ${mobile ? 'is-mobile' : ''} ${showNavigation ? 'has-sections' : ''}`}
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (!mobile && event.target === event.currentTarget) onClose();
      }}
    >
      {isWindows && <WindowTitlebar />}
      <section className="settings-surface">
        <header className="settings-header">
          <strong id="settings-title">设置</strong>
          <button type="button" className="settings-close" onClick={onClose} aria-label={mobile ? '返回' : '关闭设置'}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={mobile ? 'M15 6l-6 6 6 6' : 'M6 6l12 12M18 6 6 18'} />
            </svg>
          </button>
        </header>

        <div className={`settings-layout ${showNavigation ? '' : 'has-single-section'}`}>
          {showNavigation && (
            <nav className="settings-nav" aria-label="设置分类">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={section.id === activeSectionId ? 'is-active' : undefined}
                  aria-current={section.id === activeSectionId ? 'page' : undefined}
                  onClick={() => onSectionChange(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </nav>
          )}

          <div className="settings-content">{children}</div>
        </div>
      </section>
    </dialog>
  );
}
