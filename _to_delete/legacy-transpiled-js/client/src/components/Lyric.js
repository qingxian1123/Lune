import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from 'react';
export default function Lyric({ lines, currentIndex }) {
    const containerRef = useRef(null);
    const activeRef = useRef(null);
    useEffect(() => {
        if (activeRef.current && containerRef.current) {
            containerRef.current.scrollTop =
                activeRef.current.offsetTop - containerRef.current.clientHeight / 2 + activeRef.current.clientHeight / 2;
        }
    }, [currentIndex]);
    if (lines.length === 0) {
        return (_jsx("section", { className: "lune-panel flex h-72 items-center justify-center p-4 text-sm text-[rgb(var(--lune-muted)/0.42)]", children: "\u6682\u65E0\u6B4C\u8BCD" }));
    }
    return (_jsxs("section", { className: "lune-panel relative overflow-hidden p-4", children: [_jsx("div", { ref: containerRef, className: "lune-scrollbar h-72 overflow-y-auto px-3 py-10 text-center", children: lines.map((line, index) => {
                    const active = index === currentIndex;
                    const distance = Math.abs(index - currentIndex);
                    const faded = distance > 1;
                    return (_jsxs("div", { ref: active ? activeRef : null, className: `py-2 transition duration-200 ${active
                            ? 'scale-[1.025] text-[rgb(var(--lune-text)/0.96)]'
                            : faded
                                ? 'text-[rgb(var(--lune-muted)/0.28)]'
                                : 'text-[rgb(var(--lune-muted)/0.5)]'}`, children: [_jsx("div", { className: `mx-auto max-w-[52ch] leading-relaxed ${active
                                    ? 'text-base font-semibold drop-shadow-[0_0_10px_rgb(var(--lune-accent)/0.14)]'
                                    : 'text-sm font-medium'}`, children: line.text }), line.trans && (_jsx("div", { className: `mt-1 text-xs leading-relaxed ${active ? 'text-[rgb(var(--lune-muted)/0.46)]' : 'text-[rgb(var(--lune-muted)/0.28)]'}`, children: line.trans }))] }, `${line.time}-${index}`));
                }) }), _jsx("div", { className: "pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[rgb(var(--lune-surface)/0.95)] to-transparent" }), _jsx("div", { className: "pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[rgb(var(--lune-surface)/0.95)] to-transparent" })] }));
}
