import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
    const member = room.addMember(nickname);
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
    if (!room) throw new NotFoundException('房间不存在');
    // 重名允许,沿用 V1 行为(仅以 memberId 区分)
    const member = room.addMember(nickname);
    const token = this.signToken(room, member);
    this.logger.log(`join ${room.code} member=${member.id}`);
    return { code: room.code, member, token };
  }

  snapshot(code: string) {
    const room = this.store.getRoom(code);
    if (!room) throw new NotFoundException('房间不存在');
    return room.toSnapshot();
  }

  /**
   * 成员离线/退房调用。空房自动删除。
   * 注意:此方法后续 WS 网关(P3)在 close 时统一调用。
   */
  leave(code: string, memberId: string): { empty: boolean; ownerChanged: boolean } {
    const room = this.store.getRoom(code);
    if (!room) return { empty: true, ownerChanged: false };
    const res = room.removeMember(memberId);
    if (res.empty) {
      this.store.deleteRoom(code);
      this.logger.log(`delete empty room ${code}`);
    }
    return res;
  }

  /**
   * 签发 token。
   * 注意:token 在签发时绑定 room code 与 isOwner 快照;owner 变更后旧 token 仍持旧值,
   * 关键操作(切歌/跳过)由调用方在 RoomStore 现取 room.ownerId 校验为准。
   */
  private signToken(
    room: Room,
    member: { id: string; nickname: string; isOwner: boolean },
  ): string {
    const payload: RoomTokenPayload = {
      memberId: member.id,
      roomCode: room.code,
      nickname: member.nickname,
      isOwner: member.isOwner,
    };
    return this.jwt.sign(payload);
  }
}