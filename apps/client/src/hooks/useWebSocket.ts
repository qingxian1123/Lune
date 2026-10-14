import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@lune/shared';
import { RoomConnection, type ConnectionState } from '../lib/RoomConnection';

export function useWebSocket(url: string) {
  const connection = useRef<RoomConnection | null>(null);
  const listeners = useRef(new Set<(msg: ServerMessage) => void>());
  const statusListeners = useRef(new Set<(joined: boolean) => void>());
  const [status, setStatus] = useState<ConnectionState>({ phase: 'connecting', code: null });
  useEffect(() => {
    const session = new RoomConnection(url);
    connection.current = session;
    const statusOff = session.subscribeStatus((state) => {
      setStatus(state); statusListeners.current.forEach((fn) => fn(state.phase === 'joined'));
    });
    const messageOff = session.subscribe((msg) => listeners.current.forEach((fn) => {
      try { fn(msg); } catch { /* One subscriber cannot block room-state delivery to the others. */ }
    }));
    const online = () => session.reconnectNow();
    const visible = () => { if (document.visibilityState === 'visible') session.checkForeground(); };
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', visible);
    session.start();
    return () => {
      statusOff(); messageOff(); session.stop(); connection.current = null;
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [url]);
  const send = useCallback((msg: ClientMessage) => connection.current?.send(msg) ?? false, []);
  const subscribe = useCallback((fn: (msg: ServerMessage) => void) => {
    listeners.current.add(fn); return () => { listeners.current.delete(fn); };
  }, []);
  const getRtt = useCallback(() => connection.current?.getRtt() ?? 0, []);
  const subscribeConnection = useCallback((fn: (joined: boolean) => void) => {
    statusListeners.current.add(fn); fn(connection.current?.state.phase === 'joined');
    return () => { statusListeners.current.delete(fn); };
  }, []);
  const reconnectNow = useCallback(() => connection.current?.reconnectNow(), []);
  const stop = useCallback(() => connection.current?.stop(), []);
  const readyState = status.phase === 'joining' || status.phase === 'joined' ? WebSocket.OPEN
    : status.phase === 'connecting' ? WebSocket.CONNECTING : WebSocket.CLOSED;
  return { send, subscribe, subscribeConnection, getRtt, readyState, status, reconnectNow, stop };
}
