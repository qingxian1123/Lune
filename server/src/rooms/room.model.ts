import { randomUUID } from 'node:crypto';
import type { Member, PlaybackState, RoomSnapshot, Track } from '@lune/shared';

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
  queue: Track[] = [];
  queueRevision = 0;
  /** 防止多客户端同时发 next 跳过多次,V1 同款约束 */
  lastEndedTrackId = '';
  lastNextTime = 0;
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

  /** 开始播放指定音轨(从 position 毫秒起) */
  play(track: Track, position = 0): PlaybackState {
    this.lastEndedTrackId = '';
    return this.bumpPlayback({ status: 'playing', track, position });
  }

  /** 跳转到指定位置(毫秒),保持当前音轨与状态 */
  seek(position: number): PlaybackState {
    if (!this.playback.track) return this.playback;
    return this.bumpPlayback({ position });
  }

  /** 切到队列下一首;队列空则 idle。返回新 playback 与是否切歌 */
  next(): { playback: PlaybackState; advanced: boolean } {
    if (this.queue.length === 0) {
      const pb = this.bumpPlayback({ status: 'idle', track: null, position: 0 });
      return { playback: pb, advanced: false };
    }
    const [next, ...rest] = this.queue;
    this.queue = rest;
    this.queueRevision += 1;
    this.lastEndedTrackId = '';
    const pb = this.bumpPlayback({ status: 'playing', track: next, position: 0 });
    return { playback: pb, advanced: true };
  }

  /** 入队 */
  enqueue(track: Track): Track[] {
    this.queue.push(track);
    this.queueRevision += 1;
    return this.queue;
  }

  /** 批量入队(歌单"全部加入",一次广播) */
  enqueueMany(tracks: Track[]): Track[] {
    this.queue.push(...tracks);
    if (tracks.length > 0) this.queueRevision += 1;
    return this.queue;
  }

  /** 移除指定下标队列项 */
  removeAt(index: number): Track[] {
    if (index < 0 || index >= this.queue.length) return this.queue;
    this.queue.splice(index, 1);
    this.queueRevision += 1;
    return this.queue;
  }

  /** 移动指定队列项；返回是否实际改变了队列顺序。 */
  reorder(fromIndex: number, toIndex: number): boolean {
    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= this.queue.length ||
      toIndex >= this.queue.length ||
      fromIndex === toIndex
    ) {
      return false;
    }

    const [track] = this.queue.splice(fromIndex, 1);
    this.queue.splice(toIndex, 0, track);
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
