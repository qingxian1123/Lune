import { useEffect, useRef, useState } from 'react';
import type { Track } from '@lune/shared';
import { useSessionHeartStore } from '../hooks/useSessionHeartStore';
import './hearts.css';

export function HeartIcon({ filled = false }: { filled?: boolean }) {
  return <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" /></svg>;
}

interface HeartButtonProps {
  track: Track | null | undefined;
  onSendHeart: (track: Track) => Promise<void>;
  className?: string;
  /** Desktop acknowledgement is scoped to this server and this client session. */
  sessionScope?: string;
}

export default function HeartButton(props: HeartButtonProps) {
  const trackKey = JSON.stringify([props.sessionScope, props.track?.provider, props.track?.id]);
  return <TrackHeartButton key={trackKey} {...props} trackKey={trackKey} />;
}

function TrackHeartButton({ track, onSendHeart, className = '', sessionScope, trackKey }: HeartButtonProps & { trackKey: string }) {
  const filled = useSessionHeartStore((state) => sessionScope !== undefined && state.sent.has(trackKey));
  const remember = useSessionHeartStore((state) => state.remember);
  const [pulse, setPulse] = useState(0);
  const [confirmed, setConfirmed] = useState(0);
  const [error, setError] = useState('');
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const send = async () => {
    if (!track) return;
    setError('');
    setPulse((value) => value + 1);
    try {
      await onSendHeart(track);
      if (sessionScope !== undefined) remember(trackKey);
      if (mounted.current) setConfirmed((value) => value + 1);
    } catch {
      if (mounted.current) setError('爱心没有送出，请重试');
    }
  };
  return <span className="heart-action">
    <button type="button" className={`heart-send ${className}${filled ? ' is-filled' : ''}`} onClick={() => void send()} disabled={!track}
      title={filled ? '已送出爱心，再送一颗' : '送出爱心'} aria-label={track ? `为《${track.name}》送出一颗爱心` : '送出爱心'}>
      <span key={pulse} className={pulse ? 'heart-pulse' : ''}><HeartIcon filled={filled} /></span>
    </button>
    {confirmed > 0 && <span key={confirmed} className="heart-plus" aria-hidden="true">+1</span>}
    <span className="sr-only" role="status">{confirmed > 0 ? `已送出 ${confirmed} 颗爱心` : ''}</span>
    {error && <span className="heart-error" role="alert">{error}</span>}
  </span>;
}
