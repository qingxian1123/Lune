import { useRef } from 'react';
import { useSettingsControllerContext } from '../model/SettingsControllerContext';

export default function ServerSettingsSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useSettingsControllerContext();

  return (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault();
        void controller.saveServer();
      }}
    >
      <h2>服务连接</h2>
      <label className="settings-field">
        <span>服务器地址</span>
        <input
          ref={inputRef}
          autoFocus
          value={controller.serverUrl}
          onChange={(event) => controller.setServerUrl(event.target.value)}
          placeholder="https://lune.example.com"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>

      {controller.serverError && (
        <p className="settings-error" role="alert">{controller.serverError}</p>
      )}

      <button type="submit" className="settings-save" disabled={controller.serverState === 'testing'}>
        {controller.serverState === 'testing' ? '正在保存' : '保存'}
      </button>
    </form>
  );
}
