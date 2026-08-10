import type { LyricLine, Track } from '@lune/shared';
import LyricScroller from './LyricScroller';

interface NowPlayingProps {
  track: Track | null;
  lines: LyricLine[];
  currentIndex: number;
  isLoadingLyrics: boolean;
  isBuffering: boolean;
  isOwner: boolean;
  membersCount?: number;
  onSeek: (ms: number) => void;
}

export default function NowPlaying({
  track,
  lines,
  currentIndex,
  isLoadingLyrics,
  isBuffering,
  isOwner,
  membersCount = 0,
  onSeek,
}: NowPlayingProps) {
  return (
    <section className="now-playing-stage" aria-label="正在播放">
        <header className="stage-heading">
          <div>
            <strong>{track ? '同步播放' : '选择音乐'}</strong>
          </div>
        <div className="stage-status">
          <span className={track ? 'is-live' : ''} />
          {isBuffering ? '正在缓冲' : `${membersCount} 人正在听`}
        </div>
      </header>

      <div className="stage-content">
        <div className="record-column">
          <div className="cover-stack">
            <div className="cover-main">
              {track?.coverUrl ? (
                <img src={track.coverUrl} alt={`${track.album} 专辑封面`} />
              ) : (
              <div className="cover-placeholder">
                <span>LUNE</span>
              </div>
              )}
            </div>
          </div>

          <div className="track-identity">
          <h2>{track?.name || '还没有音乐'}</h2>
          <p>{track?.artists || '从音乐库添加歌曲'}</p>
            {track?.album && <span>{track.album}</span>}
          </div>
        </div>

        <div className="lyric-terminal">
          {isLoadingLyrics ? (
            <div className="lyric-empty">
              <span className="loading-dots"><i /><i /><i /></span>
            <strong>正在载入歌词</strong>
            </div>
          ) : lines.length === 0 ? (
            <div className="lyric-empty">
              <span className="empty-line" />
            <strong>{track ? '暂无歌词' : '等待音乐'}</strong>
            {!track && <small>播放后显示歌词</small>}
            </div>
          ) : (
            <LyricScroller
              lines={lines}
              activeIndex={currentIndex}
              isOwner={isOwner}
              onSeek={onSeek}
            />
          )}
        </div>
      </div>
    </section>
  );
}
