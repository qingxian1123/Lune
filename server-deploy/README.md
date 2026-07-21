# Lune 服务端移植说明

目标：把本目录上传到公网服务器 `139.224.114.89`，端口 `9527`，手动运行。

## 目录内容

```
server-deploy/
├─ dist/           # 编译后的 NestJS 产物(已含所有模块)
├─ package.json    # 生产依赖清单(仅 dependencies)
├─ .env            # 配置(PORT/MUSIC_COOKIE/MUSIC_PROVIDERS/JWT_SECRET)
├─ .env.example    # 不含密钥的配置示例
└─ UPDATE-QUEUE-REORDER.md # 2026-07-17 队列排序升级说明
```

`dist/` 已把 `@lune/shared` 的类型内联擦除，运行时不依赖 workspace 其他包，本目录可独立运行。

## 服务器前置

- Node.js >= 18（推荐 20+）
- 包管理器：npm 或 pnpm（下面用 npm）
- 端口 9527 放行（防火墙/安全组）

## 部署步骤

1. 上传 `server-deploy/` 到服务器，例如 `/opt/lune/`：

   ```bash
   # 本地执行（示例，按你的实际方式 scp/rsync）
   scp -r server-deploy root@139.224.114.89:/opt/lune
   ```

2. 服务器上安装生产依赖：

   ```bash
   cd /opt/lune/server-deploy
   npm install --omit=dev   # 或 pnpm install --prod
   ```

3. 启动（前台先验证）：

   ```bash
   node dist/main.js
   ```

   预期输出：
   ```
   [Lune Server] 运行在 http://localhost:9527/api
   [Lune Server] MUSIC_COOKIE: 已加载
   [Lune Server] WebSocket 路径: ws://localhost:9527/ws
   ```

4. 本地验证可达：

   ```bash
   curl http://139.224.114.89:9527/api/health
   # 期望 {"ok":true}
   ```

5. 用进程守护常驻（推荐 pm2）：

   ```bash
   npm i -g pm2
   pm2 start dist/main.js --name lune
   pm2 save
   pm2 startup        # 开机自启
   ```

## 配置项说明

| 变量 | 说明 |
|---|---|
| `PORT` | 监听端口，固定 9527 |
| `MUSIC_COOKIE` | 网易云 VIP cookie，`MUSIC_U=...` 形式。失效后需从浏览器重新获取并替换 |
| `MUSIC_PROVIDERS` | 启用的音乐源，逗号分隔，目前仅 `netease` |
| `JWT_SECRET` | JWT 签名密钥，已设为强随机串，勿泄露 |

## 更新代码

后续改了 server 代码后：
1. 本地 `pnpm --filter @lune/server build`
2. 重新 `cp -r server/dist server-deploy/dist`
3. 上传 `server-deploy/dist/` 覆盖服务器对应目录
4. `pm2 restart lune`

2026-07-17 待播队列拖放排序版本的具体升级和回滚步骤见 `UPDATE-QUEUE-REORDER.md`。该版本没有新增服务端生产依赖，已有部署只需更新 `dist/`。

## 注意

- `.env` 含 VIP cookie 与 JWT 密钥，**不要提交 git**（仓库 `.gitignore` 已排除 `.env`）。本目录是给你手动上传的临时产物。
- 房间为内存态，进程重启房间清空（与 v1 一致）。
- WebSocket 路径 `/ws`，客户端 `VITE_SERVER_URL=http://139.224.114.89:9527` 已写入 exe。
