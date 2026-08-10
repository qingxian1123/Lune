import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { formatTime } from '../lib/format';
function SortableTrack({ entry, currentTrackId, isOwner, canReorder, onRemove, }) {
    const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id, disabled: !canReorder });
    const { track, index } = entry;
    const current = track.id === currentTrackId;
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
    return (_jsxs("li", { ref: setNodeRef, style: style, className: `terminal-track ${current ? 'is-current' : ''} ${isDragging ? 'is-dragging' : ''}`, children: [_jsx("button", { ref: setActivatorNodeRef, type: "button", className: "queue-drag-handle", "aria-label": `拖动《${track.name}》，当前第 ${index + 1} 首`, title: "\u62D6\u52A8\u8C03\u6574\u64AD\u653E\u987A\u5E8F", disabled: !canReorder, ...attributes, ...listeners, children: _jsx("span", { "aria-hidden": "true", children: "\u283F" }) }), _jsx("span", { className: "track-index", children: (index + 1).toString().padStart(2, '0') }), _jsx("div", { className: "terminal-track-cover", children: track.coverUrl ? (_jsx("img", { src: track.coverUrl, alt: `${track.album} 专辑封面`, className: "h-full w-full object-cover" })) : null }), _jsxs("div", { className: "terminal-track-copy", children: [_jsx("strong", { children: track.name }), _jsx("small", { children: track.artists })] }), _jsx("span", { className: "track-duration", children: formatTime(track.duration) }), isOwner && (_jsx("button", { type: "button", onClick: () => onRemove(index), className: "track-remove", "aria-label": `移除《${track.name}》`, title: "\u79FB\u9664", children: "\u2715" }))] }));
}
export default function Queue({ queue, currentTrackId, isOwner, onRemove, onReorder, }) {
    const entries = useMemo(() => queue.map((track, index) => ({
        id: `${track.provider || ''}:${track.id}:${index}`,
        index,
        track,
    })), [queue]);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
    if (queue.length === 0) {
        return (_jsxs("section", { className: "terminal-pane empty-pane", children: [_jsxs("div", { className: "pane-heading", children: [_jsxs("div", { children: [_jsx("span", { children: "\u63A5\u4E0B\u6765\u64AD\u653E" }), _jsx("strong", { children: "\u5F85\u64AD\u961F\u5217" })] }), _jsx("small", { children: "0 \u9996" })] }), _jsxs("div", { className: "terminal-empty", children: [_jsx("span", { children: "\uFF0B" }), _jsx("strong", { children: "\u8FD8\u6CA1\u6709\u4E0B\u4E00\u9996" }), _jsx("small", { children: "\u53BB\u641C\u7D22\u4E00\u9996\u559C\u6B22\u7684\u6B4C\u5427" })] })] }));
    }
    const handleDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id)
            return;
        const fromIndex = entries.findIndex((entry) => entry.id === active.id);
        const toIndex = entries.findIndex((entry) => entry.id === over.id);
        if (fromIndex < 0 || toIndex < 0)
            return;
        onReorder(fromIndex, toIndex);
    };
    return (_jsxs("section", { className: "terminal-pane", children: [_jsxs("div", { className: "pane-heading", children: [_jsxs("div", { children: [_jsx("span", { children: "\u63A5\u4E0B\u6765\u64AD\u653E" }), _jsx("strong", { children: "\u5F85\u64AD\u961F\u5217" })] }), _jsxs("small", { children: [queue.length, " \u9996 \u00B7 \u62D6\u52A8\u6392\u5E8F"] })] }), _jsx(DndContext, { sensors: sensors, collisionDetection: closestCenter, onDragEnd: handleDragEnd, children: _jsx(SortableContext, { items: entries.map((entry) => entry.id), strategy: verticalListSortingStrategy, children: _jsx("ul", { className: "terminal-list lune-scrollbar", children: entries.map((entry) => (_jsx(SortableTrack, { entry: entry, currentTrackId: currentTrackId, isOwner: isOwner, canReorder: entries.length > 1, onRemove: onRemove }, entry.id))) }) }) }, queue.map((track) => `${track.provider || ''}:${track.id}`).join('|'))] }));
}
