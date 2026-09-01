# WebSocket 同步协议

Lune 房间同步通过 WebSocket 完成。连接地址：`ws://<host>/ws`。所有消息为 JSON 文本，统一使用 `{ type, payload }` 结构。类型定义见 `apps/shared/src/index.ts`。

## 设计约束

- 服务端是播放与队列状态的唯一权威来源。
- 推进播放使用 `PlaybackState.seq` 做 compare-and-set；同一播放版本最多推进一次。
- 播放与队列通过一条 `room_state_changed` 原子发布，客户端不会观察到半次切歌。
- 队列操作使用服务端生成的 `QueueItem.id`，不使用歌曲 ID 或数组下标。
- 所有房间成员拥有相同的播放、切歌、进度与队列控制权限。

## 连接与鉴权

1. 客户端通过 HTTP 创建或加入房间并取得 JWT `token`。
2. 建立 WebSocket 连接后立即发送 `join { token }`。
3. 服务端返回 `joined { snapshot, memberId }`，快照包含完整播放状态、队列和版本。
4. token 无效或成员已离开时返回 `error`。

## 客户端 → 服务端

| type | payload | 说明 |
|---|---|---|
| `join` | `{ token }` | 鉴权并加入房间 |
| `play` | `{ track, position?, expectedPlaybackSeq }` | 仅当房间仍为空闲且播放版本匹配时开始播放 |
| `seek` | `{ position, expectedTrackKey }` | 仅当当前曲目 key 匹配时调整进度 |
| `advance_playback` | `{ requestId, expectedPlaybackSeq, expectedTrackKey, reason }` | 版本化推进；`reason` 为 `ended`、`manual` 或 `unplayable` |
| `add_song` | `{ track }` | 加入一首歌曲，服务端生成 QueueItem |
| `add_songs` | `{ tracks }` | 批量加入歌曲，只产生一次状态事件 |
| `remove_queue_item` | `{ itemId, expectedQueueRevision }` | 按稳定条目 ID 删除；版本过期不执行 |
| `reorder_queue_item` | `{ itemId, beforeItemId, expectedQueueRevision }` | 将条目移到锚点之前；`beforeItemId: null` 表示队尾 |
| `heartbeat` | `{ clientTime }` | 时钟同步 |

没有 `pause` 消息；产品采用无暂停模型。

`expectedTrackKey` 的规范格式为 `${provider || ''}:${track.id}`；客户端和服务端必须使用相同的 helper 生成。

## 服务端 → 客户端

| type | payload | 说明 |
|---|---|---|
| `joined` | `{ snapshot, memberId }` | 加入成功并取得完整房间快照 |
| `room_state_changed` | `{ playback, queue, queueRevision, cause, appliedRequestId? }` | 播放与队列的原子权威状态 |
| `member_joined` | `{ member }` | 成员加入 |
| `member_left` | `{ memberId, ownerId }` | 成员离开以及最新 owner 标识 |
| `heartbeat_ack` | `{ serverTime, clientTime }` | 心跳响应 |
| `error` | `{ message }` | 鉴权、房间或消息错误 |

当命令所携带的播放或队列版本已经过期时，服务端不执行命令，只向发送者返回 `cause: 'resync'` 的 `room_state_changed`。

## 状态结构

```ts
interface PlaybackState {
  status: 'idle' | 'playing';
  track: Track | null;
  position: number;
  serverTimestamp: number;
  seq: number;
}

interface QueueItem {
  id: string;       // 服务端生成，一次入队实例一个 ID
  track: Track;
  addedBy: string;  // 入队成员 ID
}
```

同一首歌可以多次入队，每次都有不同的 `QueueItem.id`。

## 推进播放的幂等语义

假设多个客户端都观察到 `seq: 42`、当前曲目为 `netease:123`：

1. 第一个 `advance_playback(expectedPlaybackSeq: 42)` 到达并成功执行，服务端将播放版本推进到 43。
2. 其他基于 `seq: 42` 的命令随后到达时已经过期，只会收到最新状态，不会再次弹出队首。
3. 用户若确实需要再切一首，必须先观察到 `seq: 43`，再发送基于新版本的命令。

该语义不依赖时间窗口，可正确处理多端自然结束、不可播放上报、通知栏操作、网络延迟和重发。

## 时钟、断开与清理

- 客户端使用 `serverTimestamp`、本地时间与心跳 RTT 估算播放进度。
- WebSocket 保证单连接消息有序；连续 seek 使用曲目 key 防止旧曲目命令作用到新曲目。
- 客户端断开时服务端移除成员；房间为空时删除内存房间。
