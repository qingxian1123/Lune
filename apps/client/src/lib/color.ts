/**
 * 专辑封面取色与色彩推导纯函数。
 *
 * 设计：
 * - quantizeDominant 用频率桶量化从封面像素提取主色，轻量(<5ms / 32x32)
 * - darkenForBackground 把主色按 HSL 暗化到低亮度，作为沉浸式背景底色
 * - ensureReadableAccent 保证强调色在暗底上可读
 *
 * 所有颜色在边界处用 "r g b" 三元组字符串表示，与 index.css 的 CSS 变量格式一致。
 * 用 rgb(var(--x) / a) 引用。
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface AccentPalette {
  /** 主强调色，用于进度条、歌词发光、控件高亮 */
  accent: string;
  /** 强调色暗化版，用于次级高亮 */
  accentSoft: string;
  /** 主色暗化后的背景底色 */
  bgAccent: string;
}

export const DEFAULT_ACCENT: AccentPalette = {
  accent: '166 191 232',
  accentSoft: '96 122 172',
  bgAccent: '14 16 22',
};

/** {r,g,b} -> "r g b" */
export function toTriplet({ r, g, b }: RGB): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

/** "r g b" -> {r,g,b}，解析失败返回 null */
export function fromTriplet(str: string): RGB | null {
  const parts = str.split(/\s+/).map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return { r: parts[0], g: parts[1], b: parts[2] };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** RGB(0-255) -> HSL(h:0-360, s:0-1, l:0-1) */
export function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

/** HSL -> RGB(0-255) */
export function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * 从封面图片提取主色：32x32 采样 + 16 级量化频率桶。
 * 按 count * (1 + 饱和度 * 0.5) 加权，避免大面积灰白留白主导。
 * 跳过极黑(亮度<20)/极白(>240)像素。
 * 任何 Canvas 异常(含 tainted canvas SecurityError)返回 null，由调用方降级。
 */
export function quantizeDominant(image: HTMLImageElement): RGB | null {
  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    const step = 16;
    const buckets = new Map<string, { rgb: RGB; count: number; s: number }>();

    for (let i = 0; i < data.length; i += 4) {
      const r = Math.round(data[i] / step) * step;
      const g = Math.round(data[i + 1] / step) * step;
      const b = Math.round(data[i + 2] / step) * step;
      const brightness = (r + g + b) / 3;
      if (brightness < 20 || brightness > 240) continue;

      const key = `${r},${g},${b}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.count++;
      } else {
        const { s } = rgbToHsl({ r, g, b });
        buckets.set(key, { rgb: { r, g, b }, count: 1, s });
      }
    }

    if (buckets.size === 0) return null;

    let best: { rgb: RGB; score: number } | null = null;
    for (const bucket of buckets.values()) {
      const score = bucket.count * (1 + bucket.s * 0.5);
      if (!best || score > best.score) best = { rgb: bucket.rgb, score };
    }
    return best ? best.rgb : null;
  } catch {
    return null;
  }
}

/**
 * 把主色按 HSL 暗化到低亮度，作为背景底色。
 * targetL 默认 0.10，饱和度衰减到 0.55 倍，避免暗脏色过饱和。
 */
export function darkenForBackground(rgb: RGB, targetL = 0.1): RGB {
  const { h, s } = rgbToHsl(rgb);
  return hslToRgb({
    h,
    s: s * 0.55,
    l: clamp(targetL, 0.06, 0.13),
  });
}

/** 封面局部光晕：保留色相，限制鲜艳封面的饱和度与亮度。 */
export function deriveCoverGlow(rgb: RGB): string {
  const { h, s } = rgbToHsl(rgb);
  return toTriplet(hslToRgb({
    h,
    s: Math.min(s * 0.45, 0.28),
    l: 0.22 - Math.min(s, 1) * 0.04,
  }));
}

/**
 * 调整主色亮度让其在暗底上可读：太暗抬到 0.55，太亮压到 0.70。
 * 用于进度条填充、歌词描边等需要与暗背景对比的元素。
 */
export function ensureReadableAccent(rgb: RGB): RGB {
  const { h, s, l } = rgbToHsl(rgb);
  let targetL = l;
  if (l < 0.3) targetL = 0.55;
  else if (l > 0.8) targetL = 0.7;
  if (targetL === l) return rgb;
  return hslToRgb({ h, s, l: targetL });
}

/** 由主色推导完整调色板(主色 + 暗化次级 + 背景底色) */
export function derivePalette(rgb: RGB): AccentPalette {
  const accent = ensureReadableAccent(rgb);
  const accentSoft = darkenForBackground(accent, 0.4);
  const bgAccent = darkenForBackground(rgb, 0.1);
  return {
    accent: toTriplet(accent),
    accentSoft: toTriplet(accentSoft),
    bgAccent: toTriplet(bgAccent),
  };
}
