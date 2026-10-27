# Lune 服务端部署目录

`server-deploy/` 是服务端发布模板。仓库中的配置不包含真实密钥、账号 Cookie 或运行数据。

Linux Docker Compose 单实例部署见 [README.compose.md](README.compose.md)。

当前版本为 **2.1.0**，见 [版本说明](releases/v2.1.0.md)。黑色管理后台、固定管理员账号、SSH 隧道与账号恢复说明见 [管理员使用说明](ADMIN.md)。

## 内容

```text
server-deploy/
├─ ADMIN.md                    管理员使用与恢复说明
├─ releases/v2.1.0.md           本版本功能与升级说明
├─ config/providers.json       Provider 非敏感配置模板
├─ systemd/                    systemd unit 与环境变量模板
├─ nginx/lune.conf             HTTP 与 WebSocket 代理模板
├─ bin/lune-provider           生产环境 CLI 包装器
├─ bin/lune-admin-code         systemd 配对码生成工具（Python 3）
├─ ecosystem.config.cjs        PM2 单实例配置
├─ .env.example                生产环境变量模板
├─ package.json                生产依赖与运行命令
└─ README.md
```

执行普通打包后还会生成 `dist/`、`admin-public/`、`RELEASE.json` 和 `RELEASE-NOTES.md`。运行时的环境文件、数据、日志和构建备份不应提交。

## 打包命令

在仓库根目录执行：

```bash
npm run deploy:server
```

该命令构建 `server/`，把编译产物与当前管理页面更新到 `server-deploy/`，并写入含版本号的 `RELEASE.json` 和 `RELEASE-NOTES.md`。如果已经存在 `dist/`，原目录会改名为带时间戳的本地备份。

生成对外传输用的白名单发布目录：

```bash
npm run deploy:server:clean
```

产物位于 `server-release-clean/`，只包含运行必需文件和模板，不复制环境变量、Provider 凭据、日志或备份。

## 运行

部署包内安装依赖并启动：

```bash
npm ci --omit=dev
npm run provider -- config validate
npm start
```

首次部署先设置 `LUNE_MASTER_KEY`、`LUNE_ADMIN_TOKEN` 和 `JWT_SECRET`，启动服务后按 `ADMIN.md` 配对并创建管理员，再在后台扫码登录音乐源。Provider CLI 同样可用。服务端只能运行一个实例。房间保存于 `LUNE_DATA_DIR/rooms/`，空房默认保留 24 小时，重启后恢复未过期房间；发布时保留完整数据目录和原密钥，包括管理员账号文件 `admin-account.json`。

`LUNE_ROOM_RETENTION_MS=86400000`、`LUNE_ROOM_GRACE_MS=30000`、`LUNE_ROOM_CHECKPOINT_MS=30000` 分别设置离线保留、断线宽限和检查点周期。首次从旧版内存模型升级仍会丢失没有导出的旧房间，应安排无活跃房间的窗口。

Ubuntu、systemd、Nginx、登录、更新与备份的完整流程见 [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)。干净发布包会把该文档复制为包内 `README.md`。
