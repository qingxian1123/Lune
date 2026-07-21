import { useEffect, useRef } from 'react';
import type { ClientMessage, ServerMessage, Track, PlaybackState } from '../types';
import type { UsePlayerReturn } from './usePlayer';
import { calcTargetPosition } from '../lib/sync';
import { getTrackUrl } from '../lib/netease';

interface UseSyncOptions {
  send: (msg: ClientMessage) => void;
  lastMessage: ServerMessage | null;
  getRtt: () => number;
  player: UsePlayerReturn;
}

export function useSync({ send, lastMessage, getRtt, player }: UseSyncOptions) {
  const playerRef = useRef(player);
  playerRef.current = player;
  const sendRef = useRef(send);
  sendRef.current = send;
  const getRttRef = useRef(getRtt);
  getRttRef.current = getRtt;

  const lastSyncedTrackId = useRef(0);
  const lastProcessedSeq = useRef(0);
  const loadGeneration = useRef(0);
  const currentUrlRef = useRef<string | null>(null);
  // 记录最新服务端状态，URL 异步返回时必须重新校验后再应用
  const latestPlaybackRef = useRef<PlaybackState | null>(null);

  useEffect(() => {
    if (!lastMessage || lastMessage.type !== 'playback_state') return;

    const { status, track, position, serverTimestamp, seq } = lastMessage.payload;

    if (seq <= lastProcessedSeq.current) return;
    lastProcessedSeq.current = seq;
    latestPlaybackRef.current = lastMessage.payload;

    const p = playerRef.current;

    // ---- idle：停止一切 ----
    if (status !== 'playing' || !track) {
      loadGeneration.current += 1;
      currentUrlRef.current = null;
      p.stop();
      lastSyncedTrackId.current = 0;
      return;
    }

    // ---- 新曲目：获取 URL 并交给唯一 audio 元素播放 ----
    if (lastSyncedTrackId.current !== track.id) {
      const trackId = track.id;
      lastSyncedTrackId.current = trackId;
      const requestGeneration = ++loadGeneration.current;
      p.stop();

      getTrackUrl(trackId).then((url) => {
        const latestPlayback = latestPlaybackRef.current;
        if (!url) return;
        // 如果在 URL 加载期间状态变化到其他曲目/idle，丢弃旧请求
        if (
          requestGeneration !== loadGeneration.current ||
          !latestPlayback?.track ||
          latestPlayback.track.id !== trackId ||
          latestPlayback.status !== 'playing'
        ) {
          return;
        }

        const targetPosition = calcTargetPosition(
          latestPlayback.position,
          latestPlayback.serverTimestamp,
          getRttRef.current(),
        );

        currentUrlRef.current = url;
        playerRef.current.play(url, targetPosition);
      }).catch((err) => {
        if (requestGeneration === loadGeneration.current) {
          console.error('获取播放地址失败:', err);
        }
      });
      return;
    }

    // playing：阈值校正，避免频繁 seek 造成卡顿
    const adjustedPos = calcTargetPosition(position, serverTimestamp, getRttRef.current());
    const drift = Math.abs(p.currentTime - adjustedPos);
    if (drift > 0.5) {
      p.seekTo(adjustedPos);
    }
    if (!p.isPlaying && currentUrlRef.current) {
      p.play(currentUrlRef.current, adjustedPos);
    }
  }, [lastMessage]);

  // 曲目结束 → 通知服务器切下一首
  useEffect(() => {
    playerRef.current.setOnEnd(() => {
      sendRef.current({ type: 'next' });
    });
    return () => {
      playerRef.current?.setOnEnd(null);
    };
  }, []);

  return {
    cmdPlay: (track: Track, position = 0) => {
      sendRef.current({ type: 'play', payload: { track, position } });
    },

    cmdSeek: (position: number) => {
      sendRef.current({ type: 'seek', payload: { position } });
    },

    cmdNext: () => {
      sendRef.current({ type: 'next' });
    },

    addToQueue: (track: Track) => {
      sendRef.current({ type: 'add_to_queue', payload: { track } });
    },

    removeFromQueue: (index: number) => {
      sendRef.current({ type: 'remove_from_queue', payload: { index } });
    },
  };
}
