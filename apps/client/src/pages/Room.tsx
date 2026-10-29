import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAccentColor } from '../hooks/useAccentColor';
import { useRoomController } from '../features/room/useRoomController';
import DesktopRoomHeader from '../desktop/room/DesktopRoomHeader';
import DesktopRoomSidebar from '../desktop/room/DesktopRoomSidebar';
import type { DesktopRoomTab } from '../desktop/room/types';
import NowPlaying from '../components/NowPlaying';
import AlbumSilhouette from '../components/AlbumSilhouette';
import TransportBar from '../components/TransportBar';
import { useClientRuntime } from '../app/ClientRuntimeProvider';
import { useDesktopPreferences } from '../features/settings/model/desktopPreferences';
import '../desktop/room/floating-library.css';
import SettingsPanel from '../features/settings/SettingsPanel';
import { roomSettingsSectionIds } from '../features/settings/registry';
import { useSettingsController } from '../features/settings/model/useSettingsController';
import { useStageTransition } from '../desktop/room/useStageTransition';
import PlaybackNotice from '../components/PlaybackNotice';
import { useVolumeStore } from '../hooks/useVolumeStore';
import { getServerBaseUrl } from '../lib/serverConfig';

type AlbumPaletteStyle = CSSProperties & {
  '--album-accent': string;
  '--album-accent-soft': string;
  '--album-bg-accent': string;
};

export default function Room() {
  const isWindows = useClientRuntime().kind === 'windows';
  const settings = useSettingsController();
  const [sideTab, setSideTab] = useState<DesktopRoomTab>('search');
  const interfaceMode = useDesktopPreferences((state) => state.interfaceMode);
  const stagePanelOpen = useDesktopPreferences((state) => state.stagePanelOpen);
  const setStagePanelOpen = useDesktopPreferences((state) => state.setStagePanelOpen);
  const isFull = interfaceMode === 'full';
  const libraryButtonRef = useRef<HTMLButtonElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const previousMode = useRef(interfaceMode);
  const captureStage = useStageTransition(workspaceRef, !isFull && stagePanelOpen);
  const focusRequested = useRef(false);
  const settingsWereOpen = useRef(settings.open);
  const changePanel = useCallback((open: boolean) => {
    if (useDesktopPreferences.getState().interfaceMode !== 'stage') return;
    if (useDesktopPreferences.getState().stagePanelOpen === open) return;
    captureStage();
    focusRequested.current = true;
    setStagePanelOpen(open);
  }, [setStagePanelOpen, captureStage]);
  useLayoutEffect(() => {
    if (!focusRequested.current || isFull) return;
    focusRequested.current = false;
    if (stagePanelOpen) {
      workspaceRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
    } else {
      libraryButtonRef.current?.focus();
    }
  }, [stagePanelOpen, isFull]);
  useLayoutEffect(() => {
    const justClosed = settingsWereOpen.current && !settings.open;
    settingsWereOpen.current = settings.open;
    if (!justClosed || document.querySelector('dialog[open]')) return;
    if (isFull) {
      workspaceRef.current?.querySelector<HTMLButtonElement>('.workspace-nav [aria-current="page"]')?.focus();
    } else if (stagePanelOpen) {
      workspaceRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
    } else {
      libraryButtonRef.current?.focus();
    }
  }, [settings.open, isFull, stagePanelOpen]);
  useLayoutEffect(() => {
    if (previousMode.current === interfaceMode) return;
    previousMode.current = interfaceMode;
    const focusTarget = settings.open
      ? (isFull
        ? workspaceRef.current?.querySelector<HTMLButtonElement>('.workspace-settings-nav [aria-current="page"]')
        : document.querySelector<HTMLButtonElement>('dialog[open] .settings-nav [aria-current="page"]'))
      : isFull
        ? workspaceRef.current?.querySelector<HTMLButtonElement>('.workspace-nav [aria-current="page"]')
        : stagePanelOpen
          ? workspaceRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
          : libraryButtonRef.current;
    focusTarget?.focus();
  }, [interfaceMode, isFull, settings.open, stagePanelOpen]);
  useEffect(() => {
    if (isFull) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || event.key !== 'Escape' || event.ctrlKey || event.altKey || event.metaKey
        || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
      if (event.target instanceof Element && event.target.closest('.terminal-sidebar')) {
        event.preventDefault();
        changePanel(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changePanel, isFull]);
  const {
    code,
    connected,
    track,
    queue,
    members,
    ownerId,
    displayRoomCode,
    errorMessage,
    needsRejoin,
    connectionPhase,
    reconnectNow,
    recoveryState,
    retryPlayback,
    rejoinRoom,
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
    leaveToHome,
  } = useRoomController();
  const roomServerUrl = useRef(getServerBaseUrl());
  useEffect(() => {
    const onServerChanged = () => {
      if (getServerBaseUrl() !== roomServerUrl.current) leaveToHome();
    };
    window.addEventListener('lune-server-changed', onServerChanged);
    return () => window.removeEventListener('lune-server-changed', onServerChanged);
  }, [leaveToHome]);
  const { accent, accentSoft, bgAccent } = useAccentColor(track?.coverUrl, track?.id);
  const albumStyle: AlbumPaletteStyle = {
    '--album-accent': accent,
    '--album-accent-soft': accentSoft,
    '--album-bg-accent': bgAccent,
  };

  if (!code) return null;

  const selectSideTab = (tab: DesktopRoomTab) => {
    setSideTab(tab);
    changePanel(true);
  };

  return (
    <div className={`room-shell room-recovery room-floating-library${isWindows ? ' room-frameless' : ''}${isFull ? ' is-full-workspace' : ' is-stage'}`} style={albumStyle}>
      {!isFull && <AlbumSilhouette coverUrl={track?.coverUrl} />}
      {!isWindows && <DesktopRoomHeader />}

      {errorMessage && (
        <div className="room-error" role="alert">
          {errorMessage}
          {needsRejoin && <button type="button" className="room-error-rejoin" onClick={rejoinRoom}>重新加入</button>}
        </div>
      )}

      <div className="room-connection-slot">{!connected && !needsRejoin && connectionPhase !== 'closed' && <div className="connection-notice" role="status">
        <span>{recoveryState.phase === 'playing' ? '房间连接已断开，本机仍在播放' : '正在连接房间，恢复后将同步进度'}</span>
        <button type="button" onClick={reconnectNow}>立即重连</button>
      </div>}</div>

      <main className="room-workspace" ref={workspaceRef} data-interface={interfaceMode} data-stage-panel={stagePanelOpen}>
        {!isFull && <NowPlaying
          track={track}
          lines={lines}
          currentIndex={currentIndex}
          isLoadingLyrics={isLoadingLyrics}
          libraryOpen={stagePanelOpen}
        />}

        {!isFull && <button ref={libraryButtonRef} type="button"
          className={`library-float-toggle${stagePanelOpen ? ' is-hidden' : ''}`}
          tabIndex={stagePanelOpen ? -1 : 0} aria-hidden={stagePanelOpen}
          aria-label="展开音乐库" aria-expanded={stagePanelOpen} aria-controls="room-music-library"
          title="展开音乐库"
          onClick={() => changePanel(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16M7 9h4M7 13h4" /></svg>
        </button>}
        <DesktopRoomSidebar
          open={isFull || stagePanelOpen}
          mode={interfaceMode}
          activeTab={sideTab}
          queue={queue}
          members={members}
          ownerId={ownerId}
          roomCode={displayRoomCode}
          copied={copied}
          connected={connected}
          onCopyCode={copyCode}
          onLeave={leaveToHome}
          currentTrackId={track?.id}
          track={track}
          lines={lines}
          currentIndex={currentIndex}
          loadingLyrics={isLoadingLyrics}
          settings={settings}
          onSelectTab={selectSideTab}
          onClose={() => changePanel(false)}
          onOpenSettings={() => {
            settings.openSettings();
          }}
          onPickTrack={onPickTrack}
          onAddMany={onAddMany}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      </main>

      <div className="room-playback-slot"><PlaybackNotice state={recoveryState} provider={track?.provider} disabled={needsRejoin}
        onRetry={() => { void retryPlayback(); }} onResume={() => {
          const volume = useVolumeStore.getState(); if (volume.muted) volume.toggleMute();
          void retryPlayback(true);
        }} /></div>
      <TransportBar
        quiet={isFull}
        recoveryState={recoveryState}
        connected={connected}
        onSendHeart={onSendHeart}
        track={track}
        currentTime={timeline.currentTime}
        duration={timeline.duration}
        isBuffering={playerState.isBuffering}
        isOwner={true}
        onSeek={onSeek}
        onNext={onNext}
      />
      {!isFull && <SettingsPanel controller={settings} sectionIds={roomSettingsSectionIds} />}
    </div>
  );
}
