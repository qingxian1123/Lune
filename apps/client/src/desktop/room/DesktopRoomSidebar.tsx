import type { Member, QueueItem, Track } from '@lune/shared';
import { useLayoutEffect, useRef, useState } from 'react';
import { formatShortcut, useDesktopPreferences } from '../../features/settings/model/desktopPreferences';
import MemberList from '../../components/MemberList';
import Queue from '../../components/Queue';
import SearchPanel from '../../components/SearchPanel';
import type { SearchPanelTab } from '../../components/SearchPanel';
import type { DesktopRoomTab } from './types';
import DesktopRoomMembers from './DesktopRoomMembers';
import WorkspaceNavigation, { workspaceDestinations } from './WorkspaceNavigation';
import './full-workspace.css';

interface DesktopRoomSidebarProps {
  open: boolean;
  activeTab: DesktopRoomTab;
  queue: QueueItem[];
  members: Member[];
  ownerId: string;
  roomCode: string;
  copied: boolean;
  connected: boolean;
  onCopyCode: () => void;
  onLeave: () => void;
  currentTrackId?: string;
  onSelectTab: (tab: DesktopRoomTab) => void;
  onClose: () => void;
  onOpenSettings: () => void;
  onPickTrack: (track: Track) => void;
  onAddMany: (tracks: Track[]) => void;
  onRemove: (itemId: string) => void;
  onReorder: (itemId: string, beforeItemId: string | null) => void;
}

export default function DesktopRoomSidebar({
  open,
  activeTab,
  queue,
  members,
  ownerId,
  roomCode,
  copied,
  connected,
  onCopyCode,
  onLeave,
  currentTrackId,
  onSelectTab,
  onClose,
  onOpenSettings,
  onPickTrack,
  onAddMany,
  onRemove,
  onReorder,
}: DesktopRoomSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const shortcut = useDesktopPreferences((state) => state.bindings.toggleLibrary);
  const layout = useDesktopPreferences((state) => state.libraryLayout);
  const [searchTab, setSearchTab] = useState<SearchPanelTab>('songs');
  const expanded = layout === 'workspace';
  const destination = activeTab === 'search' ? searchTab : activeTab;
  const page = workspaceDestinations.find((item) => item.id === destination)!;
  useLayoutEffect(() => {
    sidebarRef.current?.toggleAttribute('inert', !open);
  }, [open]);
  return (
    <aside ref={sidebarRef} id="room-music-library" className={`terminal-sidebar ${open ? 'is-open' : ''}${expanded ? ' library-workspace' : ''}`} aria-label={expanded ? '完整工作区' : '房间音乐库'} aria-hidden={!open}>
      {expanded && <WorkspaceNavigation active={destination} onShowPlayer={onClose} onOpenSettings={onOpenSettings}
        onSelect={(tab, nextSearchTab) => { if (nextSearchTab) setSearchTab(nextSearchTab); onSelectTab(tab); }} />}
      <div className="sidebar-header">
        <div className="side-tabs" role="tablist" aria-label="房间工具" onKeyDown={(event) => {
          const tabs: DesktopRoomTab[] = ['search', 'queue', 'members'];
          const index = tabs.indexOf(activeTab);
          const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault();
          onSelectTab(tabs[next]);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}>
          <button
            type="button"
            role="tab"
            id="library-tab-search"
            aria-controls="library-panel-search"
            tabIndex={activeTab === 'search' ? 0 : -1}
            aria-selected={activeTab === 'search'}
            className={activeTab === 'search' ? 'is-active' : ''}
            onClick={() => onSelectTab('search')}
          >
            选歌
          </button>
          <button
            type="button"
            role="tab"
            id="library-tab-queue"
            aria-controls="library-panel-queue"
            tabIndex={activeTab === 'queue' ? 0 : -1}
            aria-selected={activeTab === 'queue'}
            className={activeTab === 'queue' ? 'is-active' : ''}
            onClick={() => onSelectTab('queue')}
          >
            队列 <small>{queue.length}</small>
          </button>
          <button
            type="button"
            role="tab"
            id="library-tab-members"
            aria-controls="library-panel-members"
            tabIndex={activeTab === 'members' ? 0 : -1}
            aria-selected={activeTab === 'members'}
            className={activeTab === 'members' ? 'is-active' : ''}
            onClick={() => onSelectTab('members')}
          >
            成员 <small>{members.length}</small>
          </button>
        </div>
        <button type="button" className="close-sidebar" onClick={onOpenSettings}
          aria-label="打开设置" title="设置">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" />
          </svg>
        </button>
        <button type="button" className="close-sidebar" onClick={onClose} aria-label="收起音乐库"
          title={`收起音乐库${shortcut ? ` · ${formatShortcut(shortcut)}` : ''}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6M20 5v14" /></svg>
        </button>
      </div>

      <div className="sidebar-content">
        <div id="library-panel-search" role={expanded ? 'region' : 'tabpanel'} aria-label={expanded ? page.label : undefined} aria-labelledby={expanded ? undefined : 'library-tab-search'} hidden={activeTab !== 'search'}>
          <SearchPanel active={open && activeTab === 'search'} onPick={onPickTrack} onAddMany={onAddMany}
            tab={searchTab} onTabChange={setSearchTab} presentation={expanded ? 'workspace' : 'compact'} />
        </div>
        <div id="library-panel-queue" role={expanded ? 'region' : 'tabpanel'} aria-label={expanded ? '播放队列' : undefined} aria-labelledby={expanded ? undefined : 'library-tab-queue'} hidden={activeTab !== 'queue'}>
          {expanded && <header className="workspace-section-heading"><h2>播放队列</h2></header>}
          <Queue
            queue={queue}
            currentTrackId={currentTrackId}
            isOwner={true}
            onRemove={onRemove}
            onReorder={onReorder}
          />
        </div>
        <div id="library-panel-members" role={expanded ? 'region' : 'tabpanel'} aria-label={expanded ? '房间成员' : undefined} aria-labelledby={expanded ? undefined : 'library-tab-members'} hidden={activeTab !== 'members'}>
          {expanded && <header className="workspace-section-heading"><h2>房间成员</h2></header>}
          <DesktopRoomMembers roomCode={roomCode} copied={copied} connected={connected} onCopyCode={onCopyCode} onLeave={onLeave}>
            <MemberList members={members} ownerId={ownerId} />
          </DesktopRoomMembers>
        </div>
      </div>
    </aside>
  );
}
