import { useEffect, useLayoutEffect, useState, useSyncExternalStore, useRef } from 'react';
import type { UIEventHandler } from 'react';
import type { BilibiliVideoSummary, PlaylistSummary, Track } from '@lune/shared';
import { getBilibiliVideoParts, getPlaylist, getProviders, searchPlaylists, searchTracks, type ProviderCatalogEntry } from '../lib/api';
import HotChartPanel, { providerLabel } from './HotChartPanel';
import './hearts.css';
import { getServerBaseUrl } from '../lib/serverConfig';
import { formatTime } from '../lib/format';
import { getUiErrorMessage } from '../lib/uiError';
import ListeningLibrary, { initialLibraryViewState } from '../features/library/ListeningLibrary';
import FavoriteButton from '../features/library/FavoriteButton';
import WorkspaceMusicBrowser from './WorkspaceMusicBrowser';
import SourcePicker from './SourcePicker';
import { BilibiliPartsView, BilibiliVideoRows, type BilibiliSelection } from './BilibiliVideoSearch';
import { useBilibiliPreferences } from '../features/settings/model/bilibiliPreferences';
import { useClientRuntime } from '../app/ClientRuntimeProvider';

interface SearchPanelProps {
  onPick: (track: Track) => void;
  onAddMany: (tracks: Track[]) => void;
  active?: boolean;
  roomActionsAvailable?: boolean;
  providerPicker?: 'select' | 'pills';
  tab?: SearchPanelTab;
  onTabChange?: (tab: SearchPanelTab) => void;
  presentation?: 'compact' | 'workspace';
}

export type SearchPanelTab = 'songs' | 'playlists' | 'hot' | 'library';
type PlaylistView = 'list' | 'detail';
type SongSearchScope = 'compact' | 'legacy';

interface SongSearchState {
  results: Track[];
  videos: BilibiliVideoSummary[];
  loading: boolean;
  error: string;
  searched: boolean;
}

const emptySongSearch: SongSearchState = { results: [], videos: [], loading: false, error: '', searched: false };

const subscribeServer = (listener: () => void) => {
  window.addEventListener('storage', listener);
  window.addEventListener('lune-server-changed', listener);
  return () => { window.removeEventListener('storage', listener); window.removeEventListener('lune-server-changed', listener); };
};

async function searchSources<T>(sources: string[], search: (source: string) => Promise<T[]>): Promise<T[]> {
  const results = await Promise.allSettled(sources.map(search));
  if (results.length === 1 && results[0].status === 'rejected') throw results[0].reason;
  const available = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (available.length === 0) throw new Error('暂时无法搜索，请检查音乐源连接后重试');
  // Interleave sources so a full first-source response does not hide every other source.
  return Array.from({ length: 20 }, (_, i) => available.flatMap((items) => items[i] ? [items[i]] : [])).flat().slice(0, 20);
}

export default function SearchPanel({ onPick, onAddMany, active = true, roomActionsAvailable = true, providerPicker = 'select', tab: controlledTab, onTabChange, presentation = 'compact' }: SearchPanelProps) {
  const windows = useClientRuntime().kind === 'windows';
  const [localTab, setLocalTab] = useState<SearchPanelTab>('songs');
  const tab = controlledTab ?? localTab;
  const setTab = (next: SearchPanelTab) => { setLocalTab(next); onTabChange?.(next); };
  const workspace = presentation === 'workspace';
  const useCompactSources = windows && !workspace;
  const songScope: SongSearchScope = useCompactSources ? 'compact' : 'legacy';
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([]);
  const [compactSources, setCompactSources] = useState<string[] | null>(null);
  const [legacyProvider, setLegacyProvider] = useState('all');
  const songSources = providers.filter((source) => source.capabilities?.includes('search') ?? true).map(({ id }) => id);
  const regularSongSources = songSources.filter((id) => id !== 'bilibili');
  const defaultSongSources = regularSongSources.length ? regularSongSources : songSources;
  const playlistSources = providers.filter((source) => source.capabilities?.includes('playlist-search') ?? source.id !== 'bilibili').map(({ id }) => id);
  const selectedCompactSources = compactSources ?? defaultSongSources;
  const selectedLegacySongs = songSources.includes(legacyProvider) ? [legacyProvider] : defaultSongSources;
  const selectedPlaylists = playlistSources.includes(legacyProvider) ? [legacyProvider] : playlistSources;
  const chartSources = songSources.includes(legacyProvider) ? [legacyProvider] : windows ? ['all'] : songSources;
  const precision = useBilibiliPreferences((state) => state.precision);
  const serverUrl = useSyncExternalStore(subscribeServer, getServerBaseUrl);

  const requests = useRef({ songs: { compact: 0, legacy: 0 }, playlists: 0, detail: 0, video: 0 });
  const contentRef = useRef<HTMLElement>(null);
  const videoTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreVideoFocus = useRef(false);
  const scrollPositions = useRef<Record<string, number>>({});
  const [libraryView, setLibraryView] = useState(initialLibraryViewState);
  const libraryViewState = { value: libraryView, onChange: setLibraryView };
  const saveScroll: UIEventHandler<HTMLElement> = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.dataset.scrollKey || !target.getClientRects().length) return;
    scrollPositions.current[`${presentation}:${target.dataset.scrollKey}`] = target.scrollTop;
  };

  // 搜歌 state
  const [kw, setKw] = useState('');
  const [songSearches, setSongSearches] = useState<Record<SongSearchScope, SongSearchState>>({
    compact: emptySongSearch, legacy: emptySongSearch,
  });
  const { results, videos, loading, error: err, searched } = songSearches[songScope];
  const updateSongSearch = (update: Partial<SongSearchState>) => {
    setSongSearches((current) => ({ ...current, [songScope]: { ...current[songScope], ...update } }));
  };
  const [videoLoadingId, setVideoLoadingId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState('');
  const [videoSelection, setVideoSelection] = useState<BilibiliSelection | null>(null);

  // 歌单 state
  const [plView, setPlView] = useState<PlaylistView>('list');
  const [plKw, setPlKw] = useState('');
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [plLoading, setPlLoading] = useState(false);
  const [plErr, setPlErr] = useState('');
  const [playlistSearched, setPlaylistSearched] = useState(false);
  const [selected, setSelected] = useState<PlaylistSummary | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState('');

  useEffect(() => {
    requests.current.songs.compact++; requests.current.songs.legacy++;
    requests.current.playlists++; requests.current.detail++; requests.current.video++;
    setSongSearches({ compact: emptySongSearch, legacy: emptySongSearch });
    setPlLoading(false); setDetailLoading(false);
    setPlaylists([]); setTracks([]); setSelected(null); setPlView('list');
    setVideoSelection(null); setVideoLoadingId(null); setVideoError('');
    setProviders([]); setCompactSources(null); setLegacyProvider('all');
    setPlErr(''); setDetailErr(''); setPlaylistSearched(false);
    setLibraryView(initialLibraryViewState());
    scrollPositions.current = {};
    let alive = true;
    getProviders()
      .then((activeProviders) => {
        if (!alive) return;
        setProviders(windows ? activeProviders : activeProviders.filter(({ id }) => id !== 'bilibili'));
      })
      .catch(() => {
        if (!alive) return;
        setProviders([{ id: 'netease' }]);
      });
    return () => {
      alive = false;
    };
  }, [serverUrl, windows]);

  useLayoutEffect(() => {
    requests.current.video++;
    restoreVideoFocus.current = false;
    setVideoSelection(null); setVideoLoadingId(null); setVideoError('');
  }, [songScope]);

  useEffect(() => {
    if (active && tab === 'songs') return;
    requests.current.video++;
    setVideoLoadingId(null);
  }, [active, tab]);

  const chooseLegacySource = (id: string) => {
    if (id === legacyProvider) return;
    delete scrollPositions.current['workspace:songs'];
    if (!windows) delete scrollPositions.current['compact:songs'];
    for (const mode of ['compact', 'workspace']) {
      delete scrollPositions.current[`${mode}:playlists`];
      delete scrollPositions.current[`${mode}:detail`];
    }
    requests.current.songs.legacy++; requests.current.playlists++; requests.current.detail++; requests.current.video++;
    setLegacyProvider(id);
    setSongSearches((current) => ({ ...current, legacy: emptySongSearch }));
    setPlLoading(false); setDetailLoading(false);
    setVideoSelection(null); setVideoLoadingId(null); setVideoError('');
    setPlaylists([]);
    setTracks([]);
    setSelected(null);
    setPlView('list');
    setPlErr('');
    setDetailErr('');
    setPlaylistSearched(false);
  };

  const toggleSource = (id: string) => {
    const next = selectedCompactSources.includes(id)
      ? selectedCompactSources.filter((source) => source !== id)
      : songSources.filter((source) => source === id || selectedCompactSources.includes(source));
    delete scrollPositions.current['compact:songs'];
    requests.current.songs.compact++; requests.current.video++;
    setCompactSources(next);
    updateSongSearch({ ...emptySongSearch, searched: searched || loading });
    setVideoSelection(null); setVideoLoadingId(null); setVideoError('');
    if (searched || loading) void doSearch(next);
  };

  const selectedSongs = useCompactSources ? selectedCompactSources : selectedLegacySongs;
  const doSearch = async (sources = selectedSongs) => {
    if (!kw.trim() || !sources.length) return;
    const request = ++requests.current.songs[songScope];
    requests.current.video++;
    const isCurrent = () => request === requests.current.songs[songScope] && serverUrl === getServerBaseUrl();
    updateSongSearch({ loading: true, error: '' });
    setVideoError(''); setVideoLoadingId(null); setVideoSelection(null);
    try {
      const result = await searchSources<Track | BilibiliVideoSummary>(sources, async (source) => {
        const { songs, videos: matches = [] } = await searchTracks(kw.trim(), 20, source, useCompactSources ? precision : undefined);
        return [...songs.map((track) => ({ ...track, provider: track.provider || source })), ...matches];
      });
      if (isCurrent()) {
        updateSongSearch({
          results: result.filter((entry): entry is Track => 'artists' in entry),
          videos: result.filter((entry): entry is BilibiliVideoSummary => 'creator' in entry),
          searched: true,
        });
      }
    } catch (e) {
      if (isCurrent()) updateSongSearch({ error: getUiErrorMessage(e, '暂时无法搜索歌曲，请稍后再试') });
    } finally {
      if (isCurrent()) updateSongSearch({ loading: false });
    }
  };

  const doPlaylistSearch = async () => {
    if (!plKw.trim() || !selectedPlaylists.length) return;
    const request = ++requests.current.playlists;
    const isCurrent = () => request === requests.current.playlists && serverUrl === getServerBaseUrl();
    setPlLoading(true);
    setPlErr('');
    try {
      const result = await searchSources(selectedPlaylists, async (source) =>
        (await searchPlaylists(plKw.trim(), 20, source)).map((item) => ({ ...item, provider: item.provider || source })));
      if (isCurrent()) { setPlaylists(result); setPlaylistSearched(true); }
    } catch (e) {
      if (isCurrent()) setPlErr(getUiErrorMessage(e, '暂时无法搜索歌单，请稍后再试'));
    } finally {
      if (isCurrent()) setPlLoading(false);
    }
  };

  const openVideo = async (video: BilibiliVideoSummary, trigger: HTMLButtonElement) => {
    if (!roomActionsAvailable) return;
    const request = ++requests.current.video;
    const isCurrent = () => request === requests.current.video && serverUrl === getServerBaseUrl();
    setVideoLoadingId(video.id);
    setVideoError('');
    try {
      const parts = await getBilibiliVideoParts(video.id);
      if (!isCurrent()) return;
      if (parts.length === 1) onPick(parts[0]);
      else if (parts.length > 1) {
        videoTrigger.current = trigger;
        setVideoSelection({ video, tracks: parts });
      } else setVideoError('该投稿暂无可用的分 P');
    } catch (error) {
      if (isCurrent()) setVideoError(getUiErrorMessage(error, '无法读取投稿，请重试'));
    } finally {
      if (isCurrent()) setVideoLoadingId(null);
    }
  };

  const backToVideos = () => {
    restoreVideoFocus.current = true;
    setVideoSelection(null);
  };

  const openPlaylist = async (pl: PlaylistSummary) => {
    delete scrollPositions.current['workspace:detail'];
    delete scrollPositions.current['compact:detail'];
    const request = ++requests.current.detail;
    const isCurrent = () => request === requests.current.detail && serverUrl === getServerBaseUrl();
    setSelected(pl);
    setPlView('detail');
    setDetailLoading(true);
    setDetailErr('');
    setTracks([]);
    try {
      const result = await getPlaylist(pl.id, pl.provider);
      if (isCurrent()) setTracks(result);
    } catch (e) {
      if (isCurrent()) setDetailErr(getUiErrorMessage(e, '歌单载入失败，请稍后再试'));
    } finally {
      if (isCurrent()) setDetailLoading(false);
    }
  };

  const backToList = () => {
    requests.current.detail++;
    setPlView('list');
    setDetailLoading(false);
    setDetailErr('');
  };

  useLayoutEffect(() => {
    const other = workspace ? 'compact' : 'workspace';
    contentRef.current?.querySelectorAll<HTMLElement>('[data-scroll-key]').forEach((element) => {
      if (!element.getClientRects().length) return;
      const key = element.dataset.scrollKey;
      const sharedPosition = windows && key === 'songs' ? 0 : scrollPositions.current[`${other}:${key}`];
      element.scrollTop = scrollPositions.current[`${presentation}:${key}`] ?? sharedPosition ?? 0;
    });
    if (!videoSelection && restoreVideoFocus.current) {
      restoreVideoFocus.current = false;
      videoTrigger.current?.focus({ preventScroll: true });
    }
  }, [presentation, workspace, windows, tab, plView, videoSelection, loading, plLoading, detailLoading, active]);

  const songSearchEnabled = selectedSongs.length > 0;
  const playlistSearchEnabled = selectedPlaylists.length > 0;
  const videoRows = { videos, pendingId: videoLoadingId, available: roomActionsAvailable,
    onOpen: (video: BilibiliVideoSummary, trigger: HTMLButtonElement) => { void openVideo(video, trigger); } };
  const partsView = videoSelection && <BilibiliPartsView key={videoSelection.video.id}
    selection={videoSelection} available={roomActionsAvailable} onBack={backToVideos} onAddMany={onAddMany} />;

  if (workspace) return <WorkspaceMusicBrowser tab={tab} active={active} server={serverUrl} containerRef={contentRef} onScrollCapture={saveScroll} libraryViewState={libraryViewState}
    source={{ value: legacyProvider, onChange: chooseLegacySource }}
    songSources={songSources} playlistSources={playlistSources} chartSources={chartSources}
    songDefaultLabel={defaultSongSources.length < songSources.length ? '默认音源' : providerLabel('all')}
    songs={{ query: kw, onQueryChange: setKw, tracks: results, loading, error: err, searched, enabled: songSearchEnabled, onSearch: () => { void doSearch(); } }}
    videos={videoRows} videoError={videoError} partsView={partsView}
    playlists={{ query: plKw, onQueryChange: setPlKw, items: playlists, loading: plLoading, error: plErr, searched: playlistSearched,
      enabled: playlistSearchEnabled,
      onSearch: () => { void doPlaylistSearch(); }, view: plView, selected, tracks, detailLoading, detailError: detailErr,
      onOpen: (playlist) => { void openPlaylist(playlist); }, onBack: backToList }}
    onPick={onPick} onAddMany={onAddMany} onTabChange={setTab} />;

  return (
    <section ref={contentRef} onScrollCapture={saveScroll} className="terminal-pane terminal-search">
      {!windows && songSources.length > 1 && tab !== 'library' && (providerPicker === 'pills'
        ? <div className="provider-pills" role="radiogroup" aria-label="选择音乐源">
          {['all', ...songSources].map((id) => <button key={id} type="button" role="radio"
            aria-checked={legacyProvider === id} className={legacyProvider === id ? 'is-active' : undefined}
            onClick={() => chooseLegacySource(id)}>{providerLabel(id)}</button>)}
        </div>
        : <div className="pane-heading">
          <label className="search-provider-picker flex items-center gap-2 text-xs text-[rgb(var(--lune-muted)/0.58)]">
            <span>音乐源</span>
            <select value={legacyProvider} onChange={(event) => chooseLegacySource(event.target.value)}
              className="lune-control rounded-lg px-2 py-1 text-xs" aria-label="选择音乐源">
              {['all', ...songSources].map((id) => <option key={id} value={id}>{providerLabel(id)}</option>)}
            </select>
          </label>
        </div>)}
      <div className="search-mode-tabs search-mode-tabs-library" aria-label="选歌方式">
        <button
          type="button"
          aria-pressed={tab === 'songs'}
          onClick={() => setTab('songs')}
          className={tab === 'songs' ? 'is-active' : ''}
        >
          搜歌
        </button>
        <button
          type="button"
          aria-pressed={tab === 'playlists'}
          onClick={() => setTab('playlists')}
          className={tab === 'playlists' ? 'is-active' : ''}
        >
          歌单
        </button>
        <button type="button" aria-pressed={tab === 'hot'} onClick={() => setTab('hot')} className={tab === 'hot' ? 'is-active' : ''}>热榜</button>
        <button type="button" aria-pressed={tab === 'library'} onClick={() => setTab('library')} className={tab === 'library' ? 'is-active' : ''} title="共听记录与收藏">我的</button>
      </div>

      <div className="library-panel-scroll lune-scrollbar" data-scroll-key="library" hidden={tab !== 'library'}>
        <ListeningLibrary key={serverUrl} server={serverUrl} viewState={libraryViewState} onAdd={(track) => onAddMany([track])} onSearch={() => setTab('songs')} />
      </div>

      <div hidden={tab !== 'hot'}>
        <HotChartPanel providers={chartSources} serverUrl={serverUrl} active={active && tab === 'hot'} onPick={(track) => onAddMany([track])} disabled={!roomActionsAvailable} />
      </div>

      <div hidden={tab !== 'songs' || Boolean(videoSelection)}>
          <div className="search-query-row flex gap-2">
            <input
              type="search"
              aria-label="搜索歌曲或歌手"
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void doSearch(); }}
              placeholder="搜索歌曲"
              className="lune-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
            />
            <button
              onClick={() => { void doSearch(); }}
              disabled={loading || !kw.trim() || !songSearchEnabled}
              className="lune-control rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
            >
              {loading ? '搜索中' : '搜索'}
            </button>
            {useCompactSources && tab === 'songs' && <SourcePicker providers={songSources} selected={selectedCompactSources} onToggle={toggleSource} />}
          </div>

          {err && <div className="mt-2 rounded-lg bg-rose-950/35 px-2 py-1.5 text-xs text-rose-200">{err}</div>}
          {videoError && <p className="mt-2 text-xs" role="alert">{videoError}</p>}
          {useCompactSources && songSearchEnabled && searched && !loading && !err && !results.length && !videos.length &&
            <p className="mt-2 text-xs" role="status">没找到结果，试试其他关键词</p>}

          <ul data-scroll-key="songs" className="lune-scrollbar mt-2 max-h-72 overflow-y-auto pr-1">
            {results.map((track) => (
              <li
                key={`${track.provider || ''}:${track.id}`}
                className="lune-item group flex cursor-pointer items-center gap-3 px-2 py-2"
                onClick={roomActionsAvailable ? () => onPick(track) : undefined}
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
                <FavoriteButton track={track} server={serverUrl} />
                <span className="tabular-nums text-xs text-[rgb(var(--lune-muted)/0.52)]">{formatTime(track.duration)}</span>
                <button type="button" disabled={!roomActionsAvailable} aria-label={`选歌：《${track.name}》`} onClick={(event) => { event.stopPropagation(); onPick(track); }} className="search-result-action rounded-md bg-[rgb(var(--lune-accent)/0.12)] px-2 py-1 text-xs text-[rgb(var(--lune-accent))] opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed">
                  加入
                </button>
              </li>
            ))}
            <BilibiliVideoRows {...videoRows} />
          </ul>
      </div>
      <div hidden={tab !== 'songs' || !videoSelection}>{partsView}</div>

      <div hidden={tab !== 'playlists' || plView !== 'list'}>
          <div className="search-query-row flex gap-2">
            <input
              type="search"
              aria-label="搜索歌单名"
              value={plKw}
              onChange={(e) => setPlKw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void doPlaylistSearch(); }}
              placeholder="搜索歌单名"
              className="lune-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
            />
            <button
              onClick={() => { void doPlaylistSearch(); }}
              disabled={plLoading || !plKw.trim() || !playlistSearchEnabled}
              className="lune-control rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45"
            >
              {plLoading ? '搜索中' : '搜索'}
            </button>
          </div>

          {plErr && <div className="mt-2 rounded-lg bg-rose-950/35 px-2 py-1.5 text-xs text-rose-200">{plErr}</div>}

          <ul data-scroll-key="playlists" className="playlist-search-results lune-scrollbar mt-2 max-h-72 overflow-y-auto pr-1">
            {playlists.map((pl) => (
              <li
                key={`${pl.provider || ''}:${pl.id}`}
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
                <button type="button" aria-label={`查看歌单《${pl.name}》`} onClick={(event) => { event.stopPropagation(); void openPlaylist(pl); }} className="search-result-action rounded-md bg-[rgb(var(--lune-accent)/0.12)] px-2 py-1 text-xs text-[rgb(var(--lune-accent))] opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
                  查看
                </button>
              </li>
            ))}
          </ul>
      </div>

      <div hidden={tab !== 'playlists' || plView !== 'detail'}>
      {plView === 'detail' && selected && (
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
              disabled={!roomActionsAvailable || detailLoading || tracks.length === 0}
              className="lune-control rounded-lg px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45"
              title="把整个歌单加入待播队列"
            >
              全部加入
            </button>
          </div>

          {detailErr && <div className="mt-2 rounded-lg bg-rose-950/35 px-2 py-1.5 text-xs text-rose-200">{detailErr}</div>}

          {detailLoading ? (
            <div className="mt-3 text-center text-xs text-[rgb(var(--lune-muted)/0.52)]">正在载入</div>
          ) : tracks.length === 0 ? (
            <div className="mt-3 text-center text-xs text-[rgb(var(--lune-muted)/0.52)]">歌单为空</div>
          ) : (
            <ul data-scroll-key="detail" className="lune-scrollbar mt-2 max-h-72 overflow-y-auto pr-1">
              {tracks.map((track, idx) => (
                <li
                  key={`${track.provider || selected.provider || ''}:${track.id}-${idx}`}
                  className="lune-item group flex cursor-pointer items-center gap-3 px-2 py-2"
                  onClick={roomActionsAvailable ? () => onPick(track) : undefined}
                >
                  <span className="w-5 shrink-0 text-right tabular-nums text-xs text-[rgb(var(--lune-muted)/0.5)]">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[rgb(var(--lune-text)/0.9)]">{track.name}</div>
                    <div className="truncate text-xs text-[rgb(var(--lune-muted)/0.46)]">{track.artists}</div>
                  </div>
                  <FavoriteButton track={track} server={serverUrl} />
                  <span className="tabular-nums text-xs text-[rgb(var(--lune-muted)/0.52)]">{formatTime(track.duration)}</span>
                  <button type="button" disabled={!roomActionsAvailable} aria-label={`选歌：《${track.name}》`} onClick={(event) => { event.stopPropagation(); onPick(track); }} className="search-result-action rounded-md bg-[rgb(var(--lune-accent)/0.12)] px-2 py-1 text-xs text-[rgb(var(--lune-accent))] opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed">
                    加入
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      </div>
    </section>
  );
}
