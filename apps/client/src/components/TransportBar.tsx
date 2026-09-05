import type { CSSProperties } from 'react';
import type { Track } from '@lune/shared';
import HeartButton from './HeartButton';
import { useVolumeStore } from '../hooks/useVolumeStore';
import { formatTime } from '../lib/format';
import VolumeIcon from './VolumeIcon';
import { getServerBaseUrl } from '../lib/serverConfig';

interface TransportBarProps {
  track: Track | null;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  isOwner: boolean;
  membersCount: number;
  onSeek: (ms: number) => void;
  onNext: () => void;
  onSendHeart: (track: Track) => Promise<void>;
}

export default function TransportBar({
  track,
  currentTime,
  duration,
  isBuffering,
  isOwner,
  membersCount,
  onSeek,
  onNext,
  onSendHeart,
}: TransportBarProps) {
  const volume = useVolumeStore((state) => state.volume);
  const muted = useVolumeStore((state) => state.muted);
  const setVolume = useVolumeStore((state) => state.setVolume);
  const toggleMute = useVolumeStore((state) => state.toggleMute);
  const safeDuration = duration || track?.duration || 0;
  const progress = safeDuration > 0 ? Math.min(currentTime, safeDuration) / safeDuration : 0;
  const volumePercent = Math.round(volume * 100);

  const progressStyle = {
    '--transport-progress': `${progress * 100}%`,
  } as CSSProperties;

  const volumeStyle = {
    '--volume-progress': `${volume * 100}%`,
  } as CSSProperties;

  return (
    <section className="transport-bar" aria-label="播放控制">
      <label className={`transport-progress ${isOwner ? '' : 'is-locked'}`} style={progressStyle}>
        <span className="sr-only">播放进度</span>
        <input
          type="range"
          min={0}
          max={Math.max(safeDuration, 1)}
          step={1000}
          value={Math.min(currentTime, safeDuration)}
          onChange={(event) => onSeek(Number(event.target.value))}
          disabled={!isOwner || safeDuration <= 0}
          aria-label="播放进度"
        />
      </label>

      <div className="transport-track">
        <div className="transport-cover">
          {track?.coverUrl ? <img src={track.coverUrl} alt="" /> : <span>L</span>}
        </div>
        <div className="transport-copy">
          <span>{isBuffering ? '正在缓冲' : track ? '正在播放' : '未播放'}</span>
          <strong>{track?.name || '还没有音乐'}</strong>
          {track?.artists && <small>{track.artists}</small>}
        </div>
      </div>

      <div className="transport-sync">
        <span className={`sync-state-dot ${track ? 'is-active' : ''}`} />
        <div>
          <strong>同步播放</strong>
          <small>{membersCount} 人正在听</small>
        </div>
      </div>

      <div className="transport-time" aria-label="播放时间">
        <strong>{formatTime(currentTime)}</strong>
        <span>/</span>
        <small>{formatTime(safeDuration)}</small>
      </div>

      <div className="transport-actions">
        <HeartButton track={track} onSendHeart={onSendHeart} sessionScope={getServerBaseUrl()} className="transport-heart" />

        <div className="transport-volume" style={volumeStyle}>
          <button
            type="button"
            className={`transport-volume-toggle ${muted ? 'is-muted' : ''}`}
            onClick={toggleMute}
            aria-label={muted ? '恢复本机音量' : '静音本机播放'}
            aria-pressed={muted}
            title={muted ? '恢复音量' : '静音'}
          >
            <VolumeIcon volume={volume} muted={muted} />
          </button>
          <label className="transport-volume-slider">
            <span className="sr-only">本机音量</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
              aria-label="本机音量"
              aria-valuetext={muted ? '静音' : `${volumePercent}%`}
            />
          </label>
          <output className="transport-volume-value" aria-hidden="true">
            {volumePercent}%
          </output>
        </div>

        <button
          type="button"
          className="transport-next"
          onClick={onNext}
          disabled={!isOwner || !track}
          title={isOwner ? '播放下一首' : '仅房主可切歌'}
        >
          <span>下一首</span>
        </button>
      </div>
    </section>
  );
}
