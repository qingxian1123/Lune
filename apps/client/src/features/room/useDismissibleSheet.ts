import { useCallback, useRef } from 'react';
import type { TouchEvent } from 'react';

const DISMISS_THRESHOLD = 80;

export function useDismissibleSheet(onDismiss: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ startY: 0, dragging: false });

  const onTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 0) return;
    dragRef.current = { startY: event.touches[0].clientY, dragging: true };
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }, []);

  const onTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging || event.touches.length === 0) return;
    const offset = Math.max(0, event.touches[0].clientY - dragRef.current.startY);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${offset}px)`;
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!dragRef.current.dragging) return;
      dragRef.current.dragging = false;
      const offset =
        event.changedTouches.length > 0
          ? Math.max(0, event.changedTouches[0].clientY - dragRef.current.startY)
          : 0;

      if (sheetRef.current) {
        sheetRef.current.style.transition = '';
        sheetRef.current.style.transform = '';
      }
      if (offset > DISMISS_THRESHOLD) onDismiss();
    },
    [onDismiss],
  );

  return { sheetRef, onTouchStart, onTouchMove, onTouchEnd };
}
