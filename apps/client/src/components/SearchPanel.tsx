import { useState } from 'react';
import type { PlaylistSummary, Track } from '@lune/shared';
import { searchPlaylists, searchTracks, getPlaylist } from '../lib/api';
import { formatTime } from '../lib/format';
import { getUiErrorMessage } from '../lib/uiError';

interface SearchPanelProps {
  onPick: (track: Track) => void;
  onAddMany: (tracks: Track[]) => void;
}

type Tab = 'songs' | 'playlists';
type PlaylistView = 'list' | 'detail';

export default function SearchPanel({ onPick, onAddMany }: SearchPanelProps) {
  const [tab, setTab] = useState<Tab>('songs');

  // 搜歌 state
  const [kw, setKw] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // 歌单 state
  const [plView, setPlView] = useState<PlaylistView>('list');
  const [plKw, setPlKw] = useState('');
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [plLoading, setPlLoading] = useState(false);
  const [plErr, setPlErr] = useState('');
  const [selected, setSelected] = useState<PlaylistSummary | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState('');

  const doSearch = async () => {
    if (!kw.trim()) return;
    setLoading(true);
    setErr('');
    try {
      setResults(await searchTracks(kw.trim(), 20));
    } catch (e) {
      setErr(getUiErrorMessage(e, '暂时无法搜索歌曲，请稍后再试'));
    } finally {
      setLoading(false);
    }
  };

  const doPlaylistSearch = async () => {
    if (!plKw.trim()) return;
    setPlLoading(true);
    setPlErr('');
    try {
      setPlaylists(await searchPlaylists(plKw.trim(), 20));
    } catch (e) {
      setPlErr(getUiErrorMessage(e, '暂时无法搜索歌单，请稍后再试'));
    } finally {
      setPlLoading(false);
    }
  };

  const openPlaylist = async (pl: PlaylistSummary) => {
    setSelected(pl);
    setPlView('detail');
    setDetailLoading(true);
    setDetailErr('');
    setTracks([]);
    try {
      setTracks(await getPlaylist(pl.id));
    } catch (e) {
      setDetailErr(getUiErrorMessage(e, '歌单载入失败，请稍后再试'));
    } finally {
      setDetailLoading(false);
    }
  };

  const backToList = () => {
    setPlView('list');
    setDetailErr('');
  };

  return (
    <section className="terminal-pane terminal-search">
      <div className="pane-heading">
        <div><span>添加到房间</span><strong>搜索音乐</strong></div>
        <small>歌曲或歌单</small>
      </div>

      <div className="search-mode-tabs">
        <button
          type="button"
          onClick={() => setTab('songs')}
          className={tab === 'songs' ? 'is-active' : ''}
        >
          单曲
        </button>
        <button
          type="button"
          onClick={() => setTab('playlists')}
          className={tab === 'playlists' ? 'is-active' : ''}
        >
          歌单
        </button>
      </div>

      {tab === 'songs' && (
        <>
          <div className="flex gap-2">
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              placeholder="搜索歌曲"
              className="lune-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
            />
            <button
              onClick={doSearch}
              disabled={loading || !kw.trim()}
              className="lune-control rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? '搜索中' : '搜索'}
            </button>
          </div>

          {err && <div className="mt-2 rounded-lg bg-rose-950/35 px-2 py-1.5 text-xs text-rose-200">{err}</div>}

          <ul className="lune-scrollbar mt-2 max-h-72 overflow-y-auto pr-1">
            {results.map((track) => (
              <li
                key={track.id}
                className="lune-item group flex cursor-pointer items-center gap-3 px-2 py-2"
                onClick={() => onPick(track)}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--lune-surface-2))]">
                  {track.coverUrl ? (
                    <img src={track.coverUrl} alt={`${track.album} 专辑封面`} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[rgb(var(--lune-text)/0.9)]">{track.name}</div>
                  <div className="truncate text-xs text-[rgb(var(--lune-muted)/0.46)]">{track.artists}</div>
                </div>
                <span className="font-mono text-[11px] text-[rgb(var(--lune-muted)/0.42)]">{formatTime(track.duration)}</span>
                <span className="rounded-md bg-[rgb(var(--lune-accent)/0.12)] px-2 py-1 text-[11px] text-[rgb(var(--lune-accent))] opacity-0 transition group-hover:opacity-100">
                  加入
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'playlists' && plView === 'list' && (
        <>
          <div className="flex gap-2">
            <input
              value={plKw}
              onChange={(e) => setPlKw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doPlaylistSearch()}
              placeholder="搜索歌单名"
              className="lune-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
            />
            <button
              onClick={doPlaylistSearch}
              disabled={plLoading || !plKw.trim()}
              className="lune-control rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
            >
              {plLoading ? '搜索中' : '搜索'}
            </button>
          </div>

          {plErr && <div className="mt-2 rounded-lg bg-rose-950/35 px-2 py-1.5 text-xs text-rose-200">{plErr}</div>}

          <ul className="lune-scrollbar mt-2 max-h-72 overflow-y-auto pr-1">
            {playlists.map((pl) => (
              <li
                key={pl.id}
                className="lune-item group flex cursor-pointer items-center gap-3 px-2 py-2"
                onClick={() => openPlaylist(pl)}
              >
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--lune-surface-2))]">
                  {pl.coverUrl ? (
                    <img src={pl.coverUrl} alt={`${pl.name} 歌单封面`} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[rgb(var(--lune-text)/0.9)]">{pl.name}</div>
                  <div className="truncate text-xs text-[rgb(var(--lune-muted)/0.46)]">
                    {pl.trackCount} 首 · {pl.creator}
                  </div>
                </div>
                <span className="rounded-md bg-[rgb(var(--lune-accent)/0.12)] px-2 py-1 text-[11px] text-[rgb(var(--lune-accent))] opacity-0 transition group-hover:opacity-100">
                  查看
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'playlists' && plView === 'detail' && selected && (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={backToList}
              className="lune-control flex h-8 w-8 items-center justify-center rounded-lg text-sm"
              aria-label="返回歌单列表"
              title="返回"
            >
              ←
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[rgb(var(--lune-text)/0.94)]">{selected.name}</div>
              <div className="truncate text-xs text-[rgb(var(--lune-muted)/0.5)]">
                {selected.trackCount} 首 · {selected.creator}
              </div>
            </div>
            <button
              onClick={() => onAddMany(tracks)}
              disabled={detailLoading || tracks.length === 0}
              className="lune-control rounded-lg px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45"
              title="把整个歌单加入待播队列"
            >
              全部加入
            </button>
          </div>

          {detailErr && <div className="mt-2 rounded-lg bg-rose-950/35 px-2 py-1.5 text-xs text-rose-200">{detailErr}</div>}

          {detailLoading ? (
            <div className="mt-3 text-center text-xs text-[rgb(var(--lune-muted)/0.42)]">加载曲目中...</div>
          ) : tracks.length === 0 ? (
            <div className="mt-3 text-center text-xs text-[rgb(var(--lune-muted)/0.42)]">该歌单暂无曲目</div>
          ) : (
            <ul className="lune-scrollbar mt-2 max-h-72 overflow-y-auto pr-1">
              {tracks.map((track, idx) => (
                <li
                  key={`${track.id}-${idx}`}
                  className="lune-item group flex cursor-pointer items-center gap-3 px-2 py-2"
                  onClick={() => onPick(track)}
                >
                  <span className="w-5 shrink-0 text-right font-mono text-[11px] text-[rgb(var(--lune-muted)/0.4)]">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[rgb(var(--lune-text)/0.9)]">{track.name}</div>
                    <div className="truncate text-xs text-[rgb(var(--lune-muted)/0.46)]">{track.artists}</div>
                  </div>
                  <span className="font-mono text-[11px] text-[rgb(var(--lune-muted)/0.42)]">{formatTime(track.duration)}</span>
                  <span className="rounded-md bg-[rgb(var(--lune-accent)/0.12)] px-2 py-1 text-[11px] text-[rgb(var(--lune-accent))] opacity-0 transition group-hover:opacity-100">
                    加入
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
