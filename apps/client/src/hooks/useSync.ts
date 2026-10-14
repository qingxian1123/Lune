import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@lune/shared';
import { AudioEngine } from '../audio/AudioEngine';
import { PlaybackSync } from '../audio/PlaybackSync';
import { resolveTrack } from '../lib/api';
import { useRoomStore } from './useRoomStore';
import { idleRecovery } from '../audio/playbackTypes';

interface UseSyncOptions {
  send: (msg: ClientMessage) => boolean;
  subscribeConnection: (fn: (joined: boolean) => void) => () => void;
  /** 订阅服务端消息(取代 lastMessage,避免 React 批处理丢消息) */
  subscribe: (fn: (msg: ServerMessage) => void) => () => void;
  getRtt: () => number;
  engine: AudioEngine;
}

/** 原子更新房间状态；音频与 ended 的版本归属统一由 PlaybackSync 管理。 */
export function useSync({ send, subscribe, subscribeConnection, getRtt, engine }: UseSyncOptions) {
  const [recoveryState, setRecoveryState] = useState(idleRecovery);
  const applyServerMessage = useRoomStore((s) => s.applyServerMessage);
  const setConnected = useRoomStore((s) => s.setConnected);
  const syncRef = useRef<PlaybackSync | null>(null);
  const sendRef = useRef(send);
  const rttRef = useRef(getRtt);
  sendRef.current = send;
  rttRef.current = getRtt;

  useEffect(() => {
    const sync = new PlaybackSync(
      engine,
      resolveTrack,
      (message) => sendRef.current(message),
      () => rttRef.current(),
      setRecoveryState,
    );
    sync.setConnected(false);
    syncRef.current = sync;
    const connectionOff = subscribeConnection((joined) => { if (!joined) sync.setConnected(false); });
    const unsub = subscribe((msg) => {
      applyServerMessage(msg);
      if (msg.type === 'heartbeat_ack') {
        sync.observeClock(msg.payload.serverTime);
      } else if (msg.type === 'joined') {
        setConnected(true);
        sync.setConnected(true);
        sync.apply(msg.payload.snapshot.playback, { reset: true, serverTime: msg.payload.serverTime });
      } else if (msg.type === 'room_state_changed') {
        sync.apply(msg.payload.playback, {
          serverTime: msg.payload.serverTime,
          recover: msg.payload.cause === 'resync',
          // 队列允许重复歌曲，advance 即使歌曲 ID 相同也必须重新加载。
          restart: msg.payload.cause === 'advance' || msg.payload.cause === 'play',
        });
      } else if (msg.type === 'left' || (msg.type === 'error' && msg.payload.code
        && ['AUTH_INVALID', 'MEMBER_INVALID', 'ROOM_NOT_FOUND'].includes(msg.payload.code))) {
        sync.setConnected(false);
        sync.recovery.stop();
      }
    });
    const timer = window.setInterval(() => sync.resync(), 5000);
    const visible = () => { if (document.visibilityState === 'visible') sync.resync(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      connectionOff();
      unsub();
      sync.dispose();
      syncRef.current = null;
    };
  }, [subscribe, subscribeConnection, applyServerMessage, setConnected, engine]);

  const resyncFromLatestPlayback = useCallback(() => syncRef.current?.resync() ?? false, []);
  const retryPlayback = useCallback((resumeSound = false) => syncRef.current?.retry(resumeSound), []);
  const holdPlayback = useCallback((reason: 'manual' | 'noisy') => syncRef.current?.hold(reason), []);
  const stopPlayback = useCallback(() => syncRef.current?.recovery.stop(), []);
  return { send, resyncFromLatestPlayback, recoveryState, retryPlayback, holdPlayback, stopPlayback };
}
