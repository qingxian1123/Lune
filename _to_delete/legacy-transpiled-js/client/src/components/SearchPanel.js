import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { getPlaylist, getProviders, searchPlaylists, searchTracks } from '../lib/api';
import { formatTime } from '../lib/format';
import { getUiErrorMessage } from '../lib/uiError';
const providerLabel = (provider) => ({ netease: '网易云音乐', kugou: '酷狗音乐' })[provider] || provider;
export default function SearchPanel({ onPick, onAddMany }) {
    const [tab, setTab] = useState('songs');
    const [providers, setProviders] = useState([]);
    const [provider, setProvider] = useState('');
    // 搜歌 state
    const [kw, setKw] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');
    // 歌单 state
    const [plView, setPlView] = useState('list');
    const [plKw, setPlKw] = useState('');
    const [playlists, setPlaylists] = useState([]);
    const [plLoading, setPlLoading] = useState(false);
    const [plErr, setPlErr] = useState('');
    const [selected, setSelected] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailErr, setDetailErr] = useState('');
    useEffect(() => {
        let alive = true;
        getProviders()
            .then((activeProviders) => {
            if (!alive)
                return;
            setProviders(activeProviders);
            setProvider((current) => current && activeProviders.includes(current) ? current : activeProviders[0] || '');
        })
            .catch(() => {
            if (!alive)
                return;
            setProviders(['netease']);
            setProvider('netease');
        });
        return () => {
            alive = false;
        };
    }, []);
    const changeProvider = (nextProvider) => {
        setProvider(nextProvider);
        setResults([]);
        setPlaylists([]);
        setTracks([]);
        setSelected(null);
        setPlView('list');
        setErr('');
        setPlErr('');
        setDetailErr('');
    };
    const doSearch = async () => {
        if (!kw.trim())
            return;
        setLoading(true);
        setErr('');
        try {
            setResults(await searchTracks(kw.trim(), 20, provider || undefined));
        }
        catch (e) {
            setErr(getUiErrorMessage(e, '暂时无法搜索歌曲，请稍后再试'));
        }
        finally {
            setLoading(false);
        }
    };
    const doPlaylistSearch = async () => {
        if (!plKw.trim())
            return;
        setPlLoading(true);
        setPlErr('');
        try {
            setPlaylists(await searchPlaylists(plKw.trim(), 20, provider || undefined));
        }
        catch (e) {
            setPlErr(getUiErrorMessage(e, '暂时无法搜索歌单，请稍后再试'));
        }
        finally {
            setPlLoading(false);
        }
    };
    const openPlaylist = async (pl) => {
        setSelected(pl);
        setPlView('detail');
        setDetailLoading(true);
        setDetailErr('');
        setTracks([]);
        try {
            setTracks(await getPlaylist(pl.id, pl.provider || provider || undefined));
        }
        catch (e) {
            setDetailErr(getUiErrorMessage(e, '歌单载入失败，请稍后再试'));
        }
        finally {
            setDetailLoading(false);
        }
    };
    const backToList = () => {
        setPlView('list');
        setDetailErr('');
    };
    return (_jsxs("section", { className: "terminal-pane terminal-search", children: [_jsxs("div", { className: "pane-heading", children: [_jsxs("div", { children: [_jsx("span", { children: "\u6DFB\u52A0\u5230\u623F\u95F4" }), _jsx("strong", { children: "\u641C\u7D22\u97F3\u4E50" })] }), _jsxs("label", { className: "flex items-center gap-2 text-xs text-[rgb(var(--lune-muted)/0.58)]", children: [_jsx("span", { children: "\u97F3\u4E50\u6E90" }), _jsx("select", { value: provider, onChange: (event) => changeProvider(event.target.value), disabled: providers.length === 0, className: "lune-control rounded-lg px-2 py-1 text-xs", "aria-label": "\u9009\u62E9\u97F3\u4E50\u6E90", children: providers.map((item) => (_jsx("option", { value: item, children: providerLabel(item) }, item))) })] })] }), _jsxs("div", { className: "search-mode-tabs", children: [_jsx("button", { type: "button", onClick: () => setTab('songs'), className: tab === 'songs' ? 'is-active' : '', children: "\u5355\u66F2" }), _jsx("button", { type: "button", onClick: () => setTab('playlists'), className: tab === 'playlists' ? 'is-active' : '', children: "\u6B4C\u5355" })] }), tab === 'songs' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: kw, onChange: (e) => setKw(e.target.value), onKeyDown: (e) => e.key === 'Enter' && doSearch(), placeholder: "\u641C\u7D22\u6B4C\u66F2", className: "lune-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm" }), _jsx("button", { onClick: doSearch, disabled: loading || !kw.trim(), className: "lune-control rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45", children: loading ? '搜索中' : '搜索' })] }), err && _jsx("div", { className: "mt-2 rounded-lg bg-rose-950/35 px-2 py-1.5 text-xs text-rose-200", children: err }), _jsx("ul", { className: "lune-scrollbar mt-2 max-h-72 overflow-y-auto pr-1", children: results.map((track) => (_jsxs("li", { className: "lune-item group flex cursor-pointer items-center gap-3 px-2 py-2", onClick: () => onPick(track), children: [_jsx("div", { className: "h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--lune-surface-2))]", children: track.coverUrl ? (_jsx("img", { src: track.coverUrl, alt: `${track.album} 专辑封面`, className: "h-full w-full object-cover" })) : null }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate text-sm font-medium text-[rgb(var(--lune-text)/0.9)]", children: track.name }), _jsx("div", { className: "truncate text-xs text-[rgb(var(--lune-muted)/0.46)]", children: track.artists })] }), _jsx("span", { className: "font-mono text-[11px] text-[rgb(var(--lune-muted)/0.42)]", children: formatTime(track.duration) }), _jsx("span", { className: "rounded-md bg-[rgb(var(--lune-accent)/0.12)] px-2 py-1 text-[11px] text-[rgb(var(--lune-accent))] opacity-0 transition group-hover:opacity-100", children: "\u52A0\u5165" })] }, `${track.provider || provider}:${track.id}`))) })] })), tab === 'playlists' && plView === 'list' && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("input", { value: plKw, onChange: (e) => setPlKw(e.target.value), onKeyDown: (e) => e.key === 'Enter' && doPlaylistSearch(), placeholder: "\u641C\u7D22\u6B4C\u5355\u540D", className: "lune-input min-w-0 flex-1 rounded-xl px-3 py-2 text-sm" }), _jsx("button", { onClick: doPlaylistSearch, disabled: plLoading || !plKw.trim(), className: "lune-control rounded-xl px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45", children: plLoading ? '搜索中' : '搜索' })] }), plErr && _jsx("div", { className: "mt-2 rounded-lg bg-rose-950/35 px-2 py-1.5 text-xs text-rose-200", children: plErr }), _jsx("ul", { className: "lune-scrollbar mt-2 max-h-72 overflow-y-auto pr-1", children: playlists.map((pl) => (_jsxs("li", { className: "lune-item group flex cursor-pointer items-center gap-3 px-2 py-2", onClick: () => openPlaylist(pl), children: [_jsx("div", { className: "h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[rgb(var(--lune-surface-2))]", children: pl.coverUrl ? (_jsx("img", { src: pl.coverUrl, alt: `${pl.name} 歌单封面`, className: "h-full w-full object-cover" })) : null }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate text-sm font-medium text-[rgb(var(--lune-text)/0.9)]", children: pl.name }), _jsxs("div", { className: "truncate text-xs text-[rgb(var(--lune-muted)/0.46)]", children: [pl.trackCount, " \u9996 \u00B7 ", pl.creator] })] }), _jsx("span", { className: "rounded-md bg-[rgb(var(--lune-accent)/0.12)] px-2 py-1 text-[11px] text-[rgb(var(--lune-accent))] opacity-0 transition group-hover:opacity-100", children: "\u67E5\u770B" })] }, `${pl.provider || provider}:${pl.id}`))) })] })), tab === 'playlists' && plView === 'detail' && selected && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { onClick: backToList, className: "lune-control flex h-8 w-8 items-center justify-center rounded-lg text-sm", "aria-label": "\u8FD4\u56DE\u6B4C\u5355\u5217\u8868", title: "\u8FD4\u56DE", children: "\u2190" }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate text-sm font-semibold text-[rgb(var(--lune-text)/0.94)]", children: selected.name }), _jsxs("div", { className: "truncate text-xs text-[rgb(var(--lune-muted)/0.5)]", children: [selected.trackCount, " \u9996 \u00B7 ", selected.creator] })] }), _jsx("button", { onClick: () => onAddMany(tracks), disabled: detailLoading || tracks.length === 0, className: "lune-control rounded-lg px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45", title: "\u628A\u6574\u4E2A\u6B4C\u5355\u52A0\u5165\u5F85\u64AD\u961F\u5217", children: "\u5168\u90E8\u52A0\u5165" })] }), detailErr && _jsx("div", { className: "mt-2 rounded-lg bg-rose-950/35 px-2 py-1.5 text-xs text-rose-200", children: detailErr }), detailLoading ? (_jsx("div", { className: "mt-3 text-center text-xs text-[rgb(var(--lune-muted)/0.42)]", children: "\u52A0\u8F7D\u66F2\u76EE\u4E2D..." })) : tracks.length === 0 ? (_jsx("div", { className: "mt-3 text-center text-xs text-[rgb(var(--lune-muted)/0.42)]", children: "\u8BE5\u6B4C\u5355\u6682\u65E0\u66F2\u76EE" })) : (_jsx("ul", { className: "lune-scrollbar mt-2 max-h-72 overflow-y-auto pr-1", children: tracks.map((track, idx) => (_jsxs("li", { className: "lune-item group flex cursor-pointer items-center gap-3 px-2 py-2", onClick: () => onPick(track), children: [_jsx("span", { className: "w-5 shrink-0 text-right font-mono text-[11px] text-[rgb(var(--lune-muted)/0.4)]", children: idx + 1 }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "truncate text-sm font-medium text-[rgb(var(--lune-text)/0.9)]", children: track.name }), _jsx("div", { className: "truncate text-xs text-[rgb(var(--lune-muted)/0.46)]", children: track.artists })] }), _jsx("span", { className: "font-mono text-[11px] text-[rgb(var(--lune-muted)/0.42)]", children: formatTime(track.duration) }), _jsx("span", { className: "rounded-md bg-[rgb(var(--lune-accent)/0.12)] px-2 py-1 text-[11px] text-[rgb(var(--lune-accent))] opacity-0 transition group-hover:opacity-100", children: "\u52A0\u5165" })] }, `${track.provider || provider}:${track.id}-${idx}`))) }))] }))] }));
}
