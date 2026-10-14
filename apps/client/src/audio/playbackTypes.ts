export type OutputHold = 'none' | 'manual' | 'noisy' | 'system' | 'gesture';
export type MediaFailureCode = 'MEDIA_NETWORK' | 'MEDIA_STALL' | 'MEDIA_START_TIMEOUT' | 'MEDIA_DECODE' | 'MEDIA_UNSUPPORTED';
export type MediaResult =
  | { status: 'playing' }
  | { status: 'held'; reason: OutputHold }
  | { status: 'cancelled' }
  | { status: 'failed'; code: MediaFailureCode };

export interface EngineSnapshot {
  playing: boolean;
  buffering: boolean;
  hold: OutputHold;
  failure: MediaFailureCode | null;
  position: number;
  readyState: number;
  seeking: boolean;
}

export interface RecoveryState {
  phase: 'idle' | 'resolving' | 'loading' | 'playing' | 'buffering' | 'recovering' | 'waiting' | 'failed';
  code: string | null;
  attempt: number;
  hold: OutputHold;
}

export const idleRecovery: RecoveryState = { phase: 'idle', code: null, attempt: 0, hold: 'none' };
