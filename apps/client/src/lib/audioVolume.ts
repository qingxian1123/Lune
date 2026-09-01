export const SAFE_INITIAL_VOLUME = 0.35;

export function clampAudioVolume(value: number): number {
  if (!Number.isFinite(value)) return SAFE_INITIAL_VOLUME;
  return Math.max(0, Math.min(1, value));
}
