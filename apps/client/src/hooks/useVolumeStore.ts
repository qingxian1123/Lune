import { create } from 'zustand';
import { AudioEngine } from '../audio/AudioEngine';
import { clampAudioVolume, SAFE_INITIAL_VOLUME } from '../lib/audioVolume';

const STORAGE_KEY = 'lune.audio.volume.v1';
const STORAGE_VERSION = 1;

interface StoredVolumeState {
  version: typeof STORAGE_VERSION;
  volume: number;
  muted: boolean;
  lastAudibleVolume: number;
}

interface VolumeState extends Omit<StoredVolumeState, 'version'> {
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

const defaultState: StoredVolumeState = {
  version: STORAGE_VERSION,
  volume: SAFE_INITIAL_VOLUME,
  muted: false,
  lastAudibleVolume: SAFE_INITIAL_VOLUME,
};

function loadVolumeState(): StoredVolumeState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;

    const stored = JSON.parse(raw) as Partial<StoredVolumeState>;
    if (stored.version !== STORAGE_VERSION || typeof stored.volume !== 'number') {
      return defaultState;
    }

    const volume = clampAudioVolume(stored.volume);
    const muted = stored.muted === true || volume === 0;
    const storedRestoreVolume =
      typeof stored.lastAudibleVolume === 'number'
        ? clampAudioVolume(stored.lastAudibleVolume)
        : SAFE_INITIAL_VOLUME;
    const lastAudibleVolume =
      storedRestoreVolume > 0
        ? storedRestoreVolume
        : volume > 0
          ? volume
          : SAFE_INITIAL_VOLUME;

    return {
      version: STORAGE_VERSION,
      volume: muted ? 0 : volume,
      muted,
      lastAudibleVolume,
    };
  } catch {
    return defaultState;
  }
}

function persistVolumeState(state: Pick<VolumeState, 'volume' | 'muted' | 'lastAudibleVolume'>): void {
  if (typeof window === 'undefined') return;

  try {
    const stored: StoredVolumeState = {
      version: STORAGE_VERSION,
      volume: state.volume,
      muted: state.muted,
      lastAudibleVolume: state.lastAudibleVolume,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // 隐私模式、存储空间不足或 WebView 禁用 localStorage 时保持内存状态可用。
  }
}

const initialState = loadVolumeState();

export const useVolumeStore = create<VolumeState>((set, get) => ({
  volume: initialState.volume,
  muted: initialState.muted,
  lastAudibleVolume: initialState.lastAudibleVolume,
  setVolume: (value) => {
    const volume = clampAudioVolume(value);
    const current = get();
    const next = {
      volume,
      muted: volume === 0,
      lastAudibleVolume: volume > 0 ? volume : current.lastAudibleVolume,
    };

    AudioEngine.instance().setVolume(volume);
    persistVolumeState(next);
    set(next);
  },
  toggleMute: () => {
    const current = get();
    const next = current.muted
      ? {
          volume: current.lastAudibleVolume,
          muted: false,
          lastAudibleVolume: current.lastAudibleVolume,
        }
      : {
          volume: 0,
          muted: true,
          lastAudibleVolume: current.volume > 0 ? current.volume : current.lastAudibleVolume,
        };

    AudioEngine.instance().setVolume(next.volume);
    persistVolumeState(next);
    set(next);
  },
}));

// 在房间首次播放之前应用本机记忆值；不会创建 AudioContext，也不会触发播放。
AudioEngine.instance().setVolume(initialState.volume, { immediate: true });
