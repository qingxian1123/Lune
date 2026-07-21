import { v4 as uuidv4 } from './polyfill.js';

export interface Member {
  id: string;
  nickname: string;
  isOwner: boolean;
}

export interface Track {
  id: number;
  name: string;
  artists: string;
  album: string;
  coverUrl: string;
  duration: number;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PlaybackState {
  status: PlaybackStatus;
  track: Track | null;
  position: number; // 秒
  serverTimestamp: number;
  seq: number;
}

function createIdlePlayback(): PlaybackState {
  return {
    status: 'idle',
    track: null,
    position: 0,
    serverTimestamp: Date.now(),
    seq: 0,
  };
}

export class Room {
  code: string;
  members: Map<string, { nickname: string; ws: import('ws').WebSocket }>;
  ownerId: string;
  playback: PlaybackState;
  queue: Track[] = [];
  lastEndedTrackId = 0; // 防止多客户端同时发 next 导致跳过多次
  lastNextTime = 0;

  constructor(code: string) {
    this.code = code;
    this.members = new Map();
    this.ownerId = '';
    this.playback = createIdlePlayback();
  }

  addMember(ws: import('ws').WebSocket, nickname: string): Member {
    const id = uuidv4();
    const isOwner = this.members.size === 0;
    this.members.set(id, { nickname, ws });
    if (isOwner) this.ownerId = id;
    return { id, nickname, isOwner };
  }

  removeMember(userId: string): boolean {
    this.members.delete(userId);
    if (userId === this.ownerId && this.members.size > 0) {
      this.ownerId = this.members.keys().next().value!;
    } else if (this.members.size === 0) {
      this.ownerId = '';
    }
    return this.members.size === 0;
  }

  getMembers(): Member[] {
    return Array.from(this.members.entries()).map(([id, m]) => ({
      id,
      nickname: m.nickname,
      isOwner: id === this.ownerId,
    }));
  }

  broadcastAll(message: object) {
    const data = JSON.stringify(message);
    for (const [, m] of this.members) {
      if (m.ws.readyState === 1) {
        m.ws.send(data);
      }
    }
  }

  isEmpty(): boolean {
    return this.members.size === 0;
  }

  // ---- 播放命令处理 ----

  /** 获取当前播放快照，保持 position/serverTimestamp 的语义一致 */
  getPlaybackSnapshot(now = Date.now()): PlaybackState {
    if (this.playback.status !== 'playing' || !this.playback.track) {
      return { ...this.playback, serverTimestamp: now };
    }

    const elapsed = Math.max(0, (now - this.playback.serverTimestamp) / 1000);
    return {
      ...this.playback,
      position: this.clampPosition(this.playback.position + elapsed, this.playback.track),
      serverTimestamp: now,
    };
  }

  /** 播放指定歌曲，返回新 PlaybackState */
  handlePlay(track: Track, position: number): PlaybackState {
    this.playback = {
      status: 'playing',
      track,
      position: this.clampPosition(position, track),
      serverTimestamp: Date.now(),
      seq: this.playback.seq + 1,
    };
    return this.playback;
  }

  /** 暂停 */
  handlePause(position?: number): PlaybackState {
    const now = Date.now();
    const snapshot = this.getPlaybackSnapshot(now);
    const nextPosition = typeof position === 'number' ? position : snapshot.position;
    this.playback = {
      ...this.playback,
      status: 'paused',
      position: this.clampPosition(nextPosition, this.playback.track),
      serverTimestamp: now,
      seq: this.playback.seq + 1,
    };
    return this.playback;
  }

  /** 跳转 */
  handleSeek(position: number): PlaybackState {
    this.playback = {
      ...this.playback,
      position: this.clampPosition(position, this.playback.track),
      serverTimestamp: Date.now(),
      seq: this.playback.seq + 1,
    };
    return this.playback;
  }

  /** 下一首：从队列取，队列空则回到 idle */
  handleNext(): PlaybackState {
    const next = this.shiftQueue();
    if (next) {
      this.playback = {
        status: 'playing',
        track: next,
        position: 0,
        serverTimestamp: Date.now(),
        seq: this.playback.seq + 1,
      };
    } else {
      this.playback = {
        status: 'idle',
        track: null,
        position: 0,
        serverTimestamp: Date.now(),
        seq: this.playback.seq + 1,
      };
    }
    return this.playback;
  }

  // ---- 队列操作 ----

  addToQueue(track: Track) {
    this.queue.push(track);
  }

  removeFromQueue(index: number): Track | null {
    if (index < 0 || index >= this.queue.length) return null;
    const [removed] = this.queue.splice(index, 1);
    return removed;
  }

  private shiftQueue(): Track | null {
    return this.queue.shift() || null;
  }

  private clampPosition(position: number, track: Track | null): number {
    const safePosition = Number.isFinite(position) ? Math.max(0, position) : 0;
    if (!track || track.duration <= 0) return safePosition;
    return Math.min(track.duration, safePosition);
  }
}

// 全局房间存储
const rooms = new Map<string, Room>();

export function generateRoomCode(): string {
  let code: string;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function createRoom(code: string): Room {
  const room = new Room(code);
  rooms.set(code, room);
  return room;
}

export function deleteRoom(code: string) {
  rooms.delete(code);
}
