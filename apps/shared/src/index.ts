/**
 * Lune 前后端共享类型
 *
 * P1:房间、成员、播放、快照等协议基础类型。
 * P2:音乐源 Provider 协议与搜索/解析/歌词返回结构。
 */

/** 音轨元数据 */
export interface Track {
  id: string;
  /** 产生该音轨的音乐源；旧房间数据缺失时回落到服务端默认源 */
  provider?: string;
  name: string;
  artists: string;
  album: string;
  coverUrl: string;
  duration: number; // 毫秒
}

/**
 * 待播队列中的一次入队实例。
 *
 * 同一首 Track 可以被重复加入，队列操作必须使用服务端生成的 item id，
 * 不能使用歌曲 id 或易失的数组下标标识。
 */
export interface QueueItem {
  id: string;
  track: Track;
  addedBy: string;
}

/** 成员 */
export interface Member {
  id: string;
  nickname: string;
  isOwner: boolean;
}

/** 播放状态机(无暂停,只做播放/空闲) */
export type PlaybackStatus = 'idle' | 'playing';

/** 播放快照(基于服务端时钟) */
export interface PlaybackState {
  status: PlaybackStatus;
  track: Track | null;
  position: number; // 毫秒
  serverTimestamp: number; // Date.now() 快照时刻
  seq: number; // 单调递增,客户端用以丢弃过期 diff
}

/** 房间完整快照(发给刚加入的客户端) */
export interface RoomSnapshot {
  code: string;
  members: Member[];
  ownerId: string;
  playback: PlaybackState;
  queue: QueueItem[];
  queueRevision: number;
}

export type PlaybackAdvanceReason = 'ended' | 'manual' | 'unplayable';

export type RoomStateChangeCause =
  | 'play'
  | 'seek'
  | 'advance'
  | 'enqueue'
  | 'remove'
  | 'reorder'
  | 'resync';

/** 播放与队列的原子状态事件，避免客户端观察到半次切歌。 */
export interface RoomStateChangedPayload {
  playback: PlaybackState;
  queue: QueueItem[];
  queueRevision: number;
  cause: RoomStateChangeCause;
  appliedRequestId?: string;
}

/** JWT payload 内容 */
export interface RoomTokenPayload {
  memberId: string;
  roomCode: string;
  nickname: string;
  isOwner: boolean;
}

// ============ Provider 插件协议 ============

/** 搜索结果音轨(可在前端列表直接展示,与 Track 兼容) */
export interface ProviderSearchResult {
  songs: Track[];
}

/** 解析后可播放音轨(含可播 URL 与失效标记) */
export interface ProviderResolveResult {
  track: Track;
  url: string | null;
  /** 失效或无版权时为 true,前端可据此提示并跳下一首 */
  unplayable?: boolean;
}

/** 歌词一行(时间秒,文本,可选翻译) */
export interface LyricLine {
  time: number; // 秒
  text: string;
  trans?: string;
}

export interface ProviderLyricResult {
  lines: LyricLine[];
}

/** 歌单摘要(搜歌单结果条目) */
export interface PlaylistSummary {
  id: string;
  /** 产生该歌单的音乐源 */
  provider?: string;
  name: string;
  coverUrl: string;
  trackCount: number;
  creator: string;
}

/** 搜歌单结果 */
export interface ProviderPlaylistSearchResult {
  playlists: PlaylistSummary[];
}

/**
 * 音乐源 Provider 接口。
 *
 * 实现:
 *  - `id`:唯一标识,用于 `MUSIC_PROVIDERS` 环境变量配置
 *  - `search`:关键词搜索
 *  - `resolve`:单曲解析为可播 URL
 *  - `lyric`:歌词(可选,无则返回空 lines)
 *  - `playlist`:歌单导入(可选)
 *
 * 注册:每个具体 provider 在构造时自报 `id`,
 * ProviderRegistry 根据 `MUSIC_PROVIDERS` env 激活对应实例。
 */
export interface MusicProvider {
  readonly id: string;
  search(keyword: string, limit?: number): Promise<ProviderSearchResult>;
  resolve(songId: string): Promise<ProviderResolveResult>;
  lyric(songId: string): Promise<ProviderLyricResult>;
  playlist?(playlistId: string): Promise<Track[]>;
  /** 按名搜歌单(可选,未实现时 controller 返回空列表) */
  searchPlaylists?(keyword: string, limit?: number): Promise<ProviderPlaylistSearchResult>;
}

// ============ WebSocket 同步协议 ============
//
// 连接:ws://<host>/ws,首条消息必须是 `join`,携带 P1 创建/加入时签发的 JWT token。
// 之后客户端可发播放控制与队列消息;服务端广播 snapshot / state-diff / 成员事件。
// 无 pause 消息(产品决定只做播放列表+切歌)。

/** 客户端 → 服务端 */
export type ClientMessage =
  | { type: 'send_heart'; payload: { requestId: string; track: Track } }
  | { type: 'join'; payload: { token: string } }
  | { type: 'play'; payload: { track: Track; position?: number; expectedPlaybackSeq: number } }
  | {
      type: 'seek';
      payload: { position: number; expectedTrackKey: string };
    }
  | {
      type: 'advance_playback';
      payload: {
        requestId: string;
        expectedPlaybackSeq: number;
        expectedTrackKey: string;
        reason: PlaybackAdvanceReason;
      };
    }
  | { type: 'add_song'; payload: { track: Track } }
  | { type: 'add_songs'; payload: { tracks: Track[] } }
  | { type: 'remove_queue_item'; payload: { itemId: string; expectedQueueRevision: number } }
  | {
      type: 'reorder_queue_item';
      payload: { itemId: string; beforeItemId: string | null; expectedQueueRevision: number };
    }
  | { type: 'heartbeat'; payload: { clientTime: number } };

/** 服务端 → 客户端 */
export type ServerMessage =
  | { type: 'heart_recorded'; payload: { requestId: string } }
  | { type: 'heart_failed'; payload: { requestId: string; message: string } }
  | { type: 'joined'; payload: { snapshot: RoomSnapshot; memberId: string } }
  | { type: 'room_state_changed'; payload: RoomStateChangedPayload }
  | { type: 'member_joined'; payload: { member: Member } }
  | { type: 'member_left'; payload: { memberId: string; ownerId: string } }
  | { type: 'heartbeat_ack'; payload: { serverTime: number; clientTime: number } }
  | { type: 'error'; payload: { message: string } };

// ============ 每日最佳(接口预留,P4 仅类型 + 路由签名) ============

/** 每日最佳推荐条目 */
export interface DailyBest {
  date: string; // YYYY-MM-DD
  tracks: Track[];
}

export interface HotChart {
  window: '7d';
  generatedAt: string;
  tracks: Array<{ rank: number; track: Track; heartCount: number; lastHeartAt: string }>;
}
