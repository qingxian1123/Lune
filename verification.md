# Verification

## v1（已归档,历史记录）

日期：2026-07-02
执行者：Codex

### 结论

客户端 exe 已重新构建成功,路径：

`archive/v1-legacy/src-tauri/target/release/lune.exe`（路径随 P0 归档迁移）

最新构建时间：2026-07-02 21:24:03

### 已验证（v1）

- `npm run build` 通过。
- `server` 目录下 `npm run build` 通过。
- 服务端播放快照回归测试通过。
- `npm run tauri -- build` 通过。
- 恢复播放修复后再次执行前端构建、服务端回归测试和 Tauri 构建,均通过。
- 无暂停重写后再次执行前端构建、服务端构建、服务端回归测试和 Tauri 构建,均通过。

### 遗留风险（v1）

- 未在真实多人房间环境中验证切歌和播放列表行为。
- 暂停/恢复功能已经从新客户端移除；服务端仍保留旧 pause 消息处理以兼容旧客户端。

---

## P0 — 归档 v1 + pnpm monorepo 骨架

日期：2026-07-02
执行者：Claude Agent

### 结论

v1 代码已归档至 `archive/v1-legacy/`；v2 pnpm monorepo 骨架就位,所有工作区包可安装、可构建、可启动。

### 已验证

- `pnpm install`（根）：成功,4 个工作区项目（lune / @lune/client / @lune/shared / @lune/server）解析完毕；`allowBuilds` 显式开启 @nestjs/core、@prisma/client、@prisma/engines、esbuild、prisma 的构建脚本。
- `pnpm --filter @lune/client build`：tsc + Vite 构建通过,产出 `apps/client/dist/`（index.html + JS 142.93 kB + CSS 5.38 kB）。
- `pnpm --filter @lune/server build`：tsc 通过,产出 `server/dist/main.js`、`server/dist/app.module.js`。
- Server 启动 + 健康检查：`PORT=9528 node server/dist/main.js` 启动后 Nest 日志正常,`GET http://localhost:9528/health` 返回 `{"ok":true}`。
- `pnpm --filter @lune/client dev`：Vite dev server 在 `http://localhost:5173/` 正常返回 `Lune · 一起听` HTML。
- `pnpm -r run typecheck`：apps/shared、apps/client、server 全部 `Done`,无类型错误。

### 遗留风险

- Tauri 桌面端构建（`pnpm tauri build`）因需 Rust toolchain 较重,P0 未执行；留给 P4 验证。
- `apps/client/src-tauri/icons/icon.png` 为 1×1 透明占位 PNG,Tauri 真实构建前需替换为正式图标。
- `apps/client/src-tauri/gen/android/` 仅为 `.gitkeep` 占位,Android 构建二期才生成。
- 尚未提交 git（用户未要求）。

---

## P1 — NestJS 房间模块 + JWT 邀请码

日期：2026-07-02
执行者：Claude Agent

### 设计决定（与用户确认）

- 房间持久化：**内存态**沿用 V1,进程重启清空；不接入 Prisma(已从依赖移除)。
- 加入凭证：**code 即邀请码**(6 位大写字母数字,易混淆字符 I/L/O/0/1 已剔除)。
- 身份绑定：**昵称入房**,JWT token 含 memberId/roomCode/nickname/isOwner,有效期 7d。
- 全局前缀 `/api`，路由：`POST /api/rooms`、`GET /api/rooms/:code`、`POST /api/rooms/:code/join`、`GET /api/health`。
- ValidationPipe 全局：whitelist + forbidNonWhitelisted + transform。
- 共享类型进 `@lune/shared`：Track / Member / PlaybackState / RoomSnapshot / RoomTokenPayload。

### 关键文件

- `server/src/rooms/room.model.ts`：Room 类（成员管理 / 播放快照 / toSnapshot），移植 V1 room.ts 语义。
- `server/src/rooms/room.store.ts`：RoomStore @Injectable 单例，code 生成与冲突重试。
- `server/src/rooms/rooms.service.ts` / `rooms.controller.ts` / `rooms.dto.ts` / `rooms.module.ts`：HTTP API + JWT 签发。
- `server/src/app.module.ts`：注册 RoomsModule + 全局 ValidationPipe。
- `apps/shared/src/index.ts`：协议类型定义。
- `apps/shared` 改为 composite 项目，server 通过 TS project references 引用；`pnpm --filter @lune/shared build` 产出 `dist/index.{js,d.ts}`。

### 已验证

- `pnpm install`：移除 Prisma 后重装成功（新增 class-validator / class-transformer）。
- `pnpm --filter @lune/shared build`：tsc -b 通过，产出 `apps/shared/dist/index.js` 与 `index.d.ts`。
- `pnpm --filter @lune/server build`：tsc -b 通过，产出 `server/dist/rooms/*.js`。
- `pnpm -r run typecheck`：apps/shared、apps/client、server 全部 Done。
- 端到端 HTTP（`PORT=9529 node server/dist/main.js`）：
  1. `GET /api/health` → `{"ok":true}` ✅
  2. `POST /api/rooms {"nickname":"Alice"}` → `code=GQGWVT`, member.isOwner=true, JWT 签发 ✅
  3. `POST /api/rooms/GQGWVT/join {"nickname":"Bob"}` → member.isOwner=false, 新 JWT ✅
  4. `GET /api/rooms/GQGWVT` → snapshot 含 Alice/Bob 两成员、ownerId=Alice、playback=idle ✅
  5. `POST /api/rooms/ZZZZZZ/join` → 404 `{"message":"房间不存在"}` ✅
  6. `GET /api/rooms/ZZZZZZ` → 404 ✅
  7. `POST /api/rooms {}` → 400 nickname 校验失败 ✅
  8. `POST /api/rooms {"nickname":"A","evil":"x"}` → 400 forbidNonWhitelisted `property evil should not exist` ✅

### 遗留风险

- 房间内存态：进程重启即清空，与用户确认一致；如未来需持久化再引 Prisma。
- JWT secret 默认值 `lune-dev-secret-change-me` 仅用于本地；生产移植到服务器前必须在 `server/.env` 设 `JWT_SECRET` 为强随机串。
- owner 变更逻辑已在 `Room.removeMember` 实现，但 P1 未通过端到端验证（leave 走 HTTP 尚无端点，将由 P3 WS 网关在 close 时调用再验）。
- 房间未做"无人自动延期清理"：V1 也是空房立即删；当前沿用此行为，长时间空房不会残留。

---

## P2 — Provider 插件层 + 网易云 provider

日期：2026-07-03
执行者：Claude Agent

### 设计

- `MusicProvider` 接口定义在 `@lune/shared`（search / resolve / lyric / playlist?），前后端共享。
- `server/src/providers/provider.registry.ts`：`ProviderRegistry` @Injectable，`register` + `setActive(ids)`，未列出的 provider 不激活。
- `server/src/providers/netease/netease.provider.ts`：移植 V1 `neteaseProxy.ts` 逻辑，封装 `NeteaseCloudMusicApi`；cookie 通过 `process.env.MUSIC_COOKIE` 注入（沿用 V1 约定）；时间统一毫秒（V1 是秒，P2 改毫秒匹配 shared Track）。
- `server/src/providers/providers.module.ts`：`PROVIDER_BOOTSTRAP` 工厂启动时注册 netease 并按 `MUSIC_PROVIDERS` env 激活。
- `server/src/providers/providers.controller.ts`：路由 `GET /api/providers`、`/search`、`/resolve`、`/lyric`，支持 `?provider=<id>` 指定。
- `app.module.ts`：`ConfigModule` 的 `envFilePath` 用绝对路径（`resolve(__dirname,'..','.env')`），修复从仓库根启动时读不到 `server/.env` 的问题（沿用 V1 思路）。
- `docs/MUSIC_SOURCE.md`：Provider 插件开发指南。

### 已验证

- `pnpm --filter @lune/shared build` + `pnpm --filter @lune/server build`：tsc -b 通过。
- `pnpm -r run typecheck`：三包 Done。
- `PORT=9531 node server/dist/main.js` 注入真实 VIP `MUSIC_COOKIE` 端到端：
  1. `GET /api/providers` → `{"providers":["netease"]}` ✅
  2. `GET /api/providers/search?kw=周杰伦 晴天&limit=3` → 返回 3 首,含 id/name/artists/album/coverUrl/duration(毫秒) ✅
  3. `GET /api/providers/resolve?id=3339230677` → 返回可播 mp3 URL,`unplayable:false` ✅（VIP cookie 生效）
  4. `GET /api/providers/lyric?id=186016`（原版《晴天》）→ 返回完整 LRC 歌词行,含 time/text/trans ✅
  5. `GET /api/providers/resolve?id=999999999999` → `{"track":{empty},"url":null,"unplayable":true}` ✅
  6. `GET /api/providers/search?kw=test&provider=qq` → 404 `{"message":"无可用音乐源或指定的 provider 未激活"}` ✅

### 遗留风险

- `server/.env` 含真实 VIP `MUSIC_COOKIE`，已被 `.gitignore` 排除，不会提交；生产移植到服务器时需手动复制该 env。
- 部分翻唱/remix 版本无歌词（如 id=3339230677 返回 `lines:[]`），前端需兼容空歌词。
- `MUSIC_PROVIDERS` 当前仅 `netease`；后续接入 QQ 等只需实现 provider 并在 module 注册 + env 加 id。
- `playlist` 接口已实现但 P2 未通过 HTTP 暴露（V1 有歌单导入，v2 暂不必要），留待需要时加路由。

### 补充：playlist 路由 + NeteaseCloudMusicApi 异常兜底（2026-07-03）

- `ProvidersController` 新增 `GET /api/providers/playlist?id=<playlistId>&provider=<id>`；provider 未实现 `playlist` 能力时返回空数组。
- `NeteaseProvider` 所有方法（search/resolve/lyric/playlist）统一用 `safe()` 包装：`NeteaseCloudMusicApi` 在参数非法/无权限时抛非 Error 裸对象（带 `status/body`），Nest 异常过滤器无法识别会 500；`safe` 捕获后返回安全空值（search→空 songs、resolve→emptyTrack+unplayable、lyric→空 lines、playlist→空数组），并记 WARN 日志。
- 端到端验证（`PORT=9533`，真实 VIP cookie）：
  1. `GET /api/providers/playlist?id=3778678`（热歌榜）→ 返回 200 首,首曲 `海屿你` ✅
  2. `GET /api/providers/playlist?id=0`（不存在）→ 返回 `[]`,日志 `playlist 失败: 歌单不存在`,HTTP 200 非 500 ✅
  3. `GET /api/providers/search?kw=晴天` 复测正常 ✅
- `docs/MUSIC_SOURCE.md` HTTP API 表已加 playlist 行。

---

## P3 — WebSocket 同步网关

日期：2026-07-03
执行者：Claude Agent

### 设计

- 协议消息类型在 `@lune/shared`：`ClientMessage`（join/play/seek/next/add_song/remove_song/heartbeat）与 `ServerMessage`（joined/playback_state/queue_updated/member_joined/member_left/heartbeat_ack/error）。**无 pause**（产品决定）。
- `server/src/sync/connection.registry.ts`：`ConnectionRegistry` 维护 `ws→{memberId,roomCode,nickname}` 与 `roomCode→Set<ws>`，提供 `bind/unbind/send/broadcast`。
- `server/src/sync/sync.gateway.ts`：`@WebSocketGateway({ path: '/ws' })`，实现 `OnGatewayConnection/Disconnect`。**不用 `@SubscribeMessage`**——NestJS WsAdapter 期望 `{event,data}`，与我们的 `{type,payload}` 协议不匹配；改为在 `handleConnection` 中挂 `ws.on('message')` 手动按 `type` 分发。连接生命周期仍由 NestJS + WsAdapter 管理。
- `server/src/rooms/room.model.ts` 加 `play/seek/next/enqueue/removeAt` 方法（无 pause）。
- `server/src/sync/sync.module.ts` 引入 RoomsModule，提供 SyncGateway + ConnectionRegistry。`app.module.ts` 引入 SyncModule。`main.ts` 用 `WsAdapter`。
- 依赖新增 `@nestjs/platform-ws@^10.4.0`（与 @nestjs/core v10 对齐）。

### 关键约束

- `join` 验 JWT（P1 签发的 token），token 内 `memberId` 必须仍在房间，否则要求重新 HTTP 加入。
- `play/seek/next/remove_song` 仅 owner 可执行（`assertOwner`），失败发 `error`。`add_song` 任何成员可发（沿用 V1）。
- `next` 防多客户端同时跳过：同一 `endedTrackId` 1 秒内不重复处理（V1 同款约束）。
- 断开：`unbind` + `rooms.leave`，空房自动删，他人收 `member_left`（含新 ownerId）。

### 已验证

- `pnpm --filter @lune/shared build` + `pnpm --filter @lune/server build`：tsc -b 通过。
- `pnpm -r run typecheck`：三包 Done。
- 端到端脚本 `server/test/sync-e2e.mjs`（双 WS 客户端 + 真实 server `PORT=9534`）全部通过：
  1. HTTP 创建房间 Alice(owner) + Bob join ✅
  2. 两 WS join,互收 `joined` + `member_joined` ✅
  3. Bob 非 owner 发 `play` → `error: 仅房主可执行此操作` ✅
  4. Alice `play {track:晴天, position:1000}` → Bob 收 `playback_state`(playing, seq=1) ✅
  5. Alice `add_song {track:稻香}` → Bob 收 `queue_updated`(len=1) ✅
  6. Alice `next {endedTrackId:1}` → Bob 收 `playback_state`(稻香) + `queue_updated`(空) ✅
  7. Alice `seek {position:5000}` → Bob 收 `playback_state`(pos=5000, seq=3) ✅
  8. heartbeat → `heartbeat_ack` 回带 serverTime ✅
  9. Bob 断开 → Alice 收 `member_left`(memberId, ownerId=Alice) ✅
  10. 双方断开后 `GET /api/rooms/:code` → 404(空房已删) ✅

### 遗留风险

- WS 连接未做心跳超时清理（heartbeat 由客户端发起,服务端只回 ack,不主动断开死连接）。生产可加服务端定期检查 lastPing。
- 单实例内存态,多实例部署时房间不共享(与 P1 内存决定一致)。
- e2e 脚本末尾 Node 24 + Windows 下 `process.exit` 触发 libuv assert 噪声,不影响验证结果。

---

## P4 — 客户端 AudioEngine + 播放器 UI + 房间页

日期：2026-07-03
执行者：Claude Agent

### 设计(与用户确认)

- **AudioEngine**：`HTMLAudioElement → MediaElementAudioSourceNode → GainNode → AudioContext.destination`,保留流式加载 + 接入 Web Audio 节点图。单例,generation token 防异步竞态。无 pause API。
- **创建/加入**：Home 页 HTTP `POST /api/rooms`(创建) / `POST /api/rooms/:code/join`(加入) 拿 token → navigate `/room/:code`。按钮点击时 `AudioEngine.resume()` 解锁 AudioContext。
- **同步**：`serverTimestamp` 估算进度 + 5s heartbeat RTT 修正(`lib/sync.ts` 改毫秒,阈值 200/500ms)。
- **交互**：无播放键,加入歌曲即播放;后加入入队;播放键位置换 **喜爱键**(纯前端 `useFavoriteStore` + localStorage);server `GET /api/daily-best` 返回空 `tracks`(接口预留,shared 加 `DailyBest` 类型)。
- 客户端 `.env` `VITE_SERVER_URL=http://localhost:9527`,WS URL 由其推导。

### 关键文件

- `apps/client/src/audio/AudioEngine.ts`：单例引擎,load/play/seek/stop/setVolume/setRate/onTick/onEnd/onBuffering/onDuration。
- `apps/client/src/lib/{api,sync,format}.ts`：fetch 封装 + 时钟修正 + ms 格式化。
- `apps/client/src/hooks/`：`useWebSocket`(RTT+重连)、`useRoomStore`(Zustand 房间快照)、`useSync`(消费消息驱动引擎)、`usePlayer`(引擎 React 状态)、`useFavoriteStore`(localStorage)、`useLyric`(歌词高亮)。
- `apps/client/src/components/{Player,Queue,SearchPanel,Lyric,MemberList}.tsx`。
- `apps/client/src/pages/{Home,Room}.tsx`、`main.tsx`(QueryClient+BrowserRouter)、`App.tsx`。
- `server/src/daily-best/`：`daily-best.controller.ts`(`GET /api/daily-best → {date, tracks:[]}`) + module,AppModule 引入。
- `apps/shared/src/index.ts`：加 `DailyBest` 类型。

### 已验证

- `pnpm --filter @lune/shared build` + `pnpm --filter @lune/client build`：tsc + Vite 通过(client 208.77 kB JS)。
- `pnpm --filter @lune/server build`：tsc -b 通过。
- `pnpm -r run typecheck`：三包 Done。
- server + client dev 启动:`GET /api/health` → `{"ok":true}`;`GET /api/daily-best` → `{"date":"2026-07-03","tracks":[]}`;Vite dev `http://localhost:5173` 正常。
- 端到端脚本 `server/test/p4-e2e.mjs`(从 client 视角走 HTTP+WS+Provider 闭环):
  1. `GET /api/daily-best` → 空 tracks ✅
  2. HTTP 创建房间 → code ✅
  3. WS join → `joined` 快照 members=1, ownerId=自己 ✅
  4. `/api/providers/search` 晴天 → 3 首 ✅
  5. `/api/providers/resolve` 第一首 → 拿到可播 url, unplayable=false ✅
  6. owner WS `play` → `playback_state`(playing, seq=1) ✅
  7. WS `add_song` → `queue_updated`(len=1) ✅
  8. WS `next` → `playback_state` 切到队列首曲 + `queue_updated`(len=0) ✅
  9. `/api/providers/lyric` → 翻唱版无歌词(lines=0,预期;原版 id=186016 P2 已验) ✅

### 遗留风险(需真浏览器手动确认)

- **Web Audio 实际发声、UI 交互(拖进度 seek/音量/喜爱键切换/歌词滚动/双窗同步)未在真浏览器验证**。Claude 无法驱动浏览器,需用户手动跑 `pnpm dev:client` + `node server/dist/main.js` 后在 `http://localhost:5173` 验证:
  - 搜歌→点结果→听到声音且进度走动
  - 第二首入队、当前曲结束自动切下一首
  - owner 拖进度条 seek 生效、音量滑块生效
  - 喜爱键♥切换且刷新后保持(localStorage)
  - 歌词随播放高亮滚动
  - 第二个窗口同 code 加入 → 双方互见成员、播放同步、owner 切歌对方跟随、一端关闭对方收 member_left
- Tauri 真实 Windows 打包(`pnpm tauri build`)需 Rust toolchain,P4 未执行;`apps/client/src-tauri/icons/icon.png` 仍为 1×1 占位,真打包前需替换正式图标。
- `apps/client/.env` 与 `server/.env` 含本地地址/真实 VIP cookie,均已被 `.gitignore` 排除。
- 微调播放速率修正后 2s 强制回 1.0(`useSync`),粗糙但够用;精细化同步二期。
- `useSync` 中 `seq` 过期丢弃逻辑对 `joined` 初始快照(seq=0)放行,正常递增 seq 才丢弃过期;极端情况下首条快照与后续 seq 跨度大时可能漏丢,生产前需复核。

---

## 构建客户端 exe + 服务端移植包

日期：2026-07-03
执行者：Claude Agent

### 客户端 Windows exe

- `apps/client/.env` 改为 `VITE_SERVER_URL=http://139.224.114.89:9527`(公网,构建时固化进 exe)。
- 修复 Tauri 构建阻塞:
  1. `apps/client/src-tauri/Cargo.toml` 去掉 `[profile.release] strip = true`(Rust 1.96.1 编译 itoa-1.0.18 触发 rustc ICE),保留 `lto = true`。
  2. 用 `pnpm --filter @lune/client tauri icon src-tauri/icons/icon.png` 生成全套图标(含 Windows `icon.ico` + Android mipmap),源 png 用 node 重写为合法 32×32 RGBA 占位。
- 构建命令:`pnpm --filter @lune/client tauri build`(裸 exe) + `--bundles nsis`(安装包)。
- 产物:
  - 裸 exe:`apps/client/src-tauri/target/release/lune.exe`(10,349,568 B / 9.9 MB,可独立双击运行)
  - NSIS 安装包:`apps/client/src-tauri/target/release/bundle/nsis/Lune_2.0.0_x64-setup.exe`(2,474,238 B / 2.4 MB)
- 路径标识符警告 `com.lune.app` 以 `.app` 结尾(macOS 冲突),Windows 不影响,二期可改为 `com.lune.desktop`。

### 服务端移植包 `server-deploy/`

- `server-deploy/dist/`:`pnpm --filter @lune/server build` 产物(已含 rooms/providers/sync/daily-best,`@lune/shared` 类型内联擦除,运行时不依赖 workspace)。
- `server-deploy/package.json`:去掉 `@lune/shared: workspace:*` 与 devDependencies,只留 13 个运行时依赖。
- `server-deploy/.env`:PORT=9527 + 真实 VIP `MUSIC_COOKIE` + `MUSIC_PROVIDERS=netease` + 强随机 `JWT_SECRET`(96 字符 hex)。
- `server-deploy/README.md`:上传/安装/启动/pm2 守护/更新流程说明。
- 本地独立验证:`server-deploy/` 内 `npm install --omit=dev` 后 `PORT=9535 node dist/main.js` 启动成功,`GET /api/health` → `{"ok":true}`、`GET /api/providers` → `{"providers":["netease"]}`、`MUSIC_COOKIE: 已加载` ✅。证明脱离 monorepo 可独立运行。

### 用户手动操作

- 客户端:把 `Lune_2.0.0_x64-setup.exe` 拷到 Windows 机器双击安装运行(或直接跑 `lune.exe`)。exe 已硬编码连 `139.224.114.89:9527`。
- 服务端:把 `server-deploy/` 整目录上传到 `139.224.114.89`(如 `/opt/lune/`),服务器上 `npm install --omit=dev` 后 `node dist/main.js`(或 pm2 守护)。防火墙放行 9527。
- Web Audio 发声与 UI 交互需安装后人工确认(Claude 无法驱动桌面 GUI)。

---

## 修复:切歌不同步(客机丢 playback_state)

日期：2026-07-03
执行者：Claude Agent

### 根因

用户反馈"主机切歌后客机没有切歌"。owner 切歌时 server 连续广播两条:`playback_state`(切歌) + `queue_updated`(队列变化)。原 `useWebSocket` 用 `useState<lastMessage>` 传递消息,React 18 在同一 tick 批处理两次 setState 只保留后一条 `queue_updated`,`playback_state` 被丢 → 客机队列更新了但播放没切。P3 node ws e2e 无 React 批处理故未暴露。

### 修法

- `useWebSocket` 改为订阅器:维护 `Set<Listener>`,`onmessage` 里 `listeners.forEach(fn => fn(msg))` 实时分发,不经过 React state。`subscribe(fn)` 返回取消订阅函数。
- `useSync` 用 `useEffect` + `subscribe` 注册回调,每条消息实时处理 + 写 Zustand store;`handlePlayback`/`loadAndPlay` 改用 `useCallback`。
- `Room.tsx` 调用从 `lastMessage: ws.lastMessage` 改为 `subscribe: ws.subscribe`。
- `pnpm --filter @lune/client build` 通过;重新 `tauri build --bundles nsis`,产物:
  - `apps/client/src-tauri/target/release/lune.exe`(10,349,568 B,17:19)
  - `apps/client/src-tauri/target/release/bundle/nsis/Lune_2.0.0_x64-setup.exe`(2,478,484 B,17:19)

### 待人工确认

切歌同步修复需在真机双窗验收:owner 点切歌 → 客机播放应同步切到下一首(此前 bug 是客机队列变但播放不变)。Claude 无法驱动桌面 GUI。

---

## UI 重构:沉浸式 NowPlaying + 专辑取色背景

日期：2026-07-03
执行者：Claude Agent

### 设计(与用户确认)

- **取色**:客户端 Canvas 从专辑封面提取主色(32×32 频率桶量化),按 coverUrl 缓存,失败降级默认色。不接服务端。
- **背景**:删原"糊封面图"背景,改三层纯色驱动——主色暗化铺底(`--lune-bg-accent`) + 顶部主色径向高斯光晕 + 底部渐暗;切歌 700ms 平滑过渡。
- **Player+Lyric 合并**:新建 `NowPlaying.tsx` 沉浸式大卡片(左 200px 大封面+主色投影+元信息+控制+进度+音量,右歌词区),删除 `Player.tsx`/`Lyric.tsx`。
- **歌词主色联动**:当前行 `drop-shadow 0 0 12px 主色/0.55` + scale 1.03;非当前行极淡;上下渐变遮罩改用 `--lune-bg-accent` 融合。

### 关键文件

- `apps/client/src/lib/color.ts`(新建):RGB↔HSL、`quantizeDominant`(频率桶,饱和度加权)、`darkenForBackground`(L=0.10,s×0.55)、`ensureReadableAccent`、`derivePalette`。
- `apps/client/src/hooks/useAccentColor.ts`(新建):Canvas 取色 + module Map 缓存 + CORS/SecurityError 降级 + generation token 防切歌竞态 + 旧色保持防闪烁。
- `apps/client/src/components/NowPlaying.tsx`(新建):合并 Player+Lyric 全部逻辑,空状态(未播放/无歌词)处理。
- `apps/client/src/pages/Room.tsx`(改):删糊封面背景层,接 `useAccentColor` 写 `--lune-accent/--lune-accent-soft/--lune-bg-accent`,换 `<NowPlaying>`。
- `apps/client/src/index.css`(改):`:root` 加 `--lune-bg-accent:14 16 22`;新增 `.now-playing` 类(主色径向光晕 + 700ms transition)。
- 删除 `apps/client/src/components/Player.tsx`、`Lyric.tsx`。

### 已验证

- `pnpm --filter @lune/client typecheck`:tsc --noEmit 通过,无类型错误。
- `pnpm --filter @lune/client dev`:Vite v5.4.21 启动成功,`http://localhost:5173` 编译无错误。

### 遗留风险(需真浏览器手动确认)

Claude 无法驱动浏览器,以下需用户手动跑 `pnpm dev:client` + `pnpm dev:server` 后在 5173 验证:
- **取色成功**:封面加载后背景/封面投影/进度条/歌词发光变为专辑主色(蓝专辑→深蓝底,红专辑→暗红底)。
- **CORS 降级**:网易云 CDN 若不给图片发 `Access-Control-Allow-Origin`,`getImageData` 抛 SecurityError → 降级默认蓝色,控制台无未捕获错误。若降级太频繁,备选加服务端 `/api/providers/cover?url=` 图片代理(非本次必做)。
- **切歌平滑**:切歌时背景/主色 700ms 平滑过渡,不闪回默认色;切回已播放过的歌首帧即正确色(缓存命中)。
- **歌词联动**:当前行主色发光、滚动居中、上下渐变与背景底色融合。
- **空状态**:未播放时封面占位 LUNE + 歌词区"等待房间开始同步";无歌词时"暂无歌词"。
- **布局**:桌面端左 200px 封面右歌词;窄屏 flex-col 封面缩小居中。

---

## P5 — 歌单搜索与批量加入

日期：2026-07-03
执行者：Claude Agent

### 设计(与用户确认)

- **UI**:SearchPanel 顶部 Tab 切"搜歌/歌单";歌单 tab 两层视图(列表→详情)。
- **歌单来源**:按歌单名搜索(网易云 cloudsearch `type=1000`),不解析分享链接、不手动填 ID。
- **加入方式**:歌单详情"全部加入"按钮 + 单曲点击加入。
- **批量加入**:新增 `add_songs` 批量 WS 消息(非循环 `add_song`),避免 200 首歌单触发 200 次全量 `queue_updated` 广播风暴 + Queue 组件 200 次重渲。
- **idle 起播策略**:"全部加入"只入队不起播,保持"加入/播放"动作分离,与 `onPickTrack` 的 idle/非 idle 二分一致。
- **服务端独立路由**:`playlist-search` 与 `playlist` 并列,不污染 `search` 的 `ProviderSearchResult` 类型契约。

### 关键文件

- `apps/shared/src/index.ts`(改):新增 `PlaylistSummary`/`ProviderPlaylistSearchResult` 类型;`MusicProvider` 加可选 `searchPlaylists?`;`ClientMessage` 加 `{ type:'add_songs', payload:{ tracks:Track[] } }`。
- `server/src/providers/providers.controller.ts`(改):新增 `PlaylistSearchQueryDto` + `@Get('playlist-search') playlistSearch()`(未实现 searchPlaylists 时返回 `{playlists:[]}`)。
- `server/src/providers/netease/netease.provider.ts`(改):新增 `searchPlaylists(keyword, limit)`,cloudsearch type=1000,字段防御性取值 `coverImgUrl||picUrl`、`creator?.nickname||creator`。
- `server/src/rooms/room.model.ts`(改):新增 `enqueueMany(tracks)`(push 返回 queue,同 `enqueue` 风格)。
- `server/src/sync/sync.gateway.ts`(改):`onMessage` 加 `case 'add_songs'` + `handleAddSongs`(任何成员可加,一次广播)。
- `apps/client/src/lib/api.ts`(改):新增 `searchPlaylists(kw,limit)` / `getPlaylist(id)`。
- `apps/client/src/components/SearchPanel.tsx`(改):Tab 化重构,props 加 `onAddMany`;歌单列表/详情两层视图,空曲目显示"该歌单暂无曲目"。
- `apps/client/src/pages/Room.tsx`(改):新增 `onAddMany` 回调发 `add_songs`,传给 SearchPanel。

### 已验证

- `pnpm --filter @lune/shared build`:tsc -b 通过(含新类型)。
- `pnpm --filter @lune/server build`:tsc -b 通过。
- `pnpm -r run typecheck`:shared/client/server 三包 Done,无类型错误。
- **curl 实测 cloudsearch type=1000 字段**(PORT=9541,真实 VIP cookie):
  1. `GET /api/providers/playlist-search?kw=华语流行&limit=2` → 2 个歌单摘要,字段映射正确:`id`/`name`/`coverUrl`(来自 `coverImgUrl`)/`trackCount`/`creator`(来自 `creator.nickname`) ✅
  2. `GET /api/providers/playlist-search?kw=` → 400(MinLength 校验) ✅
  3. `GET /api/providers/playlist-search?kw=test&provider=qq` → 404 `{"message":"无可用音乐源或指定的 provider 未激活"}` ✅
  4. `GET /api/providers/playlist?id=8596628206`(华语流行 Hi-Res 歌单) → 返回曲目列表(首曲"十年"陈奕迅) ✅ 端到端通
- `pnpm --filter @lune/client dev`:Vite v5.4.21 启动成功,5173 编译无错。

### 待人工确认(Claude 无法驱动浏览器)

跑 `pnpm dev:server` + `pnpm dev:client` 进房间验证:
- Tab 切换"搜歌/歌单"来回切不丢输入。
- 歌单 tab 搜词→列表→点歌单进详情→"全部加入"→Queue 出现整单曲目→返回列表→单曲点加。
- **批量广播**:owner 全部加入 200 首歌单,客机应只收到 1 条 `queue_updated`(queue 长度 200),Queue 组件渲染一次而非 200 次(可在浏览器 DevTools Network WS 面板数消息条数)。

### 遗留风险

- **cloudsearch type=1000 字段**:本次实测 `coverImgUrl` + `creator.nickname` 正确,但网易云 API 字段历史不稳,代码已加 `coverImgUrl||picUrl`、`creator?.nickname||creator` 防御性取值兜底。
- **批量广播 payload 体积**:200 首 Track ~40KB 单条广播,大房间多成员下短期可接受;长期若更大可改增量广播(更大协议改动,非本次范围)。
- **歌单曲目超多列表性能**:网易云部分歌单 1000+ 首,先用 `overflow-y-auto` 限高滚动兜底,未引入虚拟列表(避免过度自研);实测卡顿再单独评估。
- **非标准歌单**:cloudsearch type=1000 偶尔混入电台/播客(trackCount=0),`getPlaylist` 的 `safe` 兜底返回 `[]`,详情显示"该歌单暂无曲目"。
---

## UI Optimization: NowPlaying Card and Album Color

Date: 2026-07-04
Executor: Codex

### Scope

- Refined `NowPlaying` into an album-first left column and full-height lyric right column.
- Reduced playback control weight and tuned progress/volume sliders for a quieter desktop-player feel.
- Improved album color extraction and dark moonlight palette derivation.
- Updated room background layers for slower, smoother album-color transitions.

### Local Verification

- `pnpm --filter @lune/client build`: passed.
- Browser/visual verification: stopped after user instruction; user will validate the UI manually.

---

## UI Correction: Flat Editorial Player

Date: 2026-07-04
Executor: Codex

### Scope

- Removed glassmorphism-like blur, decorative radial backgrounds, cover glow, lyric glow and elevated controls.
- Flattened `NowPlaying` into an unframed editorial grid with album art, text hierarchy and thin controls.
- Reduced side panels from card surfaces to simple flat sections.
- Rebalanced album color derivation so the color only subtly shifts the dark background and progress line.

### Local Verification

- `pnpm --filter @lune/client build`: passed.
- Static scan confirmed no `blur`, `backdrop`, `radial-gradient`, `drop-shadow`, scale animation or active shadow usage in the main modified UI path.

---

## UI Rollback

Date: 2026-07-10
Executor: Codex

### Scope

- Rolled back the experimental UI styling changes on `NowPlaying`, `Room`, `index.css`, and `color.ts`.
- Restored the earlier compact player card/background/color extraction baseline.
- Kept user-facing Chinese strings readable.

### Local Verification

- `pnpm --filter @lune/client build`: passed.
