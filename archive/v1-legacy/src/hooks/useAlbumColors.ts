import { useState, useEffect, useRef } from 'react';

interface AlbumColors {
  dominant: string; // 主色，用作背景基调
  accent: string; // 强调色，用作控件高亮
  isDark: boolean; // 是否为深色封面
}

// 从封面图片提取颜色
function extractColors(image: HTMLImageElement): AlbumColors {
  const canvas = document.createElement('canvas');
  const size = 50; // 缩小到 50px 采样，足够且快
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, size, size);

  const data = ctx.getImageData(0, 0, size, size).data;
  const buckets: Map<string, { r: number; g: number; b: number; count: number }> = new Map();

  // 量化为 16 级色阶，减少桶数
  const step = 16;
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.round(data[i] / step) * step;
    const g = Math.round(data[i + 1] / step) * step;
    const b = Math.round(data[i + 2] / step) * step;
    // 跳过极黑和极白
    const brightness = (r + g + b) / 3;
    if (brightness < 20 || brightness > 240) continue;

    const key = `${r},${g},${b}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  // 按出现次数排序
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);

  if (sorted.length === 0) {
    return { dominant: '#1a1a2e', accent: '#e0e0e0', isDark: true };
  }

  // 主色：出现最多的
  const dominant = sorted[0];

  // 强调色：找与主色色相差异较大的高频色
  const dominantHue = rgbToHue(dominant.r, dominant.g, dominant.b);
  let accent = sorted[0];
  for (const c of sorted.slice(1)) {
    const hue = rgbToHue(c.r, c.g, c.b);
    if (Math.abs(hue - dominantHue) > 60) {
      accent = c;
      break;
    }
  }

  const domBrightness = (dominant.r + dominant.g + dominant.b) / 3;

  return {
    dominant: rgbToHex(dominant.r, dominant.g, dominant.b),
    accent: rgbToHex(accent.r, accent.g, accent.b),
    isDark: domBrightness < 100,
  };
}

function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return h * 60;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function useAlbumColors(coverUrl: string | undefined): AlbumColors {
  const [colors, setColors] = useState<AlbumColors>({
    dominant: '#0f0f1a',
    accent: '#a0a0b0',
    isDark: true,
  });
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!coverUrl) return;
    // 避免重复处理同一 URL
    if (pendingRef.current === coverUrl) return;
    pendingRef.current = coverUrl;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (pendingRef.current !== coverUrl) return; // 过期请求
      setColors(extractColors(img));
    };
    img.onerror = () => {
      // 跨域失败时用默认色
      setColors({ dominant: '#0f0f1a', accent: '#a0a0b0', isDark: true });
    };
    img.src = coverUrl;
  }, [coverUrl]);

  return colors;
}
