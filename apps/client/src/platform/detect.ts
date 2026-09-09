import { useEffect, useState } from 'react';
import type { ClientPlatformKind, PlatformCapabilities } from './contracts';

const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

export function isAndroidShell(): boolean {
  return /android/i.test(navigator.userAgent);
}

export function isTauriShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isDesktopShell(): boolean {
  return isTauriShell() && !isAndroidShell();
}

export function detectPlatformKind(): ClientPlatformKind {
  if (isAndroidShell()) return 'android';
  if (isDesktopShell()) {
    // Android also includes Linux in its user agent, so detect it first.
    if (/linux/i.test(navigator.userAgent)) return 'linux';
    return 'windows';
  }
  return 'browser';
}

export function getPlatformCapabilities(kind: ClientPlatformKind): PlatformCapabilities {
  return {
    backgroundAudio: kind === 'android',
    systemBack: kind === 'android',
    systemMediaControls: kind !== 'browser',
  };
}

export function useIsMobileLayout(): boolean {
  const locked = isAndroidShell() ? true : isDesktopShell() ? false : null;
  const [isNarrow, setIsNarrow] = useState<boolean>(() => {
    if (locked !== null) return locked;
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (locked !== null) {
      setIsNarrow(locked);
      return;
    }

    const media = window.matchMedia(MOBILE_MEDIA_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsNarrow(event.matches);
    setIsNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [locked]);

  return locked !== null ? locked : isNarrow;
}
