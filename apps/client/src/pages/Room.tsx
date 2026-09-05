import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAccentColor } from '../hooks/useAccentColor';
import { useRoomController } from '../features/room/useRoomController';
import DesktopRoomHeader from '../desktop/room/DesktopRoomHeader';
import DesktopRoomSidebar from '../desktop/room/DesktopRoomSidebar';
import type { DesktopRoomTab } from '../desktop/room/types';
import NowPlaying from '../components/NowPlaying';
import TransportBar from '../components/TransportBar';
import { useClientRuntime } from '../app/ClientRuntimeProvider';

type LuneThemeStyle = CSSProperties & {
  '--lune-accent': string;
  '--lune-accent-soft': string;
  '--lune-bg-accent': string;
};

export default function Room() {
  const isWindows = useClientRuntime().kind === 'windows';
  const [sideTab, setSideTab] = useState<DesktopRoomTab>('search');
  const [panelOpen, setPanelOpen] = useState(false);
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
    <div className={`room-shell${isWindows ? ' room-frameless' : ''}`} style={themeStyle}>
      {!isWindows && <DesktopRoomHeader
        roomCode={displayRoomCode}
        copied={copied}
        connected={connected}
        membersCount={members.length}
        onCopyCode={copyCode}
        onOpenLibrary={() => setPanelOpen(true)}
        onLeave={leaveToHome}
      />}
      {isWindows && <button type="button" className="desktop-library-toggle" onClick={() => setPanelOpen(true)}>音乐库</button>}

      {errorMessage && (
        <div className="room-error" role="alert">
          {errorMessage}
        </div>
      )}

      <main className="room-workspace">
        <NowPlaying
          track={track}
          lines={lines}
          currentIndex={currentIndex}
          isLoadingLyrics={isLoadingLyrics}
        />

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
          onClose={() => setPanelOpen(false)}
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
    </div>
  );
}
