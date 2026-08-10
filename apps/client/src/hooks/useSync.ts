import { useCallback, useEffect, useRef } from 'react';
import type { ClientMessage, PlaybackState, ServerMessage, Track } from '@lune/shared';
import { AudioEngine } from '../audio/AudioEngine';
import { resolveTrack } from '../lib/api';
import { calcTargetPosition, shouldCorrect } from '../lib/sync';
import { useRoomStore } from './useRoomStore';

interface UseSyncOptions {
  send: (msg: ClientMessage) => void;
  /** 订阅服务端消息(取代 lastMessage,避免 React 批处理丢消息) */
  subscribe: (fn: (msg: ServerMessage) => void) => () => void;
  getRtt: () => number;
  engine: AudioEngine;
}

const trackKey = (track: Track): string => `${track.provider || ''}:${track.id}`;

/**
 * 消费服务端消息,驱动 AudioEngine 与 roomStore。
 *
 * - playback_state(idle) → engine.stop
 * - playback_state(playing, 新 track) → resolve URL → load + 从估算进度播放
 * - playback_state(playing, 同 track 新 position) → shouldCorrect 决定微调/seek
 * - queue_updated / member_* → 直接写 store
 *
 * 无 pause 分支。每条消息经 subscribe 实时处理,不丢消息。
 */
export function useSync({ send, subscribe, getRtt, engine }: UseSyncOptions) {
  const applySnapshot = useRoomStore((s) => s.applySnapshot);
  const applyServerMessage = useRoomStore((s) => s.applyServerMessage);
  const setConnected = useRoomStore((s) => s.setConnected);

  const lastSyncedTrackId = useRef<string | null>(null);
  const lastProcessedSeq = useRef(0);
  const latestPlayback = useRef<PlaybackState | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  const handlePlayback = useCallback(
    (pb: PlaybackState) => {
      lastProcessedSeq.current = Math.max(lastProcessedSeq.current, pb.seq);

      // idle → 停止
      if (pb.status !== 'playing' || !pb.track) {
        lastSyncedTrackId.current = null;
        engine.stop();
        return;
      }

      const track = pb.track;
      const target = calcTargetPosition(pb.position, pb.serverTimestamp, getRtt());

      // 新曲目:取 URL 并播放
      const currentTrackKey = trackKey(track);
      if (lastSyncedTrackId.current !== currentTrackKey) {
        lastSyncedTrackId.current = currentTrackKey;
        void loadAndPlay(track, target);
        return;
      }

      // 同曲目位置修正
      const actual = engine.currentMs;
      const corr = shouldCorrect(actual, target);
      if (!corr) return;
      if (corr.type === 'seek') engine.seek(corr.target);
      else engine.setRate(corr.rate);
      // 微调后一段时间应恢复正常速率
      setTimeout(() => engine.setRate(1), 2000);
    },
    [engine, getRtt],
  );

  const loadAndPlay = useCallback(
    async (track: Track, offsetMs: number) => {
      const res = await resolveTrack(track.id, track.provider);
      if (!res.url) {
        // 失效:通知服务端切下一首(若本机是 owner 则有效)
        sendRef.current({ type: 'next', payload: { endedTrackId: track.id } });
        return;
      }
      // 加载期间若曲目已变,load 内部 generation 会丢弃,但这里也再校验一次
      if (!latestPlayback.current?.track || trackKey(latestPlayback.current.track) !== trackKey(track)) return;
      await engine.load(res.url, offsetMs);
    },
    [engine],
  );

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === 'joined') {
        setConnected(true);
        applyServerMessage(msg);
        applySnapshot(msg.payload.snapshot);
        latestPlayback.current = msg.payload.snapshot.playback;
        handlePlayback(msg.payload.snapshot.playback);
        return;
      }
      if (msg.type === 'playback_state') {
        applyServerMessage(msg);
        latestPlayback.current = msg.payload;
        handlePlayback(msg.payload);
        return;
      }
      applyServerMessage(msg);
    });
    return unsub;
  }, [subscribe, applyServerMessage, applySnapshot, setConnected, handlePlayback]);

  return { send };
}
