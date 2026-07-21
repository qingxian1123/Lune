# v1 遗留代码（archive/v1-legacy）

日期：2026-07-02
归档执行者：Claude Agent

本目录是 Lune 项目的 v1 历史实现，已停止维护。v2 重构采用 pnpm monorepo（`apps/client` + `apps/shared` + `server`），本目录仅作参考之用。

## v1 技术栈回顾

- 前端：React + Vite + Tailwind，扁平 `src/` 结构，无状态管理库
- 服务端：Express + `ws`，单文件 `server/src/index.ts`
- 网易云代理：`server/src/neteaseProxy.ts` 直接耦合 `NeteaseCloudMusicApi`
- Tauri：`src-tauri/`（Windows 桌面端）

## v2 重新设计中,以如下模块为迁移/参考起点

- `server/src/index.ts`：`.env` 加载方式、端口 9527、`/health`、`/ws` 路径约定 → v2 同步网关 / 健康检查沿用
- `server/.env` 的 `MUSIC_COOKIE` → v2 netease provider 的 cookie env 复用（v2 仓库根保留原 `.env` 已含 MUSIC_COOKIE，需迁移至 v2 `server/.env`）
- `server/src/room.ts`：`Track` / `PlaybackState` / `Member` 类型结构 → `apps/shared` 协议类型参考
- `server/src/wsHandler.ts`：消息类型枚举 → v2 同步协议设计参考

## 警告

- 本目录代码不再接收更新，不参与 v2 的 `pnpm install` / 构建流程
- 不要在此修复任何问题,如需同样能力请在 v2 重写