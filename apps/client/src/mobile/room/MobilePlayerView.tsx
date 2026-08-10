import type { Track } from '@lune/shared';
import MobileTimeline from './MobileTimeline';
import type { MobileRoomSheet, MobileRoomSheetState } from './types';

interface MobilePlayerViewProps {
  track: Track | null | undefined;
  lyricPreview: string | null;
  isLoadingLyrics: boolean;
  isBuffering: boolean;
  favorite: boolean;
  currentTime: number;
  duration: number;
  activeSheet: MobileRoomSheetState;
  queueCount: number;
  membersCount: number;
  onShowLyrics: () => void;
  onSearch: () => void;
  onToggleFavorite: () => void;
  onNext: () => void;
  onSeek: (position: number) => void;
  onOpenSheet: (sheet: MobileRoomSheet) => void;
}

export default function MobilePlayerView({
  track,
  lyricPreview,
  isLoadingLyrics,
  isBuffering,
  favorite,
  currentTime,
  duration,
  activeSheet,
  queueCount,
  membersCount,
  onShowLyrics,
  onSearch,
  onToggleFavorite,
  onNext,
  onSeek,
  onOpenSheet,
}: MobilePlayerViewProps) {
  return (
    <>
      <main className="m-player-main m-view-fade">
        {track ? (
          <>
            <div className="m-cover-zone">
              <div className="m-cover-halo" aria-hidden="true" />
              <button
                type="button"
                className="m-cover-wrap"
                onClick={onShowLyrics}
                aria-label="查看歌词"
              >
                <div className="m-cover">
                  {track.coverUrl ? (
                    <img src={track.coverUrl} alt={`${track.album} 专辑封面`} />
                  ) : (
                    <div className="m-cover-placeholder">
                      <span>LUNE</span>
                    </div>
                  )}
                </div>
              </button>
            </div>

            <div className="m-track-id">
              <h2>{track.name}</h2>
              <p>{track.artists}</p>
            </div>

            <button type="button" className="m-lyric-peek" onClick={onShowLyrics}>
              {isLoadingLyrics ? (
                <span className="m-peek-cur is-muted">正在载入歌词</span>
              ) : lyricPreview ? (
                <span className="m-peek-cur">{lyricPreview}</span>
              ) : (
                <span className="m-peek-cur is-muted">暂无歌词</span>
              )}
            </button>
          </>
        ) : (
          <div className="m-cover-zone">
            <div className="m-empty-stage">
              <div className="m-empty-moon" aria-hidden="true" />
              <strong>还没有音乐</strong>
              <small>从搜索中添加歌曲</small>
              <button type="button" className="m-empty-cta" onClick={onSearch}>
                搜索音乐
              </button>
            </div>
          </div>
        )}
      </main>

      <section className="m-player-bottom" aria-label="播放控制">
        <MobileTimeline
          currentTime={currentTime}
          duration={duration}
          isBuffering={isBuffering}
          onSeek={onSeek}
        />

        <div className="m-controls">
          <button
            type="button"
            className={`m-ctl m-heart ${favorite ? 'is-on' : ''}`}
            onClick={onToggleFavorite}
            disabled={!track}
            aria-label={favorite ? '取消喜欢' : '喜欢'}
          >
            {favorite ? '♥' : '♡'}
          </button>

          <button type="button" className="m-next" onClick={onNext} disabled={!track}>
            <span>下一首</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" />
              <rect x="17.5" y="4" width="2.4" height="16" rx="1.2" fill="currentColor" />
            </svg>
          </button>

          <button
            type="button"
            className="m-ctl"
            onClick={() => onOpenSheet('volume')}
            aria-label="音量"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
              <path
                d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </section>

      <nav className="m-dock" aria-label="房间音乐库">
        <button
          type="button"
          className={activeSheet === 'search' ? 'is-active' : undefined}
          onClick={() => onOpenSheet('search')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <line
              x1="21"
              y1="21"
              x2="16.5"
              y2="16.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <b>搜索</b>
        </button>
        <button
          type="button"
          className={activeSheet === 'queue' ? 'is-active' : undefined}
          onClick={() => onOpenSheet('queue')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="13" y2="18" />
            </g>
            <polygon points="17 15 22 18 17 21 17 15" fill="currentColor" />
          </svg>
          <b>
            队列 <span className="m-cnt">{queueCount}</span>
          </b>
        </button>
        <button
          type="button"
          className={activeSheet === 'members' ? 'is-active' : undefined}
          onClick={() => onOpenSheet('members')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
              <circle cx="17.5" cy="9" r="2.6" />
              <path d="M16.5 14.2c2.9.3 5 2.4 5 5.3" />
            </g>
          </svg>
          <b>
            成员 <span className="m-cnt">{membersCount}</span>
          </b>
        </button>
      </nav>
    </>
  );
}
