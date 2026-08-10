import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '@lune/shared';
import { useRoomController } from '../features/room/useRoomController';
import { useFavoriteStore } from '../hooks/useFavoriteStore';
import { useRoomBackNavigation } from '../platform/android/useRoomBackNavigation';
import { useRoomMediaSession } from '../platform/android/useRoomMediaSession';
import MobileLeaveConfirm from './room/MobileLeaveConfirm';
import MobileLyricsView from './room/MobileLyricsView';
import MobilePlayerView from './room/MobilePlayerView';
import MobileRoomHeader from './room/MobileRoomHeader';
import MobileRoomSheet from './room/MobileRoomSheet';
import type { MobileRoomSheet as RoomSheet, MobileRoomSheetState, MobileRoomView } from './room/types';

export default function MobileRoom() {
  const [view, setView] = useState<MobileRoomView>('player');
  const [sheet, setSheet] = useState<MobileRoomSheetState>(null);
  const [volume, setVolumeState] = useState(0.8);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastId = useRef(0);

  const showToast = useCallback((text: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const onTrackAction = useCallback(
    (track: Track, action: 'play' | 'queue') => {
      showToast(action === 'play' ? `即将播放《${track.name}》` : `已加入队列《${track.name}》`);
    },
    [showToast],
  );
  const onTracksAdded = useCallback(
    (tracks: Track[]) => showToast(`已加入 ${tracks.length} 首歌曲`),
    [showToast],
  );
  const {
    code,
    connected,
    hasConnected,
    playback,
    track,
    queue,
    members,
    ownerId,
    displayRoomCode,
    errorMessage,
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
  } = useRoomController({ onTrackAction, onTracksAdded });

  const isFavorite = useFavoriteStore((state) => state.isFavorite);
  const toggleFavorite = useFavoriteStore((state) => state.toggle);

  const closeConfirm = useCallback(() => setConfirmLeave(false), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const showPlayer = useCallback(() => setView('player'), []);
  const showLyrics = useCallback(() => setView('lyrics'), []);
  const requestLeave = useCallback(() => setConfirmLeave(true), []);
  const openSheet = useCallback((nextSheet: RoomSheet) => setSheet(nextSheet), []);
  const leaveRoom = useRoomBackNavigation({
    confirmOpen: confirmLeave,
    sheetOpen: sheet !== null,
    lyricsOpen: view === 'lyrics',
    closeConfirm,
    closeSheet,
    showPlayer,
    requestLeave,
  });

  useEffect(() => {
    setVolume(volume);
  }, [setVolume, volume]);

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareCode = useCallback(() => {
    if (!displayRoomCode) return;
    void navigator
      .share({ title: 'Lune · 一起听', text: `来 Lune 一起听歌，房间码 ${displayRoomCode}` })
      .catch(() => {});
  }, [displayRoomCode]);

  const toggleCurrentFavorite = useCallback(() => {
    if (track) toggleFavorite(track.id);
  }, [toggleFavorite, track]);

  useRoomMediaSession({
    track,
    currentTime: playerState.currentTime,
    playing: playback.status === 'playing',
    onNext,
    onToggleFavorite: toggleFavorite,
    onLeave: leaveRoom,
  });

  if (!code) return null;
  const favorite = track ? isFavorite(track.id) : false;
  const lyricPreview = (() => {
    if (lines.length === 0) return null;
    const index = currentIndex < 0 ? 0 : Math.min(currentIndex, lines.length - 1);
    return lines[index].text;
  })();

  return (
    <div className="m-room-shell">
      <div className="m-room-glow" aria-hidden="true" />

      {hasConnected && !connected && (
        <div className="m-reconnect" role="status">
          <i aria-hidden="true" />
          连接已中断，正在重新连接
        </div>
      )}

      <MobileRoomHeader
        view={view}
        track={track}
        connected={connected}
        membersCount={members.length}
        onOpenMembers={() => openSheet('members')}
        onRequestLeave={requestLeave}
      />

      {errorMessage && (
        <div className="m-room-error" role="alert">
          {errorMessage}
        </div>
      )}

      {view === 'player' ? (
        <MobilePlayerView
          track={track}
          lyricPreview={lyricPreview}
          isLoadingLyrics={isLoadingLyrics}
          isBuffering={playerState.isBuffering}
          favorite={favorite}
          currentTime={timeline.currentTime}
          duration={timeline.duration}
          activeSheet={sheet}
          queueCount={queue.length}
          membersCount={members.length}
          onShowLyrics={showLyrics}
          onSearch={() => openSheet('search')}
          onToggleFavorite={toggleCurrentFavorite}
          onNext={onNext}
          onSeek={onSeek}
          onOpenSheet={openSheet}
        />
      ) : (
        <MobileLyricsView
          track={track}
          lines={lines}
          currentIndex={currentIndex}
          isLoadingLyrics={isLoadingLyrics}
          currentTime={timeline.currentTime}
          duration={timeline.duration}
          membersCount={members.length}
          onShowPlayer={showPlayer}
          onSeek={onSeek}
        />
      )}

      {toast && (
        <div key={toast.id} className="m-toast" role="status">
          {toast.text}
        </div>
      )}

      <MobileLeaveConfirm open={confirmLeave} onCancel={closeConfirm} onLeave={leaveRoom} />

      <MobileRoomSheet
        sheet={sheet}
        queue={queue}
        currentTrackId={track?.id}
        members={members}
        ownerId={ownerId}
        roomCode={displayRoomCode}
        copied={copied}
        canShare={canShare}
        volume={volume}
        onClose={closeSheet}
        onPickTrack={onPickTrack}
        onAddMany={onAddMany}
        onRemove={onRemove}
        onReorder={onReorder}
        onCopyCode={copyCode}
        onShareCode={shareCode}
        onVolumeChange={setVolumeState}
      />
    </div>
  );
}
