import { create } from 'zustand';
import type { PlaybackState, Track } from '@lune/shared';

const STORAGE_KEY = 'lune.listening-library.v1';
const HISTORY_LIMIT = 500;
const FAVORITE_LIMIT = 1000;
let hasUnsavedChanges = false;

export const libraryTrackKey = (track: Track) => JSON.stringify([track.provider || '', track.id]);

export interface LibraryEntry {
  id: string;
  server: string;
  track: Track;
  savedAt: number;
  roomCode?: string;
}

interface Observation {
  scope: string;
  trackKey: string | null;
  seq: number;
  timestamp: number;
}

interface LibraryData {
  favorites: LibraryEntry[];
  history: LibraryEntry[];
  observations: Observation[];
}

interface LibraryState extends LibraryData {
  storageError: string | null;
  toggleFavorite: (server: string, track: Track) => void;
  observe: (server: string, roomCode: string, playback: PlaybackState, snapshot: boolean) => void;
  clearHistory: (server: string) => void;
  retrySave: () => void;
}

function isEntry(value: unknown): value is LibraryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as LibraryEntry;
  const track = entry.track;
  return typeof entry.id === 'string' && typeof entry.server === 'string'
    && Number.isFinite(entry.savedAt) && entry.savedAt > 0 && Number.isFinite(new Date(entry.savedAt).getTime())
    && (entry.roomCode === undefined || typeof entry.roomCode === 'string')
    && !!track && typeof track.id === 'string' && typeof track.name === 'string'
    && typeof track.artists === 'string' && typeof track.album === 'string'
    && typeof track.coverUrl === 'string' && Number.isFinite(track.duration)
    && (track.provider === undefined || typeof track.provider === 'string');
}

function load(): LibraryData & { storageError: string | null } {
  const empty = { favorites: [], history: [], observations: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...empty, storageError: null };
    const data = JSON.parse(raw) as Partial<LibraryData> | null;
    if (!data || !Array.isArray(data.favorites) || !Array.isArray(data.history)) throw new Error('Invalid library');
    return {
      favorites: data.favorites.filter(isEntry).slice(0, FAVORITE_LIMIT),
      history: data.history.filter(isEntry).slice(0, HISTORY_LIMIT),
      observations: Array.isArray(data.observations) ? data.observations.filter((item) => item
        && typeof item.scope === 'string' && (item.trackKey === null || typeof item.trackKey === 'string')
        && Number.isFinite(item.seq) && Number.isFinite(item.timestamp)).slice(0, 100) : [],
      storageError: null,
    };
  } catch {
    return { ...empty, storageError: '无法读取本机记录。新内容暂存于本次打开期间，请检查本机存储权限。' };
  }
}

function persist(data: LibraryData): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1,
      favorites: data.favorites, history: data.history, observations: data.observations }));
    hasUnsavedChanges = false;
    return null;
  } catch {
    hasUnsavedChanges = true;
    return '更改暂未保存到本机，关闭后可能丢失。请释放存储空间或检查权限后重试。';
  }
}

function latestData(state: LibraryData): LibraryData {
  // Re-read before mutations so a background room cannot write stale favorites over another tab.
  // Failed writes stay in memory until the user can save again.
  if (hasUnsavedChanges) return state;
  const latest = load();
  return latest.storageError ? state : latest;
}

export const useListeningLibrary = create<LibraryState>((set, get) => ({
  ...load(),
  toggleFavorite: (server, track) => {
    const state = latestData(get());
    const id = JSON.stringify([server, libraryTrackKey(track)]);
    const exists = state.favorites.some((item) => item.id === id);
    if (!exists && state.favorites.length >= FAVORITE_LIMIT) {
      set({ storageError: '已达到本机 1000 首收藏上限，请先取消部分收藏。' });
      return;
    }
    const favorites = exists ? state.favorites.filter((item) => item.id !== id)
      : [{ id, server, track: { ...track }, savedAt: Date.now() }, ...state.favorites];
    set({ ...state, favorites, storageError: persist({ ...state, favorites }) });
  },
  observe: (server, roomCode, playback, snapshot) => {
    const state = latestData(get());
    const scope = JSON.stringify([server, roomCode]);
    const previous = state.observations.find((item) => item.scope === scope);
    const track = playback.status === 'playing' ? playback.track : null;
    const trackKey = track ? libraryTrackKey(track) : null;
    // Ignore replayed/out-of-order events. A newer timestamp allows a recreated room's sequence to restart.
    if (previous && playback.seq <= previous.seq && (!snapshot || playback.serverTimestamp <= previous.timestamp)) return;
    const changed = previous?.trackKey !== trackKey;
    const shouldRecord = track && (changed || (!snapshot && (!previous || playback.seq > previous.seq)));
    const observation = { scope, trackKey, seq: playback.seq, timestamp: playback.serverTimestamp };
    const observations = [observation, ...state.observations.filter((item) => item.scope !== scope)].slice(0, 100);
    const history = shouldRecord ? [{
      id: JSON.stringify([scope, trackKey, playback.seq, playback.serverTimestamp]),
      server, roomCode, track: { ...track }, savedAt: Date.now(),
    }, ...state.history].slice(0, HISTORY_LIMIT) : state.history;
    set({ ...state, history, observations, storageError: persist({ ...state, history, observations }) });
  },
  clearHistory: (server) => {
    const state = latestData(get());
    const history = state.history.filter((item) => item.server !== server);
    set({ ...state, history, storageError: persist({ ...state, history }) });
  },
  retrySave: () => set({ storageError: persist(get()) }),
}));

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  if (!hasUnsavedChanges) useListeningLibrary.setState(load());
});
