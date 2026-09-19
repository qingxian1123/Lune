import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface StageFrame {
  element: HTMLElement;
  rect: DOMRect;
  lyricTop?: number;
}

function readFrames(root: HTMLElement): StageFrame[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-stage-motion]')).map((element) => ({
    element,
    rect: element.getBoundingClientRect(),
    lyricTop: element.querySelector('[data-focus="true"] .lyric-item-text')?.getBoundingClientRect().top,
  }));
}

/** Lay out once, then animate visual offsets. Text never scales or reflows per frame. */
export function useStageTransition(rootRef: RefObject<HTMLElement>, libraryOpen: boolean) {
  const pending = useRef<StageFrame[] | null>(null);
  const animations = useRef<Animation[]>([]);
  const cancel = useCallback(() => {
    animations.current.forEach((animation) => animation.cancel());
    animations.current = [];
  }, []);

  const capture = useCallback(() => {
    const root = rootRef.current;
    // Capture before cancelling: rapid toggles continue from the visible position.
    pending.current = root ? readFrames(root) : null;
  }, [rootRef]);

  useLayoutEffect(() => {
    const previous = pending.current;
    pending.current = null;
    cancel();
    const root = rootRef.current;
    if (!root || !previous || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const styles = getComputedStyle(root);
    const duration = Number.parseFloat(styles.getPropertyValue('--library-motion-duration')) || 300;
    const easing = styles.getPropertyValue('--library-motion-ease').trim() || 'ease-out';
    const next = readFrames(root);
    for (const frame of next) {
      const before = previous.find((item) => item.element === frame.element);
      if (!before || !frame.rect.width || !frame.rect.height || !frame.element.animate) continue;
      const dx = before.rect.left - frame.rect.left;
      const dy = before.lyricTop !== undefined && frame.lyricTop !== undefined
        ? before.lyricTop - frame.lyricTop : before.rect.top - frame.rect.top;
      const scale = frame.element.dataset.stageMotion === 'cover' ? before.rect.width / frame.rect.width : 1;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.001) continue;
      animations.current.push(frame.element.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration, easing }));
    }
  }, [libraryOpen, cancel, rootRef]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stop = () => { pending.current = null; cancel(); };
    window.addEventListener('resize', stop);
    reduced.addEventListener('change', stop);
    return () => {
      window.removeEventListener('resize', stop);
      reduced.removeEventListener('change', stop);
      stop();
    };
  }, [cancel]);

  return capture;
}
