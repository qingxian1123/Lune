import { useState, useRef, useCallback, useEffect } from 'react';
import type { PlayerState } from '../types';

export interface UsePlayerReturn extends PlayerState {
  play: (url: string, position?: number) => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  stop: () => void;
  setOnEnd: (cb: (() => void) | null) => void;
}

export function usePlayer(): UsePlayerReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const onEndRef = useRef<(() => void) | null>(null);
  const volumeRef = useRef(0.8);
  const rafRef = useRef(0);
  const commandTokenRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

  const stopTicker = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const startTicker = useCallback((audio: HTMLAudioElement) => {
    stopTicker();
    const tick = () => {
      if (!audio.paused && !audio.ended) {
        setCurrentTime(audio.currentTime);
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stopTicker]);

  const bindAudio = useCallback((audio: HTMLAudioElement) => {
    audio.preload = 'auto';
    audio.volume = volumeRef.current;

    audio.onloadedmetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onplay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      startTicker(audio);
    };
    audio.onplaying = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };
    audio.onwaiting = () => {
      setIsBuffering(true);
    };
    audio.onpause = () => {
      setIsPlaying(false);
      stopTicker();
    };
    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      stopTicker();
      onEndRef.current?.();
    };
    audio.onerror = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      stopTicker();
    };
  }, [startTicker, stopTicker]);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      bindAudio(audio);
      audioRef.current = audio;
    }
    return audioRef.current;
  }, [bindAudio]);

  const clearAudio = useCallback((resetTime = true) => {
    const audio = audioRef.current;
    commandTokenRef.current += 1;
    stopTicker();

    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

    currentUrlRef.current = null;
    setIsPlaying(false);
    setIsBuffering(false);
    setDuration(0);
    if (resetTime) setCurrentTime(0);
  }, [stopTicker]);

  useEffect(() => {
    const audio = ensureAudio();
    return () => {
      audio.pause();
      audio.src = '';
      audio.load();
      audioRef.current = null;
      stopTicker();
    };
  }, [ensureAudio, stopTicker]);

  const play = useCallback((url: string, position = 0) => {
    const audio = ensureAudio();
    const token = commandTokenRef.current + 1;
    commandTokenRef.current = token;
    const targetPosition = Math.max(0, position);

    if (currentUrlRef.current !== url) {
      audio.pause();
      audio.src = url;
      currentUrlRef.current = url;
      setDuration(0);
      audio.load();
    }

    setCurrentTime(targetPosition);
    setIsBuffering(true);

    const start = () => {
      if (commandTokenRef.current !== token) return;
      try {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = Math.min(targetPosition, audio.duration);
        } else {
          audio.currentTime = targetPosition;
        }
      } catch {
        // 某些流媒体要等 metadata 完成后才允许 seek
      }

      const playResult = audio.play();
      if (playResult) {
        playResult.catch(() => {
          if (commandTokenRef.current !== token) return;
          setIsPlaying(false);
          setIsBuffering(false);
        });
      }
    };

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      start();
    } else {
      audio.addEventListener('loadedmetadata', start, { once: true });
    }
  }, [ensureAudio]);

  const seekTo = useCallback((seconds: number) => {
    const targetPosition = Math.max(0, seconds);
    const audio = ensureAudio();
    try {
      audio.currentTime = targetPosition;
    } catch {
      // metadata 未就绪时只更新界面时间，下一次 play 会重新 seek
    }
    setCurrentTime(targetPosition);
  }, [ensureAudio]);

  const setVolume = useCallback((volume: number) => {
    const nextVolume = Math.max(0, Math.min(1, volume));
    volumeRef.current = nextVolume;
    ensureAudio().volume = nextVolume;
  }, [ensureAudio]);

  const stop = useCallback(() => {
    clearAudio(true);
  }, [clearAudio]);

  const setOnEnd = useCallback((cb: (() => void) | null) => {
    onEndRef.current = cb;
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    isBuffering,
    play,
    seekTo,
    setVolume,
    stop,
    setOnEnd,
  };
}
