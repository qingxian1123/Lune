import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject, UIEventHandler } from 'react';
import type { PlaylistSummary, Track } from '@lune/shared';
import type { SearchPanelTab } from './SearchPanel';
import HotChartPanel, { providerLabel } from './HotChartPanel';
import FavoriteButton from '../features/library/FavoriteButton';
import ListeningLibrary from '../features/library/ListeningLibrary';
import type { SharedLibraryViewState } from '../features/library/ListeningLibrary';
import { useRoomStore } from '../hooks/useRoomStore';
import { formatTime } from '../lib/format';
import { WorkspaceIcon } from '../desktop/room/WorkspaceNavigation';
import { BilibiliVideoRows, type BilibiliVideoRowsProps } from './BilibiliVideoSearch';

interface SearchState {
  query: string;
  loading: boolean;
  error: string;
  searched: boolean;
  enabled: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
}

interface Props {
  tab: SearchPanelTab;
  active: boolean;
  server: string;
  source: { value: string; onChange: (id: string) => void };
  songSources: string[];
  songDefaultLabel: string;
  playlistSources: string[];
  chartSources: string[];
  songs: SearchState & { tracks: Track[] };
  videos: BilibiliVideoRowsProps;
  videoError: string;
  partsView: ReactNode;
  playlists: SearchState & {
    items: PlaylistSummary[];
    view: 'list' | 'detail';
    selected: PlaylistSummary | null;
    tracks: Track[];
    detailLoading: boolean;
    detailError: string;
    onOpen: (playlist: PlaylistSummary) => void;
    onBack: () => void;
  };
  onPick: (track: Track) => void;
  onAddMany: (tracks: Track[]) => void;
  onTabChange: (tab: SearchPanelTab) => void;
  containerRef: RefObject<HTMLElement>;
  onScrollCapture: UIEventHandler<HTMLElement>;
  libraryViewState: SharedLibraryViewState;
}

function MusicCover({ src, className = '' }: { src?: string; className?: string }) {
  return <span className={`workspace-music-cover ${className}`}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13M9 8l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="17" cy="16" rx="3" ry="2" /></svg>
    {src && <img key={src} src={src} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
  </span>;
}

function TrackList({ tracks, server, connected, onPick, numbered = false, flow = false, extra }: {
  tracks: Track[]; server: string; connected: boolean; onPick: (track: Track) => void; numbered?: boolean; flow?: boolean; extra?: ReactNode;
}) {
  const { track: current, status } = useRoomStore((state) => state.playback);
  const [recentKey, setRecentKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);
  const handlePick = (track: Track, key: string) => {
    if (!connected) return;
    onPick(track);
    setRecentKey(key);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setRecentKey(null), 1400);
  };
  const action = status === 'idle' ? '播放' : '加入队列';
  return <div className={`workspace-track-table${numbered ? ' is-numbered' : ''}${flow ? ' is-flow' : ''}`}>
    {tracks.length > 0 && <div className="workspace-track-columns" aria-hidden="true">
      {numbered && <span>序号</span>}<span>歌曲</span><span className="workspace-artist-column">歌手</span><span className="workspace-album-column">专辑</span><span>时长</span><span />
    </div>}
    <ol className="workspace-track-list lune-scrollbar" data-scroll-key={flow ? undefined : 'songs'} aria-label="歌曲列表">
      {tracks.map((track, index) => {
        const key = `${track.provider}:${track.id}:${index}`;
        const justAdded = recentKey === key;
        return <li className="workspace-track-row" key={key}
          onDoubleClick={() => handlePick(track, key)}
          aria-current={current?.id === track.id && (current.provider || '') === (track.provider || '') ? 'true' : undefined}>
          {numbered && <span className="workspace-track-index" aria-hidden="true">{index + 1}</span>}
          <div className="workspace-track-identity">
            <MusicCover src={track.coverUrl} />
            <div className="workspace-track-copy"><strong title={track.name}>{track.name}</strong><small title={track.artists}>{track.artists}</small></div>
          </div>
          <span className="workspace-artist-column" title={track.artists}>{track.artists}</span>
          <div className="workspace-album-column workspace-track-album"><span title={track.album}>{track.album || '未知专辑'}</span><small>{providerLabel(track.provider || '')}</small></div>
          <span className="workspace-track-duration">{formatTime(track.duration)}</span>
          <div className="workspace-track-row-actions">
            <FavoriteButton track={track} server={server} />
            <button type="button" className={`workspace-add-track${justAdded ? ' is-added' : ''}`} disabled={!connected}
              aria-label={status === 'idle' ? `播放《${track.name}》` : `将《${track.name}》加入队列`}
              title={justAdded ? '已加入' : action} onClick={() => handlePick(track, key)}><WorkspaceIcon name={justAdded ? 'check' : status === 'idle' ? 'play' : 'add'} /></button>
          </div>
        </li>;
      })}
      {extra}
    </ol>
  </div>;
}

function SearchFeedback({ state, empty, prompt, children }: { state: SearchState; empty: boolean; prompt: string; children: ReactNode }) {
  if (state.loading) return <div className="workspace-browser-loading" role="status"><span className="sr-only">正在搜索</span>{[0, 1, 2, 3].map((row) => <i key={row} aria-hidden="true" />)}</div>;
  if (state.error) return <div className="workspace-browser-message" role="alert"><p>{state.error}</p><button type="button" onClick={state.onSearch}>重新搜索</button></div>;
  if (empty) return <div className="workspace-browser-empty" role="status"><WorkspaceIcon name="songs" /><p>{state.enabled && state.searched ? '没找到结果，试试其他关键词' : prompt}</p></div>;
  return children;
}

export default function WorkspaceMusicBrowser({ tab, active, server, source, songSources, songDefaultLabel, playlistSources, chartSources, songs, videos, videoError, partsView, playlists, onPick, onAddMany, onTabChange, containerRef, onScrollCapture, libraryViewState }: Props) {
  const connected = useRoomStore((state) => state.connected);
  const playlistList = useRef<HTMLUListElement>(null);
  const playlistScroll = useRef(0);
  const selectedCard = useRef<HTMLButtonElement | null>(null);
  const breadcrumb = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!active || tab !== 'playlists') return;
    if (playlists.view === 'detail') breadcrumb.current?.focus({ preventScroll: true });
    else if (selectedCard.current?.isConnected) {
      if (playlistList.current) playlistList.current.scrollTop = playlistScroll.current;
      selectedCard.current.focus({ preventScroll: true });
    }
  }, [active, tab, playlists.view]);

  useLayoutEffect(() => {
    playlistScroll.current = 0;
    selectedCard.current = null;
    if (playlistList.current) playlistList.current.scrollTop = 0;
  }, [server, source.value]);

  const enqueue = (track: Track) => onAddMany([track]);
  const sourcePicker = (providers: string[], defaultLabel = providerLabel('all')) => {
    if (providers.length <= 1) return null;
    return <select className="workspace-source lune-control" value={providers.includes(source.value) ? source.value : 'all'}
      onChange={(event) => source.onChange(event.target.value)} aria-label="选择音乐源">
      <option value="all">{defaultLabel}</option>
      {providers.map((id) => <option key={id} value={id}>{providerLabel(id)}</option>)}
    </select>;
  };
  const searchToolbar = (state: SearchState, label: string, providers: string[], defaultLabel?: string) => <form className="workspace-search-toolbar" role="search" aria-label={label}
    onSubmit={(event) => {
      event.preventDefault();
      if (!state.query.trim()) {
        event.currentTarget.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
        return;
      }
      if (state.enabled && !state.loading) state.onSearch();
    }}>
    <div className="library-search workspace-query">
      <input type="search" aria-label={label} value={state.query} placeholder={label} onChange={(event) => state.onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
          if (event.key === 'Escape' && state.query) {
            event.preventDefault();
            event.stopPropagation();
            state.onQueryChange('');
          }
        }} />
      <button type="submit" className={`workspace-search-submit${state.query.trim() ? ' has-query' : ''}`} disabled={!state.enabled || state.loading} aria-label={state.loading ? '正在搜索' : label} title={label}><WorkspaceIcon name="songs" /></button>
    </div>
    {sourcePicker(providers, defaultLabel)}
  </form>;

  return <section ref={containerRef} onScrollCapture={onScrollCapture} className="workspace-music-browser">
    <div className="workspace-browser-view" hidden={tab !== 'songs' || Boolean(partsView)}>
      <header className="workspace-section-heading"><h2>搜索音乐</h2></header>
      {searchToolbar(songs, '搜索歌曲或歌手', songSources, songDefaultLabel)}
      {videoError && <p className="workspace-browser-message" role="alert">{videoError}</p>}
      <SearchFeedback state={songs} empty={songs.tracks.length === 0 && videos.videos.length === 0} prompt={songs.enabled ? '输入歌名或歌手' : '选择要搜索的音源'}>
        <TrackList tracks={songs.tracks} server={server} connected={connected} onPick={onPick}
          extra={<BilibiliVideoRows {...videos} available={videos.available && connected} />} />
      </SearchFeedback>
    </div>
    <div className="workspace-browser-view" hidden={tab !== 'songs' || !partsView}>{partsView}</div>

    <div className="workspace-browser-view" hidden={tab !== 'playlists' || playlists.view !== 'list'}>
      <header className="workspace-section-heading"><h2>发现歌单</h2></header>
      {searchToolbar(playlists, '搜索歌单', playlistSources)}
      <SearchFeedback state={playlists} empty={playlists.items.length === 0} prompt={playlists.enabled ? '输入歌单名' : '选择支持歌单搜索的音源'}>
        <ul ref={playlistList} className="workspace-playlist-grid lune-scrollbar" data-scroll-key="playlists" aria-label="歌单列表">
          {playlists.items.map((playlist) => <li key={`${playlist.provider}:${playlist.id}`}>
            <button type="button" className="workspace-playlist-card" aria-label={`打开歌单《${playlist.name}》`}
              onClick={(event) => {
                selectedCard.current = event.currentTarget;
                playlistScroll.current = playlistList.current?.scrollTop || 0;
                playlists.onOpen(playlist);
              }}>
              <MusicCover src={playlist.coverUrl} className="workspace-playlist-artwork" />
              <span className="workspace-playlist-copy"><strong title={playlist.name}>{playlist.name}</strong><small title={playlist.creator}>{playlist.creator || '未知创建者'}</small><small>{playlist.trackCount} 首歌曲</small></span>
            </button>
          </li>)}
        </ul>
      </SearchFeedback>
    </div>

    <div className="workspace-browser-view" hidden={tab !== 'playlists' || playlists.view !== 'detail'}>
      {playlists.selected && <>
        <nav className="workspace-breadcrumb" aria-label="歌单位置">
          <button ref={breadcrumb} type="button" onClick={playlists.onBack}>发现歌单</button><span aria-hidden="true">/</span><span aria-current="page" title={playlists.selected.name}>{playlists.selected.name}</span>
        </nav>
        <div className="workspace-detail-scroll lune-scrollbar" data-scroll-key="detail">
          <header className="workspace-playlist-hero">
            <MusicCover src={playlists.selected.coverUrl} className="workspace-playlist-artwork" />
            <div className="workspace-playlist-description">
              <h2>{playlists.selected.name}</h2>
              <p>{playlists.selected.creator || '未知创建者'}<span aria-hidden="true"> · </span>{playlists.selected.trackCount} 首<span aria-hidden="true"> · </span>{providerLabel(playlists.selected.provider || '')}</p>
              <button type="button" className="workspace-add-all" disabled={!connected || playlists.detailLoading || playlists.tracks.length === 0}
                onClick={() => onAddMany(playlists.tracks)}>全部加入队列</button>
            </div>
          </header>
          {playlists.detailLoading ? <div className="workspace-browser-loading" role="status"><span className="sr-only">正在载入歌单</span>{[0, 1, 2, 3].map((row) => <i key={row} aria-hidden="true" />)}</div>
            : playlists.detailError ? <div className="workspace-browser-message" role="alert"><p>{playlists.detailError}</p><button type="button" onClick={() => { if (playlists.selected) playlists.onOpen(playlists.selected); }}>重新载入</button></div>
              : playlists.tracks.length === 0 ? <div className="workspace-browser-empty"><p>这个歌单还没有歌曲</p></div>
                : <TrackList tracks={playlists.tracks} server={server} connected={connected} onPick={onPick} numbered flow />}
        </div>
      </>}
    </div>

    <div className="workspace-browser-view workspace-hot-view" hidden={tab !== 'hot'}>
      <header className="workspace-section-heading"><h2>共听热榜</h2>{sourcePicker(songSources)}</header>
      <HotChartPanel providers={chartSources} serverUrl={server} active={active && tab === 'hot'} onPick={enqueue} disabled={!connected} presentation="workspace" />
    </div>

    <div className="workspace-browser-view" hidden={tab !== 'library'}>
      <header className="workspace-section-heading"><h2>我的音乐</h2></header>
      <div className="workspace-personal-scroll lune-scrollbar" data-scroll-key="library"><ListeningLibrary key={server} server={server} viewState={libraryViewState} onAdd={enqueue} onSearch={() => onTabChange('songs')} /></div>
    </div>
  </section>;
}
