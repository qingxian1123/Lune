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
 * - ended 由同步层绑定实际加载的播放版本
 *
 * 不暴露 play 键(产品决定:加入歌曲即播放,无手动播/暂停)。
 * seek 与音量仍提供。
 */
export function usePlayer() {
  const engineRef = useRef<AudioEngine>(AudioEngine.instance());
  const [state, setState] = useState<PlayerState>({
    currentTime: 0,
    duration: 0,
    isBuffering: false,
  });

  useEffect(() => {
    const engine = engineRef.current;
    engine.onTick((ms) => setState((s) => ({ ...s, currentTime: ms })));
    engine.onDuration((ms) => setState((s) => ({ ...s, duration: ms })));
    engine.onBuffering((b) => setState((s) => ({ ...s, isBuffering: b })));
    return () => {
      // 组件卸载不 dispose 引擎(单例,跨页面复用)
    };
  }, []);

  return {
    state,
    engine: engineRef.current,
    seek: (ms: number) => engineRef.current.seek(ms),
    setRate: (r: number) => engineRef.current.setRate(r),
  };
}
