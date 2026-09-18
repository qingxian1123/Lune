import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { formatShortcut, shortcutActions, shortcutError, useDesktopPreferences } from '../model/desktopPreferences';
import type { Shortcut } from '../model/desktopPreferences';
import './shortcuts.css';

export default function ShortcutSettingsSection() {
  const binding = useDesktopPreferences((state) => state.bindings.toggleLibrary);
  const saveBinding = useDesktopPreferences((state) => state.saveBinding);
  const [draft, setDraft] = useState<Shortcut | null>(binding);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const record = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    if (event.key === 'Tab') { setRecording(false); return; }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') { setRecording(false); setError(''); return; }
    if (event.repeat || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
    if (event.metaKey) { setError('系统键组合可能被系统占用，请使用 Ctrl 或 Alt。'); return; }
    const next = { code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey };
    const message = shortcutError(next);
    if (message) { setError(message); return; }
    setDraft(next);
    setRecording(false);
    setError('');
    setStatus('尚未保存');
  };

  return (
    <form className="settings-form shortcut-settings" onSubmit={(event) => {
      event.preventDefault();
      const message = saveBinding('toggleLibrary', draft);
      setError(message ?? '');
      setStatus(message ? '' : '已保存，立即生效');
    }}>
      <h2>快捷键</h2>
      <p id="shortcut-help">仅在桌面房间页前台生效。点击下方按钮后按组合键，按 Esc 取消录入。</p>
      <div className="shortcut-field">
        <span id="library-shortcut-label">{shortcutActions.toggleLibrary.label}</span>
        <button type="button" className={`shortcut-recorder${recording ? ' is-recording' : ''}`}
          aria-labelledby="library-shortcut-label library-shortcut-value" aria-describedby="shortcut-help"
          aria-pressed={recording} onKeyDown={record} onBlur={() => setRecording(false)}
          onClick={() => { setRecording(true); setError(''); setStatus(''); }}>
          <span id="library-shortcut-value">{recording ? '请按组合键…' : formatShortcut(draft) || '未绑定 · 点击设置'}</span>
        </button>
        <div className="shortcut-actions">
          <button type="button" onClick={() => { setDraft(null); setError(''); setStatus('尚未保存'); }}>清除</button>
          <button type="button" onClick={() => {
            setDraft(shortcutActions.toggleLibrary.defaultBinding); setError(''); setStatus('尚未保存');
          }}>恢复默认</button>
        </div>
      </div>
      <p>快捷键保存在当前设备。部分组合键可能被系统或其他软件占用，可更换绑定；未绑定时仍可点击悬浮按钮。</p>
      {error && <p className="settings-error" role="alert">{error}</p>}
      <div className="shortcut-save-row">
        <button type="submit" className="settings-save" disabled={recording}>保存</button>
        <span role="status">{status}</span>
      </div>
    </form>
  );
}
