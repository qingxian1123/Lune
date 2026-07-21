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
          <span className="stage-kicker">正在播放</span>
          <strong>{track ? '与房间保持同步' : '选择一首歌开始'}</strong>
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
                  <small>等待音乐</small>
                </div>
              )}
            </div>
          </div>

          <div className="track-identity">
            <div className="track-number">{track ? '正在播放' : '音乐尚未开始'}</div>
            <h2>{track?.name || '等待播放'}</h2>
            <p>{track?.artists || '房主选择歌曲后将自动开始同步'}</p>
            {track?.album && <span>{track.album}</span>}
          </div>
        </div>

        <div className="lyric-terminal">
          {isLoadingLyrics ? (
            <div className="lyric-empty">
              <span className="loading-dots"><i /><i /><i /></span>
              <strong>正在载入歌词</strong>
              <small>稍等片刻</small>
            </div>
          ) : lines.length === 0 ? (
            <div className="lyric-empty">
              <span className="empty-line" />
              <strong>{track ? '暂无歌词' : '等待音乐开始'}</strong>
              <small>{track ? '这首歌暂时没有歌词' : '播放开始后，歌词将在这里同步出现'}</small>
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
