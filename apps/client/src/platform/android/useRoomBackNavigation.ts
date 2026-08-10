import { useCallback, useEffect, useRef } from 'react';

interface RoomBackNavigationOptions {
  confirmOpen: boolean;
  sheetOpen: boolean;
  lyricsOpen: boolean;
  closeConfirm: () => void;
  closeSheet: () => void;
  showPlayer: () => void;
  requestLeave: () => void;
}

export function useRoomBackNavigation({
  confirmOpen,
  sheetOpen,
  lyricsOpen,
  closeConfirm,
  closeSheet,
  showPlayer,
  requestLeave,
}: RoomBackNavigationOptions) {
  const leavingRef = useRef(false);
  const backActionRef = useRef<() => void>(() => {});

  backActionRef.current = () => {
    if (confirmOpen) {
      closeConfirm();
      return;
    }
    if (sheetOpen) {
      closeSheet();
      return;
    }
    if (lyricsOpen) {
      showPlayer();
      return;
    }
    requestLeave();
  };

  useEffect(() => {
    const currentState = (window.history.state ?? {}) as Record<string, unknown>;
    if (!currentState.luneRoom) {
      window.history.pushState({ ...currentState, luneRoom: true }, '');
    }

    const handlePopState = () => {
      if (leavingRef.current) return;
      const previousState = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.pushState({ ...previousState, luneRoom: true }, '');
      backActionRef.current();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    window.history.go(-2);
  }, []);
}
