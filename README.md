# Lune · 一起听

Lune 是一个一起听歌方案项目，支持房间同步播放和 Provider 插件式音源接入。本仓库不提供公共服务器、预置账号或固定音源登录态，需自行部署服务端。

## 技术栈

- **客户端** (`apps/client`)：Windows / Android 共用 Tauri 2 + React 18 + TypeScript + Vite，状态管理 Zustand，服务端状态 TanStack Query，音频 Web Audio API，实时 native WebSocket
- **服务端** (`server`)：NestJS 10 + Prisma (SQLite 默认 / MySQL 可切) + `@nestjs/websockets` + `ws` adapter + JWT 房间邀请码
- **共享类型** (`apps/shared`)：前后端协议、DTO
- **音乐源**：Provider 插件式 (`server/src/providers/`)，当前提供网易云、酷狗基准实现，账号由服务端使用者自行登录

## 目录结构

```
Lune/
├─ apps/
│  ├─ client/          # Windows / Android 共用的 Tauri + React 客户端
│  │  ├─ src/app/      # 应用运行时与平台组合入口
│  │  ├─ src/features/ # 跨平台业务控制器和功能模块
│  │  ├─ src/desktop/  # Windows 展示组件
│  │  ├─ src/mobile/   # Android 展示组件
│  │  ├─ src/platform/ # 平台检测与原生能力适配
│  │  └─ src-tauri/    # Rust 主程序、移动插件与 Android 工程
│  └─ shared/          # 前后端共享类型
├─ server/             # NestJS 后端
├─ server-deploy/      # 服务端部署模板与运维脚本
├─ archive/v1-legacy/  # v1 遗留代码,仅供参考,不再维护
├─ docs/               # Android、Provider、部署与持久化文档
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
└─ package.json
```

## 开发

需要 Node.js >= 18、pnpm >= 9。Windows 构建另需 Rust toolchain；Android 环境见 `docs/android.md`。

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

# Android
pnpm tauri android dev
pnpm tauri android build --apk
```

## 部署

使用白名单脚本生成不含 `.env`、Cookie、Token 和凭据文件的服务端发布包：

```bash
npm run deploy:server:clean
```

完整的 Ubuntu、全新二维码登录与 systemd 持久化说明见 `docs/UBUNTU_NEW_LOGIN_DEPLOY.md`。客户端发行包默认不固化服务器地址；首次启动时填写自建服务地址并通过健康检查后，地址只保存在当前设备。

全部开发、设计和部署资料见 [`docs/README.md`](docs/README.md)。

本地生成的客户端安装包统一放在 `release-artifacts/client/<version>/`，服务端部署快照放在 `release-artifacts/server/`。整个 `release-artifacts/` 为本地交付目录，不进入 Git。

## 当前能力

| 模块 | 状态 |
|---|---|---|
| Windows / Android 同房间同步播放 | 已完成 |
| 无暂停模型、全员平等控制 | 已完成 |
| Provider 插件架构与多音源接入 | 已完成 |
| Android 后台播放与媒体通知 | 已完成 |
| 可扩展设置系统与服务器地址配置 | 已完成 |
