import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ClientMessage, Track } from '@lune/shared';
import { useLyric } from '../../hooks/useLyric';
import { usePlayer } from '../../hooks/usePlayer';
import { useRoomStore } from '../../hooks/useRoomStore';
import { useSync } from '../../hooks/useSync';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useHearts } from '../../hooks/useHearts';
import { getServerBaseUrl, getWebSocketUrl } from '../../lib/serverConfig';
import { clearRoomSession, readRoomSession, saveRoomSession } from '../../lib/roomSession';
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
  const serverUrl = useMemo(() => getServerBaseUrl(), []);
  const identity = useMemo(() => {
    const session = readRoomSession(serverUrl);
    if (session && session.roomCode === code && (!routeState?.memberId || routeState.memberId === session.memberId)) return session;
    if (routeState?.token && routeState.memberId) return routeState;
    return session?.roomCode === code ? session : null;
  }, [code, routeState, serverUrl]);
  const token = identity?.token ?? '';
  const memberId = identity?.memberId ?? '';
  const tokenRef = useRef(token);
  const leavingRef = useRef(false);
  const leaveTimer = useRef<number>();
  const [hasConnected, setHasConnected] = useState(false);
  const [joinFailure, setJoinFailure] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !memberId || !code) {
      navigate('/', { replace: true, state: code ? { rejoinRoomCode: code } : null });
    }
  }, [code, memberId, navigate, token]);

  const wsUrl = useMemo(() => getWebSocketUrl(), []);
  const ws = useWebSocket(wsUrl);
  const { send: transportSend } = ws;

  const setIdentity = useRoomStore((state) => state.setIdentity);
  const reset = useRoomStore((state) => state.reset);
  const connected = useRoomStore((state) => state.connected);
  const setConnected = useRoomStore((state) => state.setConnected);
  const playback = useRoomStore((state) => state.playback);
  const queue = useRoomStore((state) => state.queue);
  const queueRevision = useRoomStore((state) => state.queueRevision);
  const members = useRoomStore((state) => state.members);
  const ownerId = useRoomStore((state) => state.ownerId);
  const roomCode = useRoomStore((state) => state.roomCode);
  const lastError = useRoomStore((state) => state.lastError);
  const lastErrorCode = useRoomStore((state) => state.lastErrorCode);
  const clearError = useRoomStore((state) => state.clearError);
  const send = useCallback((message: ClientMessage) => {
    if (leavingRef.current || !transportSend(message)) {
      setActionError('尚未加入房间，请等待连接恢复后重试');
      return false;
    }
    setActionError(null);
    return true;
  }, [transportSend]);
  const onSendHeart = useHearts(send, ws.subscribe, connected);

  const { state: playerState, engine } = usePlayer();
  const { resyncFromLatestPlayback } = useSync({
    send: transportSend,
    subscribe: ws.subscribe,
    getRtt: ws.getRtt,
    engine,
  });

  useEffect(() => {
    tokenRef.current = token;
    if (code && token && memberId) saveRoomSession({ roomCode: code, token, memberId }, serverUrl);
  }, [code, memberId, serverUrl, token]);

  const finishLeave = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => ws.subscribe((message) => {
    if (message.type === 'joined' && !leavingRef.current) {
      tokenRef.current = message.payload.token || tokenRef.current;
      saveRoomSession({ roomCode: message.payload.snapshot.code, token: tokenRef.current,
        memberId: message.payload.memberId }, serverUrl);
      setHasConnected(true);
      setJoinFailure(null);
      setActionError(null);
    } else if (message.type === 'left' && leavingRef.current) {
      finishLeave();
    } else if (message.type === 'error') {
      const needsRejoin = message.payload.code
        && ['AUTH_INVALID', 'ROOM_NOT_FOUND', 'MEMBER_INVALID', 'NOT_JOINED'].includes(message.payload.code);
      if (needsRejoin || !useRoomStore.getState().connected) {
        setConnected(false);
        setJoinFailure(message.payload.message);
      }
      if (message.payload.code && ['AUTH_INVALID', 'ROOM_NOT_FOUND', 'MEMBER_INVALID'].includes(message.payload.code)) {
        clearRoomSession(serverUrl);
      }
    }
  }), [finishLeave, serverUrl, setConnected, ws.subscribe]);

  useEffect(() => {
    setConnected(false);
    if (leavingRef.current) return;
    if (ws.readyState !== WebSocket.OPEN || !code || !token || !memberId) {
      return;
    }
    setIdentity(memberId, code);
    setJoinFailure(null);
    transportSend({ type: 'join', payload: { token: tokenRef.current } });
    const timer = window.setTimeout(() => {
      if (!useRoomStore.getState().connected) setJoinFailure('加入房间超时，请重新加入');
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [code, memberId, transportSend, setConnected, setIdentity, token, ws.readyState]);

  useEffect(() => {
    return () => {
      engine.stop();
      reset();
      window.clearTimeout(leaveTimer.current);
    };
  }, [engine, reset]);

  useEffect(() => {
    if (!lastError || lastErrorCode || joinFailure) return;
    const timeout = window.setTimeout(() => clearError(), 5000);
    return () => window.clearTimeout(timeout);
  }, [clearError, joinFailure, lastError, lastErrorCode]);

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
      const sent = action === 'play'
        ? send({
          type: 'play',
          payload: { track: nextTrack, position: 0, expectedPlaybackSeq: playback.seq },
        })
        : send({ type: 'add_song', payload: { track: nextTrack } });
      if (sent) onTrackAction?.(nextTrack, action);
    },
    [onTrackAction, playback.seq, playback.status, send],
  );

  const onAddMany = useCallback(
    (tracks: Track[]) => {
      if (tracks.length === 0) return;
      if (send({ type: 'add_songs', payload: { tracks } })) onTracksAdded?.(tracks);
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
      if (!connected) {
        setActionError('尚未加入房间，请等待连接恢复后重试');
        return;
      }
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
    [connected, engine, playerState.playbackIssue, send, track],
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

  const leaveToHome = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    clearRoomSession(serverUrl);
    engine.stop();
    const sent = transportSend({ type: 'leave', payload: {} });
    setConnected(false);
    if (!sent) finishLeave();
    else leaveTimer.current = window.setTimeout(finishLeave, 1500);
  }, [engine, finishLeave, serverUrl, setConnected, transportSend]);

  const rejoinRoom = useCallback(() => {
    clearRoomSession(serverUrl);
    navigate('/', { replace: true, state: { rejoinRoomCode: code } });
  }, [code, navigate, serverUrl]);

  const protocolErrorMessage = lastErrorCode === 'ROOM_NOT_FOUND'
    ? '房间已过期或不存在，请重新加入或创建房间'
    : lastErrorCode === 'AUTH_INVALID' || lastErrorCode === 'MEMBER_INVALID'
      ? '房间身份已失效，请重新加入'
      : lastErrorCode === 'NOT_JOINED'
        ? '尚未加入房间，请重新加入'
        : lastErrorCode === 'STORAGE_UNAVAILABLE'
          ? '服务器暂时无法保存房间，请稍后重试'
          : null;

  return {
    code: code ?? '',
    connected: connected && ws.readyState === WebSocket.OPEN,
    hasConnected,
    playback,
    track,
    queue,
    members,
    ownerId,
    displayRoomCode,
    errorMessage: protocolErrorMessage || joinFailure || (lastError ? getUiErrorMessage(lastError) : actionError || copyError),
    needsRejoin: Boolean(joinFailure) || Boolean(lastErrorCode && lastErrorCode !== 'STORAGE_UNAVAILABLE'),
    rejoinRoom,
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
