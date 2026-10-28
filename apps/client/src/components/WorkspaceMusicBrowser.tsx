import { useLayoutEffect, useRef, useState } from 'react';
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

interface SearchState {
  query: string;
  loading: boolean;
  error: string;
  searched: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
}

interface Props {
  tab: SearchPanelTab;
  active: boolean;
  server: string;
  source: { value: string; providers: string[]; onChange: (value: string) => void };
  songs: SearchState & { tracks: Track[] };
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

function TrackList({ tracks, server, connected, onPick, numbered = false, flow = false }: {
  tracks: Track[]; server: string; connected: boolean; onPick: (track: Track) => void; numbered?: boolean; flow?: boolean;
}) {
  return <div className={`workspace-track-table${numbered ? ' is-numbered' : ''}${flow ? ' is-flow' : ''}`}>
    <div className="workspace-track-columns" aria-hidden="true">
      {numbered && <span>序号</span>}<span>歌曲</span><span className="workspace-album-column">专辑</span><span>时长</span><span />
    </div>
    <ol className="workspace-track-list lune-scrollbar" data-scroll-key={flow ? undefined : 'songs'} aria-label="歌曲列表">
      {tracks.map((track, index) => <li className="workspace-track-row" key={`${track.provider}:${track.id}:${index}`}>
        {numbered && <span className="workspace-track-index" aria-hidden="true">{index + 1}</span>}
        <div className="workspace-track-identity">
          <MusicCover src={track.coverUrl} />
          <div className="workspace-track-copy"><strong title={track.name}>{track.name}</strong><small title={track.artists}>{track.artists}</small></div>
        </div>
        <div className="workspace-album-column workspace-track-album"><span title={track.album}>{track.album || '未知专辑'}</span><small>{providerLabel(track.provider || '')}</small></div>
        <span className="workspace-track-duration">{formatTime(track.duration)}</span>
        <div className="workspace-track-row-actions">
          <FavoriteButton track={track} server={server} />
          <button type="button" className="workspace-add-track" disabled={!connected}
            aria-label={`将《${track.name}》加入队列`} title={connected ? '加入队列' : '连接房间后可加入队列'} onClick={() => onPick(track)}><WorkspaceIcon name="add" /></button>
        </div>
      </li>)}
    </ol>
  </div>;
}

function SearchFeedback({ state, empty, children }: { state: SearchState; empty: boolean; children: ReactNode }) {
  if (state.loading) return <div className="workspace-browser-loading" role="status"><span className="sr-only">正在搜索</span>{[0, 1, 2, 3].map((row) => <i key={row} aria-hidden="true" />)}</div>;
  if (state.error) return <div className="workspace-browser-message" role="alert"><p>{state.error}</p><button type="button" onClick={state.onSearch}>重新搜索</button></div>;
  if (empty) return <div className="workspace-browser-empty"><WorkspaceIcon name="songs" /><p>{state.searched ? '没有找到相关内容，换个关键词试试' : '搜索喜欢的音乐，和朋友一起听'}</p></div>;
  return children;
}

export default function WorkspaceMusicBrowser({ tab, active, server, source, songs, playlists, onPick, onAddMany, onTabChange, containerRef, onScrollCapture, libraryViewState }: Props) {
  const connected = useRoomStore((state) => state.connected);
  const [notice, setNotice] = useState('');
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

  const pick = (track: Track) => {
    onPick(track);
    setNotice(`已请求将《${track.name}》加入队列`);
  };
  const enqueue = (track: Track) => {
    onAddMany([track]);
    setNotice(`已请求将《${track.name}》加入队列`);
  };
  const sourcePicker = <select className="workspace-source lune-control" value={source.value} disabled={source.providers.length === 0}
    onChange={(event) => source.onChange(event.target.value)} aria-label="选择音乐源">
    {['all', ...source.providers].map((provider) => <option key={provider} value={provider}>{providerLabel(provider)}</option>)}
  </select>;
  const searchToolbar = (state: SearchState, label: string) => <form className="workspace-search-toolbar" role="search" aria-label={label}
    onSubmit={(event) => { event.preventDefault(); if (!state.loading && state.query.trim()) state.onSearch(); }}>
    <div className="library-search workspace-query">
      <input type="search" aria-label={label} value={state.query} placeholder={label} onChange={(event) => state.onQueryChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} />
      <button type="submit" className="workspace-search-submit" disabled={state.loading || !state.query.trim()} aria-label={state.loading ? '正在搜索' : label} title={label}><WorkspaceIcon name="songs" /></button>
    </div>
    {sourcePicker}
  </form>;

  return <section ref={containerRef} onScrollCapture={onScrollCapture} className="workspace-music-browser">
    <div className="workspace-browser-view" hidden={tab !== 'songs'}>
      <header className="workspace-section-heading"><h2>搜索音乐</h2></header>
      {searchToolbar(songs, '搜索歌曲或歌手')}
      <SearchFeedback state={songs} empty={songs.tracks.length === 0}>
        <TrackList tracks={songs.tracks} server={server} connected={connected} onPick={pick} />
      </SearchFeedback>
    </div>

    <div className="workspace-browser-view" hidden={tab !== 'playlists' || playlists.view !== 'list'}>
      <header className="workspace-section-heading"><h2>发现歌单</h2></header>
      {searchToolbar(playlists, '搜索歌单名')}
      <SearchFeedback state={playlists} empty={playlists.items.length === 0}>
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
              <p>{playlists.selected.creator || '未知创建者'}<span aria-hidden="true"> · </span>{playlists.selected.trackCount} 首<span aria-hidden="true"> · </span>{providerLabel(playlists.selected.provider || source.value)}</p>
              <button type="button" className="workspace-add-all" disabled={!connected || playlists.detailLoading || playlists.tracks.length === 0}
                title={connected ? '把整个歌单加入待播队列' : '连接房间后可加入队列'} onClick={() => { onAddMany(playlists.tracks); setNotice('已请求将歌单加入队列'); }}>全部加入队列</button>
            </div>
          </header>
          {playlists.detailLoading ? <div className="workspace-browser-loading" role="status"><span className="sr-only">正在载入歌单</span>{[0, 1, 2, 3].map((row) => <i key={row} aria-hidden="true" />)}</div>
            : playlists.detailError ? <div className="workspace-browser-message" role="alert"><p>{playlists.detailError}</p><button type="button" onClick={() => { if (playlists.selected) playlists.onOpen(playlists.selected); }}>重新载入</button></div>
              : playlists.tracks.length === 0 ? <div className="workspace-browser-empty"><p>这个歌单还没有歌曲</p></div>
                : <TrackList tracks={playlists.tracks} server={server} connected={connected} onPick={pick} numbered flow />}
        </div>
      </>}
    </div>

    <div className="workspace-browser-view" hidden={tab !== 'hot'}>
      <header className="workspace-section-heading"><h2>共听热榜</h2>{sourcePicker}</header>
      <HotChartPanel provider={source.value} serverUrl={server} active={active && tab === 'hot'} onPick={enqueue} disabled={!connected} />
    </div>

    <div className="workspace-browser-view" hidden={tab !== 'library'}>
      <header className="workspace-section-heading"><h2>我的音乐</h2></header>
      <div className="workspace-personal-scroll lune-scrollbar" data-scroll-key="library"><ListeningLibrary key={server} server={server} viewState={libraryViewState} onAdd={enqueue} onSearch={() => onTabChange('songs')} /></div>
    </div>
    <span className="sr-only" role="status">{notice}</span>
  </section>;
}
