import { useEffect, useRef, useState } from 'react';
import type { RecoveryState } from '../audio/playbackTypes';
import { checkProviderReady } from '../lib/api';
import './playback-recovery.css';

export function playbackLabel(state: RecoveryState): string {
  if (state.hold === 'noisy') return '耳机已断开，本机已静音';
  if (state.hold === 'manual') return '本机已静音';
  if (state.hold === 'gesture') return '点击开启声音';
  if (state.hold === 'system') return '本机已暂停';
  if (state.code === 'PROVIDER_AUTH_REQUIRED' || state.code === 'HTTP_401' || state.code === 'HTTP_403') return '当前平台暂不可用，请联系建服的朋友';
  if (state.code === 'UNPLAYABLE') return '这首歌暂时无法播放';
  if (state.code === 'CONNECTION') return '正在重连房间…';
  return ({ idle: '未播放', resolving: '正在加载', loading: '正在加载', playing: '正在播放',
    buffering: '正在缓冲', recovering: '播放中断，正在恢复…', waiting: '等待恢复播放', failed: '这首歌加载失败' })[state.phase];
}

export default function PlaybackNotice({ state, provider, onRetry, onResume, disabled = false }: {
  state: RecoveryState; provider?: string; onRetry: () => void; onResume: () => void; disabled?: boolean; compact?: boolean;
}) {
  const [delayed, setDelayed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const operation = useRef(0);
  const checking = useRef(false);
  useEffect(() => {
    operation.current++; checking.current = false; setBusy(false); setFeedback('');
    return () => { operation.current++; };
  }, [provider, state.code, state.hold, state.phase]);
  useEffect(() => {
    setDelayed(false);
    const timer = window.setTimeout(() => setDelayed(true), 1000);
    return () => window.clearTimeout(timer);
  }, [state.phase]);
  const pending = ['loading', 'resolving', 'recovering'].includes(state.phase);
  const auth = ['PROVIDER_AUTH_REQUIRED', 'HTTP_401', 'HTTP_403'].includes(state.code ?? '');
  const check = async () => {
    if (checking.current) return;
    checking.current = true; setBusy(true);
    const id = operation.current;
    try {
      const ready = await checkProviderReady(provider);
      if (id !== operation.current) return;
      if (ready) onRetry(); else setFeedback('平台仍不可用，请联系建服的朋友');
    } catch { if (id === operation.current) setFeedback('暂时无法检查，请稍后再试'); }
    finally { if (id === operation.current) { checking.current = false; setBusy(false); } }
  };
  if (state.phase === 'idle' || (state.phase === 'playing' && state.hold === 'none')
    || (['loading', 'resolving', 'buffering'].includes(state.phase) && !delayed)
    || state.code === 'CONNECTION') return null;
  return <section className="playback-notice" aria-label="本机播放状态">
    <span role="status" aria-live="polite">{playbackLabel(state)}</span>
    <div className="playback-notice-actions">
      {state.hold !== 'none'
        ? <button type="button" disabled={disabled || pending} onClick={onResume}>恢复声音</button>
        : !pending && state.phase !== 'buffering' && <button type="button" disabled={disabled || busy} onClick={auth ? () => void check() : onRetry}>
          {busy ? '检查中…' : auth ? '重新检查' : '重试'}
        </button>}
    </div>
    {feedback && <small role="status">{feedback}</small>}
  </section>;
}
