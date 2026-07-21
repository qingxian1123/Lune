import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import { useRoom } from '../hooks/useRoom';
import { usePlayer } from '../hooks/usePlayer';
import { useSync } from '../hooks/useSync';
import { useAlbumColors } from '../hooks/useAlbumColors';
import { searchTracks, getLyric } from '../lib/netease';
import type { Track } from '../types';

const BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3001';
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';

// ---- 歌词行类型 ----
interface LyricLine {
  time: number;
  text: string;
  trans: string;
}

export default function Room() {
  const { code } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { nickname?: string; action?: 'create' | 'join'; roomCode?: string } | null;

  // 重定向保护
  useEffect(() => {
    if (!state?.nickname || !code) navigate('/', { replace: true });
  }, [state, code, navigate]);

  // ---- 核心 hooks ----
  const ws = useWebSocket(WS_URL);
  const room = useRoom({ send: ws.send, lastMessage: ws.lastMessage, readyState: ws.readyState });
  const player = usePlayer();
  const sync = useSync({
    send: ws.send,
    lastMessage: ws.lastMessage,
    getRtt: ws.getRtt,
    player,
  });

  const playbackView = useMemo(() => {
    const track = room.playback.track;
    const duration = track?.duration || player.duration || 0;
    const fallbackPosition = room.playback.status === 'idle' ? 0 : room.playback.position;
    const localPosition = player.currentTime > 0 ? player.currentTime : fallbackPosition;
    const currentTime = duration > 0 ? Math.min(localPosition, duration) : localPosition;

    return {
      currentTime,
      duration,
      isPlaying: room.playback.status === 'playing',
      track,
    };
  }, [
    player.currentTime,
    player.duration,
    room.playback.position,
    room.playback.status,
    room.playback.track,
  ]);

  // ---- 连接房间 ----
  const [hasJoined, setHasJoined] = useState(false);
  useEffect(() => {
    if (hasJoined || ws.readyState !== WebSocket.OPEN) return;
    setHasJoined(true);
    if (state?.action === 'create') {
      ws.send({ type: 'create_room', payload: { nickname: state.nickname!, roomCode: state.roomCode! } });
    } else {
      ws.send({ type: 'join_room', payload: { roomCode: code!, nickname: state?.nickname || '听众' } });
    }
  }, [ws.readyState, hasJoined, state, code, ws.send]);

  // ---- 歌词 ----
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([]);
  const currentLyricIndex = useMemo(() => {
    if (lyricLines.length === 0) return -1;
    const t = playbackView.currentTime;
    let idx = -1;
    for (let i = 0; i < lyricLines.length; i++) {
      if (lyricLines[i].time <= t) idx = i;
      else break;
    }
    return idx;
  }, [lyricLines, playbackView.currentTime]);

  useEffect(() => {
    if (!room.playback.track) {
      setLyricLines([]);
      return;
    }
    getLyric(room.playback.track.id)
      .then((d) => setLyricLines(d.lines))
      .catch(() => setLyricLines([]));
  }, [room.playback.track?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 封面取色 ----
  const colors = useAlbumColors(room.playback.track?.coverUrl);

  // ---- 搜索 ----
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchKeyword.trim()) return;
    setIsSearching(true);
    try {
      setSearchResults(await searchTracks(searchKeyword.trim()));
    } finally {
      setIsSearching(false);
    }
  }, [searchKeyword]);

  // ---- 播放操作 ----
  const handlePlay = useCallback(
    (track: Track) => {
      sync.cmdPlay(track, 0);
      setShowSearch(false);
      setSearchKeyword('');
      setSearchResults([]);
    },
    [sync],
  );

  const handleStartCurrent = useCallback(() => {
    const t = playbackView.track;
    if (t && !playbackView.isPlaying) sync.cmdPlay(t, 0);
  }, [playbackView.isPlaying, playbackView.track, sync]);

  const handleAddToQueue = useCallback(
    (track: Track) => {
      sync.addToQueue(track);
    },
    [sync],
  );

  const handlePrev = useCallback(() => {
    if (!playbackView.track) return;
    sync.cmdSeek(0);
  }, [playbackView.track, sync]);

  const handleNext = useCallback(() => {
    sync.cmdNext();
  }, [sync]);

  // 播放状态只展示 playing，不再提供暂停/恢复
  const isPlaying = playbackView.isPlaying;

  // ---- 滚轮交互 ----
  const [volume, setVolume] = useState(0.8);
  const [showVolume, setShowVolume] = useState(false);
  const volumeTimer = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const handleVolumeChange = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));
      setVolume(clamped);
      player.setVolume(clamped);
      setShowVolume(true);
      clearTimeout(volumeTimer.current);
      volumeTimer.current = window.setTimeout(() => setShowVolume(false), 1500);
    },
    [player],
  );
  const handleVolumeChangeRef = useRef(handleVolumeChange);
  handleVolumeChangeRef.current = handleVolumeChange;

  const coverRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = coverRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      handleVolumeChangeRef.current(volumeRef.current - e.deltaY * 0.001);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ---- 工具函数 ----
  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const copyCode = () => navigator.clipboard.writeText(code || '');

  const handleLeave = () => {
    room.leaveRoom();
    navigate('/');
  };

  // 封面淡入淡出
  const [coverVisible, setCoverVisible] = useState(true);
  const prevCoverRef = useRef<string>('');
  useEffect(() => {
    if (!room.playback.track?.coverUrl) return;
    if (prevCoverRef.current && prevCoverRef.current !== room.playback.track.coverUrl) {
      setCoverVisible(false);
      const t = setTimeout(() => setCoverVisible(true), 300);
      return () => clearTimeout(t);
    }
    prevCoverRef.current = room.playback.track.coverUrl;
    setCoverVisible(true);
  }, [room.playback.track?.coverUrl]);

  // ---- 渲染 ----
  if (!state?.nickname) return null;

  return (
    <div
      className="relative h-screen w-screen overflow-hidden select-none"
      style={{
        backgroundColor: colors.dominant,
        transition: 'background-color 1.2s ease',
      }}
    >
      {/* ====== 模糊背景层 ====== */}
      <div className="absolute inset-0">
        {room.playback.track?.coverUrl && (
          <img
            src={room.playback.track.coverUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110"
            style={{
              filter: 'blur(80px) saturate(1.6)',
              opacity: coverVisible ? 1 : 0,
              transition: 'opacity 1s ease',
            }}
          />
        )}
        {/* 深色遮罩 */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${colors.dominant}99 0%, ${colors.dominant}dd 50%, ${colors.dominant} 100%)`,
            transition: 'background 1.2s ease',
          }}
        />
      </div>

      {/* ====== 内容层 ====== */}
      <div className="relative z-10 h-full flex flex-col">
        {/* 顶部栏 */}
        <header className="flex items-center justify-between px-8 py-5 shrink-0">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-[0.3em] text-white/60">LUNE</span>
            <span className="text-white/30 text-xs">
              房间 {code} · {room.members.length} 人
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={copyCode}
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              复制房间码
            </button>
            <button
              onClick={handleLeave}
              className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
            >
              离开
            </button>
          </div>
        </header>

        {/* 主区域：封面 + 歌词 */}
        <div className="flex-1 flex flex-col items-center justify-center gap-10 min-h-0">
          {/* 成员列表（左侧悬浮） */}
          <div className="fixed left-8 top-1/2 -translate-y-1/2 space-y-3">
            {room.members.map((m) => (
              <div key={m.id} className="flex items-center gap-2 group">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: m.isOwner ? colors.accent : '#ffffff40' }}
                />
                <span className="text-xs text-white/50 group-hover:text-white/80 transition-colors truncate max-w-[80px]">
                  {m.nickname}
                </span>
                {m.isOwner && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: colors.accent + '30', color: colors.accent }}
                  >
                    房主
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 封面 */}
          <div
            ref={coverRef}
            className="relative shrink-0 group cursor-pointer"
            style={{ width: 280, height: 280 }}
          >
            {/* 播放时发光环 */}
            {isPlaying && (
              <div
                className="absolute -inset-4 rounded-full animate-spin"
                style={{
                  background: `conic-gradient(from 0deg, ${colors.accent}20, transparent 60%, ${colors.accent}10, transparent)`,
                  animationDuration: '20s',
                }}
              />
            )}
            {isPlaying && (
              <div
                className="absolute -inset-6 rounded-full animate-spin"
                style={{
                  background: `conic-gradient(from 180deg, transparent, ${colors.accent}10, transparent 40%)`,
                  animationDuration: '14s',
                  animationDirection: 'reverse',
                }}
              />
            )}
            {/* 封面图 */}
            {room.playback.track ? (
              <img
                src={room.playback.track.coverUrl}
                alt={room.playback.track.name}
                className="relative w-full h-full object-cover rounded-2xl shadow-2xl"
                style={{
                  opacity: coverVisible ? 1 : 0,
                  transition: 'opacity 0.3s ease',
                  boxShadow: `0 20px 60px -10px ${colors.dominant}`,
                }}
              />
            ) : (
              <div className="relative w-full h-full rounded-2xl bg-white/5 flex items-center justify-center">
                <span className="text-white/20 text-5xl">♪</span>
              </div>
            )}
            {/* 音量提示 */}
            <div
              className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/40 backdrop-blur text-xs text-white/70 transition-opacity duration-300"
              style={{ opacity: showVolume ? 1 : 0 }}
            >
              🔈 {Math.round(volume * 100)}%
            </div>
            {/* 双击喜欢占位 */}
            <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-xs">❤️</span>
            </div>
          </div>

          {/* 歌词（3行） */}
          <div
            className="w-full max-w-lg px-8 h-20 overflow-hidden relative"
            style={{
              maskImage:
                'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)',
            }}
          >
            <div
              className="flex flex-col items-center transition-transform duration-500"
              style={{ transform: `translateY(${-currentLyricIndex * 28 + 28}px)` }}
            >
              {lyricLines.length === 0 && (
                <p className="text-white/20 text-sm leading-7 h-7 text-center">
                  {room.playback.track ? '纯音乐，请欣赏' : ''}
                </p>
              )}
              {lyricLines.map((line, i) => {
                const isCurrent = i === currentLyricIndex;
                return (
                  <p
                    key={i}
                    className="text-center leading-7 h-7 transition-all duration-500 truncate max-w-full"
                    style={{
                      fontSize: isCurrent ? 15 : 13,
                      fontWeight: isCurrent ? 600 : 400,
                      color: isCurrent ? '#fff' : '#ffffff40',
                      opacity: Math.abs(i - currentLyricIndex) <= 1 ? 1 : 0,
                    }}
                  >
                    {line.text}
                    {isCurrent && line.trans && (
                      <span className="block text-xs text-white/30 mt-0.5">{line.trans}</span>
                    )}
                  </p>
                );
              })}
            </div>
          </div>
        </div>

        {/* ====== 底部播放控制栏 ====== */}
        <footer className="shrink-0 px-8 pb-6 pt-2 space-y-3">
          {/* 进度条（只读） */}
          <div className="flex items-center gap-3 max-w-2xl mx-auto">
            <span className="text-xs text-white/40 w-10 text-right tabular-nums">
              {fmt(playbackView.currentTime)}
            </span>
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${playbackView.duration ? (playbackView.currentTime / playbackView.duration) * 100 : 0}%`,
                  backgroundColor: colors.accent,
                }}
              />
            </div>
            <span className="text-xs text-white/40 w-10 tabular-nums">
              {fmt(playbackView.duration)}
            </span>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-center gap-6">
            {/* 循环模式 */}
            <button className="w-8 h-8 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 2l4 4-4 4" />
                <path d="M3 11v-1a4 4 0 014-4h14" />
                <path d="M7 22l-4-4 4-4" />
                <path d="M21 13v1a4 4 0 01-4 4H3" />
              </svg>
            </button>

            {/* 上一首 */}
            <button
              onClick={handlePrev}
              className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* 播放状态 */}
            <button
              onClick={handleStartCurrent}
              disabled={isPlaying || !playbackView.track}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-all enabled:hover:scale-105 enabled:active:scale-95 disabled:cursor-default"
              style={{
                backgroundColor: isPlaying ? colors.accent : '#ffffff15',
                color: isPlaying ? (colors.isDark ? '#fff' : '#111') : '#ffffff99',
                opacity: playbackView.track ? 1 : 0.45,
              }}
            >
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="9" width="3" height="8" rx="1" />
                  <rect x="10.5" y="5" width="3" height="12" rx="1" />
                  <rect x="16" y="11" width="3" height="6" rx="1" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* 下一首 */}
            <button
              onClick={handleNext}
              className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            {/* 音量 */}
            <div className="flex items-center gap-2 group">
              <span className="text-white/30 text-xs">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                </svg>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-20 h-1 appearance-none rounded-full cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${colors.accent} ${volume * 100}%, #ffffff20 ${volume * 100}%)`,
                }}
              />
            </div>
          </div>

          {/* 当前歌曲信息 */}
          <div className="text-center">
            {room.playback.track ? (
              <>
                <p className="text-sm font-medium text-white/90 truncate max-w-md mx-auto">
                  {room.playback.track.name}
                </p>
                <p className="text-xs text-white/40 mt-0.5">
                  {room.playback.track.artists}
                </p>
              </>
            ) : (
              <p className="text-xs text-white/25">搜索歌曲开始播放</p>
            )}
          </div>
        </footer>
      </div>

      {/* ====== 右侧：队列 + 搜索按钮 ====== */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col items-end gap-4">
        {/* 搜索触发按钮 */}
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
          title="搜索歌曲"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </button>

        {/* 队列面板 */}
        <div className="w-64 max-h-60 overflow-y-auto rounded-xl bg-black/40 backdrop-blur border border-white/5 p-3 space-y-2">
          <p className="text-xs text-white/40 font-medium">播放列表</p>
          {room.queue.length === 0 && (
            <p className="text-xs text-white/20">队列为空</p>
          )}
          {room.queue.map((track, i) => (
            <div key={`${track.id}-${i}`} className="flex items-center gap-2 group">
              <img
                src={track.coverUrl || ''}
                alt=""
                className="w-8 h-8 rounded object-cover bg-white/5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 truncate">{track.name}</p>
                <p className="text-[10px] text-white/30 truncate">{track.artists}</p>
              </div>
              <button
                onClick={() => sync.removeFromQueue(i)}
                className="text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ====== 搜索浮层 ====== */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSearch(false)} />
          <div className="relative w-full max-w-md bg-gray-950/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl">
            <div className="p-4 flex gap-2">
              <input
                autoFocus
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                placeholder="搜索歌曲..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: colors.accent + '30', color: colors.accent }}
              >
                {isSearching ? '...' : '搜索'}
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto px-2 pb-2">
              {searchResults.map((track) => (
                <div
                  key={track.id}
                  className="flex items-center gap-2 p-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <img
                    src={track.coverUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'}
                    alt=""
                    className="w-11 h-11 rounded-lg object-cover bg-white/5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/90 truncate">{track.name}</p>
                    <p className="text-xs text-white/40 truncate mt-0.5">{track.artists}</p>
                  </div>
                  <span className="text-xs text-white/25 shrink-0">{fmt(track.duration)}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => handlePlay(track)}
                      className="px-2 py-1 rounded text-xs font-medium bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
                      title="立刻播放"
                    >
                      ▶
                    </button>
                    <button
                      onClick={() => handleAddToQueue(track)}
                      className="px-2 py-1 rounded text-xs font-medium bg-white/5 text-white/50 hover:bg-white/10 transition-colors"
                      title="加入队列"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && !isSearching && (
                <p className="text-center text-white/20 text-sm py-8">输入关键词搜索</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
