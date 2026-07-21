# WebSocket 同步协议

Lune 房间同步通过 WebSocket 完成。连接地址：`ws://<host>/ws`。所有消息为 JSON 文本，统一 `{ type, payload }` 结构。类型定义见 `apps/shared/src/index.ts` 的 `ClientMessage` / `ServerMessage`。

## 连接与鉴权

1. 客户端先用 HTTP `POST /api/rooms`（创建）或 `POST /api/rooms/:code/join`（加入）拿到 JWT `token`。
2. 建立 WebSocket 连接，立即发送 `join` 携带 token。
3. 服务端验 JWT 并确认 `memberId` 仍在房间，回 `joined`（含完整 `RoomSnapshot`）；同时向房间其他人广播 `member_joined`。
4. token 无效或成员已不在房间时回 `error`，客户端应重新走 HTTP 加入流程。

## 客户端 → 服务端

| type | payload | 权限 | 说明 |
|---|---|---|---|
| `join` | `{ token }` | 公开 | 鉴权并入房,首条消息 |
| `play` | `{ track, position? }` | owner | 播放指定音轨,position 毫秒 |
| `seek` | `{ position }` | owner | 跳转到 position 毫秒,保持当前音轨 |
| `next` | `{ endedTrackId? }` | owner | 切到队列下一首;队列空则进入 idle。endedTrackId 用于防多客户端同时触发跳过 |
| `add_song` | `{ track }` | 任意成员 | 入队 |
| `remove_song` | `{ index }` | owner | 移除队列指定下标 |
| `reorder_song` | `{ fromIndex, toIndex, expectedRevision }` | 任意成员 | 将待播队列项从原下标移动到目标下标；版本过期时返回最新队列而不执行 |
| `heartbeat` | `{ clientTime }` | 公开 | 时钟同步,服务端回 heartbeat_ack |

**无 `pause` 消息**：产品只做播放列表与切歌，不做暂停。

## 服务端 → 客户端

| type | payload | 说明 |
|---|---|---|
| `joined` | `{ snapshot, memberId }` | 加入成功,含房间完整快照 |
| `playback_state` | `PlaybackState` | 播放状态变更(含单调递增 seq,客户端用以丢弃过期 diff) |
| `queue_updated` | `{ queue, queueRevision }` | 队列变更；版本号用于避免并发拖动误操作 |
| `member_joined` | `{ member }` | 新成员加入 |
| `member_left` | `{ memberId, ownerId }` | 成员离开,含当前 ownerId(可能已转移) |
| `heartbeat_ack` | `{ serverTime, clientTime }` | 心跳回带服务端时钟 |
| `error` | `{ message }` | 操作失败(权限不足/房间不存在/token 无效等) |

## PlaybackState

```
{
  status: 'idle' | 'playing',
  track: Track | null,
  position: number,        // 毫秒
  serverTimestamp: number, // 服务端 Date.now() 快照时刻
  seq: number              // 单调递增
}
```

客户端用 `serverTimestamp + (Date.now() - serverTimestamp)` 估算当前播放进度,用 `seq` 丢弃过期消息。

## 时钟与进度同步

- 服务端在每次 `playback_state` 变更时附带 `serverTimestamp`。
- 客户端定期发 `heartbeat`,用 `heartbeat_ack.serverTime` 与本地时钟做漂移修正。
- 切歌防抖:同一 `endedTrackId` 1 秒内多次 `next` 只处理一次。

## 断开与清理

- 客户端断开时,服务端 `unbind` 该连接并从房间移除成员。
- 成员离开后向其他人广播 `member_left`;若离开的是 owner,自动转移给最早加入的成员,`member_left.payload.ownerId` 反映新 owner。
- 房间空时自动删除。
