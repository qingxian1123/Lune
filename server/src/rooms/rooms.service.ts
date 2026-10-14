import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { RoomStore } from './room.store';
import { JwtService } from '@nestjs/jwt';
import type { RoomTokenPayload } from '@lune/shared';
import type { Room } from './room.model';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly store: RoomStore,
    private readonly jwt: JwtService,
  ) {}

  create(nickname: string): {
    code: string;
    member: { id: string; nickname: string; isOwner: boolean };
    token: string;
  } {
    const room = this.store.createRoom();
    const member = this.store.transact(room, () => room.addMember(nickname, this.store.now()));
    const token = this.signToken(room, member);
    this.logger.log(`create ${room.code} owner=${member.id}`);
    return { code: room.code, member, token };
  }

  join(code: string, nickname: string): {
    code: string;
    member: { id: string; nickname: string; isOwner: boolean };
    token: string;
  } {
    const room = this.store.getRoom(code);
    if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: '房间不存在或已过期' });
    // 重名允许,沿用 V1 行为(仅以 memberId 区分)
    const member = this.store.transact(room, () => room.addMember(nickname, this.store.now()));
    const token = this.signToken(room, member);
    this.logger.log(`join ${room.code} member=${member.id}`);
    return { code: room.code, member, token };
  }

  snapshot(code: string) {
    const room = this.store.getRoom(code);
    if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: '房间不存在或已过期' });
    return room.toSnapshot();
  }

  connect(code: string, memberId: string, roomId?: string) {
    const room = this.store.getRoom(code);
    if (!room) throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: '房间不存在或已过期' });
    if ((roomId !== undefined && roomId !== room.id) || !room.hasIdentity(memberId, this.store.now())) {
      throw new UnauthorizedException({ code: 'MEMBER_INVALID', message: '成员身份已失效，请重新加入' });
    }
    const reconnecting = room.members.has(memberId) && room.identities.get(memberId)?.lastConnectedAt !== undefined;
    const wasDormant = room.dormant;
    const member = this.store.transact(room, () => room.markConnected(memberId, this.store.now()));
    if (wasDormant) this.logger.log(`room resumed code=${room.code} member=${memberId}`);
    return { room, member, reconnecting };
  }

  disconnect(code: string, memberId: string): void {
    const room = this.store.peekRoom(code);
    if (!room) return;
    try {
      this.store.transact(room, () => room.markDisconnected(memberId, this.store.now(), this.store.graceMs, this.store.retentionMs));
    } catch (error) {
      // A real closed socket cannot be rolled back into a live presence on disk failure.
      room.markDisconnected(memberId, this.store.now(), this.store.graceMs, this.store.retentionMs);
      this.store.markDirty(room);
      throw error;
    }
    this.logger.log(`member disconnected code=${room.code} member=${memberId} expiresAt=${room.expiresAt}`);
  }

  /** 明确退出撤销身份；异常断线只清在线状态，空房保留24小时。 */
  leave(code: string, memberId: string): { empty: boolean; ownerChanged: boolean } {
    const room = this.store.getRoom(code);
    if (!room) return { empty: true, ownerChanged: false };
    const res = this.store.transact(room, () => room.revokeMember(memberId, this.store.now(), this.store.graceMs, this.store.retentionMs));
    this.logger.log(`member left code=${room.code} member=${memberId} expiresAt=${room.expiresAt}`);
    return res;
  }

  /**
   * 签发 token。
   * 注意:token 在签发时绑定 room code 与 isOwner 快照;owner 变更后旧 token 仍持旧值,
   * 关键操作(切歌/跳过)由调用方在 RoomStore 现取 room.ownerId 校验为准。
   */
  signToken(
    room: Room,
    member: { id: string; nickname: string; isOwner: boolean },
  ): string {
    const payload: RoomTokenPayload = {
      memberId: member.id,
      roomCode: room.code,
      roomId: room.id,
      nickname: member.nickname,
      isOwner: member.isOwner,
    };
    return this.jwt.sign(payload);
  }
}
