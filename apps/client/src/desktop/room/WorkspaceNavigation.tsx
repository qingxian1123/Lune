import type { SearchPanelTab } from '../../components/SearchPanel';
import type { DesktopRoomTab } from './types';

export type WorkspaceDestination = SearchPanelTab | 'queue' | 'members';
type IconName = WorkspaceDestination | 'settings' | 'add';

const iconPaths: Record<IconName, string> = {
  songs: 'M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  playlists: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  hot: 'M5 20v-6M12 20V9M19 20V4M3 20h19',
  library: 'M5 4v16M9 4v16M14 5l5-1 3 15-5 1z',
  queue: 'M4 5h16M4 10h16M4 15h7M4 20h7M16 14l5 3-5 3z',
  members: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6',
  add: 'M12 5v14M5 12h14',
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
  onSelect: (tab: DesktopRoomTab, searchTab?: SearchPanelTab) => void;
  onOpenSettings: () => void;
  settingsOpen?: boolean;
}

export default function WorkspaceNavigation({ active, onSelect, onOpenSettings, settingsOpen = false }: Props) {
  return <nav className="workspace-nav" aria-label="工作区导航">
    <div className="workspace-nav-label">库</div>
    <div className="workspace-nav-links">
      {workspaceDestinations.map((item, index) => <div key={item.id}>
        {index === 4 && <div className="workspace-nav-divider" />}
        <button type="button" aria-current={!settingsOpen && active === item.id ? 'page' : undefined} aria-label={item.label} title={item.label}
          className="workspace-nav-item" aria-controls={`library-panel-${item.id === 'queue' || item.id === 'members' ? item.id : 'search'}`}
          onClick={() => item.id === 'queue' || item.id === 'members' ? onSelect(item.id) : onSelect('search', item.id)}>
          <WorkspaceIcon name={item.id} /><span>{item.label}</span>
        </button>
      </div>)}
    </div>
    <div className="workspace-nav-bottom">
      <button type="button" className="workspace-nav-item" onClick={onOpenSettings} aria-current={settingsOpen ? 'page' : undefined} aria-label="设置" title="设置"><WorkspaceIcon name="settings" /><span>设置</span></button>
    </div>
  </nav>;
}
