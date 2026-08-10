import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useFavoriteStore } from '../hooks/useFavoriteStore';
import { formatTime } from '../lib/format';
export default function TransportBar({ track, currentTime, duration, isBuffering, isOwner, membersCount, onSeek, onVolume, onNext, }) {
    const isFavorite = useFavoriteStore((state) => state.isFavorite);
    const toggleFavorite = useFavoriteStore((state) => state.toggle);
    const [volume, setVolume] = useState(0.8);
    const safeDuration = duration || track?.duration || 0;
    const progress = safeDuration > 0 ? Math.min(currentTime, safeDuration) / safeDuration : 0;
    const favorite = track ? isFavorite(track.id) : false;
    useEffect(() => {
        onVolume(volume);
    }, [onVolume, volume]);
    const progressStyle = {
        '--transport-progress': `${progress * 100}%`,
    };
    const volumeStyle = {
        '--volume-progress': `${volume * 100}%`,
    };
    return (_jsxs("section", { className: "transport-bar", "aria-label": "\u64AD\u653E\u63A7\u5236", children: [_jsxs("label", { className: `transport-progress ${isOwner ? '' : 'is-locked'}`, style: progressStyle, children: [_jsx("span", { className: "sr-only", children: "\u64AD\u653E\u8FDB\u5EA6" }), _jsx("input", { type: "range", min: 0, max: Math.max(safeDuration, 1), step: 1000, value: Math.min(currentTime, safeDuration), onChange: (event) => onSeek(Number(event.target.value)), disabled: !isOwner || safeDuration <= 0, "aria-label": "\u64AD\u653E\u8FDB\u5EA6" })] }), _jsxs("div", { className: "transport-track", children: [_jsx("div", { className: "transport-cover", children: track?.coverUrl ? _jsx("img", { src: track.coverUrl, alt: "" }) : _jsx("span", { children: "L" }) }), _jsxs("div", { className: "transport-copy", children: [_jsx("span", { children: isBuffering ? '正在缓冲' : track ? '正在播放' : '尚未播放' }), _jsx("strong", { children: track?.name || '等待播放' }), _jsx("small", { children: track?.artists || 'Lune 共听房间' })] })] }), _jsxs("div", { className: "transport-sync", children: [_jsx("span", { className: `sync-state-dot ${track ? 'is-active' : ''}` }), _jsxs("div", { children: [_jsx("strong", { children: isOwner ? '由你控制播放' : '与房主同步' }), _jsxs("small", { children: [membersCount, " \u4EBA\u6B63\u5728\u542C"] })] })] }), _jsxs("div", { className: "transport-time", "aria-label": "\u64AD\u653E\u65F6\u95F4", children: [_jsx("strong", { children: formatTime(currentTime) }), _jsx("span", { children: "/" }), _jsx("small", { children: formatTime(safeDuration) })] }), _jsxs("div", { className: "transport-actions", children: [_jsx("button", { type: "button", className: `terminal-icon-button ${favorite ? 'is-active' : ''}`, onClick: () => track && toggleFavorite(track.id), disabled: !track, "aria-label": favorite ? '取消喜欢' : '喜欢', title: favorite ? '取消喜欢' : '喜欢', children: favorite ? '♥' : '♡' }), _jsxs("label", { className: "transport-volume", style: volumeStyle, children: [_jsx("span", { children: "\u97F3\u91CF" }), _jsx("input", { type: "range", min: 0, max: 1, step: 0.01, value: volume, onChange: (event) => setVolume(Number(event.target.value)), "aria-label": "\u97F3\u91CF" })] }), _jsx("button", { type: "button", className: "transport-next", onClick: onNext, disabled: !isOwner || !track, title: isOwner ? '播放下一首' : '仅房主可切歌', children: _jsx("span", { children: "\u4E0B\u4E00\u9996" }) })] })] }));
}
