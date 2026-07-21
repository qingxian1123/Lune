import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Track } from '@lune/shared';
import { useFavoriteStore } from '../hooks/useFavoriteStore';
import { formatTime } from '../lib/format';

interface TransportBarProps {
  track: Track | null;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
  isOwner: boolean;
  membersCount: number;
  onSeek: (ms: number) => void;
  onVolume: (volume: number) => void;
  onNext: () => void;
}

export default function TransportBar({
  track,
  currentTime,
  duration,
  isBuffering,
  isOwner,
  membersCount,
  onSeek,
  onVolume,
  onNext,
}: TransportBarProps) {
  const isFavorite = useFavoriteStore((state) => state.isFavorite);
  const toggleFavorite = useFavoriteStore((state) => state.toggle);
  const [volume, setVolume] = useState(0.8);
  const safeDuration = duration || track?.duration || 0;
  const progress = safeDuration > 0 ? Math.min(currentTime, safeDuration) / safeDuration : 0;
  const favorite = track ? isFavorite(track.id) : false;

  useEffect(() => {
    onVolume(volume);
  }, [onVolume, volume]);

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
          <span>{isBuffering ? '正在缓冲' : track ? '正在播放' : '尚未播放'}</span>
          <strong>{track?.name || '等待播放'}</strong>
          <small>{track?.artists || 'Lune 共听房间'}</small>
        </div>
      </div>

      <div className="transport-sync">
        <span className={`sync-state-dot ${track ? 'is-active' : ''}`} />
        <div>
          <strong>{isOwner ? '由你控制播放' : '与房主同步'}</strong>
          <small>{membersCount} 人正在听</small>
        </div>
      </div>

      <div className="transport-time" aria-label="播放时间">
        <strong>{formatTime(currentTime)}</strong>
        <span>/</span>
        <small>{formatTime(safeDuration)}</small>
      </div>

      <div className="transport-actions">
        <button
          type="button"
          className={`terminal-icon-button ${favorite ? 'is-active' : ''}`}
          onClick={() => track && toggleFavorite(track.id)}
          disabled={!track}
          aria-label={favorite ? '取消喜欢' : '喜欢'}
          title={favorite ? '取消喜欢' : '喜欢'}
        >
          {favorite ? '♥' : '♡'}
        </button>

        <label className="transport-volume" style={volumeStyle}>
          <span>音量</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="音量"
          />
        </label>

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
