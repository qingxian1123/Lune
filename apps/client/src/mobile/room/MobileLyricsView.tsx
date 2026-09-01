import type { MouseEvent } from 'react';
import type { LyricLine, Track } from '@lune/shared';
import LyricScroller from '../../components/LyricScroller';
import MobileTimeline from './MobileTimeline';

interface MobileLyricsViewProps {
  track: Track | null | undefined;
  lines: LyricLine[];
  currentIndex: number;
  isLoadingLyrics: boolean;
  currentTime: number;
  duration: number;
  membersCount: number;
  onShowPlayer: () => void;
  onSeek: (position: number) => void;
}

export default function MobileLyricsView({
  track,
  lines,
  currentIndex,
  isLoadingLyrics,
  currentTime,
  duration,
  membersCount,
  onShowPlayer,
  onSeek,
}: MobileLyricsViewProps) {
  const handleBackgroundClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as Element | null;
    if (target?.closest?.('.lyric-item')) return;
    onShowPlayer();
  };

  return (
    <>
      <main className="m-lyric-full m-view-fade" onClick={handleBackgroundClick}>
        {isLoadingLyrics ? (
          <div className="m-lyric-empty">
            <strong>正在载入歌词</strong>
          </div>
        ) : lines.length === 0 ? (
          <div className="m-lyric-empty">
            <strong>{track ? '暂无歌词' : '等待音乐'}</strong>
            {!track && <small>播放后显示歌词</small>}
          </div>
        ) : (
          <LyricScroller lines={lines} activeIndex={currentIndex} />
        )}
      </main>

      <section className="m-lyric-bottom">
        <MobileTimeline currentTime={currentTime} duration={duration} onSeek={onSeek} />

        <button type="button" className="m-mini-bar" onClick={onShowPlayer}>
          <div className="m-mini-cover">
            {track?.coverUrl ? <img src={track.coverUrl} alt="" /> : <span>L</span>}
          </div>
          <div className="m-mini-copy">
            <strong>{track?.name || '还没有音乐'}</strong>
            <small>{membersCount} 人在听</small>
          </div>
          <span className="m-eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>
      </section>
    </>
  );
}
