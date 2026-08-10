# Lune · 一起听

Lune 是一个自托管的“一起听歌”系统壳子，支持房间同步播放和 Provider 插件式音源接入。本仓库不提供公共服务器、预置账号或固定音源登录态：使用者自行部署服务端，在客户端首次启动时添加服务器地址，并在自己的服务器上配置音源账号。

## 技术栈

- **桌面端** (`apps/client`)：Tauri 2 + React 18 + TypeScript + Vite + Tailwind CSS,状态管理 Zustand,服务端状态 TanStack Query,音频 Web Audio API,实时 native WebSocket
- **服务端** (`server`)：NestJS 10 + Prisma (SQLite 默认 / MySQL 可切) + `@nestjs/websockets` + `ws` adapter + JWT 房间邀请码
- **共享类型** (`apps/shared`)：前后端协议、DTO
- **音乐源**：Provider 插件式 (`server/src/providers/`)，当前提供网易云、酷狗基准实现，账号由服务端使用者自行登录

## 目录结构

```
Lune/
├─ apps/
│  ├─ client/          # Tauri + React 桌面端（Windows 优先,Android 二期）
│  └─ shared/          # 前后端共享类型
├─ server/            # NestJS 后端
├─ archive/v1-legacy/  # v1 遗留代码,仅供参考,不再维护
├─ docs/              # 文档（Provider 开发、同步协议,见对应阶段）
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ package.json
```

## 开发

需要 Node.js >= 18、pnpm >= 9。Windows 桌面端构建另需 Rust toolchain (Tauri 2)。

```bash
# 安装所有工作区依赖
pnpm install

# 分别启动
pnpm dev:client   # Vite dev server (http://localhost:5173)
pnpm dev:server   # NestJS dev (tsx watch)

# 类型检查
pnpm typecheck

# 构建
pnpm build:client
pnpm build:server

# Tauri 桌面端（需 Rust）
pnpm tauri dev
pnpm tauri build
```

## 部署

使用白名单脚本生成不含 `.env`、Cookie、Token 和凭据文件的服务端发布包：

```bash
npm run deploy:server:clean
```

完整的 Ubuntu、全新二维码登录与 systemd 持久化说明见 `docs/UBUNTU_NEW_LOGIN_DEPLOY.md`。客户端发行包默认不固化服务器地址；首次启动时填写自建服务地址并通过健康检查后，地址只保存在当前设备。

## 阶段路线

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 归档 v1 + monorepo 骨架 | 进行中 |
| P1 | NestJS + Prisma + 房间/邀请码 | 待开始 |
| P2 | Provider 插件层 + 网易云 provider | 待开始 |
| P3 | WebSocket 同步网关 + 协议类型 | 待开始 |
| P4 | 客户端 AudioEngine + 播放器 + 房间页 | 待开始 |
| 二期 | admin 后台 / Android Tauri / 多 provider | — |

详见 `archive/v1-legacy/README.md` 了解 v1 设计参考。
