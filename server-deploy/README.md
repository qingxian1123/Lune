# Lune 服务端移植说明

目标：把 Lune 服务端部署到使用者自己的服务器。项目不预置公网地址、音源账号或登录态。

## 目录内容

```
server-deploy/
├─ dist/           # 编译后的 NestJS 产物(已含所有模块)
├─ config/         # Provider 非敏感配置
├─ data/           # 运行时创建；加密 Provider 凭据，不随版本覆盖
├─ package.json    # 生产依赖清单(仅 dependencies)
├─ RELEASE.json    # 自动打包生成的版本和上游依赖信息
├─ .env            # 端口、主密钥、管理 Token 与 JWT_SECRET
├─ .env.example    # 不含密钥的配置示例
└─ UPDATE-QUEUE-REORDER.md # 2026-07-17 队列排序升级说明
```

`dist/` 已把 `@lune/shared` 的类型内联擦除，运行时不依赖 workspace 其他包，本目录可独立运行。

## 服务器前置

- Node.js 24 LTS
- 包管理器：npm 或 pnpm（下面用 npm）
- 服务端默认监听 9527；是否直接开放、使用反向代理或 HTTPS 由服务器使用者决定

## 部署步骤

1. 上传 `server-deploy/` 到服务器，例如 `/opt/lune/`：

   ```bash
   # 本地执行（示例，按你的实际方式 scp/rsync）
   scp -r server-release-clean <user>@<server>:/tmp/lune-release
   ```

2. 服务器上安装生产依赖：

   ```bash
   cd /opt/lune/server-deploy
   npm install --omit=dev   # 或 pnpm install --prod
   ```

3. 初始化 Provider 配置和密钥：

   ```bash
   npm run provider -- init
   ```

   将 `.env.provider.generated` 的内容写入 `.env` 或部署平台 Secret，确认保存后删除生成文件。随后执行：

   ```bash
   npm run provider -- config validate
   npm run provider -- login netease
   npm run provider -- login kugou
   npm run provider -- doctor
   ```

   两个登录命令会输出登录 URL 并自动等待扫码确认；成功后 Cookie/Token 加密保存到 `data/provider-credentials.enc.json`。

4. 启动（前台先验证）：

   ```bash
   node dist/main.js
   ```

   预期输出：
   ```
   [Lune Server] 运行在 http://localhost:9527/api
   [Lune Server] Providers: netease=ready, kugou=ready
   [Lune Server] WebSocket 路径: ws://localhost:9527/ws
   ```

5. 本地验证可达：

   ```bash
   curl http://127.0.0.1:9527/api/health/live
   curl http://127.0.0.1:9527/api/health/ready
   # 期望 {"ok":true}
   ```

6. 用进程守护常驻。生产 Linux 推荐安装 `systemd/lune-server.service`；快速部署可使用 PM2：

   ```bash
   npm i -g pm2
   mkdir -p logs
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup        # 继续执行它输出的 sudo 命令，才能完成开机自启
   ```

   当前房间状态在内存中，必须保持单实例。不要把 PM2 `instances` 改成大于 1，也不要同时运行 systemd 和 PM2。

## 配置项说明

| 变量 | 说明 |
|---|---|
| `PORT` | 监听端口，固定 9527 |
| `LUNE_CONFIG_FILE` | Provider 非敏感配置文件，默认 `./config/providers.json` |
| `LUNE_DATA_DIR` | 加密凭据目录，默认 `./data` |
| `LUNE_MASTER_KEY` | 32 字节 Base64 或 64 位 hex 主密钥，丢失后无法解密凭据 |
| `LUNE_ADMIN_TOKEN` | Provider 管理 API Bearer Token |
| `JWT_SECRET` | JWT 签名密钥，已设为强随机串，勿泄露 |

`MakcRe/KuGouMusicApi` 已作为固定版本的生产依赖在 Lune 进程内调用，不需要单独部署服务或开放 3000 端口。

## 更新代码

后续改了 server 代码后：
1. 本地运行 `npm --prefix server run deploy:pack`
2. 脚本编译并更新 `server-deploy/dist`，旧版本保留为带时间戳的备份
3. 上传新的 `dist/`、`package.json`、锁文件、配置模板和 `RELEASE.json`
4. 使用 systemd 时执行 `systemctl restart lune-server`；使用 PM2 时执行 `pm2 restart lune-server --update-env`

2026-07-17 待播队列拖放排序版本的具体升级和回滚步骤见 `UPDATE-QUEUE-REORDER.md`。该版本没有新增服务端生产依赖，已有部署只需更新 `dist/`。

## 注意

- `.env`、`data/` 和备份均含敏感信息，**不要提交 git**，也不要通过普通日志或聊天工具传输。
- Provider 管理 API 默认要求 `LUNE_ADMIN_TOKEN`，建议只通过回环地址或 SSH 隧道访问。
- 房间为内存态，进程重启房间清空（与 v1 一致）。
- WebSocket 路径为 `/ws`。客户端不写死服务地址，由使用者首次启动时添加并保存在本机。
