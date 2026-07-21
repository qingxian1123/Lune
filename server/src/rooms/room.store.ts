import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Room } from './room.model';

/**
 * 房间存储(内存单例)。
 *
 * - createRoom:生成 6 位大写字母数字 code,重名重试
 * - getRoom / deleteRoom / 房间快照
 * - room code 生成沿用 V1 风格(6 位字母数字,便于口播分享)
 */
@Injectable()
export class RoomStore {
  private readonly logger = new Logger(RoomStore.name);
  private readonly rooms = new Map<string, Room>();
  private readonly ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  private readonly CODE_LEN = 6;
  private readonly MAX_RETRY = 12;

  createRoom(): Room {
    for (let i = 0; i < this.MAX_RETRY; i++) {
      const code = this.genCode();
      if (!this.rooms.has(code)) {
        const room = new Room(code);
        this.rooms.set(code, room);
        this.logger.log(`createRoom ${code}`);
        return room;
      }
    }
    const fallback = randomUUID().slice(0, 8).toUpperCase();
    const room = new Room(fallback);
    this.rooms.set(fallback, room);
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  deleteRoom(code: string): void {
    this.rooms.delete(code);
  }

  list(): Room[] {
    return Array.from(this.rooms.values());
  }

  private genCode(): string {
    let s = '';
    for (let i = 0; i < this.CODE_LEN; i++) {
      s += this.ALPHABET[Math.floor(Math.random() * this.ALPHABET.length)];
    }
    return s;
  }
}