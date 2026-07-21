import { Logger } from '@nestjs/common';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '@lune/shared';

interface ConnInfo {
  memberId: string;
  roomCode: string;
  nickname: string;
}

/**
 * WS 连接 ↔ 房间映射。
 *
 * - `bind`:连接加入房间后登记
 * - `unbind`:断开时清理,返回该连接的房间与成员,供网关调 rooms.leave
 * - `broadcast(roomCode, msg)`:向房间内所有连接发送消息
 * - `send(ws, msg)`:向单连接发送,自动跳过已关闭
 *
 * 进程内单例,由 SyncModule 提供。
 */
export class ConnectionRegistry {
  private readonly logger = new Logger(ConnectionRegistry.name);
  private readonly connToInfo = new Map<WebSocket, ConnInfo>();
  private readonly roomConns = new Map<string, Set<WebSocket>>();

  bind(ws: WebSocket, info: ConnInfo): void {
    this.connToInfo.set(ws, info);
    let set = this.roomConns.get(info.roomCode);
    if (!set) {
      set = new Set();
      this.roomConns.set(info.roomCode, set);
    }
    set.add(ws);
  }

  unbind(ws: WebSocket): ConnInfo | undefined {
    const info = this.connToInfo.get(ws);
    if (!info) return undefined;
    this.connToInfo.delete(ws);
    const set = this.roomConns.get(info.roomCode);
    set?.delete(ws);
    if (set && set.size === 0) this.roomConns.delete(info.roomCode);
    return info;
  }

  infoOf(ws: WebSocket): ConnInfo | undefined {
    return this.connToInfo.get(ws);
  }

  send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      this.logger.warn(`send 失败: ${(e as Error).message}`);
    }
  }

  broadcast(roomCode: string, msg: ServerMessage): void {
    const set = this.roomConns.get(roomCode);
    if (!set) return;
    for (const ws of set) this.send(ws, msg);
  }

  /** 房间内连接数,用于 close 时判断是否清房 */
  connCount(roomCode: string): number {
    return this.roomConns.get(roomCode)?.size ?? 0;
  }
}