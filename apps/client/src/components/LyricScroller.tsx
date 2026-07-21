import { useEffect, useLayoutEffect, useRef } from 'react';
import type { LyricLine } from '@lune/shared';

interface LyricScrollerProps {
  lines: LyricLine[];
  activeIndex: number;
  isOwner: boolean;
  onSeek: (ms: number) => void;
}

/**
 * Karaoke-style lyric scroller.
 *
 * Model:
 * - All lines stay mounted with stable keys (no slot remounts).
 * - Viewport fills the cover row; the list is translated so the focus line's
 *   main text mid-line sits on the viewport mid-line (= album cover center).
 * - Transform is written in useLayoutEffect (not React state) so measure +
 *   apply happen before paint — avoids the flash from "new active, old offset".
 * - Only transform is animated. Typography role changes are instant so
 *   layout height is final when we measure.
 */
export default function LyricScroller({
  lines,
  activeIndex,
  isOwner,
  onSeek,
}: LyricScrollerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prevFocusRef = useRef<number | null>(null);
  const positionedRef = useRef(false);
  const focusIndexRef = useRef(-1);

  // Focus index: before the first timed line, keep the list parked on line 0.
  const focusIndex =
    lines.length === 0 ? -1 : activeIndex < 0 ? 0 : Math.min(activeIndex, lines.length - 1);
  focusIndexRef.current = focusIndex;

  const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const applyOffset = (offsetY: number, animate: boolean) => {
    const list = listRef.current;
    if (!list) return;

    const durationMs = !animate || prefersReducedMotion() ? 0 : 460;
    list.style.transitionDuration = `${durationMs}ms`;
    list.style.transform = `translate3d(0, ${offsetY}px, 0)`;
  };

  const measureAndPin = (animate: boolean, index = focusIndexRef.current) => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list || index < 0) return;

    const item = itemRefs.current[index];
    if (!item) return;

    // Pin the main lyric text (not the whole row with translation) to the
    // viewport mid-line — that mid-line matches the album cover center.
    const text = item.querySelector('.lyric-item-text');
    const target = text instanceof HTMLElement ? text : item;

    const currentY = readTranslateY(list);
    const viewportRect = viewport.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const viewportCenter = viewportRect.top + viewportRect.height / 2;
    const targetCenter = targetRect.top + targetRect.height / 2;
    applyOffset(currentY + (viewportCenter - targetCenter), animate);
  };

  // Pin after every focus change / line set change — before browser paint.
  useLayoutEffect(() => {
    if (focusIndex < 0) {
      prevFocusRef.current = null;
      return;
    }

    const prev = prevFocusRef.current;
    const isFirst = !positionedRef.current || prev === null;
    const jumped = prev !== null && Math.abs(focusIndex - prev) > 5;
    const animate = !isFirst && !jumped;

    measureAndPin(animate, focusIndex);
    positionedRef.current = true;
    prevFocusRef.current = focusIndex;
  }, [focusIndex, lines]);

  // Re-pin on viewport resize without animation.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(() => {
      measureAndPin(false);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [lines]);

  if (lines.length === 0) return null;

  return (
    <div className="lyric-scroller" ref={viewportRef} aria-live="polite">
      <div className="lyric-list" ref={listRef}>
        {lines.map((line, index) => {
          const distance = Math.abs(index - focusIndex);
          const role =
            activeIndex < 0
              ? distance === 0
                ? 'near'
                : 'far'
              : distance === 0
                ? 'active'
                : distance === 1
                  ? 'near'
                  : 'far';
          const isFocus = index === focusIndex && activeIndex >= 0;

          return (
            <button
              type="button"
              key={`${line.time}-${index}`}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="lyric-item"
              data-role={role}
              data-focus={isFocus ? 'true' : undefined}
              onClick={() => {
                if (!isOwner) return;
                onSeek(line.time * 1000);
              }}
              disabled={!isOwner}
              title={
                isOwner
                  ? `跳转到 ${formatClock(line.time)}`
                  : '正在跟随房主'
              }
              aria-current={isFocus ? 'true' : undefined}
            >
              <span className="lyric-item-text">{line.text}</span>
              {line.trans ? (
                <span className="lyric-item-trans">{line.trans}</span>
              ) : null}
              {isOwner ? (
                <span className="lyric-item-time">{formatClock(line.time)}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Current translateY from inline style or computed matrix. */
function readTranslateY(el: HTMLElement): number {
  const inline = el.style.transform;
  const inlineMatch = /translate3d\(\s*[^,]+,\s*([-\d.]+)px/i.exec(inline);
  if (inlineMatch) return Number(inlineMatch[1]);

  const computed = getComputedStyle(el).transform;
  if (!computed || computed === 'none') return 0;

  if (computed.startsWith('matrix3d(')) {
    const parts = computed.slice(9, -1).split(',').map((v) => Number(v.trim()));
    return parts[13] ?? 0;
  }

  if (computed.startsWith('matrix(')) {
    const parts = computed.slice(7, -1).split(',').map((v) => Number(v.trim()));
    return parts[5] ?? 0;
  }

  return 0;
}
