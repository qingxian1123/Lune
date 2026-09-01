import { useCallback, useEffect, useRef } from 'react';
import type { ClientMessage, PlaybackState, ServerMessage } from '@lune/shared';
import { AudioEngine } from '../audio/AudioEngine';
import { resolveTrack } from '../lib/api';
import { createAdvancePlaybackMessage, getTrackKey } from '../lib/playbackCommand';
import { calcTargetPosition, shouldCorrect } from '../lib/sync';
import { useRoomStore } from './useRoomStore';

interface UseSyncOptions {
  send: (msg: ClientMessage) => void;
  /** 订阅服务端消息(取代 lastMessage,避免 React 批处理丢消息) */
  subscribe: (fn: (msg: ServerMessage) => void) => () => void;
  getRtt: () => number;
  engine: AudioEngine;
}

/**
 * 消费服务端消息,驱动 AudioEngine 与 roomStore。
 *
 * - playback idle → engine.stop
 * - playback playing, 新 track → resolve URL → load + 从估算进度播放
 * - playback playing, 同 track 新 position → shouldCorrect 决定微调/seek
 * - room_state_changed → 原子写入 playback + queue，再按 playback seq 驱动音频
 *
 * 无 pause 分支。每条消息经 subscribe 实时处理,不丢消息。
 */
export function useSync({ send, subscribe, getRtt, engine }: UseSyncOptions) {
  const applyServerMessage = useRoomStore((s) => s.applyServerMessage);
  const setConnected = useRoomStore((s) => s.setConnected);

  const lastSyncedTrackId = useRef<string | null>(null);
  const lastProcessedSeq = useRef(-1);
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
      const currentTrackKey = getTrackKey(track);
      if (lastSyncedTrackId.current !== currentTrackKey) {
        lastSyncedTrackId.current = currentTrackKey;
        void loadAndPlay(pb, target);
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
    async (playback: PlaybackState, offsetMs: number) => {
      const track = playback.track;
      if (!track) return;
      const res = await resolveTrack(track.id, track.provider);
      if (!res.url) {
        const message = createAdvancePlaybackMessage(playback, 'unplayable');
        if (message) sendRef.current(message);
        return;
      }
      // 加载期间若曲目已变,load 内部 generation 会丢弃,但这里也再校验一次
      if (
        !latestPlayback.current?.track ||
        latestPlayback.current.seq !== playback.seq ||
        getTrackKey(latestPlayback.current.track) !== getTrackKey(track)
      ) return;
      await engine.load(res.url, offsetMs);
    },
    [engine],
  );

  const resyncFromLatestPlayback = useCallback((): boolean => {
    const pb = latestPlayback.current;
    if (!pb) return false;
    if (pb.status !== 'playing' || !pb.track) {
      handlePlayback(pb);
      return false;
    }

    const currentTrackKey = getTrackKey(pb.track);
    if (lastSyncedTrackId.current !== currentTrackKey) {
      handlePlayback(pb);
      return true;
    }

    const target = calcTargetPosition(pb.position, pb.serverTimestamp, getRtt());
    if (Math.abs(engine.currentMs - target) < 200) return false;
    engine.setRate(1);
    engine.seek(target);
    return true;
  }, [engine, getRtt, handlePlayback]);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === 'joined') {
        setConnected(true);
        applyServerMessage(msg);
        lastProcessedSeq.current = -1;
        latestPlayback.current = msg.payload.snapshot.playback;
        handlePlayback(msg.payload.snapshot.playback);
        return;
      }
      if (msg.type === 'room_state_changed') {
        applyServerMessage(msg);
        const nextPlayback = msg.payload.playback;
        if (nextPlayback.seq > lastProcessedSeq.current) {
          latestPlayback.current = nextPlayback;
          handlePlayback(nextPlayback);
        }
        return;
      }
      applyServerMessage(msg);
    });
    return unsub;
  }, [subscribe, applyServerMessage, setConnected, handlePlayback]);

  return { send, resyncFromLatestPlayback };
}
