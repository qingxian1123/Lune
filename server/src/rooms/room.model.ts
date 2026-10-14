import { randomUUID } from 'node:crypto';
import type { Member, PlaybackAdvanceReason, PlaybackState, QueueItem, RoomSnapshot, Track } from '@lune/shared';

const getTrackKey = (track: Pick<Track, 'id' | 'provider'>): string =>
  `${track.provider || ''}:${track.id}`;

export interface RoomRecord {
  version: 1;
  id: string;
  code: string;
  createdAt: number;
  lastSeenAt: number;
  emptySince: number | null;
  expiresAt: number | null;
  dormant: boolean;
  identities: Array<[string, { nickname: string; expiresAt: number; lastConnectedAt?: number }]>;
  members: Array<[string, { nickname: string; isOwner: boolean }]>;
  onlineMembers: string[];
  memberDeadlines: Array<[string, number]>;
  ownerId: string;
  playback: PlaybackState;
  queue: QueueItem[];
  queueRevision: number;
}

/** 在线成员与可恢复身份分离；休眠房间保留歌曲、队列和稳定版本。 */
export class Room {
  id: string = randomUUID();
  readonly code: string;
  readonly members = new Map<string, { nickname: string; isOwner: boolean }>();
  readonly identities = new Map<string, { nickname: string; expiresAt: number; lastConnectedAt?: number }>();
  readonly onlineMembers = new Set<string>();
  readonly memberDeadlines = new Map<string, number>();
  emptySince: number | null;
  expiresAt: number | null = null;
  dormant = false;
  lastSeenAt: number;
  ownerId = '';
  playback: PlaybackState;
  queue: QueueItem[] = [];
  queueRevision = 0;
  private bornAt: number;

  constructor(code: string, now = Date.now()) {
    this.code = code;
    this.bornAt = now;
    this.lastSeenAt = now;
    this.emptySince = now;
    this.playback = {
      status: 'idle',
      track: null,
      position: 0,
      serverTimestamp: now,
      seq: 0,
    };
  }

  addMember(nickname: string, now = Date.now()): Member {
    const id = randomUUID();
    const isOwner = this.members.size === 0;
    this.members.set(id, { nickname, isOwner });
    this.identities.set(id, { nickname, expiresAt: now + 7 * 24 * 60 * 60 * 1000 });
    // HTTP 入场尚不算在线，防止没有建立 WS 的成员永久占据房间。
    this.memberDeadlines.set(id, now + 60_000);
    if (isOwner) this.ownerId = id;
    return { id, nickname, isOwner };
  }

  hasIdentity(memberId: string, now = Date.now()): boolean {
    const identity = this.identities.get(memberId);
    return !!identity && identity.expiresAt > now;
  }

  markConnected(memberId: string, now = Date.now()): Member {
    const identity = this.identities.get(memberId);
    if (!identity || identity.expiresAt <= now) throw new Error('成员身份已失效');
    if (this.dormant) {
      this.dormant = false;
      const track = this.playback.track;
      if (track && track.duration > 0 && this.playback.position >= track.duration) {
        this.advance(this.playback.seq, getTrackKey(track), 'manual');
      } else {
        this.playback = { ...this.playback, seq: this.playback.seq + 1, serverTimestamp: now };
      }
      // advance uses the live clock; recovery always publishes this activation's anchor.
      this.playback = { ...this.playback, serverTimestamp: now };
    }
    this.onlineMembers.add(memberId);
    this.memberDeadlines.delete(memberId);
    this.emptySince = null;
    this.expiresAt = null;
    this.lastSeenAt = now;
    identity.expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    identity.lastConnectedAt = now;
    if (!this.ownerId || !this.members.has(this.ownerId)) this.ownerId = memberId;
    const member = { nickname: identity.nickname, isOwner: this.ownerId === memberId };
    this.members.set(memberId, member);
    return { id: memberId, ...member };
  }

  markDisconnected(memberId: string, now: number, graceMs: number, retentionMs: number): void {
    this.onlineMembers.delete(memberId);
    if (this.members.has(memberId)) this.memberDeadlines.set(memberId, now + graceMs);
    if (this.onlineMembers.size === 0 && this.emptySince === null) {
      this.emptySince = now;
      this.expiresAt = now + retentionMs;
    }
  }

  revokeMember(memberId: string, now: number, graceMs: number, retentionMs: number) {
    this.markDisconnected(memberId, now, graceMs, retentionMs);
    this.identities.delete(memberId);
    this.memberDeadlines.delete(memberId);
    return this.removeMember(memberId);
  }

  /** 移除在线列表只影响 presence，身份可在有效期内恢复。 */
  maintain(now: number, graceMs: number): string[] {
    const removed: string[] = [];
    for (const [id, deadline] of this.memberDeadlines) {
      if (deadline <= now && !this.onlineMembers.has(id)) {
        this.memberDeadlines.delete(id);
        if (this.members.has(id)) {
          this.removeMember(id);
          removed.push(id);
        }
      }
    }
    for (const [id, identity] of this.identities) {
      if (identity.expiresAt <= now && !this.onlineMembers.has(id)) this.identities.delete(id);
    }
    if (this.onlineMembers.size === 0 && this.emptySince !== null && now >= this.emptySince + graceMs) {
      this.freeze(this.emptySince + graceMs);
    }
    return removed;
  }

  private freeze(at: number): void {
    if (this.dormant) return;
    const track = this.playback.track;
    const position = this.playback.status === 'playing'
      ? this.playback.position + Math.max(0, at - this.playback.serverTimestamp)
      : this.playback.position;
    this.playback = {
      ...this.playback,
      position: track && track.duration > 0 ? Math.min(position, track.duration) : position,
      serverTimestamp: at,
      seq: this.playback.seq + 1,
    };
    this.dormant = true;
  }

  toRecord(): RoomRecord {
    return structuredClone({
      version: 1 as const, id: this.id, code: this.code, createdAt: this.bornAt,
      lastSeenAt: this.lastSeenAt, emptySince: this.emptySince, expiresAt: this.expiresAt,
      dormant: this.dormant, identities: [...this.identities], members: [...this.members],
      onlineMembers: [...this.onlineMembers], memberDeadlines: [...this.memberDeadlines],
      ownerId: this.ownerId, playback: this.playback, queue: this.queue, queueRevision: this.queueRevision,
    });
  }

  restore(record: RoomRecord): void {
    this.id = record.id;
    this.bornAt = record.createdAt;
    this.lastSeenAt = record.lastSeenAt;
    this.emptySince = record.emptySince;
    this.expiresAt = record.expiresAt;
    this.dormant = record.dormant;
    this.ownerId = record.ownerId;
    this.playback = structuredClone(record.playback);
    this.queue = structuredClone(record.queue);
    this.queueRevision = record.queueRevision;
    this.identities.clear();
    this.members.clear();
    this.onlineMembers.clear();
    this.memberDeadlines.clear();
    for (const [id, value] of record.identities) this.identities.set(id, { ...value });
    for (const [id, value] of record.members) this.members.set(id, { ...value });
    for (const id of record.onlineMembers) this.onlineMembers.add(id);
    for (const [id, deadline] of record.memberDeadlines) this.memberDeadlines.set(id, deadline);
  }

  static fromRecord(record: RoomRecord, retentionMs: number): Room {
    const room = new Room(record.code, record.createdAt);
    room.restore(record);
    // Restart restores identities, never live sockets or a fresh retention window.
    if (room.emptySince === null) {
      room.emptySince = room.lastSeenAt;
      room.expiresAt = room.lastSeenAt + retentionMs;
      room.freeze(room.lastSeenAt);
    }
    room.onlineMembers.clear();
    room.members.clear();
    room.memberDeadlines.clear();
    room.ownerId = '';
    return room;
  }

  removeMember(memberId: string): { empty: boolean; ownerChanged: boolean } {
    if (!this.members.has(memberId)) return { empty: this.members.size === 0, ownerChanged: false };
    this.members.delete(memberId);
    this.onlineMembers.delete(memberId);
    let ownerChanged = false;
    if (this.ownerId === memberId) {
      const next = this.onlineMembers.size > 0 ? this.onlineMembers.values().next() : this.members.keys().next();
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
      lifecycle: this.dormant ? 'dormant' : this.emptySince === null ? 'active' : 'grace',
      expiresAt: this.expiresAt,
    };
  }

  get ageMs() {
    return Date.now() - this.bornAt;
  }
}
