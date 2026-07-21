import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ClientMessage, Track } from '@lune/shared';
import { WS_URL } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useRoomStore } from '../hooks/useRoomStore';
import { useSync } from '../hooks/useSync';
import { usePlayer } from '../hooks/usePlayer';
import { useLyric } from '../hooks/useLyric';
import { useAccentColor } from '../hooks/useAccentColor';
import { getUiErrorMessage } from '../lib/uiError';
import NowPlaying from '../components/NowPlaying';
import TransportBar from '../components/TransportBar';
import Queue from '../components/Queue';
import SearchPanel from '../components/SearchPanel';
import MemberList from '../components/MemberList';

interface RoomRouteState {
  token?: string;
  memberId?: string;
}

type SideTab = 'search' | 'queue' | 'members';

type LuneThemeStyle = CSSProperties & {
  '--lune-accent': string;
  '--lune-accent-soft': string;
  '--lune-bg-accent': string;
};

export default function Room() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as RoomRouteState | null;
  const [sideTab, setSideTab] = useState<SideTab>('search');
  const [panelOpen, setPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!state?.token || !state?.memberId || !code) {
      navigate('/', { replace: true });
    }
  }, [state, code, navigate]);

  const token = state?.token ?? '';
  const memberId = state?.memberId ?? '';
  const ws = useWebSocket(WS_URL);
  const { send } = ws;

  const setIdentity = useRoomStore((roomState) => roomState.setIdentity);
  const reset = useRoomStore((roomState) => roomState.reset);
  const playback = useRoomStore((roomState) => roomState.playback);
  const queue = useRoomStore((roomState) => roomState.queue);
  const queueRevision = useRoomStore((roomState) => roomState.queueRevision);
  const members = useRoomStore((roomState) => roomState.members);
  const ownerId = useRoomStore((roomState) => roomState.ownerId);
  const roomCode = useRoomStore((roomState) => roomState.roomCode);
  const lastError = useRoomStore((roomState) => roomState.lastError);
  const isOwner = ownerId === memberId;

  const onEnd = useCallback(() => {
    const endedTrackId = playback.track?.id;
    const message: ClientMessage = { type: 'next', payload: { endedTrackId } };
    send(message);
  }, [playback.track?.id, send]);

  const { state: playerState, engine, setVolume } = usePlayer(onEnd);
  useSync({ send, subscribe: ws.subscribe, getRtt: ws.getRtt, engine });

  const joinedRef = useRef(false);
  useEffect(() => {
    if (ws.readyState !== WebSocket.OPEN || joinedRef.current) return;
    joinedRef.current = true;
    setIdentity(memberId, code ?? '');
    send({ type: 'join', payload: { token } });
  }, [ws.readyState, send, token, memberId, code, setIdentity]);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const track = playback.track;
  const { lines, currentIndex, isLoading: isLoadingLyrics } = useLyric(track?.id, playerState.currentTime);
  const { accent, accentSoft, bgAccent } = useAccentColor(track?.coverUrl, track?.id);
  const themeStyle: LuneThemeStyle = {
    '--lune-accent': accent,
    '--lune-accent-soft': accentSoft,
    '--lune-bg-accent': bgAccent,
  };

  const onPickTrack = useCallback(
    (nextTrack: Track) => {
      if (playback.status === 'idle') {
        send({ type: 'play', payload: { track: nextTrack, position: 0 } });
      } else {
        send({ type: 'add_song', payload: { track: nextTrack } });
      }
    },
    [playback.status, send],
  );

  const onAddMany = useCallback(
    (tracks: Track[]) => {
      if (tracks.length > 0) send({ type: 'add_songs', payload: { tracks } });
    },
    [send],
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

  const copyCode = useCallback(() => {
    const value = roomCode || code;
    if (!value) return;
    void navigator.clipboard?.writeText(value);
    setCopied(true);
  }, [roomCode, code]);

  const view = useMemo(
    () => ({
      currentTime: playback.status === 'idle' ? 0 : playerState.currentTime,
      duration: track?.duration || playerState.duration || 0,
    }),
    [playback.status, playerState.currentTime, playerState.duration, track?.duration],
  );

  if (!code) return null;
  const connected = ws.readyState === WebSocket.OPEN;

  const selectSideTab = (tab: SideTab) => {
    setSideTab(tab);
    setPanelOpen(true);
  };

  return (
    <div className="room-shell" style={themeStyle}>
      <header className="room-topbar">
        <div className="room-brand">
          <span className="brand-mark">LUNE</span>
          <span className="brand-divider" />
          <button type="button" className="room-code" onClick={copyCode} title="复制房间码">
            <span>房间</span>
            <strong>{roomCode || code}</strong>
            <small>{copied ? '已复制' : '复制'}</small>
          </button>
        </div>

        <div className="room-actions">
          <div className="connection-state">
            <span className={connected ? 'is-connected' : ''} />
            <div>
              <strong>{connected ? `${members.length} 人正在听` : '正在连接'}</strong>
              <small>{isOwner ? '你是房主' : '正在跟随房主'}</small>
            </div>
          </div>
          <button type="button" className="mobile-panel-toggle" onClick={() => setPanelOpen(true)}>
            音乐库
          </button>
          <button type="button" className="leave-room" onClick={() => navigate('/')}>
            <strong aria-hidden="true">×</strong>
          </button>
        </div>
      </header>

      {lastError && (
        <div className="room-error" role="alert">
          {getUiErrorMessage(lastError)}
        </div>
      )}

      <main className="room-workspace">
        <NowPlaying
          track={track}
          lines={lines}
          currentIndex={currentIndex}
          isLoadingLyrics={isLoadingLyrics}
          isBuffering={playerState.isBuffering}
          isOwner={isOwner}
          membersCount={members.length}
          onSeek={onSeek}
        />

        <aside className={`terminal-sidebar ${panelOpen ? 'is-open' : ''}`} aria-label="房间音乐库">
          <div className="sidebar-header">
            <div className="side-tabs" role="tablist" aria-label="房间工具">
              <button
                type="button"
                role="tab"
                aria-selected={sideTab === 'search'}
                className={sideTab === 'search' ? 'is-active' : ''}
                onClick={() => selectSideTab('search')}
              >
                搜索
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sideTab === 'queue'}
                className={sideTab === 'queue' ? 'is-active' : ''}
                onClick={() => selectSideTab('queue')}
              >
                队列 <small>{queue.length}</small>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sideTab === 'members'}
                className={sideTab === 'members' ? 'is-active' : ''}
                onClick={() => selectSideTab('members')}
              >
                成员 <small>{members.length}</small>
              </button>
            </div>
            <button type="button" className="close-sidebar" onClick={() => setPanelOpen(false)} aria-label="关闭终端">
              ×
            </button>
          </div>

          <div className="sidebar-content">
            {sideTab === 'search' && <SearchPanel onPick={onPickTrack} onAddMany={onAddMany} />}
            {sideTab === 'queue' && (
              <Queue
                queue={queue}
                currentTrackId={track?.id}
                isOwner={isOwner}
                onRemove={onRemove}
                onReorder={onReorder}
              />
            )}
            {sideTab === 'members' && <MemberList members={members} ownerId={ownerId} />}
          </div>

        </aside>
      </main>

      <TransportBar
        track={track}
        currentTime={view.currentTime}
        duration={view.duration}
        isBuffering={playerState.isBuffering}
        isOwner={isOwner}
        membersCount={members.length}
        onSeek={onSeek}
        onVolume={setVolume}
        onNext={onNext}
      />
    </div>
  );
}
