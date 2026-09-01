import { useEffect, useLayoutEffect, useRef } from 'react';
import type { LyricLine } from '@lune/shared';

interface LyricScrollerProps {
  lines: LyricLine[];
  activeIndex: number;
}

/**
 * Read-only bilingual lyric scroller.
 *
 * Model:
 * - All lines stay mounted with stable keys (no slot remounts).
 * - Every original/translation pair always participates in layout.
 * - The active line's original-text top edge is pinned to a stable viewport
 *   anchor. Its translation height can change without moving that anchor.
 * - Transform is written in useLayoutEffect (not React state) so measure +
 *   apply happen before paint — avoids the flash from "new active, old offset".
 * - Lyrics are display-only. Seeking remains available from the timeline.
 */
export default function LyricScroller({
  lines,
  activeIndex,
}: LyricScrollerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
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

    // Pin the main lyric text's top edge. Clamp the anchor upward when a tall
    // bilingual block needs more room below it, keeping common long lines out
    // of the viewport fade zones.
    const text = item.querySelector('.lyric-item-text');
    const target = text instanceof HTMLElement ? text : item;

    const viewportRect = viewport.getBoundingClientRect();
    const styles = getComputedStyle(viewport);
    const focusRatio = readRatio(styles.getPropertyValue('--lyric-focus-position'), 0.4);
    const safeRatio = readRatio(styles.getPropertyValue('--lyric-fade-safe'), 0.08);
    const safeInset = Math.max(16, viewportRect.height * safeRatio);
    const desiredAnchor = viewportRect.height * focusRatio;
    const targetOffsetWithinItem = target === item ? 0 : target.offsetTop;
    const targetOffset = item.offsetTop + targetOffsetWithinItem;
    const blockHeightBelowTarget = item.offsetHeight - targetOffsetWithinItem;
    const highestCompleteAnchor = Math.max(
      safeInset,
      viewportRect.height - safeInset - blockHeightBelowTarget,
    );
    const anchor = Math.max(safeInset, Math.min(desiredAnchor, highestCompleteAnchor));

    applyOffset(anchor - targetOffset, animate);
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

  // Re-pin on viewport/content resize and after fonts settle, without motion.
  useEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;

    const observer = new ResizeObserver(() => {
      measureAndPin(false);
    });
    observer.observe(viewport);
    observer.observe(list);

    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) measureAndPin(false);
    });

    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [lines]);

  if (lines.length === 0) return null;

  return (
    <div className="lyric-scroller" ref={viewportRef} aria-label="同步歌词">
      <div className="lyric-list" ref={listRef} role="list">
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
            <div
              key={`${line.time}-${index}`}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="lyric-item"
              role="listitem"
              data-role={role}
              data-focus={isFocus ? 'true' : undefined}
              aria-current={isFocus ? 'true' : undefined}
            >
              <span className="lyric-item-text">{line.text}</span>
              {line.trans ? (
                <span className="lyric-item-trans">{line.trans}</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function readRatio(value: string, fallback: number) {
  const normalized = value.trim();
  if (!normalized) return fallback;

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  return normalized.endsWith('%') ? parsed / 100 : parsed;
}
