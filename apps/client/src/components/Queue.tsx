import { useMemo } from 'react';
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
import type { Track } from '@lune/shared';
import { formatTime } from '../lib/format';

interface QueueProps {
  queue: Track[];
  currentTrackId?: string;
  isOwner: boolean;
  onRemove: (index: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

interface QueueEntry {
  id: string;
  index: number;
  track: Track;
}

interface SortableTrackProps {
  entry: QueueEntry;
  currentTrackId?: string;
  isOwner: boolean;
  canReorder: boolean;
  onRemove: (index: number) => void;
}

function SortableTrack({
  entry,
  currentTrackId,
  isOwner,
  canReorder,
  onRemove,
}: SortableTrackProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id, disabled: !canReorder });
  const { track, index } = entry;
  const current = track.id === currentTrackId;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`terminal-track ${current ? 'is-current' : ''} ${isDragging ? 'is-dragging' : ''}`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="queue-drag-handle"
        aria-label={`拖动《${track.name}》，当前第 ${index + 1} 首`}
        title="拖动调整播放顺序"
        disabled={!canReorder}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <span className="track-index">{(index + 1).toString().padStart(2, '0')}</span>
      <div className="terminal-track-cover">
        {track.coverUrl ? (
          <img src={track.coverUrl} alt={`${track.album} 专辑封面`} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="terminal-track-copy">
        <strong>{track.name}</strong>
        <small>{track.artists}</small>
      </div>
      <span className="track-duration">{formatTime(track.duration)}</span>
      {isOwner && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="track-remove"
          aria-label={`移除《${track.name}》`}
          title="移除"
        >
          ✕
        </button>
      )}
    </li>
  );
}

export default function Queue({
  queue,
  currentTrackId,
  isOwner,
  onRemove,
  onReorder,
}: QueueProps) {
  const entries = useMemo<QueueEntry[]>(
    () =>
      queue.map((track, index) => ({
        id: `${track.id}:${index}`,
        index,
        track,
      })),
    [queue],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (queue.length === 0) {
    return (
      <section className="terminal-pane empty-pane">
        <div className="pane-heading">
          <div><span>接下来播放</span><strong>待播队列</strong></div>
          <small>0 首</small>
        </div>
        <div className="terminal-empty">
          <span>＋</span>
          <strong>还没有下一首</strong>
          <small>去搜索一首喜欢的歌吧</small>
        </div>
      </section>
    );
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const fromIndex = entries.findIndex((entry) => entry.id === active.id);
    const toIndex = entries.findIndex((entry) => entry.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    onReorder(fromIndex, toIndex);
  };

  return (
    <section className="terminal-pane">
      <div className="pane-heading">
        <div><span>接下来播放</span><strong>待播队列</strong></div>
        <small>{queue.length} 首 · 拖动排序</small>
      </div>
      <DndContext
        key={queue.map((track) => track.id).join('|')}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={entries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
          <ul className="terminal-list lune-scrollbar">
            {entries.map((entry) => (
              <SortableTrack
                key={entry.id}
                entry={entry}
                currentTrackId={currentTrackId}
                isOwner={isOwner}
                canReorder={entries.length > 1}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}
