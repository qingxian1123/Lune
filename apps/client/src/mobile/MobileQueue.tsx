import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { QueueItem, Track } from '@lune/shared';
import { formatTime } from '../lib/format';

interface MobileQueueProps {
  queue: QueueItem[];
  currentTrackId?: string;
  onRemove: (itemId: string) => void;
  onReorder: (itemId: string, beforeItemId: string | null) => void;
}

interface QueueEntry {
  id: string;
  index: number;
  track: Track;
}

/** 删除按钮宽度(px),左滑露出区域 */
const SWIPE_WIDTH = 84;
/** 判定滑开/收回的位移阈值 */
const SWIPE_THRESHOLD = SWIPE_WIDTH / 2;

interface SwipeableTrackProps {
  entry: QueueEntry;
  current: boolean;
  showUpNext: boolean;
  canReorder: boolean;
  open: boolean;
  onOpenChange: (itemId: string | null) => void;
  onRemove: (itemId: string) => void;
}

function SwipeableTrack({
  entry,
  current,
  showUpNext,
  canReorder,
  open,
  onOpenChange,
  onRemove,
}: SwipeableTrackProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id, disabled: !canReorder });
  const { track, index } = entry;

  const contentRef = useRef<HTMLDivElement>(null);

  // 最新值经 ref 透传,原生监听只绑定一次
  const openRef = useRef(open);
  openRef.current = open;
  const itemIdRef = useRef(entry.id);
  itemIdRef.current = entry.id;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // 左滑删除:原生非 passive 监听。React 合成触摸事件在根节点以 passive
  // 注册,无法 preventDefault,横滑会被 WebView 判给列表滚动并 touchcancel。
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const gesture = { x: 0, y: 0, tracking: false, horizontal: false };

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const point = event.touches[0];
      gesture.x = point.clientX;
      gesture.y = point.clientY;
      gesture.tracking = true;
      gesture.horizontal = false;
    };

    const onMove = (event: TouchEvent) => {
      if (!gesture.tracking || event.touches.length === 0) return;
      const point = event.touches[0];
      const dx = point.clientX - gesture.x;
      const dy = point.clientY - gesture.y;

      if (!gesture.horizontal) {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          gesture.horizontal = true;
          el.style.transition = 'none';
        } else if (Math.abs(dy) > 10) {
          gesture.tracking = false;
          return;
        } else {
          return;
        }
      }

      // 已确立横向意图:阻止 WebView 把手势判给滚动
      event.preventDefault();
      const base = openRef.current ? -SWIPE_WIDTH : 0;
      const x = Math.min(0, Math.max(-SWIPE_WIDTH, base + dx));
      el.style.transform = `translateX(${x}px)`;
    };

    const onEnd = (event: TouchEvent) => {
      if (!gesture.tracking) return;
      gesture.tracking = false;
      if (!gesture.horizontal) return;

      const point = event.changedTouches.length > 0 ? event.changedTouches[0] : null;
      const dx = point ? point.clientX - gesture.x : 0;
      const base = openRef.current ? -SWIPE_WIDTH : 0;
      const x = Math.min(0, Math.max(-SWIPE_WIDTH, base + dx));
      el.style.transition = '';
      el.style.transform = '';
      onOpenChangeRef.current(x < -SWIPE_THRESHOLD ? itemIdRef.current : null);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const sortStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={sortStyle}
      className={`m-q-item ${current ? 'is-current' : ''} ${isDragging ? 'is-dragging' : ''}`}
    >
      {!current && (
        <button
          type="button"
          className="m-q-delete"
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          onClick={() => {
            onOpenChange(null);
            onRemove(entry.id);
          }}
        >
          删除
        </button>
      )}

      <div
        ref={contentRef}
        className={`m-q-content ${open ? 'is-open' : ''}`}
        onClick={() => open && onOpenChange(null)}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="m-q-handle"
          aria-label={`拖动《${track.name}》，当前第 ${index + 1} 首`}
          disabled={!canReorder}
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>

        {current ? (
          <span className="m-eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : null}

        <div className="m-q-cover">
          {track.coverUrl ? (
            <img src={track.coverUrl} alt="" loading="lazy" />
          ) : null}
        </div>

        <div className="m-q-copy">
          <strong>
            {track.name}
            {showUpNext && <em className="m-q-badge">下一首</em>}
          </strong>
          <small>{current ? `${track.artists} · 正在播放` : track.artists}</small>
        </div>

        <span className="m-q-dur">{formatTime(track.duration)}</span>
      </div>
    </li>
  );
}

/**
 * 移动端播放队列:紧凑行高 + 左滑删除 + 拖柄排序(全员同权)。
 * 与桌面 Queue 独立,互不影响。
 */
export default function MobileQueue({
  queue,
  currentTrackId,
  onRemove,
  onReorder,
}: MobileQueueProps) {
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  // 队列内容变化(增删/排序/切歌)后收起已滑开的行
  useEffect(() => {
    setOpenItemId(null);
  }, [queue]);

  const entries = useMemo<QueueEntry[]>(
    () =>
      queue.map((item, index) => ({
        id: item.id,
        index,
        track: item.track,
      })),
    [queue],
  );

  const currentIndex = useMemo(
    () => entries.findIndex((entry) => entry.track.id === currentTrackId),
    [entries, currentTrackId],
  );
  const upNextIndex = currentIndex >= 0 ? currentIndex + 1 : 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (queue.length === 0) {
    return (
      <div className="m-q-empty">
        <strong>队列为空</strong>
        <small>从搜索中添加歌曲</small>
      </div>
    );
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const fromIndex = entries.findIndex((entry) => entry.id === active.id);
    const toIndex = entries.findIndex((entry) => entry.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    const reordered = [...entries];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    onReorder(moved.id, reordered[toIndex + 1]?.id ?? null);
  };

  return (
    <DndContext
      key={entries.map((entry) => entry.id).join('|')}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={entries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
        <ul className="m-q-list">
          {entries.map((entry) => (
            <SwipeableTrack
              key={entry.id}
              entry={entry}
              current={entry.index === currentIndex}
              showUpNext={entry.index === upNextIndex && entry.index !== currentIndex}
              canReorder={entries.length > 1}
              open={openItemId === entry.id}
              onOpenChange={setOpenItemId}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
