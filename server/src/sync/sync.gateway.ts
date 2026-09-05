import { Logger } from '@nestjs/common';
import { HeartStore } from '../charts/heart.store';
import { ProviderRegistry } from '../providers/provider.registry';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, WebSocket } from 'ws';
import { JwtService } from '@nestjs/jwt';
import type {
  ClientMessage,
  PlaybackAdvanceReason,
  RoomStateChangeCause,
  RoomTokenPayload,
  Track,
} from '@lune/shared';
import { RoomStore } from '../rooms/room.store';
import { RoomsService } from '../rooms/rooms.service';
import type { Room } from '../rooms/room.model';
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
 *  4. 播放/队列命令经版本校验后原子修改 Room 状态，广播单条 `room_state_changed`
 *  5. 断开:unbind + rooms.leave,空房删除,他人收到 `member_left`
 *
 * 无 pause 消息(产品决定)。
 */
@WebSocketGateway({ path: '/ws', maxPayload: 1024 * 1024 })
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SyncGateway.name);
  private readonly disconnectGraceMs = 30_000;
  private readonly pendingLeaves = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly heartRates = new WeakMap<WebSocket, { at: number; count: number }>();
  private heartPending = 0;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly rooms: RoomsService,
    private readonly store: RoomStore,
    private readonly conns: ConnectionRegistry,
    private readonly hearts: HeartStore,
    private readonly providers: ProviderRegistry,
  ) {}

  handleConnection(ws: WebSocket): void {
    this.logger.log(`WS 连接进入,等待 join`);
    ws.on('message', (raw) => this.onMessage(ws, raw.toString()));
  }

  handleDisconnect(ws: WebSocket): void {
    const info = this.conns.unbind(ws);
    if (!info) return;
    const key = this.memberConnectionKey(info.roomCode, info.memberId);
    const previous = this.pendingLeaves.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.pendingLeaves.delete(key);
      if (this.conns.hasMemberConnection(info.roomCode, info.memberId)) return;
      const { empty, ownerChanged } = this.rooms.leave(info.roomCode, info.memberId);
      if (empty) return;
      const room = this.store.getRoom(info.roomCode);
      const ownerId = room?.ownerId ?? '';
      this.conns.broadcast(info.roomCode, {
        type: 'member_left',
        payload: { memberId: info.memberId, ownerId },
      });
      if (ownerChanged) this.logger.log(`owner 转移至 ${ownerId}`);
    }, this.disconnectGraceMs);
    timer.unref?.();
    this.pendingLeaves.set(key, timer);
  }

  private onMessage(ws: WebSocket, text: string): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(text);
    } catch {
      this.conns.send(ws, { type: 'error', payload: { message: '无效的 JSON' } });
      return;
    }
    if (!msg || typeof msg !== 'object' || !msg.payload) return;
    switch (msg.type) {
      case 'send_heart':
        void this.handleHeart(ws, msg.payload, text.length);
        break;
      case 'join':
        this.handleJoin(ws, msg.payload.token);
        break;
      case 'play':
        this.handlePlay(ws, msg.payload.track, msg.payload.position, msg.payload.expectedPlaybackSeq);
        break;
      case 'seek':
        this.handleSeek(
          ws,
          msg.payload.position,
          msg.payload.expectedTrackKey,
        );
        break;
      case 'advance_playback':
        this.handleAdvancePlayback(
          ws,
          msg.payload.requestId,
          msg.payload.expectedPlaybackSeq,
          msg.payload.expectedTrackKey,
          msg.payload.reason,
        );
        break;
      case 'add_song':
        this.handleAddSong(ws, msg.payload.track);
        break;
      case 'add_songs':
        this.handleAddSongs(ws, msg.payload.tracks);
        break;
      case 'remove_queue_item':
        this.handleRemoveQueueItem(ws, msg.payload.itemId, msg.payload.expectedQueueRevision);
        break;
      case 'reorder_queue_item':
        this.handleReorderQueueItem(
          ws,
          msg.payload.itemId,
          msg.payload.beforeItemId,
          msg.payload.expectedQueueRevision,
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
    const reconnecting = this.cancelPendingLeave(payload.roomCode, payload.memberId) ||
      this.conns.hasMemberConnection(payload.roomCode, payload.memberId);
    this.conns.bind(ws, {
      memberId: payload.memberId,
      roomCode: payload.roomCode,
      nickname: payload.nickname,
    });
    this.conns.send(ws, {
      type: 'joined',
      payload: { snapshot: room.toSnapshot(), memberId: payload.memberId },
    });
    if (!reconnecting) {
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
    }
    this.logger.log(`${payload.nickname} joined ${payload.roomCode}`);
  }

  private async handleHeart(ws: WebSocket, payload: { requestId: string; track: Track }, size: number): Promise<void> {
    const requestId = typeof payload.requestId === 'string' ? payload.requestId.slice(0, 128) : '';
    try {
      const info = this.conns.infoOf(ws);
      if (!info || !this.store.getRoom(info.roomCode)?.members.has(info.memberId)) throw new Error('Not joined');
      const now = Date.now();
      const rate = this.heartRates.get(ws);
      if (!rate || now - rate.at >= 1000) this.heartRates.set(ws, { at: now, count: 1 });
      else if (++rate.count > 20) throw new Error('Too many hearts');
      if (size > 8192 || this.heartPending >= 100 || typeof payload.requestId !== 'string' || !/^[\w:-]{1,128}$/.test(payload.requestId)) throw new Error('Invalid request');
      const raw = payload.track;
      if (!raw || typeof raw !== 'object') throw new Error('Invalid track');
      const provider = raw.provider ?? this.providers.getDefaultId();
      if (!provider || !this.providers.getActiveById(provider)) throw new Error('Invalid provider');
      for (const [field, max] of [['id', 256], ['name', 512], ['artists', 1024], ['album', 512], ['coverUrl', 2048]] as const) {
        if (typeof raw[field] !== 'string' || raw[field].length > max) throw new Error('Invalid track field');
      }
      if (!raw.id.trim() || !raw.name.trim() || !Number.isFinite(raw.duration) || raw.duration < 0 || raw.duration > 604800000) throw new Error('Invalid track');
      if (raw.coverUrl && !/^https?:\/\//i.test(raw.coverUrl)) throw new Error('Invalid cover');
      const track: Track = { id: raw.id, provider, name: raw.name, artists: raw.artists, album: raw.album, coverUrl: raw.coverUrl, duration: raw.duration };
      this.heartPending += 1;
      try { await this.hearts.record(requestId, track); }
      finally { this.heartPending -= 1; }
      this.conns.send(ws, { type: 'heart_recorded', payload: { requestId } });
    } catch {
      this.conns.send(ws, { type: 'heart_failed', payload: { requestId, message: '爱心没有送出，请重试' } });
    }
  }

  private handlePlay(
    ws: WebSocket,
    track: Track,
    position: number | undefined,
    expectedPlaybackSeq: number,
  ): void {
    if (!this.assertJoined(ws)) return;
    const info = this.conns.infoOf(ws)!;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    if (!room.play(track, position ?? 0, expectedPlaybackSeq)) {
      this.sendRoomState(ws, room, 'resync');
      return;
    }
    this.broadcastRoomState(info.roomCode, room, 'play');
  }

  private handleSeek(
    ws: WebSocket,
    position: number,
    expectedTrackKey: string,
  ): void {
    if (!this.assertJoined(ws)) return;
    const info = this.conns.infoOf(ws)!;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    if (!room.seek(position, expectedTrackKey)) {
      this.sendRoomState(ws, room, 'resync');
      return;
    }
    this.broadcastRoomState(info.roomCode, room, 'seek');
  }

  private handleAdvancePlayback(
    ws: WebSocket,
    requestId: string,
    expectedPlaybackSeq: number,
    expectedTrackKey: string,
    _reason: PlaybackAdvanceReason,
  ): void {
    if (!this.assertJoined(ws)) return;
    const info = this.conns.infoOf(ws)!;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    if (!room.advance(expectedPlaybackSeq, expectedTrackKey)) {
      this.sendRoomState(ws, room, 'resync');
      return;
    }
    this.broadcastRoomState(info.roomCode, room, 'advance', requestId);
  }

  private handleAddSong(ws: WebSocket, track: Track): void {
    const info = this.conns.infoOf(ws);
    if (!info) return;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    // 任何成员都可加歌(沿用 V1)
    room.enqueue(track, info.memberId);
    this.broadcastRoomState(info.roomCode, room, 'enqueue');
  }

  private handleAddSongs(ws: WebSocket, tracks: Track[]): void {
    const info = this.conns.infoOf(ws);
    if (!info) return;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    if (tracks.length === 0) return;
    // 批量入队(歌单"全部加入"),只产生一次原子房间状态事件
    room.enqueueMany(tracks, info.memberId);
    this.broadcastRoomState(info.roomCode, room, 'enqueue');
  }

  private handleRemoveQueueItem(ws: WebSocket, itemId: string, expectedQueueRevision: number): void {
    if (!this.assertJoined(ws)) return;
    const info = this.conns.infoOf(ws)!;
    const room = this.store.getRoom(info.roomCode);
    if (!room) return;
    if (!room.remove(itemId, expectedQueueRevision)) {
      this.sendRoomState(ws, room, 'resync');
      return;
    }
    this.broadcastRoomState(info.roomCode, room, 'remove');
  }

  private handleReorderQueueItem(
    ws: WebSocket,
    itemId: string,
    beforeItemId: string | null,
    expectedQueueRevision: number,
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
    if (!room.reorder(itemId, beforeItemId, expectedQueueRevision)) {
      this.sendRoomState(ws, room, 'resync');
      return;
    }
    this.broadcastRoomState(info.roomCode, room, 'reorder');
  }

  private broadcastRoomState(
    roomCode: string,
    room: Room,
    cause: RoomStateChangeCause,
    appliedRequestId?: string,
  ): void {
    this.conns.broadcast(roomCode, {
      type: 'room_state_changed',
      payload: {
        playback: room.playback,
        queue: room.queue,
        queueRevision: room.queueRevision,
        cause,
        ...(appliedRequestId ? { appliedRequestId } : {}),
      },
    });
  }

  private sendRoomState(ws: WebSocket, room: Room, cause: RoomStateChangeCause): void {
    this.conns.send(ws, {
      type: 'room_state_changed',
      payload: {
        playback: room.playback,
        queue: room.queue,
        queueRevision: room.queueRevision,
        cause,
      },
    });
  }

  /**
   * 校验连接已 join 且房间存在,失败发 error 返回 false。
   * 产品决策:全员同权——播放/切歌/进度/删歌不再限制房主,
   * owner 仅保留为成员列表标识与房主转移语义。
   */
  private assertJoined(ws: WebSocket): boolean {
    const info = this.conns.infoOf(ws);
    if (!info) {
      this.conns.send(ws, { type: 'error', payload: { message: '请先 join 房间' } });
      return false;
    }
    if (!this.store.getRoom(info.roomCode)) {
      this.conns.send(ws, { type: 'error', payload: { message: '房间不存在' } });
      return false;
    }
    return true;
  }

  private memberConnectionKey(roomCode: string, memberId: string): string {
    return `${roomCode}:${memberId}`;
  }

  private cancelPendingLeave(roomCode: string, memberId: string): boolean {
    const key = this.memberConnectionKey(roomCode, memberId);
    const timer = this.pendingLeaves.get(key);
    if (!timer) return false;
    clearTimeout(timer);
    this.pendingLeaves.delete(key);
    return true;
  }
}
