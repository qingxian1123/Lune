import type { CSSProperties } from 'react';
import SettingsPanel from '../features/settings/SettingsPanel';
import { useAccessController } from '../features/access/useAccessController';

type ParticleStyle = CSSProperties & {
  '--particle-x': string;
  '--particle-y': string;
  '--particle-size': string;
  '--particle-duration': string;
  '--particle-delay': string;
};

const particles: ParticleStyle[] = [
  { '--particle-x': '12%', '--particle-y': '16%', '--particle-size': '1.5px', '--particle-duration': '9s', '--particle-delay': '0s' },
  { '--particle-x': '78%', '--particle-y': '11%', '--particle-size': '2px', '--particle-duration': '12s', '--particle-delay': '-3s' },
  { '--particle-x': '64%', '--particle-y': '28%', '--particle-size': '1.5px', '--particle-duration': '10s', '--particle-delay': '-6s' },
  { '--particle-x': '30%', '--particle-y': '42%', '--particle-size': '1.5px', '--particle-duration': '11s', '--particle-delay': '-2s' },
  { '--particle-x': '88%', '--particle-y': '50%', '--particle-size': '1.5px', '--particle-duration': '8s', '--particle-delay': '-5s' },
  { '--particle-x': '8%', '--particle-y': '62%', '--particle-size': '2px', '--particle-duration': '13s', '--particle-delay': '-8s' },
];

export default function MobileHome() {
  const access = useAccessController();

  return (
    <div className="m-access-shell">
      <div className="m-moon" aria-hidden="true" />
      <div className="m-particles" aria-hidden="true">
        {particles.map((style, index) => <i key={index} style={style} />)}
      </div>

      <header className="m-topline">
        <div className="brand-lockup">
          <span className="brand-mark">LUNE</span>
        </div>
        <button type="button" className="settings-trigger" onClick={access.settings.openSettings} aria-label="打开设置">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" />
          </svg>
          <span>设置</span>
        </button>
      </header>

      <main className="m-access-main">
        <section className="m-hero" aria-labelledby="m-access-title">
          <h1 id="m-access-title">
            <span className="m-hero-l1">Follow your inner moonlight</span>
            <span className="m-hero-l2">don't hide the madness</span>
          </h1>
          <p>tonight, together</p>
        </section>

        <section className="m-access-card" aria-label="进入音乐房间">
          <div className="m-card-head">
            <strong>进入房间</strong>
          </div>

          <div className="access-tabs" role="tablist" aria-label="房间操作">
            <button
              type="button"
              role="tab"
              aria-selected={access.mode === 'create'}
              className={access.mode === 'create' ? 'is-active' : undefined}
              onClick={() => access.switchMode('create')}
            >
              创建房间
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={access.mode === 'join'}
              className={access.mode === 'join' ? 'is-active' : undefined}
              onClick={() => access.switchMode('join')}
            >
              加入房间
            </button>
          </div>

          <div className="m-access-fields">
            <label className="terminal-field">
              <span>昵称</span>
              <input
                value={access.nickname}
                onChange={(event) => access.setNickname(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void access.enterRoom()}
                maxLength={32}
                autoComplete="nickname"
              />
              {access.error?.field === 'nickname' && <small className="field-error">{access.error.message}</small>}
            </label>

            {access.mode === 'join' && (
              <label className="terminal-field">
                <span>房间码</span>
                <input
                  ref={access.roomCodeInputRef}
                  value={access.roomCode}
                  onChange={(event) => access.setRoomCode(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void access.enterRoom()}
                  maxLength={6}
                  autoCapitalize="characters"
                  className="room-code-input"
                />
                {access.error?.field === 'roomCode' && <small className="field-error">{access.error.message}</small>}
              </label>
            )}

            <div className={`access-message ${access.error && !access.error.field ? 'is-error' : ''}`} aria-live="polite">
              {access.error && !access.error.field ? access.error.message : null}
            </div>

            <button type="button" className="access-submit" onClick={() => void access.enterRoom()} disabled={access.busy}>
              <span>{access.busy ? '正在进入房间' : access.mode === 'create' ? '创建房间' : '加入房间'}</span>
            </button>
          </div>
        </section>
      </main>

      <SettingsPanel controller={access.settings} mobile />
    </div>
  );
}
