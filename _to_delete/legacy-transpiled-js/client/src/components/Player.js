import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { formatTime } from '../lib/format';
import { useFavoriteStore } from '../hooks/useFavoriteStore';
export default function Player({ track, currentTime, duration, isBuffering, isOwner, membersCount = 0, onSeek, onVolume, onNext, }) {
    const isFav = useFavoriteStore((s) => s.isFavorite);
    const toggleFav = useFavoriteStore((s) => s.toggle);
    const [volume, setVolume] = useState(0.8);
    useEffect(() => {
        onVolume(volume);
    }, [volume, onVolume]);
    const dur = duration || track?.duration || 0;
    const progress = dur > 0 ? Math.min(currentTime, dur) / dur : 0;
    const fav = track ? isFav(track.id) : false;
    const progressPercent = progress * 100;
    const volumePercent = volume * 100;
    const handleProgressClick = (event) => {
        if (!isOwner || dur <= 0)
            return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        onSeek(ratio * dur);
    };
    const volumeStyle = {
        background: `linear-gradient(90deg, rgb(var(--lune-accent)) ${volumePercent}%, rgb(var(--lune-border) / 0.12) ${volumePercent}%)`,
    };
    return (_jsxs("section", { className: "lune-panel p-4", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-[rgb(var(--lune-border)/0.07)] bg-[rgb(var(--lune-surface-2))]", children: track?.coverUrl ? (_jsx("img", { src: track.coverUrl, alt: `${track.album} 专辑封面`, className: "h-full w-full object-cover" })) : (_jsx("div", { className: "flex h-full w-full items-center justify-center text-xs tracking-[0.18em] text-[rgb(var(--lune-muted)/0.34)]", children: "LUNE" })) }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("h2", { className: "truncate text-lg font-semibold leading-tight text-[rgb(var(--lune-text)/0.94)]", children: track?.name || '未播放' }), isBuffering && (_jsx("span", { className: "shrink-0 rounded-full border border-[rgb(var(--lune-border)/0.07)] px-2 py-0.5 text-[11px] text-[rgb(var(--lune-muted)/0.52)]", children: "\u7F13\u51B2" }))] }), _jsx("div", { className: "mt-1 truncate text-[13px] text-[rgb(var(--lune-muted)/0.56)]", children: track?.artists || '等待房间开始同步' }), _jsxs("div", { className: "mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[rgb(var(--lune-muted)/0.46)]", children: [_jsx("span", { className: "rounded-full bg-[rgb(var(--lune-surface-2)/0.68)] px-2 py-0.5", children: isOwner ? '房主同步中' : '跟随房主' }), _jsxs("span", { className: "rounded-full bg-[rgb(var(--lune-surface-2)/0.68)] px-2 py-0.5", children: [membersCount, " \u4EBA\u6B63\u5728\u542C"] })] })] }), _jsxs("div", { className: "flex shrink-0 items-center gap-2", children: [_jsx("button", { type: "button", onClick: () => track && toggleFav(track.id), disabled: !track, className: `lune-control flex h-9 w-9 items-center justify-center rounded-full text-lg disabled:cursor-not-allowed disabled:opacity-35 ${fav ? 'border-[rgb(var(--lune-accent)/0.22)] text-[rgb(var(--lune-accent))]' : ''}`, "aria-label": fav ? '取消喜欢' : '喜欢', title: fav ? '取消喜欢' : '喜欢', children: fav ? '♥' : '♡' }), _jsx("button", { type: "button", className: "lune-control flex h-9 w-9 items-center justify-center rounded-full text-xs disabled:cursor-not-allowed disabled:opacity-35", disabled: !track, "aria-label": "\u6B4C\u8BCD", title: "\u6B4C\u8BCD", children: "\u8BCD" }), _jsx("button", { type: "button", onClick: onNext, disabled: !isOwner, className: "lune-control flex h-9 w-9 items-center justify-center rounded-full text-sm disabled:cursor-not-allowed disabled:opacity-35", "aria-label": "\u4E0B\u4E00\u9996", title: isOwner ? '切歌' : '仅房主可切歌', children: "\u23ED" })] })] }), _jsxs("div", { className: "mt-4", children: [_jsx("div", { className: `group relative h-[5px] rounded-full bg-[rgb(var(--lune-border)/0.12)] ${isOwner ? 'cursor-pointer' : 'cursor-not-allowed'}`, onClick: handleProgressClick, role: "slider", "aria-label": "\u64AD\u653E\u8FDB\u5EA6", "aria-valuemin": 0, "aria-valuemax": dur, "aria-valuenow": Math.min(currentTime, dur), children: _jsx("div", { className: "absolute inset-y-0 left-0 rounded-full bg-[rgb(var(--lune-accent))] shadow-[0_0_12px_rgb(var(--lune-accent)/0.2)]", style: { width: `${progressPercent}%` } }) }), _jsxs("div", { className: "mt-2 flex justify-between font-mono text-[11px] text-[rgb(var(--lune-muted)/0.42)]", children: [_jsx("span", { children: formatTime(currentTime) }), _jsx("span", { children: formatTime(dur) })] })] }), _jsxs("div", { className: "mt-3 flex items-center gap-3", children: [_jsx("span", { className: "text-xs text-[rgb(var(--lune-muted)/0.5)]", children: "\u97F3\u91CF" }), _jsx("input", { type: "range", min: 0, max: 1, step: 0.01, value: volume, onChange: (event) => setVolume(Number(event.target.value)), className: "lune-range w-36", style: volumeStyle, "aria-label": "\u97F3\u91CF" }), _jsx("span", { className: "w-8 text-right font-mono text-[11px] text-[rgb(var(--lune-muted)/0.38)]", children: Math.round(volumePercent) })] })] }));
}
