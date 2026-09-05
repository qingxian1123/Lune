import { useCallback, useEffect, useRef, useState } from 'react';
import type { Track } from '@lune/shared';
import { AudioEngine } from '../audio/AudioEngine';
import { useRoomController } from '../features/room/useRoomController';
import { useVolumeStore } from '../hooks/useVolumeStore';
import {
  onAudioInterrupt,
  requestMediaAudioFocus,
} from '../lib/mediaSession';
import { useRoomBackNavigation } from '../platform/android/useRoomBackNavigation';
import { useRoomMediaSession } from '../platform/android/useRoomMediaSession';
import MobileLeaveConfirm from './room/MobileLeaveConfirm';
import MobileLyricsView from './room/MobileLyricsView';
import MobilePlayerView from './room/MobilePlayerView';
import MobileRoomHeader from './room/MobileRoomHeader';
import MobileRoomSheet from './room/MobileRoomSheet';
import type { MobileRoomSheet as RoomSheet, MobileRoomSheetState, MobileRoomView } from './room/types';

type LocalAudioInterruption = 'focus' | 'noisy' | 'manual';

export default function MobileRoom() {
  const [view, setView] = useState<MobileRoomView>('player');
  const [sheet, setSheet] = useState<MobileRoomSheetState>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [audioInterruption, setAudioInterruption] = useState<LocalAudioInterruption | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastId = useRef(0);
  const audioInterruptionRef = useRef<LocalAudioInterruption | null>(null);

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
    onSendHeart,
    onRemove,
    onReorder,
    onSeek,
    resyncFromLatestPlayback,
  } = useRoomController({ onTrackAction, onTracksAdded });

  const volume = useVolumeStore((state) => state.volume);
  const muted = useVolumeStore((state) => state.muted);
  const setVolume = useVolumeStore((state) => state.setVolume);
  const toggleMute = useVolumeStore((state) => state.toggleMute);

  const suppressLocalAudio = useCallback((reason: LocalAudioInterruption) => {
    const current = audioInterruptionRef.current;
    if (reason === 'focus' && (current === 'manual' || current === 'noisy')) return;
    audioInterruptionRef.current = reason;
    setAudioInterruption(reason);
    AudioEngine.instance().setOutputSuppressed(true);
  }, []);

  const resumeLocalAudio = useCallback(
    (options: { requestFocus: boolean } = { requestFocus: true }) => {
      if (options.requestFocus) void requestMediaAudioFocus();
      audioInterruptionRef.current = null;
      setAudioInterruption(null);
      AudioEngine.instance().setOutputSuppressed(false);
      if (resyncFromLatestPlayback()) showToast('已追上房间进度');
    },
    [resyncFromLatestPlayback, showToast],
  );

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let active = true;
    void onAudioInterrupt((event) => {
      if (event === 'focus_loss') {
        suppressLocalAudio('focus');
        return;
      }
      if (event === 'becoming_noisy') {
        suppressLocalAudio('noisy');
        return;
      }
      if (event === 'focus_gain' && audioInterruptionRef.current === 'focus') {
        resumeLocalAudio({ requestFocus: false });
      }
    }).then((unsubscribe) => {
      if (active) dispose = unsubscribe;
      else unsubscribe();
    });
    return () => {
      active = false;
      dispose?.();
      audioInterruptionRef.current = null;
      AudioEngine.instance().setOutputSuppressed(false, { immediate: true });
    };
  }, [resumeLocalAudio, suppressLocalAudio]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (resyncFromLatestPlayback()) showToast('已追上房间进度');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [resyncFromLatestPlayback, showToast]);

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

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareCode = useCallback(() => {
    if (!displayRoomCode) return;
    void navigator
      .share({ title: 'Lune · 一起听', text: `来 Lune 一起听歌，房间码 ${displayRoomCode}` })
      .catch(() => {});
  }, [displayRoomCode]);

  const muteFromSystemSurface = useCallback(() => {
    suppressLocalAudio('manual');
  }, [suppressLocalAudio]);

  const resumeFromSystemSurface = useCallback(() => {
    if (muted) toggleMute();
    resumeLocalAudio({ requestFocus: false });
  }, [muted, resumeLocalAudio, toggleMute]);

  const locallyMuted = muted || audioInterruption !== null;

  useRoomMediaSession({
    track,
    currentTime: playerState.currentTime,
    playing: playback.status === 'playing',
    muted: locallyMuted,
    onNext,
    onSendHeart: () => { if (track) void onSendHeart(track).then(() => showToast('爱心已送出')).catch(() => showToast('爱心没有送出，请重试')); },
    onMute: muteFromSystemSurface,
    onResume: resumeFromSystemSurface,
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

      {audioInterruption && (
        <section className="m-audio-interruption" role="status" aria-live="polite">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 9v6h4l5 4V5L9 9H5Z" />
            <path d="m18 9 4 4m0-4-4 4" />
          </svg>
          <span>
            {audioInterruption === 'noisy'
              ? '耳机已断开，为你保持静音'
              : audioInterruption === 'focus'
                ? '其他声音正在播放，已为你静音'
                : '已在本机静音，房间仍在播放'}
          </span>
          <button type="button" onClick={() => resumeLocalAudio()}>
            恢复声音
          </button>
        </section>
      )}

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
