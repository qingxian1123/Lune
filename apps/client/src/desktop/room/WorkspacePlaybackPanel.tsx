import type { LyricLine, QueueItem, Track } from '@lune/shared';
import { useState } from 'react';
import LyricScroller from '../../components/LyricScroller';
import FavoriteButton from '../../features/library/FavoriteButton';

interface Props {
  track: Track | null;
  queue: QueueItem[];
  lines: LyricLine[];
  currentIndex: number;
  loadingLyrics: boolean;
  onShowQueue: () => void;
  onClose: () => void;
}

export default function WorkspacePlaybackPanel({ track, queue, lines, currentIndex, loadingLyrics, onShowQueue, onClose }: Props) {
  const [failedCover, setFailedCover] = useState('');
  const cover = track?.coverUrl && failedCover !== track.coverUrl ? track.coverUrl : '';
  const next = queue[0]?.track;

  return <aside id="workspace-playback-panel" className="workspace-playback-panel" aria-label="播放详情">
    <header className="workspace-playback-heading">
      <h2>正在播放</h2>
      <button type="button" className="workspace-playback-close" onClick={onClose} aria-label="收起播放详情"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
    </header>
    {track ? <>
      <div className="workspace-playback-cover">
        {cover ? <img key={cover} src={cover} alt="" onError={() => setFailedCover(cover)} /> : <span aria-hidden="true">L</span>}
      </div>
      <div className="workspace-playback-track">
        <div><strong title={track.name}>{track.name}</strong><span title={track.artists}>{track.artists}</span></div>
        <FavoriteButton track={track} />
      </div>
      <section className="workspace-playback-lyrics" aria-label="歌词">
        <h3>歌词</h3>
        {loadingLyrics ? <p role="status">正在载入歌词</p> : lines.length === 0 ? <p>暂无歌词</p>
          : <LyricScroller lines={lines} activeIndex={currentIndex} highlightCredits />}
      </section>
    </> : <div className="workspace-playback-empty">还没有音乐</div>}
    <section className="workspace-playback-next" aria-label="接下来">
      <h3>接下来</h3>
      {next ? <button type="button" onClick={onShowQueue} aria-label={`查看播放队列，下一首 ${next.name}`}>
        <span className="workspace-playback-next-cover">{next.coverUrl && <img src={next.coverUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
        <span><strong>{next.name}</strong><small>{next.artists}</small></span>
      </button> : <p>队列为空</p>}
    </section>
  </aside>;
}
