import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audio/AudioEngine';

export interface PlayerState {
  currentTime: number; // 毫秒
  duration: number; // 毫秒
  isBuffering: boolean;
}

/**
 * 包装 AudioEngine 单例为 React 状态。
 * - 转发 tick/duration/buffering 到 state
 * - onEnd 由调用方注入(用于发 next 消息)
 *
 * 不暴露 play 键(产品决定:加入歌曲即播放,无手动播/暂停)。
 * seek 与音量仍提供。
 */
export function usePlayer(onEnd?: () => void) {
  const engineRef = useRef<AudioEngine>(AudioEngine.instance());
  const [state, setState] = useState<PlayerState>({
    currentTime: 0,
    duration: 0,
    isBuffering: false,
  });
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    const engine = engineRef.current;
    engine.onTick((ms) => setState((s) => ({ ...s, currentTime: ms })));
    engine.onDuration((ms) => setState((s) => ({ ...s, duration: ms })));
    engine.onBuffering((b) => setState((s) => ({ ...s, isBuffering: b })));
    engine.onEnd(() => onEndRef.current?.());
    return () => {
      // 组件卸载不 dispose 引擎(单例,跨页面复用)
    };
  }, []);

  return {
    state,
    engine: engineRef.current,
    seek: (ms: number) => engineRef.current.seek(ms),
    setVolume: (v: number) => engineRef.current.setVolume(v),
    setRate: (r: number) => engineRef.current.setRate(r),
  };
}