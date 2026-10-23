import { useEffect, useState } from 'react';
import SettingsPanel from '../settings/SettingsPanel';
import { hasSavedServerUrl } from '../../lib/serverConfig';
import { useAccessController } from './useAccessController';

function EclipseVinyl() {
  return (
    <div className="invite-turntable" aria-hidden="true">
      <svg className="invite-turntable-svg" viewBox="0 0 520 520">
        <defs>
          <filter id="eclipse-vinyl-shadow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="-8" dy="8" stdDeviation="9" floodColor="#000000" floodOpacity="0.58" />
          </filter>
        </defs>

        {/* Bottom-left pure white Moon circle */}
        <circle cx="234" cy="285" r="222" className="eclipse-moon" />

        {/* Top-right offset Black Vinyl Record casting shadow onto the white moon */}
        <g className="eclipse-vinyl-group" filter="url(#eclipse-vinyl-shadow)">
          <circle cx="286" cy="235" r="222" className="eclipse-vinyl-body" />

          {/* 4 concentric pinkish-lavender groove rings matching the design comp */}
          <circle cx="286" cy="235" r="186" className="eclipse-vinyl-groove" />
          <circle cx="286" cy="235" r="136" className="eclipse-vinyl-groove" />
          <circle cx="286" cy="235" r="107" className="eclipse-vinyl-groove" />
          <circle cx="286" cy="235" r="70" className="eclipse-vinyl-groove" />

          {/* Dark plum-tinted center label ring */}
          <circle cx="286" cy="235" r="56" className="eclipse-vinyl-label" />

          {/* Pure white center hole */}
          <circle cx="286" cy="235" r="36" className="eclipse-vinyl-hole" />
        </g>
      </svg>
    </div>
  );
}

export default function WindowsInvitationHome() {
  const access = useAccessController({ invitation: true });
  const firstConnection = !hasSavedServerUrl();
  const [serverEditorRevealed, setServerEditorRevealed] = useState(false);

  useEffect(() => {
    if (access.settings.serverError || access.error?.field === 'server') {
      setServerEditorRevealed(true);
    }
  }, [access.error?.field, access.settings.serverError]);

  const showServerEditor = firstConnection || serverEditorRevealed;
  const serverError = access.error?.field === 'server'
    ? access.error.message
    : access.settings.serverError;

  return (
    <div className="invitation-home">
      <main className="invitation-stage">
        <section className="invitation-ticket" aria-labelledby="invitation-title">
          {/* Left Pane: Eclipse Moon & Black Vinyl Sleeve */}
          <div className="invitation-sleeve">
            <div className="invitation-brand" aria-label="Lune">
              <span className="invitation-brand-mark">LUNE</span>
            </div>

            <div className="invitation-disc-wrap">
              <EclipseVinyl />
            </div>

            <p className="invitation-tagline">Follow your inner moonlight</p>
          </div>

          {/* Perforated Divider */}
          <div className="invitation-perforation" aria-hidden="true">
            <span className="perforation-notch is-top" />
            <span className="perforation-line" />
            <span className="perforation-notch is-bottom" />
          </div>

          {/* Right Pane: Clean Entry Form */}
          <div className="invitation-pass">
            <header className="invitation-pass-header">
              <h1 id="invitation-title" className="invitation-pass-title">进入房间</h1>
              <button
                type="button"
                className="invitation-settings-trigger"
                onClick={access.settings.openSettings}
                aria-label="打开设置"
                title="设置"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" />
                </svg>
              </button>
            </header>

            <form
              className="invitation-form"
              onSubmit={(event) => {
                event.preventDefault();
                void access.enterRoom();
              }}
              noValidate
            >
              <label className="invitation-field">
                <span className="invitation-field-head">
                  <span>昵称</span>
                </span>
                <input
                  value={access.nickname}
                  onChange={(event) => access.setNickname(event.target.value)}
                  maxLength={32}
                  autoComplete="nickname"
                  autoFocus
                  placeholder="输入你的昵称"
                  aria-invalid={access.error?.field === 'nickname'}
                  aria-describedby={access.error?.field === 'nickname' ? 'invitation-name-error' : undefined}
                />
                {access.error?.field === 'nickname' && (
                  <small id="invitation-name-error" className="invitation-error">
                    {access.error.message}
                  </small>
                )}
              </label>

              <label className="invitation-field">
                <span className="invitation-field-head">
                  <span>房间码</span>
                  <em>选填</em>
                </span>
                <input
                  ref={access.roomCodeInputRef}
                  value={access.roomCode}
                  onChange={(event) => access.setRoomCode(event.target.value)}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  className="invitation-code-input"
                  placeholder="留空创建，或输入 6 位房间码"
                  aria-invalid={access.error?.field === 'roomCode'}
                  aria-describedby={access.error?.field === 'roomCode' ? 'invitation-code-error' : undefined}
                />
                {access.error?.field === 'roomCode' && (
                  <small id="invitation-code-error" className="invitation-error">
                    {access.error.message}
                  </small>
                )}
              </label>

              {showServerEditor && (
                <label className="invitation-field">
                  <span className="invitation-field-head">
                    <span>服务器地址</span>
                  </span>
                  <input
                    value={access.settings.serverUrl}
                    onChange={(event) => access.settings.setServerUrl(event.target.value)}
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="https://lune.example.com"
                    aria-invalid={Boolean(serverError)}
                    aria-describedby={serverError ? 'invitation-server-error' : undefined}
                  />
                  {serverError && (
                    <small id="invitation-server-error" className="invitation-error">
                      {serverError}
                    </small>
                  )}
                </label>
              )}

              {access.error && !access.error.field && (
                <p className="invitation-alert" role="alert">
                  {access.error.message}
                </p>
              )}

              <button type="submit" className="invitation-submit" disabled={access.busy}>
                <span>
                  {access.busy
                    ? '正在进入…'
                    : access.mode === 'join'
                      ? '加入房间'
                      : '创建房间'}
                </span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h14m-5-5 5 5-5 5" />
                </svg>
              </button>
            </form>
          </div>
        </section>
      </main>

      <SettingsPanel controller={access.settings} />
    </div>
  );
}
