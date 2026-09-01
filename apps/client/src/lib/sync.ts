/**
 * 同步时钟修正(移植 v1 lib/sync.ts,时间单位由秒改为毫秒)。
 *
 * 服务端在原子房间状态的 playback 中附 serverTimestamp + position(毫秒)。
 * 客户端用本地 now 与 serverTimestamp 的差,叠加单向 RTT 估算当前应处进度。
 */

/** 估算目标播放进度(毫秒) */
export function calcTargetPosition(
  position: number,
  serverTimestamp: number,
  rtt: number,
): number {
  const now = Date.now();
  const oneWayDelay = rtt / 2;
  const elapsed = now - serverTimestamp - oneWayDelay;
  return Math.max(0, position + elapsed);
}

/** 修正指令:微调速或跳转 */
export type Correction =
  | { type: 'rate'; rate: number }
  | { type: 'seek'; target: number };

/**
 * 判断是否需要修正。阈值单位毫秒。
 * - 偏差 < 200ms:不修正
 * - 200~500ms:微调播放速率(rate)
 * - > 500ms:直接 seek
 */
export function shouldCorrect(actual: number, expected: number): Correction | null {
  const diff = Math.abs(actual - expected);
  if (diff < 200) return null;
  if (diff < 500) {
    return { type: 'rate', rate: actual > expected ? 0.97 : 1.03 };
  }
  return { type: 'seek', target: expected };
}
