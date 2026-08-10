import type { Member, Track } from '@lune/shared';
import MemberList from '../../components/MemberList';
import Queue from '../../components/Queue';
import SearchPanel from '../../components/SearchPanel';
import type { DesktopRoomTab } from './types';

interface DesktopRoomSidebarProps {
  open: boolean;
  activeTab: DesktopRoomTab;
  queue: Track[];
  members: Member[];
  ownerId: string;
  currentTrackId?: string;
  onSelectTab: (tab: DesktopRoomTab) => void;
  onClose: () => void;
  onPickTrack: (track: Track) => void;
  onAddMany: (tracks: Track[]) => void;
  onRemove: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export default function DesktopRoomSidebar({
  open,
  activeTab,
  queue,
  members,
  ownerId,
  currentTrackId,
  onSelectTab,
  onClose,
  onPickTrack,
  onAddMany,
  onRemove,
  onReorder,
}: DesktopRoomSidebarProps) {
  return (
    <aside className={`terminal-sidebar ${open ? 'is-open' : ''}`} aria-label="房间音乐库">
      <div className="sidebar-header">
        <div className="side-tabs" role="tablist" aria-label="房间工具">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'search'}
            className={activeTab === 'search' ? 'is-active' : ''}
            onClick={() => onSelectTab('search')}
          >
            搜索
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'queue'}
            className={activeTab === 'queue' ? 'is-active' : ''}
            onClick={() => onSelectTab('queue')}
          >
            队列 <small>{queue.length}</small>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'members'}
            className={activeTab === 'members' ? 'is-active' : ''}
            onClick={() => onSelectTab('members')}
          >
            成员 <small>{members.length}</small>
          </button>
        </div>
        <button type="button" className="close-sidebar" onClick={onClose} aria-label="关闭音乐库">
          ×
        </button>
      </div>

      <div className="sidebar-content">
        <div hidden={activeTab !== 'search'}>
          <SearchPanel onPick={onPickTrack} onAddMany={onAddMany} />
        </div>
        <div hidden={activeTab !== 'queue'}>
          <Queue
            queue={queue}
            currentTrackId={currentTrackId}
            isOwner={true}
            onRemove={onRemove}
            onReorder={onReorder}
          />
        </div>
        <div hidden={activeTab !== 'members'}>
          <MemberList members={members} ownerId={ownerId} />
        </div>
      </div>
    </aside>
  );
}
