import type { SearchPanelTab } from '../../components/SearchPanel';
import type { DesktopRoomTab } from './types';

export type WorkspaceDestination = SearchPanelTab | 'queue' | 'members';
type IconName = WorkspaceDestination | 'settings' | 'collapse' | 'back' | 'copy';

const iconPaths: Record<IconName, string> = {
  songs: 'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  playlists: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  hot: 'M5 20v-6M12 20V9M19 20V4M3 20h19',
  library: 'M5 4v16M9 4v16M14 5l5-1 3 15-5 1z',
  queue: 'M4 5h16M4 10h16M4 15h7M4 20h7M16 14l5 3-5 3z',
  members: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6',
  collapse: 'M4 4h16v16H4zM15 4v16M8 9l3 3-3 3',
  back: 'M19 12H5M11 6l-6 6 6 6',
  copy: 'M9 9h11v11H9zM15 5V3H3v12h2',
};

export function WorkspaceIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconPaths[name]} /></svg>;
}

export const workspaceDestinations: { id: WorkspaceDestination; label: string }[] = [
  { id: 'songs', label: '搜索音乐' },
  { id: 'playlists', label: '发现歌单' },
  { id: 'hot', label: '共听热榜' },
  { id: 'library', label: '我的音乐' },
  { id: 'queue', label: '播放队列' },
  { id: 'members', label: '房间成员' },
];

interface Props {
  active: WorkspaceDestination;
  queueCount: number;
  membersCount: number;
  roomCode: string;
  connected: boolean;
  copied: boolean;
  onCopyCode: () => void;
  onSelect: (tab: DesktopRoomTab, searchTab?: SearchPanelTab) => void;
  onOpenSettings: () => void;
}

export default function WorkspaceNavigation({ active, queueCount, membersCount, roomCode, connected, copied, onCopyCode, onSelect, onOpenSettings }: Props) {
  return <nav className="workspace-nav" aria-label="工作区导航">
    <div className="workspace-brand"><span>Lune</span><span>一起听</span></div>
    <div className="workspace-nav-links">
      {workspaceDestinations.map((item, index) => <div key={item.id}>
        {(index === 0 || index === 4) && <p className="workspace-nav-group">{index === 0 ? '音乐' : '房间'}</p>}
        <button type="button" aria-current={active === item.id ? 'page' : undefined}
          className="workspace-nav-item" aria-controls={`library-panel-${item.id === 'queue' || item.id === 'members' ? item.id : 'search'}`}
          onClick={() => item.id === 'queue' || item.id === 'members' ? onSelect(item.id) : onSelect('search', item.id)}>
          <WorkspaceIcon name={item.id} /><span>{item.label}</span>
          {item.id === 'queue' && <small>{queueCount}</small>}
          {item.id === 'members' && <small>{membersCount}</small>}
        </button>
      </div>)}
    </div>
    <div className="workspace-nav-bottom">
      <div className="workspace-room-status"><i data-connected={connected} /><span>{connected ? `${membersCount} 人在房间` : '房间已断开'}</span></div>
      <button type="button" className="workspace-invite" onClick={onCopyCode} disabled={!roomCode} aria-label="复制房间邀请码" title="复制邀请码，邀请朋友">
        <span>邀请码 <strong>{roomCode || '—'}</strong></span><WorkspaceIcon name="copy" />
      </button>
      <span className="workspace-copy-feedback" role="status">{copied ? '邀请码已复制' : ''}</span>
      <button type="button" className="workspace-nav-item" onClick={onOpenSettings}><WorkspaceIcon name="settings" /><span>设置</span></button>
    </div>
  </nav>;
}
