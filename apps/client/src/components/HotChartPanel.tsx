import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Track } from '@lune/shared';
import { getHotChart } from '../lib/api';
import { HeartIcon } from './HeartButton';

export const providerLabel = (provider: string): string =>
  ({ all: '全部音源', netease: '网易云音乐', kugou: '酷狗音乐' })[provider] || provider;

export default function HotChartPanel({ provider, serverUrl, active, onPick }: {
  provider: string; serverUrl: string; active: boolean; onPick: (track: Track) => void;
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
  return <div className="hot-chart">
    <div className="hot-chart-heading">
      <div><h3>近 7 天热榜</h3><p>按最近 168 小时收到的爱心排序</p></div>
      <button type="button" className="lune-control" disabled={chart.isFetching} onClick={() => void chart.refetch()}>刷新</button>
    </div>
    {chart.isFetching && <div className={chart.data ? 'sr-only' : 'hot-chart-state'} role="status">正在读取近 7 天热度</div>}
    {chart.isError && <div className="hot-chart-state" role="alert"><strong>热榜暂时无法载入</strong><p>请检查服务器连接后重试</p><button type="button" className="lune-control" onClick={() => void chart.refetch()}>重新载入</button></div>}
    {chart.data?.tracks.length === 0 && <div className="hot-chart-state" role="status"><HeartIcon /><strong>近 7 天还没有收到爱心</strong><p>播放一首歌，送出这里的第一颗心吧</p></div>}
    <ol className="hot-chart-list lune-scrollbar" aria-label="近 7 天热榜歌曲">
        {chart.data?.tracks.map(({ rank, track, heartCount }) => <li key={`${track.provider}:${track.id}`} className={`hot-chart-row hot-rank-${rank}`}>
          <span className="hot-chart-rank">{String(rank).padStart(2, '0')}</span>
          <div className="hot-chart-cover">{track.coverUrl && <img src={track.coverUrl} alt="" loading="lazy" />}</div>
          <div className="hot-chart-track"><strong title={track.name}>{track.name}</strong><small title={track.artists}>{track.artists} · {providerLabel(track.provider || '')}</small><span className="hot-chart-count"><HeartIcon />{heartCount.toLocaleString('zh-CN')}<span className="sr-only">颗爱心</span></span></div>
          <button type="button" className="lune-control" aria-label={`将《${track.name}》加入队列`} onClick={() => { onPick(track); setAdded(`已请求加入《${track.name}》`); }}>加入</button>
        </li>)}
      </ol>
    <span role="status" className="sr-only">{added}</span>
  </div>;
}
