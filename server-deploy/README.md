# Lune 服务端部署目录

`server-deploy/` 是服务端发布模板。仓库中的配置不包含真实密钥、账号 Cookie 或运行数据。

## 内容

```text
server-deploy/
├─ config/providers.json       Provider 非敏感配置模板
├─ systemd/                    systemd unit 与环境变量模板
├─ nginx/lune.conf             HTTP、WebSocket 和管理路由代理模板
├─ bin/lune-provider           生产环境 CLI 包装器
├─ ecosystem.config.cjs        PM2 单实例配置
├─ .env.example                生产环境变量模板
├─ package.json                生产依赖与运行命令
└─ README.md
```

执行普通打包后还会生成 `dist/` 和 `RELEASE.json`。运行时的 `.env`、`data/`、`logs/` 和 `dist.backup-*` 不应提交。

## 打包命令

在仓库根目录执行：

```bash
npm run deploy:server
```

该命令构建 `server/`，把编译产物更新到 `server-deploy/dist/`，并写入 `RELEASE.json`。如果已经存在 `dist/`，原目录会改名为带时间戳的本地备份。

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

首次部署必须先设置 `LUNE_MASTER_KEY`、`LUNE_ADMIN_TOKEN` 和 `JWT_SECRET`，再通过 Provider CLI 登录音乐源。服务端只能运行一个实例；进程重启会清空房间状态。

Ubuntu、systemd、Nginx、登录、更新与备份的完整流程见 [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)。干净发布包会把该文档复制为包内 `README.md`。
