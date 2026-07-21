import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_ACCENT,
  derivePalette,
  quantizeDominant,
  type AccentPalette,
} from '../lib/color';

/**
 * 按 coverUrl 缓存取色结果,只增不删。
 * 切回已播放过的歌时首帧即正确色,避免闪烁。
 */
const colorCache = new Map<string, AccentPalette>();

interface UseAccentColorResult {
  /** 主强调色 "r g b" */
  accent: string;
  /** 次级强调色 "r g b" */
  accentSoft: string;
  /** 主色暗化背景底色 "r g b" */
  bgAccent: string;
  /** 当前色是否已就绪(取色完成或降级);false 期间保留旧值 */
  ready: boolean;
}

/**
 * 从专辑封面提取主色并推导调色板。
 *
 * - 客户端 Canvas 取色(32x32 量化),按 coverUrl 缓存
 * - CORS 失败 / tainted canvas / 网络错误 → 降级 DEFAULT_ACCENT
 * - generation token 防切歌竞态(同 AudioEngine.load 套路)
 * - 切歌时保留旧色到新色就绪,避免闪回默认色
 */
export function useAccentColor(
  coverUrl: string | undefined,
  trackId: string | undefined,
): UseAccentColorResult {
  const [palette, setPalette] = useState<AccentPalette>(() => {
    if (coverUrl) {
      const cached = colorCache.get(coverUrl);
      if (cached) return cached;
    }
    return DEFAULT_ACCENT;
  });
  const [ready, setReady] = useState<boolean>(() => (coverUrl ? colorCache.has(coverUrl) : true));
  const genRef = useRef(0);

  useEffect(() => {
    if (!coverUrl) {
      // 无封面:保留旧色不动,仅标记未就绪由调用方决定是否显示占位
      setPalette(colorCache.get(coverUrl ?? '') ?? DEFAULT_ACCENT);
      setReady(true);
      return;
    }

    const cached = colorCache.get(coverUrl);
    if (cached) {
      setPalette(cached);
      setReady(true);
      return;
    }

    // 未命中缓存:开始异步取色,ready 暂保持旧值(不重置,避免闪烁)
    setReady(false);
    const gen = ++genRef.current;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      if (genRef.current !== gen) return;
      const dominant = quantizeDominant(img);
      const next = dominant ? derivePalette(dominant) : DEFAULT_ACCENT;
      colorCache.set(coverUrl, next);
      setPalette(next);
      setReady(true);
    };

    img.onerror = () => {
      if (genRef.current !== gen) return;
      // 网络失败 / CORS 拒绝加载:降级默认色并缓存,避免重复重试
      colorCache.set(coverUrl, DEFAULT_ACCENT);
      setPalette(DEFAULT_ACCENT);
      setReady(true);
    };

    img.src = coverUrl;

    return () => {
      // 切歌时不清空 state,仅让后续 gen 失效
      genRef.current++;
    };
  }, [coverUrl, trackId]);

  return { accent: palette.accent, accentSoft: palette.accentSoft, bgAccent: palette.bgAccent, ready };
}
