import { useMemo, useState } from 'react';
import type { Track } from '@lune/shared';
import { useRoomStore } from '../../hooks/useRoomStore';
import FavoriteButton, { BookmarkIcon } from './FavoriteButton';
import { useListeningLibrary } from './useListeningLibrary';
import type { LibraryEntry } from './useListeningLibrary';
import './library.css';

function dayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return '今天';
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ListeningLibrary({ server, onAdd, onSearch }: {
  server: string; onAdd: (track: Track) => void; onSearch: () => void;
}) {
  const [view, setView] = useState<'history' | 'favorites'>('history');
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [notice, setNotice] = useState('');
  const [limit, setLimit] = useState(50);
  const history = useListeningLibrary((state) => state.history);
  const favorites = useListeningLibrary((state) => state.favorites);
  const storageError = useListeningLibrary((state) => state.storageError);
  const clearHistory = useListeningLibrary((state) => state.clearHistory);
  const retrySave = useListeningLibrary((state) => state.retrySave);
  const connected = useRoomStore((state) => state.connected);
  const localHistory = useMemo(() => history.filter((item) => item.server === server), [history, server]);
  const localFavorites = useMemo(() => favorites.filter((item) => item.server === server), [favorites, server]);
  const source = view === 'history' ? localHistory : localFavorites;
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return source.filter(({ track, roomCode }) => !keyword
      || `${track.name} ${track.artists} ${track.album} ${roomCode || ''}`.toLocaleLowerCase().includes(keyword));
  }, [query, source]);
  const groups = useMemo(() => {
    const result = new Map<string, LibraryEntry[]>();
    filtered.slice(0, limit).forEach((entry) => {
      const label = dayLabel(entry.savedAt);
      result.set(label, [...(result.get(label) || []), entry]);
    });
    return [...result];
  }, [filtered, limit]);

  return <section className="listening-library" aria-label="共听记录与收藏">
    <div className="library-toolbar">
      <div className="library-views" role="group" aria-label="查看记录或收藏">
        <button type="button" aria-pressed={view === 'history'} onClick={() => { setView('history'); setLimit(50); setConfirmClear(false); }}>
          共听记录 <span>{localHistory.length}</span>
        </button>
        <button type="button" aria-pressed={view === 'favorites'} onClick={() => { setView('favorites'); setLimit(50); setConfirmClear(false); }}>
          收藏 <span>{localFavorites.length}</span>
        </button>
      </div>
      {view === 'history' && localHistory.length > 0 && !confirmClear && <button type="button" className="library-clear" onClick={() => setConfirmClear(true)}>清空记录</button>}
    </div>
    <label className="library-search">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
      <span className="sr-only">搜索记录与收藏中的歌曲、歌手或专辑</span>
      <input type="search" value={query} placeholder="搜索歌曲或歌手"
        onChange={(event) => { setQuery(event.target.value); setLimit(50); }} />
    </label>
    {storageError && <div className="library-notice" role="alert"><p>{storageError}</p><button type="button" onClick={retrySave}>重试保存</button></div>}
    {confirmClear && <div className="library-notice">
      <p>清空当前服务器的本机共听记录？收藏会保留，此操作无法撤销。</p>
      <div className="library-confirm-actions"><button type="button" onClick={() => setConfirmClear(false)}>保留记录</button>
        <button type="button" onClick={() => { clearHistory(server); setConfirmClear(false); setNotice('共听记录已清空'); }}>确认清空</button></div>
    </div>}
    {filtered.length === 0 ? <div className="library-empty">
      <BookmarkIcon />
      <h4>{query.trim() ? '没有找到结果' : view === 'history' ? '暂无共听记录' : '暂无收藏'}</h4>
      <button type="button" className="lune-control" onClick={query.trim() ? () => setQuery('') : onSearch}>{query.trim() ? '清除搜索' : '去选歌'}</button>
    </div> : <div className="library-groups">
      {groups.map(([label, entries]) => <section key={label} className="library-day" aria-label={label}>
        <h4>{label}</h4>
        <ul>{entries.map((entry) => <li key={entry.id} className="library-row">
          <div className="library-cover">{entry.track.coverUrl
            ? <img src={entry.track.coverUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17V5l11-2v12M9 8l11-2" /><circle cx="6" cy="17" r="3" /><circle cx="17" cy="15" r="3" /></svg>}</div>
          <div className="library-track">
            <strong title={entry.track.name}>{entry.track.name}</strong>
            <span title={entry.track.artists}>{entry.track.artists || '未知歌手'}</span>
          </div>
          <div className="library-row-actions">
            <FavoriteButton track={entry.track} server={server} />
            <button type="button" className="library-add" disabled={!connected}
              title={connected ? '加入待播队列' : '连接房间后可加入队列'} aria-label={`将《${entry.track.name}》加入队列`}
              onClick={() => { onAdd(entry.track); setNotice(`已请求将《${entry.track.name}》加入队列`); }}>加入</button>
          </div>
        </li>)}</ul>
      </section>)}
      {filtered.length > limit && <button type="button" className="library-more lune-control" onClick={() => setLimit(limit + 50)}>再显示 50 条</button>}
    </div>}
    <p className="library-feedback" role="status">{notice}</p>
  </section>;
}
