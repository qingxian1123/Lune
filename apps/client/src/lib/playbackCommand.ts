import type { ClientMessage, PlaybackAdvanceReason, PlaybackState } from '@lune/shared';

type AdvancePlaybackMessage = Extract<ClientMessage, { type: 'advance_playback' }>;

export const getTrackKey = (
  track: { id: string; provider?: string },
): string => `${track.provider || ''}:${track.id}`;

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** 创建绑定当前播放版本的幂等切歌命令。 */
export function createAdvancePlaybackMessage(
  playback: PlaybackState,
  reason: PlaybackAdvanceReason,
): AdvancePlaybackMessage | null {
  if (playback.status !== 'playing' || !playback.track) return null;
  return {
    type: 'advance_playback',
    payload: {
      requestId: createRequestId(),
      expectedPlaybackSeq: playback.seq,
      expectedTrackKey: getTrackKey(playback.track),
      reason,
    },
  };
}
