import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Track } from '@lune/shared';
import { getHotChart } from '../lib/api';
import { formatTime } from '../lib/format';
import { HeartIcon } from './HeartButton';
import FavoriteButton from '../features/library/FavoriteButton';
import { useRoomStore } from '../hooks/useRoomStore';
import { WorkspaceIcon } from '../desktop/room/WorkspaceNavigation';

export const providerLabel = (provider: string): string =>
  ({ all: '全部音源', netease: '网易云音乐', kugou: '酷狗音乐' })[provider] || provider;

function MusicCover({ src }: { src?: string }) {
  return <span className="workspace-music-cover">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13M9 8l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="17" cy="16" rx="3" ry="2" /></svg>
    {src && <img key={src} src={src} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
  </span>;
}

function WorkspaceHotChart({ serverUrl, disabled, added, onPick, tracks, fetching, error, onRetry }: {
  serverUrl: string;
  disabled: boolean;
  added: string;
  onPick: (track: Track) => void;
  tracks: { rank: number; track: Track; heartCount: number }[] | undefined;
  fetching: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const current = useRoomStore((state) => state.playback.track);
  return <div className="workspace-hot">
    <div className="workspace-hot-banner" aria-hidden="true">
      <div className="workspace-hot-banner-copy">
        <span>共听热榜</span>
        <strong>TOP 50</strong>
      </div>
      <i className="workspace-hot-orb workspace-hot-orb-a" />
      <i className="workspace-hot-orb workspace-hot-orb-b" />
      <svg className="workspace-hot-note" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13" /><ellipse cx="6" cy="18" rx="3.2" ry="2.2" /></svg>
    </div>
    {fetching && !tracks && <div className="workspace-browser-loading" role="status"><span className="sr-only">正在读取近 7 天热度</span>{[0, 1, 2, 3].map((row) => <i key={row} aria-hidden="true" />)}</div>}
    {fetching && tracks && <div className="sr-only" role="status">正在读取近 7 天热度</div>}
    {error && <div className="workspace-browser-message" role="alert"><p>热榜暂时无法载入。请检查服务器连接后重试。</p><button type="button" onClick={onRetry}>重新载入</button></div>}
    {tracks?.length === 0 && <div className="workspace-browser-empty" role="status"><p>近 7 天还没有收到爱心。播放一首歌，送出这里的第一颗心吧。</p></div>}
    {!!tracks?.length && <div className="workspace-track-table is-numbered">
      <div className="workspace-track-columns" aria-hidden="true">
        <span>#</span><span>歌曲</span><span className="workspace-artist-column">歌手</span><span className="workspace-album-column">专辑</span><span>时长</span><span />
      </div>
      <ol className="workspace-track-list lune-scrollbar" data-scroll-key="hot" aria-label="近 7 天热榜歌曲">
        {tracks.map(({ rank, track, heartCount }) => <li className="workspace-track-row" key={`${track.provider}:${track.id}`}
          aria-current={current?.id === track.id && (current.provider || '') === (track.provider || '') ? 'true' : undefined}>
          <span className="workspace-track-index">{String(rank).padStart(2, '0')}</span>
          <div className="workspace-track-identity">
            <MusicCover src={track.coverUrl} />
            <div className="workspace-track-copy">
              <strong title={track.name}>{track.name}</strong>
              <small title={track.artists}>{track.artists}</small>
              <span className="workspace-hot-hearts" title={`${heartCount.toLocaleString('zh-CN')} 颗爱心`}>{heartCount.toLocaleString('zh-CN')}<span className="sr-only">颗爱心</span></span>
            </div>
          </div>
          <span className="workspace-artist-column" title={track.artists}>{track.artists}</span>
          <div className="workspace-album-column workspace-track-album"><span title={track.album}>{track.album || '未知专辑'}</span><small>{providerLabel(track.provider || '')}</small></div>
          <span className="workspace-track-duration">{formatTime(track.duration)}</span>
          <div className="workspace-track-row-actions">
            <FavoriteButton track={track} server={serverUrl} />
            <button type="button" className="workspace-add-track" disabled={disabled}
              aria-label={`将《${track.name}》加入队列`} title={disabled ? '连接房间后可加入队列' : '加入队列'}
              onClick={() => onPick(track)}><WorkspaceIcon name="add" /></button>
          </div>
        </li>)}
      </ol>
    </div>}
    <span role="status" className="sr-only">{added}</span>
  </div>;
}

export default function HotChartPanel({ provider, serverUrl, active, onPick, disabled = false, presentation = 'compact' }: {
  provider: string; serverUrl: string; active: boolean; onPick: (track: Track) => void; disabled?: boolean;
  presentation?: 'compact' | 'workspace';
}) {
  const [added, setAdded] = useState('');
  const chart = useQuery({
    queryKey: ['hot-chart', serverUrl, provider],
    queryFn: ({ signal }) => getHotChart(serverUrl, provider, signal),
    enabled: active,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const pick = (track: Track) => {
    onPick(track);
    setAdded(`已请求加入《${track.name}》`);
  };
  if (presentation === 'workspace') {
    return <WorkspaceHotChart serverUrl={serverUrl} disabled={disabled} added={added} onPick={pick} tracks={chart.data?.tracks}
      fetching={chart.isFetching} error={chart.isError} onRetry={() => void chart.refetch()} />;
  }
  return <div className="hot-chart">
    <div className="hot-chart-heading">
      <div><h3>近 7 天热榜</h3><p>按最近 168 小时收到的爱心排序</p></div>
      <button type="button" className="lune-control" disabled={chart.isFetching} onClick={() => void chart.refetch()}>刷新</button>
    </div>
    {chart.isFetching && <div className={chart.data ? 'sr-only' : 'hot-chart-state'} role="status">正在读取近 7 天热度</div>}
    {chart.isError && <div className="hot-chart-state" role="alert"><strong>热榜暂时无法载入</strong><p>请检查服务器连接后重试</p><button type="button" className="lune-control" onClick={() => void chart.refetch()}>重新载入</button></div>}
    {chart.data?.tracks.length === 0 && <div className="hot-chart-state" role="status"><HeartIcon /><strong>近 7 天还没有收到爱心</strong><p>播放一首歌，送出这里的第一颗心吧</p></div>}
    <ol className="hot-chart-list lune-scrollbar" data-scroll-key="hot" aria-label="近 7 天热榜歌曲">
        {chart.data?.tracks.map(({ rank, track, heartCount }) => <li key={`${track.provider}:${track.id}`} className={`hot-chart-row hot-rank-${rank}`}>
          <span className="hot-chart-rank">{String(rank).padStart(2, '0')}</span>
          <div className="hot-chart-cover">{track.coverUrl && <img src={track.coverUrl} alt="" loading="lazy" />}</div>
          <div className="hot-chart-track"><strong title={track.name}>{track.name}</strong><small title={track.artists}>{track.artists} · {providerLabel(track.provider || '')}</small><span className="hot-chart-count"><HeartIcon />{heartCount.toLocaleString('zh-CN')}<span className="sr-only">颗爱心</span></span></div>
          <button type="button" className="lune-control" disabled={disabled} title={disabled ? '连接房间后可加入队列' : '加入队列'} aria-label={`将《${track.name}》加入队列`} onClick={() => pick(track)}>加入</button>
        </li>)}
      </ol>
    <span role="status" className="sr-only">{added}</span>
  </div>;
}
