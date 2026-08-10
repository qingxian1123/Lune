import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { WS_URL } from '../lib/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useRoomStore } from '../hooks/useRoomStore';
import { useSync } from '../hooks/useSync';
import { usePlayer } from '../hooks/usePlayer';
import { useLyric } from '../hooks/useLyric';
import { useAccentColor } from '../hooks/useAccentColor';
import { getUiErrorMessage } from '../lib/uiError';
import NowPlaying from '../components/NowPlaying';
import TransportBar from '../components/TransportBar';
import Queue from '../components/Queue';
import SearchPanel from '../components/SearchPanel';
import MemberList from '../components/MemberList';
export default function Room() {
    const { code } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state;
    const [sideTab, setSideTab] = useState('search');
    const [panelOpen, setPanelOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    useEffect(() => {
        if (!state?.token || !state?.memberId || !code) {
            navigate('/', { replace: true });
        }
    }, [state, code, navigate]);
    const token = state?.token ?? '';
    const memberId = state?.memberId ?? '';
    const ws = useWebSocket(WS_URL);
    const { send } = ws;
    const setIdentity = useRoomStore((roomState) => roomState.setIdentity);
    const reset = useRoomStore((roomState) => roomState.reset);
    const playback = useRoomStore((roomState) => roomState.playback);
    const queue = useRoomStore((roomState) => roomState.queue);
    const queueRevision = useRoomStore((roomState) => roomState.queueRevision);
    const members = useRoomStore((roomState) => roomState.members);
    const ownerId = useRoomStore((roomState) => roomState.ownerId);
    const roomCode = useRoomStore((roomState) => roomState.roomCode);
    const lastError = useRoomStore((roomState) => roomState.lastError);
    const isOwner = ownerId === memberId;
    const onEnd = useCallback(() => {
        const endedTrackId = playback.track?.id;
        const message = { type: 'next', payload: { endedTrackId } };
        send(message);
    }, [playback.track?.id, send]);
    const { state: playerState, engine, setVolume } = usePlayer(onEnd);
    useSync({ send, subscribe: ws.subscribe, getRtt: ws.getRtt, engine });
    const joinedRef = useRef(false);
    useEffect(() => {
        if (ws.readyState !== WebSocket.OPEN || joinedRef.current)
            return;
        joinedRef.current = true;
        setIdentity(memberId, code ?? '');
        send({ type: 'join', payload: { token } });
    }, [ws.readyState, send, token, memberId, code, setIdentity]);
    useEffect(() => {
        return () => reset();
    }, [reset]);
    useEffect(() => {
        if (!copied)
            return;
        const timeout = window.setTimeout(() => setCopied(false), 1800);
        return () => window.clearTimeout(timeout);
    }, [copied]);
    const track = playback.track;
    const { lines, currentIndex, isLoading: isLoadingLyrics } = useLyric(track?.id, playerState.currentTime, track?.provider);
    const { accent, accentSoft, bgAccent } = useAccentColor(track?.coverUrl, track?.id);
    const themeStyle = {
        '--lune-accent': accent,
        '--lune-accent-soft': accentSoft,
        '--lune-bg-accent': bgAccent,
    };
    const onPickTrack = useCallback((nextTrack) => {
        if (playback.status === 'idle') {
            send({ type: 'play', payload: { track: nextTrack, position: 0 } });
        }
        else {
            send({ type: 'add_song', payload: { track: nextTrack } });
        }
    }, [playback.status, send]);
    const onAddMany = useCallback((tracks) => {
        if (tracks.length > 0)
            send({ type: 'add_songs', payload: { tracks } });
    }, [send]);
    const onNext = useCallback(() => {
        send({ type: 'next', payload: { endedTrackId: track?.id } });
    }, [send, track?.id]);
    const onRemove = useCallback((index) => send({ type: 'remove_song', payload: { index } }), [send]);
    const onReorder = useCallback((fromIndex, toIndex) => send({ type: 'reorder_song', payload: { fromIndex, toIndex, expectedRevision: queueRevision } }), [queueRevision, send]);
    const onSeek = useCallback((position) => send({ type: 'seek', payload: { position } }), [send]);
    const copyCode = useCallback(() => {
        const value = roomCode || code;
        if (!value)
            return;
        void navigator.clipboard?.writeText(value);
        setCopied(true);
    }, [roomCode, code]);
    const view = useMemo(() => ({
        currentTime: playback.status === 'idle' ? 0 : playerState.currentTime,
        duration: track?.duration || playerState.duration || 0,
    }), [playback.status, playerState.currentTime, playerState.duration, track?.duration]);
    if (!code)
        return null;
    const connected = ws.readyState === WebSocket.OPEN;
    const selectSideTab = (tab) => {
        setSideTab(tab);
        setPanelOpen(true);
    };
    return (_jsxs("div", { className: "room-shell", style: themeStyle, children: [_jsxs("header", { className: "room-topbar", children: [_jsxs("div", { className: "room-brand", children: [_jsx("span", { className: "brand-mark", children: "LUNE" }), _jsx("span", { className: "brand-divider" }), _jsxs("button", { type: "button", className: "room-code", onClick: copyCode, title: "\u590D\u5236\u623F\u95F4\u7801", children: [_jsx("span", { children: "\u623F\u95F4" }), _jsx("strong", { children: roomCode || code }), _jsx("small", { children: copied ? '已复制' : '复制' })] })] }), _jsxs("div", { className: "room-actions", children: [_jsxs("div", { className: "connection-state", children: [_jsx("span", { className: connected ? 'is-connected' : '' }), _jsxs("div", { children: [_jsx("strong", { children: connected ? `${members.length} 人正在听` : '正在连接' }), _jsx("small", { children: isOwner ? '你是房主' : '正在跟随房主' })] })] }), _jsx("button", { type: "button", className: "mobile-panel-toggle", onClick: () => setPanelOpen(true), children: "\u97F3\u4E50\u5E93" }), _jsx("button", { type: "button", className: "leave-room", onClick: () => navigate('/'), children: _jsx("strong", { "aria-hidden": "true", children: "\u00D7" }) })] })] }), lastError && (_jsx("div", { className: "room-error", role: "alert", children: getUiErrorMessage(lastError) })), _jsxs("main", { className: "room-workspace", children: [_jsx(NowPlaying, { track: track, lines: lines, currentIndex: currentIndex, isLoadingLyrics: isLoadingLyrics, isBuffering: playerState.isBuffering, isOwner: isOwner, membersCount: members.length, onSeek: onSeek }), _jsxs("aside", { className: `terminal-sidebar ${panelOpen ? 'is-open' : ''}`, "aria-label": "\u623F\u95F4\u97F3\u4E50\u5E93", children: [_jsxs("div", { className: "sidebar-header", children: [_jsxs("div", { className: "side-tabs", role: "tablist", "aria-label": "\u623F\u95F4\u5DE5\u5177", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": sideTab === 'search', className: sideTab === 'search' ? 'is-active' : '', onClick: () => selectSideTab('search'), children: "\u641C\u7D22" }), _jsxs("button", { type: "button", role: "tab", "aria-selected": sideTab === 'queue', className: sideTab === 'queue' ? 'is-active' : '', onClick: () => selectSideTab('queue'), children: ["\u961F\u5217 ", _jsx("small", { children: queue.length })] }), _jsxs("button", { type: "button", role: "tab", "aria-selected": sideTab === 'members', className: sideTab === 'members' ? 'is-active' : '', onClick: () => selectSideTab('members'), children: ["\u6210\u5458 ", _jsx("small", { children: members.length })] })] }), _jsx("button", { type: "button", className: "close-sidebar", onClick: () => setPanelOpen(false), "aria-label": "\u5173\u95ED\u7EC8\u7AEF", children: "\u00D7" })] }), _jsxs("div", { className: "sidebar-content", children: [_jsx("div", { hidden: sideTab !== 'search', children: _jsx(SearchPanel, { onPick: onPickTrack, onAddMany: onAddMany }) }), _jsx("div", { hidden: sideTab !== 'queue', children: _jsx(Queue, { queue: queue, currentTrackId: track?.id, isOwner: isOwner, onRemove: onRemove, onReorder: onReorder }) }), _jsx("div", { hidden: sideTab !== 'members', children: _jsx(MemberList, { members: members, ownerId: ownerId }) })] })] })] }), _jsx(TransportBar, { track: track, currentTime: view.currentTime, duration: view.duration, isBuffering: playerState.isBuffering, isOwner: isOwner, membersCount: members.length, onSeek: onSeek, onVolume: setVolume, onNext: onNext })] }));
}
