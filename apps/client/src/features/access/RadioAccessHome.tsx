import SettingsPanel from '../settings/SettingsPanel';
import { useAccessController } from './useAccessController';

const tuningMarks = Array.from({ length: 48 }, (_, index) => index);

function TuningDial() {
  return (
    <div className="radio-dial" aria-hidden="true">
      <div className="radio-dial-scale">
        {tuningMarks.map((mark) => (
          <i key={mark} className={mark % 4 === 0 ? 'is-major' : undefined} style={{ transform: `rotate(${mark * 7.5}deg)` }} />
        ))}
      </div>
      <div className="radio-dial-record">
        <div className="radio-dial-label">
          <span>LUNE</span>
          <strong>RADIO</strong>
          <small>一起听</small>
        </div>
      </div>
      <div className="radio-dial-needle" />
      <span className="radio-dial-caption">TUNE INTO EACH OTHER</span>
    </div>
  );
}

export default function RadioAccessHome({ mobile = false }: { mobile?: boolean }) {
  const access = useAccessController();

  return (
    <div className={`radio-home${mobile ? ' is-mobile' : ''}`}>
      <header className="radio-topbar">
        <div className="radio-identity" aria-label="Lune Radio，一起听">
          <span className="radio-identity-name">LUNE</span>
          <span className="radio-identity-divider" />
          <span className="radio-identity-sub">RADIO <b>·</b> 一起听</span>
        </div>
        <button type="button" className="radio-settings" onClick={access.settings.openSettings} aria-label="打开设置">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" /></svg>
          <span>设置</span>
        </button>
      </header>

      <main className="radio-stage">
        <section className="radio-hero" aria-labelledby="radio-title">
          <div className="radio-hero-copy">
            <h1 id="radio-title"><span>Follow your</span><strong>inner moonlight<span className="radio-period">.</span></strong></h1>
            <p className="radio-manifesto">don't hide the madness</p>
            <p className="radio-together">tonight, together</p>
          </div>
          <TuningDial />
        </section>

        <section className="radio-console" aria-labelledby="radio-entry-title">
          <div className="radio-console-intro">
            <span className="radio-console-icon" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></span>
            <h2 id="radio-entry-title">把今晚调到同一频道。</h2>
            <p>创建一间房，或凭朋友分享的房间码加入。</p>
          </div>

          <div className="radio-console-controls">
            <div className="radio-mode-switch" role="group" aria-label="房间操作">
              <button type="button" aria-pressed={access.mode === 'create'} className={access.mode === 'create' ? 'is-active' : undefined} onClick={() => access.switchMode('create')}>创建房间</button>
              <button type="button" aria-pressed={access.mode === 'join'} className={access.mode === 'join' ? 'is-active' : undefined} onClick={() => access.switchMode('join')}>加入房间</button>
            </div>

            <div className="radio-fields" data-mode={access.mode}>
              <label className="radio-field">
                <span>你的昵称</span>
                <input value={access.nickname} onChange={(event) => access.setNickname(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void access.enterRoom()} maxLength={32} autoComplete="nickname" placeholder="今晚怎么称呼你" aria-invalid={access.error?.field === 'nickname'} aria-describedby={access.error?.field === 'nickname' ? 'radio-nickname-error' : undefined} />
                {access.error?.field === 'nickname' && <small id="radio-nickname-error" className="radio-field-error">{access.error.message}</small>}
              </label>

              {access.mode === 'join' && (
                <label className="radio-field">
                  <span>六位房间码</span>
                  <input ref={access.roomCodeInputRef} value={access.roomCode} onChange={(event) => access.setRoomCode(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void access.enterRoom()} maxLength={6} autoCapitalize="characters" autoComplete="off" className="radio-code-input" placeholder="输入房间码" aria-invalid={access.error?.field === 'roomCode'} aria-describedby={access.error?.field === 'roomCode' ? 'radio-code-error' : undefined} />
                  {access.error?.field === 'roomCode' && <small id="radio-code-error" className="radio-field-error">{access.error.message}</small>}
                </label>
              )}

              <button type="button" className="radio-enter" onClick={() => void access.enterRoom()} disabled={access.busy}>
                <span>{access.busy ? '正在进入房间…' : access.mode === 'create' ? '创建房间' : '加入房间'}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
              </button>
            </div>
            <div className="radio-feedback" role="status" aria-live="polite">{access.error && !access.error.field ? access.error.message : null}</div>
          </div>
        </section>
      </main>

      <footer className="radio-footer"><span>PRIVATE LISTENING · SHARED FREQUENCY</span><span>一间房，几个人，刚好一首歌的距离。</span></footer>
      <SettingsPanel controller={access.settings} mobile={mobile} />
    </div>
  );
}
