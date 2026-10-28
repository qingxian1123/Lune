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
import { formatShortcut, matchesShortcut, useDesktopPreferences } from '../features/settings/model/desktopPreferences';
import '../desktop/room/floating-library.css';
import SettingsPanel from '../features/settings/SettingsPanel';
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
  const panelOpen = useDesktopPreferences((state) => state.libraryOpen);
  const libraryLayout = useDesktopPreferences((state) => state.libraryLayout);
  const setPanelOpen = useDesktopPreferences((state) => state.setLibraryOpen);
  const libraryShortcut = useDesktopPreferences((state) => state.bindings.toggleLibrary);
  const libraryButtonRef = useRef<HTMLButtonElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const compactPanelOpen = panelOpen && libraryLayout === 'compact';
  const captureStage = useStageTransition(workspaceRef, compactPanelOpen);
  const focusRequested = useRef(false);
  const settingsWereOpen = useRef(settings.open);
  const changePanel = useCallback((open: boolean) => {
    if (useDesktopPreferences.getState().libraryOpen === open) return;
    captureStage();
    focusRequested.current = true;
    setPanelOpen(open);
  }, [setPanelOpen, captureStage]);
  useLayoutEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    if (panelOpen) {
      workspaceRef.current?.querySelector<HTMLButtonElement>('.workspace-nav [aria-current="page"], [role="tab"][aria-selected="true"]')?.focus();
    } else {
      libraryButtonRef.current?.focus();
    }
  }, [panelOpen]);
  useLayoutEffect(() => {
    const justClosed = settingsWereOpen.current && !settings.open;
    settingsWereOpen.current = settings.open;
    if (!justClosed || document.querySelector('dialog[open]')) return;
    if (panelOpen) {
      const selector = libraryLayout === 'workspace'
        ? '.workspace-nav [aria-current="page"]'
        : '[role="tab"][aria-selected="true"]';
      workspaceRef.current?.querySelector<HTMLButtonElement>(selector)?.focus();
    } else {
      libraryButtonRef.current?.focus();
    }
  }, [settings.open, panelOpen, libraryLayout]);
  useLayoutEffect(() => {
    const stage = workspaceRef.current?.querySelector<HTMLElement>('.now-playing-stage');
    stage?.toggleAttribute('inert', panelOpen && libraryLayout === 'workspace');
    return () => { stage?.removeAttribute('inert'); };
  }, [panelOpen, libraryLayout]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
        || document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
      if (matchesShortcut(event, libraryShortcut)) {
        event.preventDefault();
        changePanel(!useDesktopPreferences.getState().libraryOpen);
      } else if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.metaKey
        && event.target instanceof Element && event.target.closest('.terminal-sidebar')) {
        event.preventDefault();
        changePanel(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changePanel, libraryShortcut]);
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
    <div className={`room-shell room-recovery room-floating-library${isWindows ? ' room-frameless' : ''}`} style={albumStyle}>
      <AlbumSilhouette coverUrl={track?.coverUrl} />
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

      <main className="room-workspace" ref={workspaceRef} data-library-open={panelOpen} data-library-layout={libraryLayout}>
        <NowPlaying
          track={track}
          lines={lines}
          currentIndex={currentIndex}
          isLoadingLyrics={isLoadingLyrics}
          libraryOpen={compactPanelOpen}
        />

        <button ref={libraryButtonRef} type="button"
          className={`library-float-toggle${panelOpen ? ' is-hidden' : ''}`}
          tabIndex={panelOpen ? -1 : 0} aria-hidden={panelOpen}
          aria-label="展开音乐库" aria-expanded={panelOpen} aria-controls="room-music-library"
          title={`展开音乐库${libraryShortcut ? ` · ${formatShortcut(libraryShortcut)}` : ''}`}
          onClick={() => changePanel(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16M7 9h4M7 13h4" /></svg>
        </button>
        <DesktopRoomSidebar
          open={panelOpen}
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
        quiet={panelOpen && libraryLayout === 'workspace'}
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
      <SettingsPanel controller={settings} sectionIds={['server', 'shortcuts', 'appearance', 'workspace']} />
    </div>
  );
}
