import type { Correction } from '../types';

// 根据服务端时间戳计算目标播放位置
export function calcTargetPosition(
  position: number,
  serverTimestamp: number,
  rtt: number,
): number {
  const now = Date.now();
  const oneWayDelay = rtt / 2;
  const elapsed = (now - serverTimestamp - oneWayDelay) / 1000;
  // 考虑服务器处理延迟，位置不能为负
  return Math.max(0, position + elapsed);
}

// 判断是否需要修正播放位置
export function shouldCorrect(
  actual: number,
  expected: number,
): Correction | null {
  const diff = Math.abs(actual - expected);
  if (diff < 0.2) return null;
  if (diff < 0.5) {
    return { type: 'rate', rate: actual > expected ? 0.97 : 1.03 };
  }
  return { type: 'seek', target: expected };
}
