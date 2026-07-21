import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom } from '../lib/api';
import { AudioEngine } from '../audio/AudioEngine';
import { getUiErrorMessage } from '../lib/uiError';

type AccessMode = 'create' | 'join';
type AccessError = { field?: 'nickname' | 'roomCode'; message: string };
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
  const navigate = useNavigate();
  const [mode, setMode] = useState<AccessMode>('create');
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState<AccessError | null>(null);
  const [busy, setBusy] = useState(false);
  const roomCodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'join') roomCodeRef.current?.focus();
  }, [mode]);

  const enterRoom = async () => {
    if (!nickname.trim()) {
      setError({ field: 'nickname', message: '请先输入你的昵称' });
      return;
    }
    if (mode === 'join' && !roomCode.trim()) {
      setError({ field: 'roomCode', message: '请输入房主分享的房间码' });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await AudioEngine.instance().resume();
      const response =
        mode === 'create'
          ? await createRoom(nickname.trim())
          : await joinRoom(roomCode.trim().toUpperCase(), nickname.trim());
      navigate(`/room/${response.code}`, {
        state: { token: response.token, memberId: response.member.id },
      });
    } catch (error) {
      setError({ message: getUiErrorMessage(error, '暂时无法进入房间，请稍后再试') });
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode: AccessMode) => {
    setMode(nextMode);
    setError(null);
  };

  return (
    <div className="access-shell">
      <div className="moon-silhouette" aria-hidden="true" />
      <div className="home-particles" aria-hidden="true">
        {particles.map((style, index) => <i key={index} style={style} />)}
      </div>

      <header className="access-header">
        <div className="brand-lockup">
          <span className="brand-mark">LUNE</span>
          <span className="brand-divider" />
          <span className="brand-caption">一起听</span>
        </div>
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
              <strong>今晚想一起听什么？</strong>
            </div>
          </div>

          <div className="access-tabs" role="tablist" aria-label="房间操作">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'create'}
              className={mode === 'create' ? 'is-active' : undefined}
              onClick={() => switchMode('create')}
            >
              创建房间
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'join'}
              className={mode === 'join' ? 'is-active' : undefined}
              onClick={() => switchMode('join')}
            >
              加入房间
            </button>
          </div>

          <div className="access-fields">
            <label className="terminal-field">
              <span>你的昵称</span>
              <input
                value={nickname}
                onChange={(event) => {
                  setNickname(event.target.value);
                  if (error?.field === 'nickname') setError(null);
                }}
                onKeyDown={(event) => event.key === 'Enter' && enterRoom()}
                placeholder="输入你的昵称"
                maxLength={32}
                autoComplete="nickname"
              />
              {error?.field === 'nickname' && <small className="field-error">{error.message}</small>}
            </label>

            {mode === 'join' && (
              <label className="terminal-field">
                <span>房间代码</span>
                <input
                  ref={roomCodeRef}
                  value={roomCode}
                  onChange={(event) => {
                    setRoomCode(event.target.value.toUpperCase().slice(0, 6));
                    if (error?.field === 'roomCode') setError(null);
                  }}
                  onKeyDown={(event) => event.key === 'Enter' && enterRoom()}
                  placeholder="输入六位房间码"
                  maxLength={6}
                  autoCapitalize="characters"
                  className="room-code-input"
                />
                {error?.field === 'roomCode' && <small className="field-error">{error.message}</small>}
              </label>
            )}

            <div className={`access-message ${error && !error.field ? 'is-error' : ''}`} aria-live="polite">
              {error && !error.field
                ? error.message
                : mode === 'create'
                  ? '创建后即可邀请朋友加入'
                  : '使用房主分享的房间码加入'}
            </div>

            <button type="button" className="access-submit" onClick={enterRoom} disabled={busy}>
              <span>{busy ? '正在进入房间' : mode === 'create' ? '创建房间' : '加入房间'}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>


        </section>
      </main>
    </div>
  );
}
