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
import type { QueueItem, Track } from '@lune/shared';
import { formatTime } from '../lib/format';
import { useClientRuntime } from '../app/ClientRuntimeProvider';

interface QueueProps {
  queue: QueueItem[];
  currentTrackId?: string;
  isOwner: boolean;
  connected?: boolean;
  onSearch?: () => void;
  onRemove: (itemId: string) => void;
  onReorder: (itemId: string, beforeItemId: string | null) => void;
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
  connected: boolean;
  canReorder: boolean;
  onRemove: (itemId: string) => void;
}

function SortableTrack({
  entry,
  currentTrackId,
  isOwner,
  connected,
  canReorder,
  onRemove,
}: SortableTrackProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id, disabled: !canReorder });
  const { track, index } = entry;
  const current = track.id === currentTrackId;
  const windows = useClientRuntime().kind === 'windows';
  const subtitle = windows && track.provider === 'bilibili' && track.album
    ? [track.artists, track.album].filter(Boolean).join(' · ') : track.artists;
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
        <small>{subtitle}</small>
      </div>
      <span className="track-duration">{formatTime(track.duration)}</span>
      {isOwner && (
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          className="track-remove"
          aria-label={`从队列移除《${track.name}》`}
          title="移除"
          disabled={!connected}
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
  connected = true,
  onSearch,
  onRemove,
  onReorder,
}: QueueProps) {
  const entries = useMemo<QueueEntry[]>(
    () =>
      queue.map((item, index) => ({
        id: item.id,
        index,
        track: item.track,
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
        <div className="terminal-empty">
          <strong>队列为空</strong>
          {onSearch
            ? <button type="button" className="lune-control queue-search" onClick={onSearch}>去选歌</button>
            : <small>从搜索中添加歌曲</small>}
        </div>
      </section>
    );
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!connected || !over || active.id === over.id) return;
    const fromIndex = entries.findIndex((entry) => entry.id === active.id);
    const toIndex = entries.findIndex((entry) => entry.id === over.id);
    if (fromIndex < 0 || toIndex < 0) return;
    const reordered = [...entries];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    onReorder(moved.id, reordered[toIndex + 1]?.id ?? null);
  };

  return (
    <section className="terminal-pane">
      <DndContext
        key={entries.map((entry) => entry.id).join('|')}
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
                connected={connected}
                canReorder={isOwner && connected && entries.length > 1}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
}
