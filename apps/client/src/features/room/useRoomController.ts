import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ClientMessage, Track } from '@lune/shared';
import { useLyric } from '../../hooks/useLyric';
import { usePlayer } from '../../hooks/usePlayer';
import { useRoomStore } from '../../hooks/useRoomStore';
import { useSync } from '../../hooks/useSync';
import { useWebSocket } from '../../hooks/useWebSocket';
import { getWebSocketUrl } from '../../lib/serverConfig';
import { getUiErrorMessage } from '../../lib/uiError';

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

  useEffect(() => {
    if (!token || !memberId || !code) {
      navigate('/', { replace: true });
    }
  }, [code, memberId, navigate, token]);

  const wsUrl = useMemo(() => getWebSocketUrl(), []);
  const ws = useWebSocket(wsUrl);
  const { send } = ws;

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

  const onEnd = useCallback(() => {
    const endedTrackId = playback.track?.id;
    const message: ClientMessage = { type: 'next', payload: { endedTrackId } };
    send(message);
  }, [playback.track?.id, send]);

  const { state: playerState, engine, setVolume } = usePlayer(onEnd);
  useSync({ send, subscribe: ws.subscribe, getRtt: ws.getRtt, engine });

  const joinedRef = useRef(false);
  useEffect(() => {
    if (
      ws.readyState !== WebSocket.OPEN ||
      joinedRef.current ||
      !code ||
      !token ||
      !memberId
    ) {
      return;
    }
    joinedRef.current = true;
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
        send({ type: 'play', payload: { track: nextTrack, position: 0 } });
      } else {
        send({ type: 'add_song', payload: { track: nextTrack } });
      }
      onTrackAction?.(nextTrack, action);
    },
    [onTrackAction, playback.status, send],
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
    send({ type: 'next', payload: { endedTrackId: track?.id } });
  }, [send, track?.id]);

  const onRemove = useCallback(
    (index: number) => send({ type: 'remove_song', payload: { index } }),
    [send],
  );

  const onReorder = useCallback(
    (fromIndex: number, toIndex: number) =>
      send({ type: 'reorder_song', payload: { fromIndex, toIndex, expectedRevision: queueRevision } }),
    [queueRevision, send],
  );

  const onSeek = useCallback(
    (position: number) => send({ type: 'seek', payload: { position } }),
    [send],
  );

  const displayRoomCode = roomCode || code || '';
  const copyCode = useCallback(() => {
    if (!displayRoomCode) return;
    void navigator.clipboard?.writeText(displayRoomCode);
    setCopied(true);
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
    errorMessage: lastError ? getUiErrorMessage(lastError) : null,
    playerState,
    lines,
    currentIndex,
    isLoadingLyrics,
    timeline,
    copied,
    copyCode,
    onPickTrack,
    onAddMany,
    onNext,
    onRemove,
    onReorder,
    onSeek,
    setVolume,
    leaveToHome,
  };
}
