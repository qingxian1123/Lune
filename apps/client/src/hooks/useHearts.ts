import { useCallback, useEffect, useRef } from 'react';
import type { ClientMessage, ServerMessage, Track } from '@lune/shared';

export function useHearts(
  send: (message: ClientMessage) => void,
  subscribe: (listener: (message: ServerMessage) => void) => () => void,
  connected: boolean,
) {
  const pending = useRef(new Map<string, { resolve: () => void; reject: () => void; timer: number }>());
  useEffect(() => {
    const unsubscribe = subscribe((message) => {
      if (message.type !== 'heart_recorded' && message.type !== 'heart_failed') return;
      const entry = pending.current.get(message.payload.requestId);
      if (!entry) return;
      window.clearTimeout(entry.timer);
      pending.current.delete(message.payload.requestId);
      if (message.type === 'heart_recorded') entry.resolve();
      else entry.reject();
    });
    const entries = pending.current;
    return () => {
      unsubscribe();
      entries.forEach((entry) => { window.clearTimeout(entry.timer); entry.reject(); });
      entries.clear();
    };
  }, [subscribe]);

  return useCallback((track: Track): Promise<void> => new Promise((resolve, reject) => {
    const fail = () => reject(new Error('爱心没有送出，请重试'));
    if (!connected || pending.current.size >= 40) { fail(); return; }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const requestId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    const timer = window.setTimeout(() => {
      pending.current.delete(requestId);
      fail();
    }, 12000);
    pending.current.set(requestId, { resolve, reject: fail, timer });
    try { send({ type: 'send_heart', payload: { requestId, track } }); }
    catch { window.clearTimeout(timer); pending.current.delete(requestId); fail(); }
  }), [connected, send]);
}
