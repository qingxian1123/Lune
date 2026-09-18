import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAccentColor } from '../hooks/useAccentColor';
import { useRoomController } from '../features/room/useRoomController';
import DesktopRoomHeader from '../desktop/room/DesktopRoomHeader';
import DesktopRoomSidebar from '../desktop/room/DesktopRoomSidebar';
import type { DesktopRoomTab } from '../desktop/room/types';
import NowPlaying from '../components/NowPlaying';
import TransportBar from '../components/TransportBar';
import { useClientRuntime } from '../app/ClientRuntimeProvider';
import { formatShortcut, matchesShortcut, useDesktopPreferences } from '../features/settings/model/desktopPreferences';
import '../desktop/room/floating-library.css';
import SettingsPanel from '../features/settings/SettingsPanel';
import { useSettingsController } from '../features/settings/model/useSettingsController';

type LuneThemeStyle = CSSProperties & {
  '--lune-accent': string;
  '--lune-accent-soft': string;
  '--lune-bg-accent': string;
};

export default function Room() {
  const isWindows = useClientRuntime().kind === 'windows';
  const settings = useSettingsController();
  const [sideTab, setSideTab] = useState<DesktopRoomTab>('search');
  const panelOpen = useDesktopPreferences((state) => state.libraryOpen);
  const setPanelOpen = useDesktopPreferences((state) => state.setLibraryOpen);
  const libraryShortcut = useDesktopPreferences((state) => state.bindings.toggleLibrary);
  const libraryButtonRef = useRef<HTMLButtonElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const focusRequested = useRef(false);
  const changePanel = useCallback((open: boolean) => {
    if (useDesktopPreferences.getState().libraryOpen === open) return;
    focusRequested.current = true;
    setPanelOpen(open);
  }, [setPanelOpen]);
  useLayoutEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    if (panelOpen) {
      workspaceRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
    } else {
      libraryButtonRef.current?.focus();
    }
  }, [panelOpen]);
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
  const { accent, accentSoft, bgAccent } = useAccentColor(track?.coverUrl, track?.id);
  const themeStyle: LuneThemeStyle = {
    '--lune-accent': accent,
    '--lune-accent-soft': accentSoft,
    '--lune-bg-accent': bgAccent,
  };

  if (!code) return null;

  const selectSideTab = (tab: DesktopRoomTab) => {
    setSideTab(tab);
    setPanelOpen(true);
  };

  return (
    <div className={`room-shell room-floating-library${isWindows ? ' room-frameless' : ''}`} style={themeStyle}>
      {!isWindows && <DesktopRoomHeader
        roomCode={displayRoomCode}
        copied={copied}
        connected={connected}
        membersCount={members.length}
        onCopyCode={copyCode}
        onOpenLibrary={() => changePanel(true)}
        onLeave={leaveToHome}
      />}

      {errorMessage && (
        <div className="room-error" role="alert">
          {errorMessage}
        </div>
      )}

      <main className="room-workspace" ref={workspaceRef}>
        <NowPlaying
          track={track}
          lines={lines}
          currentIndex={currentIndex}
          isLoadingLyrics={isLoadingLyrics}
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
            settings.selectSection('shortcuts');
          }}
          onPickTrack={onPickTrack}
          onAddMany={onAddMany}
          onRemove={onRemove}
          onReorder={onReorder}
        />
      </main>

      <TransportBar
        onSendHeart={onSendHeart}
        track={track}
        currentTime={timeline.currentTime}
        duration={timeline.duration}
        isBuffering={playerState.isBuffering}
        isOwner={true}
        membersCount={members.length}
        onSeek={onSeek}
        onNext={onNext}
      />
      <SettingsPanel controller={settings} sectionIds={['shortcuts']} />
    </div>
  );
}
