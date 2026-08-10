import type { CSSProperties } from 'react';
import SettingsPanel from '../features/settings/SettingsPanel';
import { useAccessController } from '../features/access/useAccessController';

type ParticleStyle = CSSProperties & {
  '--particle-x': string;
  '--particle-y': string;
  '--particle-size': string;
  '--particle-duration': string;
  '--particle-delay': string;
  '--particle-drift': string;
};

const particles: ParticleStyle[] = [
  { '--particle-x': '8%', '--particle-y': '21%', '--particle-size': '1px', '--particle-duration': '27s', '--particle-delay': '-4s', '--particle-drift': '10px' },
  { '--particle-x': '17%', '--particle-y': '72%', '--particle-size': '1px', '--particle-duration': '31s', '--particle-delay': '-16s', '--particle-drift': '-8px' },
  { '--particle-x': '28%', '--particle-y': '38%', '--particle-size': '2px', '--particle-duration': '24s', '--particle-delay': '-9s', '--particle-drift': '7px' },
  { '--particle-x': '39%', '--particle-y': '84%', '--particle-size': '1px', '--particle-duration': '29s', '--particle-delay': '-21s', '--particle-drift': '-11px' },
  { '--particle-x': '48%', '--particle-y': '16%', '--particle-size': '1px', '--particle-duration': '32s', '--particle-delay': '-12s', '--particle-drift': '9px' },
  { '--particle-x': '57%', '--particle-y': '61%', '--particle-size': '1px', '--particle-duration': '25s', '--particle-delay': '-19s', '--particle-drift': '-6px' },
  { '--particle-x': '66%', '--particle-y': '29%', '--particle-size': '2px', '--particle-duration': '30s', '--particle-delay': '-7s', '--particle-drift': '8px' },
  { '--particle-x': '73%', '--particle-y': '78%', '--particle-size': '1px', '--particle-duration': '26s', '--particle-delay': '-14s', '--particle-drift': '-10px' },
  { '--particle-x': '82%', '--particle-y': '47%', '--particle-size': '1px', '--particle-duration': '33s', '--particle-delay': '-24s', '--particle-drift': '6px' },
  { '--particle-x': '91%', '--particle-y': '18%', '--particle-size': '1px', '--particle-duration': '28s', '--particle-delay': '-11s', '--particle-drift': '-7px' },
  { '--particle-x': '94%', '--particle-y': '68%', '--particle-size': '2px', '--particle-duration': '31s', '--particle-delay': '-18s', '--particle-drift': '8px' },
  { '--particle-x': '52%', '--particle-y': '91%', '--particle-size': '1px', '--particle-duration': '29s', '--particle-delay': '-5s', '--particle-drift': '-9px' },
];

export default function Home() {
  const access = useAccessController();

  return (
    <div className="access-shell">
      <div className="moon-silhouette" aria-hidden="true" />
      <div className="home-particles" aria-hidden="true">
        {particles.map((style, index) => <i key={index} style={style} />)}
      </div>

      <header className="access-header">
        <div className="brand-lockup">
          <span className="brand-mark">LUNE</span>
        </div>
        <button type="button" className="settings-trigger" onClick={access.settings.openSettings}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" />
          </svg>
          <span>设置</span>
        </button>
      </header>

      <main className="access-main">
        <section className="access-intro" aria-labelledby="access-title">
          <h1 id="access-title">
            <span className="headline-primary">Follow your inner moonlight</span>
            <span className="headline-secondary">don't hide the madness</span>
          </h1>
        </section>

        <section className="access-terminal" aria-label="进入音乐房间">
          <div className="terminal-heading">
            <div>
              <strong>进入房间</strong>
            </div>
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

          <div className="access-fields">
            <label className="terminal-field">
              <span>昵称</span>
              <input
                value={access.nickname}
                onChange={(event) => access.setNickname(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void access.enterRoom()}
                placeholder="例如，小林"
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
                  placeholder="例如 ABC123"
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

      <SettingsPanel controller={access.settings} />
    </div>
  );
}
