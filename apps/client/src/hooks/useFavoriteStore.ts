import { create } from 'zustand';

const STORAGE_KEY = 'lune.favorites';

interface FavoriteState {
  ids: Set<string>;
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => void;
}

function loadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function persist(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // 隐私模式/无 localStorage 时忽略
  }
}

export const useFavoriteStore = create<FavoriteState>((set, get) => ({
  ids: loadIds(),
  isFavorite: (id) => get().ids.has(id),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return { ids: next };
    }),
}));