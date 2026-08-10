import type { CSSProperties } from 'react';
import { formatTime } from '../../lib/format';

interface MobileTimelineProps {
  currentTime: number;
  duration: number;
  isBuffering?: boolean;
  onSeek: (position: number) => void;
}

export default function MobileTimeline({
  currentTime,
  duration,
  isBuffering = false,
  onSeek,
}: MobileTimelineProps) {
  const progressRatio = duration > 0 ? Math.min(currentTime, duration) / duration : 0;
  const progressStyle = { '--m-progress': `${progressRatio * 100}%` } as CSSProperties;

  return (
    <>
      <label className={isBuffering ? 'm-progress is-buffering' : 'm-progress'} style={progressStyle}>
        <span className="sr-only">播放进度</span>
        <input
          type="range"
          min={0}
          max={Math.max(duration, 1)}
          step={1000}
          value={Math.min(currentTime, duration)}
          onChange={(event) => onSeek(Number(event.target.value))}
          disabled={duration <= 0}
          aria-label="播放进度"
        />
      </label>
      <div className="m-times">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </>
  );
}
