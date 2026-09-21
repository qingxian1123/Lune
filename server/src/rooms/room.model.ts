import { randomUUID } from 'node:crypto';
import type { Member, PlaybackAdvanceReason, PlaybackState, QueueItem, RoomSnapshot, Track } from '@lune/shared';

const getTrackKey = (track: Pick<Track, 'id' | 'provider'>): string =>
  `${track.provider || ''}:${track.id}`;

/**
 * 房间管理器(内存态)
 *
 * P1 沿用 v1 的内存模型:进程重启房间清空,不接入 Prisma。
 * 进程内单例,由 NestJS DI 生命周期持有。
 */
export class Room {
  readonly code: string;
  readonly members = new Map<string, { nickname: string; isOwner: boolean }>();
  ownerId = '';
  playback: PlaybackState;
  queue: QueueItem[] = [];
  queueRevision = 0;
  private readonly bornAt = Date.now();

  constructor(code: string) {
    this.code = code;
    this.playback = {
      status: 'idle',
      track: null,
      position: 0,
      serverTimestamp: Date.now(),
      seq: 0,
    };
  }

  addMember(nickname: string): Member {
    const id = randomUUID();
    const isOwner = this.members.size === 0;
    this.members.set(id, { nickname, isOwner });
    if (isOwner) this.ownerId = id;
    return { id, nickname, isOwner };
  }

  removeMember(memberId: string): { empty: boolean; ownerChanged: boolean } {
    if (!this.members.has(memberId)) return { empty: this.members.size === 0, ownerChanged: false };
    this.members.delete(memberId);
    let ownerChanged = false;
    if (this.ownerId === memberId) {
      const next = this.members.keys().next();
      if (next.done) {
        this.ownerId = '';
      } else {
        this.ownerId = next.value;
        const m = this.members.get(this.ownerId)!;
        this.members.set(this.ownerId, { ...m, isOwner: true });
        ownerChanged = true;
      }
    }
    return { empty: this.members.size === 0, ownerChanged };
  }

  bumpPlayback(next: Partial<PlaybackState>): PlaybackState {
    this.playback = {
      ...this.playback,
      ...next,
      seq: this.playback.seq + 1,
      serverTimestamp: Date.now(),
    } as PlaybackState;
    return this.playback;
  }

  /** 仅在客户端观察到的播放版本仍为当前版本且房间空闲时开始播放。 */
  play(track: Track, position: number, expectedPlaybackSeq: number): boolean {
    if (expectedPlaybackSeq !== this.playback.seq || this.playback.status !== 'idle') return false;
    this.bumpPlayback({ status: 'playing', track, position });
    return true;
  }

  /** seek 同样基于播放版本，旧曲目的延迟命令不能作用到新曲目。 */
  seek(position: number, expectedTrackKey: string): boolean {
    if (
      !this.playback.track ||
      getTrackKey(this.playback.track) !== expectedTrackKey
    ) {
      return false;
    }
    this.bumpPlayback({ position });
    return true;
  }

  /**
   * 版本化切歌：只有基于当前 playback seq 与当前曲目的命令能生效。
   * 多客户端对同一次结束事件发出的后续命令会因 seq 过期自然失效。
   */
  advance(expectedPlaybackSeq: number, expectedTrackKey: string, reason: PlaybackAdvanceReason = 'manual'): boolean {
    if (
      expectedPlaybackSeq !== this.playback.seq ||
      !this.playback.track ||
      getTrackKey(this.playback.track) !== expectedTrackKey
    ) {
      return false;
    }
    if (reason === 'ended') {
      const duration = this.playback.track.duration;
      const position = this.playback.position + Math.max(0, Date.now() - this.playback.serverTimestamp);
      // 版本正确不代表真的播完：时钟偏差、试听或异常 seek 都可能立即触发 ended。
      // 容忍 1.5 秒的媒体时长/网络误差；手动切歌不受此限制。
      if (Number.isFinite(duration) && duration > 0 && position < duration - 1500) return false;
    }
    if (this.queue.length === 0) {
      this.bumpPlayback({ status: 'idle', track: null, position: 0 });
      return true;
    }
    const [nextItem, ...rest] = this.queue;
    this.queue = rest;
    this.queueRevision += 1;
    this.bumpPlayback({ status: 'playing', track: nextItem.track, position: 0 });
    return true;
  }

  /** 入队 */
  enqueue(track: Track, addedBy: string): QueueItem[] {
    this.queue.push({ id: randomUUID(), track, addedBy });
    this.queueRevision += 1;
    return this.queue;
  }

  /** 批量入队(歌单"全部加入",一次广播) */
  enqueueMany(tracks: Track[], addedBy: string): QueueItem[] {
    this.queue.push(...tracks.map((track) => ({ id: randomUUID(), track, addedBy })));
    if (tracks.length > 0) this.queueRevision += 1;
    return this.queue;
  }

  /** 批量加入；房间空闲时立即播放队首，其余歌曲保留在队列中。 */
  enqueueManyAndStartIfIdle(tracks: Track[], addedBy: string): boolean {
    if (tracks.length === 0) return false;

    const items = tracks.map((track) => ({ id: randomUUID(), track, addedBy }));
    if (this.playback.status === 'idle') {
      const [nextItem, ...rest] = [...this.queue, ...items];
      this.queue = rest;
      this.queueRevision += 1;
      this.bumpPlayback({ status: 'playing', track: nextItem.track, position: 0 });
      return true;
    }

    this.queue.push(...items);
    this.queueRevision += 1;
    return false;
  }

  /** 按稳定条目 ID 删除；队列版本过期时不执行。 */
  remove(itemId: string, expectedQueueRevision: number): boolean {
    if (expectedQueueRevision !== this.queueRevision) return false;
    const index = this.queue.findIndex((item) => item.id === itemId);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    this.queueRevision += 1;
    return true;
  }

  /** 将条目移动到锚点条目之前；beforeItemId=null 表示移动到队尾。 */
  reorder(itemId: string, beforeItemId: string | null, expectedQueueRevision: number): boolean {
    if (expectedQueueRevision !== this.queueRevision || itemId === beforeItemId) return false;
    const fromIndex = this.queue.findIndex((item) => item.id === itemId);
    if (fromIndex < 0) return false;
    if (beforeItemId !== null && !this.queue.some((item) => item.id === beforeItemId)) return false;

    const [item] = this.queue.splice(fromIndex, 1);
    const toIndex = beforeItemId === null
      ? this.queue.length
      : this.queue.findIndex((candidate) => candidate.id === beforeItemId);
    this.queue.splice(toIndex, 0, item);
    this.queueRevision += 1;
    return true;
  }

  toSnapshot(): RoomSnapshot {
    const members: Member[] = Array.from(this.members.entries()).map(([id, m]) => ({
      id,
      nickname: m.nickname,
      isOwner: this.ownerId === id,
    }));
    return {
      code: this.code,
      members,
      ownerId: this.ownerId,
      playback: this.playback,
      queue: this.queue,
      queueRevision: this.queueRevision,
    };
  }

  get ageMs() {
    return Date.now() - this.bornAt;
  }
}
