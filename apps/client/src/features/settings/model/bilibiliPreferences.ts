import type { BilibiliSearchPrecision } from '@lune/shared';
import { create } from 'zustand';

const key = 'lune.bilibili-search-precision.v1';

function initialPrecision(): BilibiliSearchPrecision {
  try {
    const value = localStorage.getItem(key);
    return value === 'strict' || value === 'broad' ? value : 'balanced';
  } catch {
    return 'balanced';
  }
}

export const useBilibiliPreferences = create<{
  precision: BilibiliSearchPrecision;
  setPrecision: (precision: BilibiliSearchPrecision) => boolean;
}>((set) => ({
  precision: initialPrecision(),
  setPrecision: (precision) => {
    try {
      localStorage.setItem(key, precision);
    } catch {
      return false;
    }
    set({ precision });
    return true;
  },
}));
