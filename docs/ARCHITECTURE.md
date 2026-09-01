# 系统架构

Lune 采用 pnpm monorepo 和模块化单体服务端。客户端负责音频输出与界面，服务端负责房间权威状态、同步仲裁和音乐源访问。

## 运行组成

```text
Windows / Android 客户端
  ├─ HTTP：创建/加入房间、搜索、解析、歌词、歌单
  ├─ WebSocket：房间状态、队列、成员与心跳
  └─ AudioEngine：在本机播放并按服务端时间校正
                    │
                    ▼
NestJS 服务端（单实例）
  ├─ Rooms：房间、成员、播放与队列内存状态
  ├─ Sync：JWT 鉴权、命令仲裁与状态广播
  ├─ Providers：音乐目录、账号登录、健康状态与路由
  └─ Daily Best：预留接口，当前返回空列表
                    │
                    ▼
网易云音乐 / 酷狗音乐上游 API
```

## 工作区边界

| 路径 | 职责 |
|---|---|
| `apps/shared/src/index.ts` | HTTP/WS 共用的音轨、房间、队列和消息类型 |
| `apps/client/src/app` | 客户端运行时与平台组合 |
| `apps/client/src/features` | 房间、访问和设置业务控制器 |
| `apps/client/src/desktop` | 桌面布局 |
| `apps/client/src/mobile` | Android 与窄屏布局 |
| `apps/client/src/platform` | 平台检测、返回键和媒体会话适配 |
| `apps/client/src-tauri` | Tauri 主程序与 Android 原生媒体插件 |
| `server/src/rooms` | 房间领域状态机和内存存储 |
| `server/src/sync` | WebSocket 网关与连接注册表 |
| `server/src/providers` | Provider 领域、应用服务、基础设施和接口 |

## 房间生命周期

1. 客户端通过 `POST /api/rooms` 创建房间，或通过 `POST /api/rooms/:code/join` 加入房间。
2. 服务端返回成员信息和绑定房间、成员身份的 JWT。
3. 客户端连接 `/ws`，首条消息发送 `join` 和 JWT。
4. 服务端返回完整快照，之后所有播放和队列变更由服务端校验并广播。
5. 连接断开后，成员身份保留 30 秒供网络重连；宽限结束仍未重连才离房。
6. 最后一名成员离开后房间立即删除。

房主仅用于成员列表标识和离开后的房主转移。所有成员都能播放、切歌、跳转进度和修改队列。

## 状态一致性

- `PlaybackState.seq` 是播放状态版本。切歌和播放推进使用预期版本，拒绝重复或过期命令。
- `queueRevision` 是队列版本。删除和排序必须携带调用方观察到的版本。
- `QueueItem.id` 标识一次入队实例，因此同一歌曲可重复加入。
- 播放和队列由一条 `room_state_changed` 原子广播。
- 客户端用 `serverTimestamp` 和心跳往返时间估算当前进度，并在偏差超过阈值时校正。

完整消息结构见 [WebSocket 同步协议](SYNC_PROTOCOL.md)。

## Provider 子系统

Provider 在编译期注册到 `ProviderRegistry`，运行时由 `config/providers.json` 决定启用项和默认项。每个插件由以下部分组成：

- `descriptor`：名称、能力和是否需要账号
- `catalog`：搜索、解析、歌词和歌单能力
- `auth`：二维码登录、校验、刷新与退出

登录凭据保存在 `LUNE_DATA_DIR/provider-credentials.enc.json`，使用 `LUNE_MASTER_KEY` 进行 AES-256-GCM 加密。非敏感运行参数保存在 `LUNE_CONFIG_FILE`。

## HTTP 接口

服务端统一使用 `/api` 前缀。

| 路由 | 用途 |
|---|---|
| `GET /api/health`、`/live` | 进程存活检查 |
| `GET /api/health/ready` | 至少一个 Provider 可用时返回成功 |
| `POST /api/rooms` | 创建房间 |
| `POST /api/rooms/:code/join` | 加入房间 |
| `GET /api/rooms/:code` | 获取房间快照 |
| `GET /api/providers` | 查询启用的 Provider、能力和状态 |
| `GET /api/providers/search` | 搜索歌曲 |
| `GET /api/providers/resolve` | 解析播放地址 |
| `GET /api/providers/lyric` | 获取歌词 |
| `GET /api/providers/playlist-search` | 搜索歌单 |
| `GET /api/providers/playlist` | 导入歌单曲目 |
| `/api/admin/providers/*` | 受 Bearer Token 保护的 Provider 管理接口 |
| `GET /api/daily-best` | 返回当日推荐结构；当前曲目列表为空 |

## 数据与安全边界

- 客户端服务器地址只保存在设备本地；构建期的 `VITE_SERVER_URL` 仅用于可选预填。
- Provider 账号凭据只存在服务端，不发送给普通客户端。
- 管理 API 需要 `LUNE_ADMIN_TOKEN`；生产环境应限制为回环访问或通过 SSH 隧道访问。
- `JWT_SECRET` 用于房间身份令牌，`LUNE_MASTER_KEY` 用于 Provider 凭据加密，两者必须独立生成并备份。
- 房间状态不落盘，也不跨进程共享，因此生产环境只能运行一个服务端实例。
