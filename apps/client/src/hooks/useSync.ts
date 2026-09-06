import { useCallback, useEffect, useRef } from 'react';
import type { ClientMessage, ServerMessage } from '@lune/shared';
import { AudioEngine } from '../audio/AudioEngine';
import { PlaybackSync } from '../audio/PlaybackSync';
import { resolveTrack } from '../lib/api';
import { useRoomStore } from './useRoomStore';

interface UseSyncOptions {
  send: (msg: ClientMessage) => void;
  /** 订阅服务端消息(取代 lastMessage,避免 React 批处理丢消息) */
  subscribe: (fn: (msg: ServerMessage) => void) => () => void;
  getRtt: () => number;
  engine: AudioEngine;
}

/** 原子更新房间状态；音频与 ended 的版本归属统一由 PlaybackSync 管理。 */
export function useSync({ send, subscribe, getRtt, engine }: UseSyncOptions) {
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
    );
    syncRef.current = sync;
    const unsub = subscribe((msg) => {
      applyServerMessage(msg);
      if (msg.type === 'joined') {
        setConnected(true);
        sync.apply(msg.payload.snapshot.playback, { reset: true });
      } else if (msg.type === 'room_state_changed') {
        sync.apply(msg.payload.playback, {
          // 队列允许重复歌曲，advance 即使歌曲 ID 相同也必须重新加载。
          restart: msg.payload.cause === 'advance' || msg.payload.cause === 'play',
        });
      }
    });
    return () => {
      unsub();
      sync.dispose();
      syncRef.current = null;
    };
  }, [subscribe, applyServerMessage, setConnected, engine]);

  const resyncFromLatestPlayback = useCallback(() => syncRef.current?.resync() ?? false, []);
  return { send, resyncFromLatestPlayback };
}
