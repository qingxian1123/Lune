import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, WebSocket } from 'ws';
import { JwtService } from '@nestjs/jwt';
import type { ClientMessage, RoomTokenPayload, Track } from '@lune/shared';
import { RoomStore } from '../rooms/room.store';
import { RoomsService } from '../rooms/rooms.service';
import { ConnectionRegistry } from './connection.registry';

/**
 * 同步网关:ws://<host>/ws
 *
 * 协议为 `{ type, payload }`(见 @lune/shared 的 ClientMessage/ServerMessage)。
 * NestJS WsAdapter 默认期望 `{ event, data }`,与我们的协议不匹配,
 * 因此不用 @SubscribeMessage 装饰器,而在 handleConnection 中挂原生 ws.on('message'),
 * 按 type 手动分发。Gateway 生命周期(连接/断开)与 WsAdapter 的连接管理仍由 NestJS 提供。
 *
 * 流程:
 *  1. 客户端连接后发 `join { token }`
 *  2. 网关验 JWT,绑定 memberId→room,回 `joined { snapshot, memberId }`
 *  3. 其他成员收到 `member_joined`
 *  4. 播放/队列消息由 owner 校验后改 Room 状态,广播 `playback_state` / `queue_updated`
 *  5. 断开:unbind + rooms.leave,空房删除,他人收到 `member_left`
 *
 * 无 pause 消息(产品决定)。
 */
@WebSocketGateway({ path: '/ws' })
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SyncGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly rooms: RoomsService,
    private readonly store: RoomStore,
    private readonly conns: ConnectionRegistry,
  ) {}

  handleConnection(ws: WebSocket): void {
    this.logger.log(`WS 连接进入,等待 join`);
    ws.on('message', (raw) => this.onMessage(ws, raw.toString()));
  }

  handleDisconnect(ws: WebSocket): void {
    const info = this.conns.unbind(ws);
    if (!info) return;
    const { empty, ownerChanged } = this.rooms.leave(info.roomCode, info.memberId);
    if (empty) return;
    const room = this.store.getRoom(info.roomCode);
    const ownerId = room?.ownerId ?? '';
    this.conns.broadcast(info.roomCode, {
      type: 'member_left',
      payload: { memberId: info.memberId, ownerId },
    });
    if (ownerChanged) this.logger.log(`owner 转移至 ${ownerId}`);
  }

  private onMessage(ws: WebSocket, text: string): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(text);
    } catch {
      this.conns.send(ws, { type: 'error', payload: { message: '无效的 JSON' } });
      return;
    }
    switch (msg.type) {
      case 'join':
        this.handleJoin(ws, msg.payload.token);
        break;
      case 'play':
        this.handlePlay(ws, msg.payload.track, msg.payload.position);
        break;
      case 'seek':
        this.handleSeek(ws, msg.payload.position);
        break;
      case 'next':
        this.handleNext(ws, msg.payload.endedTrackId);
        break;
      case 'add_song':
        this.handleAddSong(ws, msg.payload.track);
        break;
      case 'add_songs':
        this.handleAddSongs(ws, msg.payload.tracks);
        break;
      case 'remove_song':
        this.handleRemoveSong(ws, msg.payload.index);
        break;
      case 'reorder_song':
        this.handleReorderSong(
          ws,
          msg.payload.fromIndex,
          msg.payload.toIndex,
          msg.payload.expectedRevision,
        );
        break;
      case 'heartbeat':
        this.conns.send(ws, {
          type: 'heartbeat_ack',
          payload: { serverTime: Date.now(), clientTime: msg.payload.clientTime },
        });
        break;
      default:
        this.conns.send(ws, { type: 'error', payload: { message: `未知消息类型: ${(msg as { type: string }).type}` } });
    }
  }

  private handleJoin(ws: WebSocket, token: string): void {
    let payload: RoomTokenPayload;
    try {
      payload = this.jwt.verify<RoomTokenPayload>(token);
    } catch {
      this.conns.send(ws, { type: 'error', payload: { message: 'token 无效或已过期' } });
      return;
    }
    const room = this.store.getRoom(payload.roomCode);
    if (!room) {
      this.conns.send(ws, { type: 'error', payload: { message: '房间不存在' } });
      return;
    }
    if (!room.members.has(payload.memberId)) {
      this.conns.send(ws, { type: 'error', payload: { message: '成员已不在房间,请重新加入' } });
      return;
    }
    this.conns.bind(ws, {
      memberId: payload.memberId,
      roomCode: payload.roomCode,
      nickname: payload.nickname,
    });
    this.conns.send(ws, {
      type: 'joined',
      payload: { snapshot: room.toSnapshot(), memberId: payload.memberId },
    });
    this.conns.broadcast(payload.roomCode, {
      type: 'member_joined',
      payload: {
        member: {
          id: payload.memberId,
          nickname: payload.nickname,
          isOwner: room.ownerId === payload.memberId,
        },
      },
    });
    this.logger.log(`${payload.nickname} joined ${payload.roomCode}`);
  }

  private handlePlay(ws: WebSocket, track: Track, position?: number): void {
    if (!this.assertOwner(ws)) return;
    const info = this.conns.infoOf(ws)!;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    const playback = room.play(track, position ?? 0);
    this.conns.broadcast(info.roomCode, { type: 'playback_state', payload: playback });
  }

  private handleSeek(ws: WebSocket, position: number): void {
    if (!this.assertOwner(ws)) return;
    const info = this.conns.infoOf(ws)!;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    const playback = room.seek(position);
    this.conns.broadcast(info.roomCode, { type: 'playback_state', payload: playback });
  }

  private handleNext(ws: WebSocket, endedTrackId?: string): void {
    if (!this.assertOwner(ws)) return;
    const info = this.conns.infoOf(ws)!;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    // 防多客户端同时发 next 跳过多次(V1 同款约束):同一 endedTrackId 1s 内不重复
    const now = Date.now();
    if (endedTrackId && room.lastEndedTrackId === endedTrackId && now - room.lastNextTime < 1000) {
      return;
    }
    room.lastEndedTrackId = endedTrackId ?? '';
    room.lastNextTime = now;
    const { playback } = room.next();
    this.conns.broadcast(info.roomCode, { type: 'playback_state', payload: playback });
    this.broadcastQueue(info.roomCode, room);
  }

  private handleAddSong(ws: WebSocket, track: Track): void {
    const info = this.conns.infoOf(ws);
    if (!info) return;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    // 任何成员都可加歌(沿用 V1)
    room.enqueue(track);
    this.broadcastQueue(info.roomCode, room);
  }

  private handleAddSongs(ws: WebSocket, tracks: Track[]): void {
    const info = this.conns.infoOf(ws);
    if (!info) return;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    if (tracks.length === 0) return;
    // 批量入队(歌单"全部加入"),一次广播避免 N 次 queue_updated 风暴
    room.enqueueMany(tracks);
    this.broadcastQueue(info.roomCode, room);
  }

  private handleRemoveSong(ws: WebSocket, index: number): void {
    if (!this.assertOwner(ws)) return;
    const info = this.conns.infoOf(ws)!;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    room.removeAt(index);
    this.broadcastQueue(info.roomCode, room);
  }

  private handleReorderSong(
    ws: WebSocket,
    fromIndex: number,
    toIndex: number,
    expectedRevision: number,
  ): void {
    const info = this.conns.infoOf(ws);
    if (!info) {
      this.conns.send(ws, { type: 'error', payload: { message: '请先 join 房间' } });
      return;
    }
    const room = this.store.getRoom(info.roomCode);
    if (!room) {
      this.conns.send(ws, { type: 'error', payload: { message: '房间不存在' } });
      return;
    }
    if (expectedRevision !== room.queueRevision) {
      this.conns.send(ws, {
        type: 'queue_updated',
        payload: { queue: room.queue, queueRevision: room.queueRevision },
      });
      return;
    }
    if (!room.reorder(fromIndex, toIndex)) return;
    this.broadcastQueue(info.roomCode, room);
  }

  private broadcastQueue(roomCode: string, room: { queue: Track[]; queueRevision: number }): void {
    this.conns.broadcast(roomCode, {
      type: 'queue_updated',
      payload: { queue: room.queue, queueRevision: room.queueRevision },
    });
  }

  /** 校验连接已 join 且是 owner,失败发 error 返回 false */
  private assertOwner(ws: WebSocket): boolean {
    const info = this.conns.infoOf(ws);
    if (!info) {
      this.conns.send(ws, { type: 'error', payload: { message: '请先 join 房间' } });
      return false;
    }
    const room = this.store.getRoom(info.roomCode);
    if (!room) {
      this.conns.send(ws, { type: 'error', payload: { message: '房间不存在' } });
      return false;
    }
    if (room.ownerId !== info.memberId) {
      this.conns.send(ws, { type: 'error', payload: { message: '仅房主可执行此操作' } });
      return false;
    }
    return true;
  }
}
