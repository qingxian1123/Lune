# Lune · 一起听

Lune 是一个自托管的多人同步听歌应用。用户在 Windows 或 Android 客户端连接自己的 Lune 服务，创建房间或通过六位房间码加入；房间成员可以共同选歌、调整进度、切歌和维护队列。

项目不提供公共服务器、预置账号或固定音乐源登录态。部署需要自行运行服务端，并通过 Provider CLI 登录音乐平台账号。

## 功能

- Windows 与 Android 双平台
- WebSocket 实时同步播放状态、队列和成员列表
- 单曲搜索、歌单搜索、整单加入、歌词和收藏
- 完整的歌曲列表体验
- 网易云音乐和酷狗音乐 Provider
- Android 后台播放、锁屏媒体卡、音频焦点与耳机断开处理
- 客户端首次启动配置自建服务器地址

## 技术栈

- 客户端：Tauri 2、React 18、TypeScript、Vite、Zustand、TanStack Query
- 服务端：NestJS 10、原生 `ws` WebSocket adapter、JWT
- 工作区：pnpm monorepo
- 音乐源：服务端进程内 Provider，登录凭据使用 AES-256-GCM 加密落盘

## 目录

```text
Lune/
├─ apps/client/       Windows / Android 客户端
├─ apps/shared/       前后端共享协议与数据类型
├─ server/            NestJS 服务端、Provider 与测试
├─ server-deploy/     部署模板、systemd、Nginx 与 PM2 配置
├─ docs/              当前版本文档
└─ package.json       工作区命令入口
```

## 本地开发

需要 Node.js 18 或更高版本、pnpm 9 或更高版本。Tauri 桌面构建还需要 Rust；Android 环境见 [Android 开发与构建](docs/android.md)。

```bash
pnpm install

pnpm dev:server
pnpm dev:client

pnpm typecheck
pnpm build
```

默认地址：

- Web 客户端：`http://127.0.0.1:5173`
- HTTP API：`http://127.0.0.1:9527/api`
- WebSocket：`ws://127.0.0.1:9527/ws`

复制 `server/.env.example` 为 `server/.env`，先初始化 Provider 文件和随机密钥：

```bash
pnpm --filter @lune/server provider init
```

把 `server/.env.provider.generated` 中的变量合并到 `server/.env`，删除生成文件后登录并检查音乐源：

```bash
pnpm --filter @lune/server provider login netease
pnpm --filter @lune/server provider login kugou
pnpm --filter @lune/server provider doctor
```

客户端可在首次启动时填写服务地址；本地开发也可复制 `apps/client/.env.example` 为 `apps/client/.env` 并设置 `VITE_SERVER_URL`。

## 构建

```bash
pnpm build:client
pnpm build:server

pnpm tauri build
pnpm tauri android build --apk
```

生成不包含环境变量、登录凭据和运行数据的服务端发布目录：

```bash
npm run deploy:server:clean
```

产物位于 `server-release-clean/`。完整生产部署步骤见 [服务端部署与运维](docs/DEPLOYMENT.md)。

## 验证

```bash
pnpm typecheck
pnpm --filter @lune/server test:room
pnpm --filter @lune/server test:providers
pnpm --filter @lune/server test:kugou
pnpm build
```

端到端脚本需要先启动服务端，并保证相应 Provider 已登录：

```bash
node server/test/sync-e2e.mjs
```

## 文档

- [文档索引](docs/README.md)
- [系统架构](docs/ARCHITECTURE.md)
- [Provider 配置与开发](docs/PROVIDERS.md)
- [WebSocket 同步协议](docs/SYNC_PROTOCOL.md)
- [Android 开发与构建](docs/android.md)
- [服务端部署与运维](docs/DEPLOYMENT.md)

## 当前限制

- 房间、成员、播放和队列状态保存在服务端内存中；服务重启后清空。
- 服务端必须单实例运行，多实例之间不会共享房间状态。
- 音乐可用性受上游账号、会员、版权和地区限制。
- 当前不提供用户账号体系、跨服务发现或房间持久化。

## License

[MIT](LICENSE)
