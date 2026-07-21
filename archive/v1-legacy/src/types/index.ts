// ---- 歌曲 ----
export interface Track {
  id: number;
  name: string;
  artists: string;
  album: string;
  coverUrl: string;
  duration: number; // 秒
}

// ---- 房间成员 ----
export interface Member {
  id: string;
  nickname: string;
  isOwner: boolean;
}

// ---- 播放状态 ----
export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PlaybackState {
  status: PlaybackStatus;
  track: Track | null;
  position: number; // 秒
  serverTimestamp: number;
  seq: number;
}

// ---- WebSocket 消息协议 ----
// 客户端 → 服务端
export type ClientMessage =
  | { type: 'create_room'; payload: { nickname: string; roomCode?: string } }
  | { type: 'join_room'; payload: { roomCode: string; nickname: string } }
  | { type: 'leave_room' }
  | { type: 'play'; payload: { track: Track; position: number } }
  | { type: 'pause'; payload: { position: number } }
  | { type: 'seek'; payload: { position: number } }
  | { type: 'next' }
  | { type: 'add_to_queue'; payload: { track: Track } }
  | { type: 'remove_from_queue'; payload: { index: number } }
  | { type: 'heartbeat'; payload: { clientTime: number } };

// 服务端 → 客户端
export type ServerMessage =
  | { type: 'room_created'; payload: { roomCode: string; userId: string; members: Member[] } }
  | { type: 'room_joined'; payload: { userId: string; members: Member[]; playback: PlaybackState; queue: Track[] } }
  | { type: 'member_joined'; payload: { member: Member } }
  | { type: 'member_left'; payload: { userId: string } }
  | { type: 'owner_changed'; payload: { newOwnerId: string } }
  | { type: 'playback_state'; payload: PlaybackState }
  | { type: 'queue_updated'; payload: { queue: Track[] } }
  | { type: 'heartbeat_ack'; payload: { serverTime: number; clientTime: number } }
  | { type: 'error'; payload: { message: string } };

// ---- 同步修正指令 ----
export type Correction =
  | { type: 'rate'; rate: number } // 微调速
  | { type: 'seek'; target: number }; // 跳转修正

// ---- 播放器状态 ----
export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isBuffering: boolean;
}
