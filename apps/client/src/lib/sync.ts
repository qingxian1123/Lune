/**
 * 同步时钟修正(移植 v1 lib/sync.ts,时间单位由秒改为毫秒)。
 *
 * 服务端在原子房间状态的 playback 中附 serverTimestamp + position(毫秒)。
 * 用消息携带的服务器时间建立本机单调时钟锚点，不比较两台设备的系统时间。
 */

/** 估算目标播放进度(毫秒) */
export function calcTargetPosition(
  position: number,
  serverTimestamp: number,
  rtt: number,
  now = Date.now(),
): number {
  const oneWayDelay = rtt / 2;
  const elapsed = now - serverTimestamp - oneWayDelay;
  return Math.max(0, position + elapsed);
}

/** 服务器时钟估计；performance.now 不受用户改时间或系统校时影响。 */
export class PlaybackClock {
  private anchor: { serverTime: number; receivedAt: number } | null = null;

  observe(serverTime: number | undefined, rtt: number): void {
    if (serverTime === undefined || !Number.isFinite(serverTime)) return;
    const delay = Number.isFinite(rtt) ? Math.max(0, rtt) / 2 : 0;
    this.anchor = { serverTime: serverTime + delay, receivedAt: performance.now() };
  }

  now(): number {
    if (!this.anchor) return Date.now(); // 兼容尚未携带 serverTime 的旧服务端。
    return this.anchor.serverTime + performance.now() - this.anchor.receivedAt;
  }
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
