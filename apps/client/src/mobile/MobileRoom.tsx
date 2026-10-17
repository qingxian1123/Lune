import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '@lune/shared';
import PlaybackNotice from '../components/PlaybackNotice';
import AlbumSilhouette from '../components/AlbumSilhouette';
import { useRoomController } from '../features/room/useRoomController';
import { useVolumeStore } from '../hooks/useVolumeStore';
import { onAudioInterrupt } from '../lib/mediaSession';
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
    connectionPhase,
    reconnectNow,
    recoveryState,
    retryPlayback,
    holdPlayback,
    track,
    queue,
    members,
    ownerId,
    displayRoomCode,
    errorMessage,
    needsRejoin,
    rejoinRoom,
    leaveToHome,
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
    onSendHeart,
    onRemove,
    onReorder,
    onSeek,
  } = useRoomController({ onTrackAction, onTracksAdded });

  const volume = useVolumeStore((state) => state.volume);
  const muted = useVolumeStore((state) => state.muted);
  const setVolume = useVolumeStore((state) => state.setVolume);
  const toggleMute = useVolumeStore((state) => state.toggleMute);

  const resumeLocalAudio = useCallback(() => {
    const volumeState = useVolumeStore.getState();
    if (volumeState.muted) volumeState.toggleMute();
    void retryPlayback(true);
  }, [retryPlayback]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let active = true;
    void onAudioInterrupt((event) => {
      if (event === 'becoming_noisy') holdPlayback('noisy');
    }).then((unsubscribe) => {
      if (active) dispose = unsubscribe; else unsubscribe();
    });
    return () => { active = false; dispose?.(); };
  }, [holdPlayback]);

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
    onLeave: leaveToHome,
  });

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareCode = useCallback(() => {
    if (!displayRoomCode) return;
    void navigator
      .share({ title: 'Lune · 一起听', text: `来 Lune 一起听歌，房间码 ${displayRoomCode}` })
      .catch(() => {});
  }, [displayRoomCode]);

  const muteFromSystemSurface = useCallback(() => holdPlayback('manual'), [holdPlayback]);
  const locallyMuted = muted || recoveryState.hold !== 'none';

  useRoomMediaSession({
    track,
    currentTime: playerState.currentTime,
    playing: recoveryState.phase === 'playing' && recoveryState.hold === 'none',
    muted: locallyMuted,
    onNext,
    onSendHeart: () => { if (track) void onSendHeart(track).then(() => showToast('爱心已送出')).catch(() => showToast('爱心没有送出，请重试')); },
    onMute: muteFromSystemSurface,
    onResume: resumeLocalAudio,
    onLeave: leaveRoom,
  });

  if (!code) return null;
  const lyricPreview = (() => {
    if (lines.length === 0) return null;
    const index = currentIndex < 0 ? 0 : Math.min(currentIndex, lines.length - 1);
    return lines[index].text;
  })();

  return (
    <div className="m-room-shell">
      <div className="m-room-glow" aria-hidden="true" />
      <AlbumSilhouette coverUrl={track?.coverUrl} />

      {!connected && !needsRejoin && connectionPhase !== 'closed' && (
        <div className="connection-notice" role="status">
          <span>{recoveryState.phase === 'playing' ? '房间连接已断开，本机仍在播放' : '正在连接房间，恢复后将同步进度'}</span>
          <button type="button" onClick={reconnectNow}>立即重连</button>
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

      <PlaybackNotice state={recoveryState} provider={track?.provider} disabled={needsRejoin}
        onRetry={() => { void retryPlayback(); }} onResume={resumeLocalAudio} />

      {errorMessage && (
        <div className="m-room-error" role="alert">
          {errorMessage}
          {needsRejoin && <button type="button" className="room-error-rejoin" onClick={rejoinRoom}>重新加入</button>}
        </div>
      )}

      {view === 'player' ? (
        <MobilePlayerView
          track={track}
          lyricPreview={lyricPreview}
          isLoadingLyrics={isLoadingLyrics}
          isBuffering={playerState.isBuffering}
          volume={volume}
          muted={locallyMuted}
          currentTime={timeline.currentTime}
          duration={timeline.duration}
          activeSheet={sheet}
          queueCount={queue.length}
          membersCount={members.length}
          onShowLyrics={showLyrics}
          onSearch={() => openSheet('search')}
          onSendHeart={onSendHeart}
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
        muted={muted}
        onClose={closeSheet}
        onPickTrack={onPickTrack}
        onAddMany={onAddMany}
        onRemove={onRemove}
        onReorder={onReorder}
        onCopyCode={copyCode}
        onShareCode={shareCode}
        onVolumeChange={setVolume}
        onToggleMute={toggleMute}
      />
    </div>
  );
}
