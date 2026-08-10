import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRoom, joinRoom } from '../lib/api';
import { AudioEngine } from '../audio/AudioEngine';
import { getUiErrorMessage } from '../lib/uiError';
const particles = [
    { '--particle-x': '8%', '--particle-y': '21%', '--particle-size': '1px', '--particle-duration': '27s', '--particle-delay': '-4s', '--particle-drift': '10px' },
    { '--particle-x': '17%', '--particle-y': '72%', '--particle-size': '1px', '--particle-duration': '31s', '--particle-delay': '-16s', '--particle-drift': '-8px' },
    { '--particle-x': '28%', '--particle-y': '38%', '--particle-size': '2px', '--particle-duration': '24s', '--particle-delay': '-9s', '--particle-drift': '7px' },
    { '--particle-x': '39%', '--particle-y': '84%', '--particle-size': '1px', '--particle-duration': '29s', '--particle-delay': '-21s', '--particle-drift': '-11px' },
    { '--particle-x': '48%', '--particle-y': '16%', '--particle-size': '1px', '--particle-duration': '32s', '--particle-delay': '-12s', '--particle-drift': '9px' },
    { '--particle-x': '57%', '--particle-y': '61%', '--particle-size': '1px', '--particle-duration': '25s', '--particle-delay': '-19s', '--particle-drift': '-6px' },
    { '--particle-x': '66%', '--particle-y': '29%', '--particle-size': '2px', '--particle-duration': '30s', '--particle-delay': '-7s', '--particle-drift': '8px' },
    { '--particle-x': '73%', '--particle-y': '78%', '--particle-size': '1px', '--particle-duration': '26s', '--particle-delay': '-14s', '--particle-drift': '-10px' },
    { '--particle-x': '82%', '--particle-y': '47%', '--particle-size': '1px', '--particle-duration': '33s', '--particle-delay': '-24s', '--particle-drift': '6px' },
    { '--particle-x': '91%', '--particle-y': '18%', '--particle-size': '1px', '--particle-duration': '28s', '--particle-delay': '-11s', '--particle-drift': '-7px' },
    { '--particle-x': '94%', '--particle-y': '68%', '--particle-size': '2px', '--particle-duration': '31s', '--particle-delay': '-18s', '--particle-drift': '8px' },
    { '--particle-x': '52%', '--particle-y': '91%', '--particle-size': '1px', '--particle-duration': '29s', '--particle-delay': '-5s', '--particle-drift': '-9px' },
];
export default function Home() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('create');
    const [nickname, setNickname] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const roomCodeRef = useRef(null);
    useEffect(() => {
        if (mode === 'join')
            roomCodeRef.current?.focus();
    }, [mode]);
    const enterRoom = async () => {
        if (!nickname.trim()) {
            setError({ field: 'nickname', message: '请先输入你的昵称' });
            return;
        }
        if (mode === 'join' && !roomCode.trim()) {
            setError({ field: 'roomCode', message: '请输入房主分享的房间码' });
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await AudioEngine.instance().resume();
            const response = mode === 'create'
                ? await createRoom(nickname.trim())
                : await joinRoom(roomCode.trim().toUpperCase(), nickname.trim());
            navigate(`/room/${response.code}`, {
                state: { token: response.token, memberId: response.member.id },
            });
        }
        catch (error) {
            setError({ message: getUiErrorMessage(error, '暂时无法进入房间，请稍后再试') });
        }
        finally {
            setBusy(false);
        }
    };
    const switchMode = (nextMode) => {
        setMode(nextMode);
        setError(null);
    };
    return (_jsxs("div", { className: "access-shell", children: [_jsx("div", { className: "moon-silhouette", "aria-hidden": "true" }), _jsx("div", { className: "home-particles", "aria-hidden": "true", children: particles.map((style, index) => _jsx("i", { style: style }, index)) }), _jsx("header", { className: "access-header", children: _jsxs("div", { className: "brand-lockup", children: [_jsx("span", { className: "brand-mark", children: "LUNE" }), _jsx("span", { className: "brand-divider" }), _jsx("span", { className: "brand-caption", children: "\u4E00\u8D77\u542C" })] }) }), _jsxs("main", { className: "access-main", children: [_jsx("section", { className: "access-intro", "aria-labelledby": "access-title", children: _jsxs("h1", { id: "access-title", children: [_jsx("span", { className: "headline-primary", children: "Follow your inner moonlight" }), _jsx("span", { className: "headline-secondary", children: "don't hide the madness" })] }) }), _jsxs("section", { className: "access-terminal", "aria-label": "\u8FDB\u5165\u97F3\u4E50\u623F\u95F4", children: [_jsx("div", { className: "terminal-heading", children: _jsx("div", { children: _jsx("strong", { children: "\u4ECA\u665A\u60F3\u4E00\u8D77\u542C\u4EC0\u4E48\uFF1F" }) }) }), _jsxs("div", { className: "access-tabs", role: "tablist", "aria-label": "\u623F\u95F4\u64CD\u4F5C", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": mode === 'create', className: mode === 'create' ? 'is-active' : undefined, onClick: () => switchMode('create'), children: "\u521B\u5EFA\u623F\u95F4" }), _jsx("button", { type: "button", role: "tab", "aria-selected": mode === 'join', className: mode === 'join' ? 'is-active' : undefined, onClick: () => switchMode('join'), children: "\u52A0\u5165\u623F\u95F4" })] }), _jsxs("div", { className: "access-fields", children: [_jsxs("label", { className: "terminal-field", children: [_jsx("span", { children: "\u4F60\u7684\u6635\u79F0" }), _jsx("input", { value: nickname, onChange: (event) => {
                                                    setNickname(event.target.value);
                                                    if (error?.field === 'nickname')
                                                        setError(null);
                                                }, onKeyDown: (event) => event.key === 'Enter' && enterRoom(), placeholder: "\u8F93\u5165\u4F60\u7684\u6635\u79F0", maxLength: 32, autoComplete: "nickname" }), error?.field === 'nickname' && _jsx("small", { className: "field-error", children: error.message })] }), mode === 'join' && (_jsxs("label", { className: "terminal-field", children: [_jsx("span", { children: "\u623F\u95F4\u4EE3\u7801" }), _jsx("input", { ref: roomCodeRef, value: roomCode, onChange: (event) => {
                                                    setRoomCode(event.target.value.toUpperCase().slice(0, 6));
                                                    if (error?.field === 'roomCode')
                                                        setError(null);
                                                }, onKeyDown: (event) => event.key === 'Enter' && enterRoom(), placeholder: "\u8F93\u5165\u516D\u4F4D\u623F\u95F4\u7801", maxLength: 6, autoCapitalize: "characters", className: "room-code-input" }), error?.field === 'roomCode' && _jsx("small", { className: "field-error", children: error.message })] })), _jsx("div", { className: `access-message ${error && !error.field ? 'is-error' : ''}`, "aria-live": "polite", children: error && !error.field
                                            ? error.message
                                            : mode === 'create'
                                                ? '创建后即可邀请朋友加入'
                                                : '使用房主分享的房间码加入' }), _jsxs("button", { type: "button", className: "access-submit", onClick: enterRoom, disabled: busy, children: [_jsx("span", { children: busy ? '正在进入房间' : mode === 'create' ? '创建房间' : '加入房间' }), _jsx("span", { "aria-hidden": "true", children: "\u2192" })] })] })] })] })] }));
}
