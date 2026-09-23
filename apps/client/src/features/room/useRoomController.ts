import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Track } from '@lune/shared';
import { useLyric } from '../../hooks/useLyric';
import { usePlayer } from '../../hooks/usePlayer';
import { useRoomStore } from '../../hooks/useRoomStore';
import { useSync } from '../../hooks/useSync';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useHearts } from '../../hooks/useHearts';
import { getWebSocketUrl } from '../../lib/serverConfig';
import { getUiErrorMessage } from '../../lib/uiError';
import { createAdvancePlaybackMessage, getTrackKey } from '../../lib/playbackCommand';

interface RoomRouteState {
  token?: string;
  memberId?: string;
}

type TrackAction = 'play' | 'queue';

interface RoomControllerOptions {
  onTrackAction?: (track: Track, action: TrackAction) => void;
  onTracksAdded?: (tracks: Track[]) => void;
}

export function useRoomController(options: RoomControllerOptions = {}) {
  const { onTrackAction, onTracksAdded } = options;
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as RoomRouteState | null;
  const token = routeState?.token ?? '';
  const memberId = routeState?.memberId ?? '';
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !memberId || !code) {
      navigate('/', { replace: true });
    }
  }, [code, memberId, navigate, token]);

  const wsUrl = useMemo(() => getWebSocketUrl(), []);
  const ws = useWebSocket(wsUrl);
  const { send } = ws;
  const onSendHeart = useHearts(send, ws.subscribe, ws.readyState === WebSocket.OPEN);

  const setIdentity = useRoomStore((state) => state.setIdentity);
  const reset = useRoomStore((state) => state.reset);
  const playback = useRoomStore((state) => state.playback);
  const queue = useRoomStore((state) => state.queue);
  const queueRevision = useRoomStore((state) => state.queueRevision);
  const members = useRoomStore((state) => state.members);
  const ownerId = useRoomStore((state) => state.ownerId);
  const roomCode = useRoomStore((state) => state.roomCode);
  const lastError = useRoomStore((state) => state.lastError);
  const clearError = useRoomStore((state) => state.clearError);

  const { state: playerState, engine } = usePlayer();
  const { resyncFromLatestPlayback } = useSync({
    send,
    subscribe: ws.subscribe,
    getRtt: ws.getRtt,
    engine,
  });

  useEffect(() => {
    if (ws.readyState !== WebSocket.OPEN || !code || !token || !memberId) {
      return;
    }
    setIdentity(memberId, code);
    send({ type: 'join', payload: { token } });
  }, [code, memberId, send, setIdentity, token, ws.readyState]);

  useEffect(() => {
    return () => {
      engine.stop();
      reset();
    };
  }, [engine, reset]);

  useEffect(() => {
    if (!lastError) return;
    const timeout = window.setTimeout(() => clearError(), 5000);
    return () => window.clearTimeout(timeout);
  }, [clearError, lastError]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const track = playback.track;
  const { lines, currentIndex, isLoading: isLoadingLyrics } = useLyric(
    track?.id,
    playerState.currentTime,
    track?.provider,
  );

  const onPickTrack = useCallback(
    (nextTrack: Track) => {
      const action: TrackAction = playback.status === 'idle' ? 'play' : 'queue';
      if (action === 'play') {
        send({
          type: 'play',
          payload: { track: nextTrack, position: 0, expectedPlaybackSeq: playback.seq },
        });
      } else {
        send({ type: 'add_song', payload: { track: nextTrack } });
      }
      onTrackAction?.(nextTrack, action);
    },
    [onTrackAction, playback.seq, playback.status, send],
  );

  const onAddMany = useCallback(
    (tracks: Track[]) => {
      if (tracks.length === 0) return;
      send({ type: 'add_songs', payload: { tracks } });
      onTracksAdded?.(tracks);
    },
    [onTracksAdded, send],
  );

  const onNext = useCallback(() => {
    const message = createAdvancePlaybackMessage(playback, 'manual');
    if (message) send(message);
  }, [playback, send]);

  const onRemove = useCallback(
    (itemId: string) =>
      send({
        type: 'remove_queue_item',
        payload: { itemId, expectedQueueRevision: queueRevision },
      }),
    [queueRevision, send],
  );

  const onReorder = useCallback(
    (itemId: string, beforeItemId: string | null) =>
      send({
        type: 'reorder_queue_item',
        payload: { itemId, beforeItemId, expectedQueueRevision: queueRevision },
      }),
    [queueRevision, send],
  );

  const onSeek = useCallback(
    (position: number) => {
      if (!track || !Number.isFinite(position)) return;
      // 在点击手势中恢复本机媒体；服务端 seek 本身不会解除系统暂停或自动播放拦截。
      // 耳机断开/系统静音的显式锁定仍需通过恢复按钮解除。
      if (!engine.isOutputSuppressed && (playerState.playbackIssue || !engine.isPlaying)) {
        void engine.resume().catch((error) => {
          console.warn('跳转时恢复本机播放失败', error);
        });
      }
      send({
        type: 'seek',
        payload: {
          position,
          expectedTrackKey: getTrackKey(track),
        },
      });
    },
    [engine, playerState.playbackIssue, send, track],
  );

  const displayRoomCode = roomCode || code || '';
  const copyCode = useCallback(async () => {
    if (!displayRoomCode) return;
    setCopyError(null);
    setCopied(false);
    try {
      await navigator.clipboard.writeText(displayRoomCode);
      setCopied(true);
    } catch {
      setCopyError('复制失败，请手动复制房间邀请码');
    }
  }, [displayRoomCode]);

  const timeline = useMemo(
    () => ({
      currentTime: playback.status === 'idle' ? 0 : playerState.currentTime,
      duration: track?.duration || playerState.duration || 0,
    }),
    [playback.status, playerState.currentTime, playerState.duration, track?.duration],
  );

  const [hasConnected, setHasConnected] = useState(false);
  useEffect(() => {
    if (ws.readyState === WebSocket.OPEN) setHasConnected(true);
  }, [ws.readyState]);

  const leaveToHome = useCallback(() => navigate('/'), [navigate]);

  return {
    code: code ?? '',
    connected: ws.readyState === WebSocket.OPEN,
    hasConnected,
    playback,
    track,
    queue,
    members,
    ownerId,
    displayRoomCode,
    errorMessage: lastError ? getUiErrorMessage(lastError) : copyError,
    playerState,
    lines,
    currentIndex,
    isLoadingLyrics,
    timeline,
    copied,
    copyCode,
    onPickTrack,
    onSendHeart,
    onAddMany,
    onNext,
    onRemove,
    onReorder,
    onSeek,
    resyncFromLatestPlayback,
    leaveToHome,
  };
}
