import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Room, type RoomRecord } from './room.model';

export interface RoomStoreOptions {
  dataDir?: string;
  retentionMs?: number;
  graceMs?: number;
  checkpointMs?: number;
  now?: () => number;
}

const DAY = 24 * 60 * 60 * 1000;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value);
const text = (value: unknown): value is string => typeof value === 'string';
const validTrack = (value: any): boolean => !!value && typeof value === 'object' &&
  ['id', 'name', 'artists', 'album', 'coverUrl'].every((key) => text(value[key])) &&
  !!value.id && (value.provider === undefined || text(value.provider)) && finite(value.duration);

/** Invalid incoming state cannot poison the next startup. */
function validateRecord(value: any): asserts value is RoomRecord {
  const pairs = (list: unknown, validate: (entry: any) => boolean) => Array.isArray(list) &&
    list.length <= 10_000 && list.every((entry) => Array.isArray(entry) && entry.length === 2 && text(entry[0]) && !!entry[0] && validate(entry[1])) &&
    new Set(list.map((entry) => entry[0])).size === list.length;
  if (!value || value.version !== 1 || !text(value.id) || !/^[a-f\d-]{36}$/i.test(value.id) ||
      !text(value.code) || !/^[A-Z0-9]{6,12}$/.test(value.code) ||
      !finite(value.createdAt) || !finite(value.lastSeenAt) ||
      !(value.emptySince === null || finite(value.emptySince)) ||
      !(value.expiresAt === null || finite(value.expiresAt)) ||
      (value.emptySince === null) !== (value.expiresAt === null) ||
      typeof value.dormant !== 'boolean' || (value.dormant && value.emptySince === null) ||
      !text(value.ownerId) || !integer(value.queueRevision) ||
      !pairs(value.identities, (entry) => entry && text(entry.nickname) && entry.nickname.length <= 32 && finite(entry.expiresAt)) ||
      !pairs(value.members, (entry) => entry && text(entry.nickname) && typeof entry.isOwner === 'boolean') ||
      !pairs(value.memberDeadlines, finite) || !Array.isArray(value.onlineMembers) ||
      !value.onlineMembers.every(text) || new Set(value.onlineMembers).size !== value.onlineMembers.length ||
      !value.playback || !['idle', 'playing'].includes(value.playback.status) ||
      !finite(value.playback.position) || !finite(value.playback.serverTimestamp) || !integer(value.playback.seq) ||
      !(value.playback.track === null || validTrack(value.playback.track)) ||
      (value.playback.status === 'playing' && value.playback.track === null) ||
      !Array.isArray(value.queue) || value.queue.length > 20_000 ||
      !value.queue.every((item: any) => item && text(item.id) && !!item.id && text(item.addedBy) && validTrack(item.track)) ||
      new Set(value.queue.map((item: any) => item.id)).size !== value.queue.length) throw new Error('Invalid room data');
  const identities = new Set(value.identities.map(([id]: [string, unknown]) => id));
  const members = new Set(value.members.map(([id]: [string, unknown]) => id));
  if (value.members.some(([id]: [string, unknown]) => !identities.has(id)) ||
      value.onlineMembers.some((id: string) => !members.has(id)) ||
      (value.ownerId && !members.has(value.ownerId))) throw new Error('Invalid room membership');
}

/** Single-process owner. Every acknowledged mutation has an atomic durable snapshot. */
@Injectable()
export class RoomStore {
  private readonly logger = new Logger(RoomStore.name);
  private readonly rooms = new Map<string, Room>();
  readonly retentionMs: number;
  readonly graceMs: number;
  readonly checkpointMs: number;
  readonly now: () => number;
  private readonly dataDir?: string;
  private readonly checkpoints = new Map<string, number>();
  private readonly dirty = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;
  private stopping = false;
  private presenceListener?: (room: Room, memberIds: string[]) => void;
  private readonly ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  constructor(options: RoomStoreOptions = {}) {
    this.dataDir = options.dataDir;
    this.retentionMs = this.duration(options.retentionMs, DAY);
    this.graceMs = this.duration(options.graceMs, 30_000);
    this.checkpointMs = this.duration(options.checkpointMs, 30_000);
    this.now = options.now ?? Date.now;
    if (this.dataDir && existsSync(this.dataDir)) {
      for (const file of readdirSync(this.dataDir)) {
        if (!file.endsWith('.json')) continue;
        const record = JSON.parse(readFileSync(join(this.dataDir, file), 'utf8'));
        validateRecord(record);
        if (file !== `${record.id}.json` || this.rooms.has(record.code)) throw new Error('Invalid or duplicate room file');
        const room = Room.fromRecord(record, this.retentionMs);
        if (room.expiresAt !== null && room.expiresAt <= this.now()) {
          unlinkSync(join(this.dataDir, file));
          this.logger.log(`room expired code=${room.code} reason=startup expiresAt=${room.expiresAt}`);
          continue;
        }
        room.maintain(this.now(), this.graceMs);
        this.rooms.set(room.code, room);
        this.persist(room);
        this.logger.log(`room restored code=${room.code} expiresAt=${room.expiresAt}`);
      }
    }
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      try { this.sweep(); }
      catch (error) { this.logger.error(`Room maintenance failed: ${(error as Error).message}`); }
    }, Math.max(10, Math.min(1000, this.graceMs, this.checkpointMs)));
    this.timer.unref?.();
  }

  setPresenceListener(listener: (room: Room, memberIds: string[]) => void): void {
    this.presenceListener = listener;
  }

  onApplicationShutdown(): void {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    for (const room of this.rooms.values()) this.transact(room, () => {
      for (const id of [...room.onlineMembers]) room.markDisconnected(id, this.now(), this.graceMs, this.retentionMs);
      room.maintain(this.now(), this.graceMs);
    });
  }

  createRoom(): Room {
    for (let retry = 0; retry < 100; retry++) {
      let code = '';
      for (let i = 0; i < 6; i++) code += this.ALPHABET[Math.floor(Math.random() * this.ALPHABET.length)];
      if (!this.rooms.has(code)) {
        const room = new Room(code, this.now());
        room.expiresAt = this.now() + this.retentionMs;
        this.persist(room);
        this.rooms.set(code, room);
        this.logger.log(`createRoom ${code}`);
        return room;
      }
    }
    throw new ServiceUnavailableException('暂时无法生成房间码');
  }

  getRoom(code: string): Room | undefined {
    if (typeof code !== 'string') return;
    const room = this.rooms.get(code.trim().toUpperCase());
    if (room && room.onlineMembers.size === 0 && room.expiresAt !== null && room.expiresAt <= this.now()) {
      this.deleteRoom(room.code);
      this.logger.log(`room expired code=${room.code} reason=lookup`);
      return;
    }
    if (room) this.maintainRoom(room, this.now());
    return room;
  }

  /** Transport teardown must not depend on a maintenance write succeeding. */
  peekRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  markDirty(room: Room): void {
    this.dirty.add(room.id);
  }

  deleteRoom(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    if (this.dataDir) {
      try { unlinkSync(join(this.dataDir, `${room.id}.json`)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw this.storageError(error); }
    }
    this.rooms.delete(code);
    this.checkpoints.delete(room.id);
    this.dirty.delete(room.id);
  }

  list(): Room[] {
    this.sweep();
    return [...this.rooms.values()];
  }

  transact<T>(room: Room, operation: () => T): T {
    const before = room.toRecord();
    try {
      const result = operation();
      this.persist(room);
      return result;
    } catch (error) {
      room.restore(before);
      throw error;
    }
  }

  persist(room: Room): void {
    if (room.onlineMembers.size > 0) room.lastSeenAt = this.now();
    const record = room.toRecord();
    let temporary: string | undefined;
    try {
      validateRecord(record);
      if (this.dataDir) {
        mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
        const target = join(this.dataDir, `${room.id}.json`);
        temporary = `${target}.${randomUUID()}.tmp`;
        const file = openSync(temporary, 'wx', 0o600);
        try {
          writeFileSync(file, JSON.stringify(record), 'utf8');
          fsyncSync(file);
        } finally { closeSync(file); }
        renameSync(temporary, target);
      }
      this.checkpoints.set(room.id, this.now());
      this.dirty.delete(room.id);
    } catch (error) {
      if (temporary) { try { unlinkSync(temporary); } catch { /* not committed */ } }
      throw this.storageError(error);
    }
  }

  sweep(now = this.now()): void {
    if (this.stopping) return;
    for (const room of [...this.rooms.values()]) {
      if (room.onlineMembers.size === 0 && room.expiresAt !== null && room.expiresAt <= now) {
        this.deleteRoom(room.code);
        this.logger.log(`room expired code=${room.code} reason=retention expiresAt=${room.expiresAt}`);
      } else {
        this.maintainRoom(room, now);
        if (this.dirty.has(room.id) || (room.onlineMembers.size > 0 && now - (this.checkpoints.get(room.id) ?? 0) >= this.checkpointMs)) this.persist(room);
      }
    }
  }

  private maintainRoom(room: Room, now: number): void {
    const before = room.toRecord();
    const removed = room.maintain(now, this.graceMs);
    if (!isDeepStrictEqual(before, room.toRecord())) {
      try { this.persist(room); }
      catch (error) { room.restore(before); throw error; }
      if (!before.dormant && room.dormant) this.logger.log(`room dormant code=${room.code} expiresAt=${room.expiresAt}`);
      if (removed.length) this.presenceListener?.(room, removed);
    }
  }

  private storageError(error: unknown): ServiceUnavailableException {
    this.logger.error(`Room persistence failed: ${(error as Error).message}`);
    return new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: '房间状态暂时无法保存，请稍后重试' });
  }

  private duration(value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid room lifecycle duration');
    return value;
  }
}
