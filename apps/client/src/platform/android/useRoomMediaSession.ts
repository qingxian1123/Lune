import { useEffect, useRef } from 'react';
import type { Track } from '@lune/shared';
import {
  onMediaAction,
  startMediaSession,
  stopMediaSession,
  updateMediaSession,
} from '../../lib/mediaSession';
import type { MediaAction } from '../../lib/mediaSession';

interface RoomMediaSessionOptions {
  track: Track | null | undefined;
  currentTime: number;
  playing: boolean;
  onNext: () => void;
  onToggleFavorite: (trackId: string) => void;
  onLeave: () => void;
}

export function useRoomMediaSession({
  track,
  currentTime,
  playing,
  onNext,
  onToggleFavorite,
  onLeave,
}: RoomMediaSessionOptions) {
  useEffect(() => {
    void startMediaSession();
    return () => {
      void stopMediaSession();
    };
  }, []);

  const actionRef = useRef<(action: MediaAction) => void>(() => {});
  actionRef.current = (action) => {
    if (action === 'next') {
      if (track) onNext();
      return;
    }
    if (action === 'favorite') {
      if (track) onToggleFavorite(track.id);
      return;
    }
    if (action === 'leave') onLeave();
  };

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let active = true;
    void onMediaAction((action) => actionRef.current(action)).then((unsubscribe) => {
      if (active) dispose = unsubscribe;
      else unsubscribe();
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, []);

  const positionRef = useRef(0);
  positionRef.current = currentTime;
  useEffect(() => {
    if (!track) return;
    void updateMediaSession({
      title: track.name,
      artist: track.artists,
      coverUrl: track.coverUrl || null,
      durationMs: track.duration,
      positionMs: Math.round(positionRef.current),
      playing,
      canNext: true,
    });
  }, [playing, track]);
}
