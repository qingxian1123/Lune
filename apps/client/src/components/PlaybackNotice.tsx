import { useEffect, useRef, useState } from 'react';
import type { RecoveryState } from '../audio/playbackTypes';
import { exportPlaybackDiagnostics, playbackDiagnosticReport } from '../lib/playbackDiagnostics';
import { checkProviderReady } from '../lib/api';
import './playback-recovery.css';

export function playbackLabel(state: RecoveryState): string {
  if (state.hold === 'noisy') return '耳机已断开，本机播放已暂停';
  if (state.hold === 'manual') return '已在本机静音，房间仍在播放';
  if (state.hold === 'gesture') return '需要你点击恢复声音';
  if (state.hold === 'system') return '本机播放已暂停';
  if (state.code === 'PROVIDER_AUTH_REQUIRED' || state.code === 'HTTP_401' || state.code === 'HTTP_403') return '音乐源需要服务管理员重新登录';
  if (state.code === 'UNPLAYABLE') return '音乐源暂未提供这首歌的播放地址';
  if (state.code === 'CONNECTION') return '等待房间连接恢复';
  return ({ idle: '未播放', resolving: '正在载入歌曲', loading: '正在载入歌曲', playing: '正在播放',
    buffering: '正在缓冲', recovering: '播放暂时中断，正在尝试恢复', waiting: '等待播放恢复', failed: '这首歌暂时未能载入' })[state.phase];
}

export default function PlaybackNotice({ state, provider, onRetry, onResume, disabled = false }: {
  state: RecoveryState; provider?: string; onRetry: () => void; onResume: () => void; disabled?: boolean;
}) {
  const [delayed, setDelayed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState('');
  const operation = useRef(0);
  const checking = useRef(false);
  useEffect(() => {
    operation.current++; checking.current = false; setBusy(false); setFeedback(''); setFallback('');
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
      if (ready) onRetry(); else setFeedback('音乐源仍未就绪，请联系服务管理员');
    } catch { if (id === operation.current) setFeedback('暂时无法检查音乐源，请稍后再试'); }
    finally { if (id === operation.current) { checking.current = false; setBusy(false); } }
  };
  const exportReport = async () => {
    const id = operation.current;
    try { const message = await exportPlaybackDiagnostics(); if (id === operation.current) setFeedback(message); }
    catch {
      if (id !== operation.current) return;
      setFeedback('无法下载或复制，可手动复制下方脱敏诊断'); setFallback(playbackDiagnosticReport());
    }
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
          {busy ? '正在检查' : auth ? '检查状态' : '重试播放'}
        </button>}
      {!pending && <button type="button" onClick={() => void exportReport()}>导出诊断</button>}
    </div>
    {feedback && <small role="status">{feedback}</small>}
    {fallback && <textarea aria-label="脱敏诊断，复制后保存" readOnly value={fallback} onFocus={(event) => event.target.select()} />}
  </section>;
}
