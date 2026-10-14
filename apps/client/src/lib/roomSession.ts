import { getServerBaseUrl } from './serverConfig';

export interface RoomSession {
  roomCode: string;
  token: string;
  memberId: string;
}

const keyFor = (serverUrl: string) => `lune.room.session.v1:${serverUrl}`;

/** 会话只适用于签发它的服务器；存储不可用时仍允许正常加入。 */
export function readRoomSession(serverUrl = getServerBaseUrl()): RoomSession | null {
  try {
    const raw = window.localStorage.getItem(keyFor(serverUrl));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const session = value as Partial<RoomSession>;
    if (typeof session.roomCode !== 'string' || !/^[A-Z0-9]{6}$/.test(session.roomCode)
      || typeof session.token !== 'string' || !session.token
      || typeof session.memberId !== 'string' || !session.memberId) return null;
    return session as RoomSession;
  } catch {
    return null;
  }
}

export function saveRoomSession(session: RoomSession, serverUrl = getServerBaseUrl()): void {
  try {
    window.localStorage.setItem(keyFor(serverUrl), JSON.stringify(session));
  } catch {
    // 浏览器限制或磁盘已满不会阻断当前房间，只影响冷启动恢复。
    console.warn('房间会话无法保存，重新打开应用后需要重新加入');
  }
}

export function clearRoomSession(serverUrl = getServerBaseUrl()): void {
  try {
    window.localStorage.removeItem(keyFor(serverUrl));
  } catch {
    // 内存中的身份仍会在退出时清除。
  }
}
