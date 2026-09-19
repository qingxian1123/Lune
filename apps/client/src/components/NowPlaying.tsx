import { useEffect, useRef, useState } from 'react';
import type { LyricLine, Track } from '@lune/shared';
import LyricScroller from './LyricScroller';
import { deriveCoverGlow, quantizeDominant } from '../lib/color';
import './playback-stage.css';

interface NowPlayingProps {
  track: Track | null;
  lines: LyricLine[];
  currentIndex: number;
  isLoadingLyrics: boolean;
  libraryOpen?: boolean;
}

interface BackdropLayer {
  id: number;
  color: string;
  active: boolean;
}

export default function NowPlaying({
  track,
  lines,
  currentIndex,
  isLoadingLyrics,
  libraryOpen,
}: NowPlayingProps) {
  const [coverError, setCoverError] = useState(false);
  const [layers, setLayers] = useState<BackdropLayer[]>([]);
  const nextIdRef = useRef(1);
  const loadGenRef = useRef(0);
  const cleanupTimerRef = useRef<number | null>(null);
  const rafId1Ref = useRef<number | null>(null);
  const rafId2Ref = useRef<number | null>(null);
  const activeImgRef = useRef<HTMLImageElement | null>(null);

  const cancelRaf = () => {
    if (rafId1Ref.current !== null) {
      cancelAnimationFrame(rafId1Ref.current);
      rafId1Ref.current = null;
    }
    if (rafId2Ref.current !== null) {
      cancelAnimationFrame(rafId2Ref.current);
      rafId2Ref.current = null;
    }
  };

  useEffect(() => {
    setCoverError(false);
  }, [track?.coverUrl]);

  useEffect(() => {
    const currentUrl = track?.coverUrl?.trim() || '';
    const gen = ++loadGenRef.current;

    // Reset pending cleanup timer and RAFs
    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    cancelRaf();

    // Cancel in-flight image load
    if (activeImgRef.current) {
      activeImgRef.current.onload = null;
      activeImgRef.current.onerror = null;
      activeImgRef.current = null;
    }

    if (!currentUrl) {
      setLayers((prev) => prev.map((l) => ({ ...l, active: false })));
      cleanupTimerRef.current = window.setTimeout(() => {
        setLayers([]);
      }, 1000);
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      activeImgRef.current = img;

      img.onload = () => {
        if (loadGenRef.current !== gen) return;
        activeImgRef.current = null;
        const newId = ++nextIdRef.current;
        const dominant = quantizeDominant(img);
        const color = dominant ? deriveCoverGlow(dominant) : '43 43 46';

        setLayers((prev) => {
          // Bounded: keep at most the previous layer (as inactive) and the new layer
          const outgoing = prev.slice(-1).map((l) => ({ ...l, active: false }));
          return [...outgoing, { id: newId, color, active: false }];
        });

        cancelRaf();
        rafId1Ref.current = requestAnimationFrame(() => {
          rafId1Ref.current = null;
          rafId2Ref.current = requestAnimationFrame(() => {
            rafId2Ref.current = null;
            setLayers((prev) =>
              prev.map((l) => (l.id === newId ? { ...l, active: true } : l))
            );
          });
        });

        cleanupTimerRef.current = window.setTimeout(() => {
          setLayers((prev) => prev.filter((l) => l.id === newId));
        }, 1050);
      };

      img.onerror = () => {
        if (loadGenRef.current !== gen) return;
        activeImgRef.current = null;
        cancelRaf();
        setLayers((prev) => prev.map((l) => ({ ...l, active: false })));
        cleanupTimerRef.current = window.setTimeout(() => {
          setLayers([]);
        }, 1000);
      };

      // Set callbacks before setting src
      img.src = currentUrl;
    }

    // Unified cleanup for all branches
    return () => {
      loadGenRef.current++;
      cancelRaf();
      if (activeImgRef.current) {
        activeImgRef.current.onload = null;
        activeImgRef.current.onerror = null;
        activeImgRef.current = null;
      }
      if (cleanupTimerRef.current !== null) {
        window.clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
    };
  }, [track?.coverUrl]);

  const hasActiveCover = Boolean(track?.coverUrl && !coverError);
  const coverAlt = track
    ? track.album
      ? `${track.album} 专辑封面`
      : `${track.name} 专辑封面`
    : '专辑封面';

  if (!track) {
    return <section className="now-playing-stage" aria-label="正在播放" />;
  }

  return (
    <section className="now-playing-stage" aria-label="正在播放">
      <div className="stage-content">
        <div className="record-column">
          <div className="cover-stack" data-stage-motion="cover">
            <div className="stage-backdrop" aria-hidden="true">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className={`stage-backdrop-layer${layer.active && hasActiveCover ? ' is-active' : ''}`}
                  style={{ backgroundImage: `radial-gradient(ellipse at center, rgb(${layer.color} / 0.8) 0%, rgb(${layer.color} / 0.5) 36%, rgb(${layer.color} / 0.16) 54%, transparent 72%)` }}
                />
              ))}
            </div>
            <div className="cover-main">
              {hasActiveCover ? (
                <img
                  src={track.coverUrl}
                  alt={coverAlt}
                  onError={() => setCoverError(true)}
                />
              ) : (
                <div className="cover-placeholder">
                  <span>LUNE</span>
                </div>
              )}
            </div>
          </div>

          <div className="track-identity" data-stage-motion="identity">
            <h2 title={track.name}>{track.name}</h2>
            <p title={track.artists}>{track.artists}</p>
            {track.album && <span title={track.album}>{track.album}</span>}
          </div>
        </div>

        <div className="lyric-terminal" data-stage-motion="lyrics">
          {isLoadingLyrics ? (
            <div className="lyric-empty">
              <span className="loading-dots"><i /><i /><i /></span>
              <strong>正在载入歌词</strong>
            </div>
          ) : lines.length === 0 ? (
            <div className="lyric-empty">
              <span className="empty-line" />
              <strong>暂无歌词</strong>
            </div>
          ) : (
            <LyricScroller
              lines={lines}
              activeIndex={currentIndex}
              highlightCredits={true}
              layoutKey={libraryOpen}
            />
          )}
        </div>
      </div>
    </section>
  );
}
