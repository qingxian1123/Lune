# Lune 服务端持久化运行方案 V1

## 1. 推荐结论

生产 Linux 服务器推荐使用 **systemd + 单实例 Node.js + 独立数据目录**：

```text
/opt/lune/server-deploy/       只读应用发布目录
/etc/lune/providers.json       非敏感 Provider 配置
/etc/lune/lune.env             启动密钥，root:lune 0640
/var/lib/lune/                 Provider 加密凭据，lune:lune 0700
journald                        服务日志
```

PM2 作为快速部署和开发验证方案保留。两种方式只能选择一种，不能同时启动同一端口。

必须保持 `instances=1`：当前房间、成员、队列和播放状态都在进程内存中，多进程会造成同一房间被分配到不同实例。Provider 凭据已经持久化，但房间状态尚未持久化，进程重启后房间仍会清空。

## 2. 已持久化与未持久化内容

| 数据 | 当前行为 | 重启后 |
|---|---|---|
| Provider Cookie/Token | AES-256-GCM 加密写入 `LUNE_DATA_DIR` | 保留 |
| Provider 非敏感配置 | `providers.json` | 保留 |
| 主密钥、管理 Token、JWT 密钥 | systemd EnvironmentFile 或 `.env` | 保留 |
| 房间、成员、队列、播放状态 | Node.js 内存 | 清空 |
| 登录二维码会话 | Node.js 内存 | 清空，需要重新发起 |
| 运行状态、熔断状态 | Node.js 内存 | 重建 |

因此，“持久化运行”第一版解决进程守护和 Provider 账号恢复，不代表房间业务数据已经持久化。

## 3. systemd 生产部署

仓库提供：

```text
server-deploy/systemd/lune-server.service
server-deploy/systemd/lune.env.example
```

### 3.1 创建服务账号和目录

```bash
sudo useradd --system --home-dir /opt/lune --shell /usr/sbin/nologin lune
sudo install -d -o lune -g lune -m 0750 /opt/lune/server-deploy
sudo install -d -o root -g lune -m 0750 /etc/lune
sudo install -d -o lune -g lune -m 0700 /var/lib/lune
```

上传发布制品到 `/opt/lune/server-deploy`，然后安装生产依赖：

```bash
cd /opt/lune/server-deploy
sudo -u lune npm ci --omit=dev
```

### 3.2 安装配置与密钥

```bash
sudo install -o root -g lune -m 0640 config/providers.json /etc/lune/providers.json
sudo install -o root -g lune -m 0640 systemd/lune.env.example /etc/lune/lune.env
sudoedit /etc/lune/lune.env
```

必须填写：

- `LUNE_MASTER_KEY`
- `LUNE_ADMIN_TOKEN`
- `JWT_SECRET`

配置验证：

```bash
sudo -u lune bash -lc 'set -a; source /etc/lune/lune.env; set +a; cd /opt/lune/server-deploy; node dist/providers/interfaces/cli/provider-cli.js config validate --json'
```

也可以直接安装 unit 后使用 `systemctl start`；`ExecStartPre` 会读取 EnvironmentFile 并完成同一校验。

### 3.3 安装并启动 unit

确认 Node.js 路径：

```bash
command -v node
```

如果不是 `/usr/bin/node`，先修改 `lune-server.service` 中的两个 Node 路径。

```bash
sudo install -o root -g root -m 0644 \
  systemd/lune-server.service /etc/systemd/system/lune-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now lune-server
```

检查：

```bash
systemctl status lune-server --no-pager
journalctl -u lune-server -n 100 --no-pager
curl --fail http://127.0.0.1:9527/api/health/live
curl --fail http://127.0.0.1:9527/api/health/ready
```

`live` 成功但 `ready` 返回 503 时，说明进程正常，但还没有可用 Provider，通常需要扫码登录。

### 3.4 首次扫码登录

停止服务不是必需条件。使用与 unit 相同的服务账号和环境执行：

```bash
sudo systemctl stop lune-server
sudo -u lune bash -lc 'set -a; source /etc/lune/lune.env; set +a; cd /opt/lune/server-deploy; npm run provider -- login netease'
sudo -u lune bash -lc 'set -a; source /etc/lune/lune.env; set +a; cd /opt/lune/server-deploy; npm run provider -- login kugou'
sudo systemctl start lune-server
```

这里选择先停止服务，是为了避免 CLI 与服务内定时刷新同时写同一个凭据文件。后续可以直接通过受保护管理 API 在线重新登录。

## 4. PM2 快速方案

在 `server-deploy` 目录执行：

```bash
npm install --omit=dev
npm run provider -- init
# 将 .env.provider.generated 合并到 .env 后删除生成文件
npm run provider -- login netease
npm run provider -- login kugou
npm run provider -- doctor
npm install --global pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

必须执行 `pm2 startup` 输出的那条 sudo 命令，才能真正实现开机自启。

常用命令：

```bash
pm2 status
pm2 logs lune-server --lines 100
pm2 restart lune-server --update-env
pm2 reload ecosystem.config.cjs --update-env
pm2 stop lune-server
```

PM2 配置固定 `fork + instances: 1`，包含异常自动重启、3 秒延迟、指数退避、512 MB 内存重启阈值和 15 秒优雅退出窗口。

建议安装日志轮转：

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

## 5. 发布、升级与回滚

本地生成制品：

```bash
npm --prefix server run deploy:pack -- --dry-run
npm --prefix server run deploy:pack
```

推荐服务器使用版本目录：

```text
/opt/lune/releases/2026-08-09-001/
/opt/lune/releases/2026-08-10-001/
/opt/lune/current -> /opt/lune/releases/2026-08-10-001/
```

数据和密钥始终放在 `/var/lib/lune`、`/etc/lune`，不能放进版本目录。

升级顺序：

1. 上传新版本并运行 `npm ci --omit=dev`。
2. 使用新版本 CLI 执行 `config validate`。
3. 停止服务，切换 `current` 符号链接。
4. 启动服务并检查 `live`、`ready`、Provider 状态。
5. 失败时切回旧链接并重启。

当前仓库 unit 固定使用 `/opt/lune/server-deploy`。采用 `current` 方案时，应把 unit 的 `WorkingDirectory`、`ExecStartPre` 和 `ExecStart` 改为 `/opt/lune/current`。

## 6. 备份方案

需要备份：

```text
/var/lib/lune/provider-credentials.enc.json
/etc/lune/providers.json
/etc/lune/lune.env
```

注意：加密凭据文件和 `LUNE_MASTER_KEY` 必须同时可恢复，但最好分别保存在两个安全位置。只备份其中一个都无法恢复账号登录态。

建议：

- 每天备份 Provider 凭据和配置。
- 保留最近 7 个日备份和 4 个周备份。
- 备份文件再次使用主机级加密或密钥管理服务加密。
- 每月至少执行一次恢复演练。
- 不备份普通日志中的临时请求信息作为业务数据。

## 7. 监控与自动恢复

外部监控每 30 秒检查：

- `/api/health/live`：连续 3 次失败，重启服务并告警。
- `/api/health/ready`：连续 2 次失败只告警，不盲目重启；登录失效无法靠重启恢复。
- 管理状态：Provider 长时间为 `auth-required` 时通知管理员扫码。

systemd 已负责进程崩溃和异常退出后的重启。不要再写 cron 每分钟无条件重启，否则会掩盖配置错误并形成重启风暴。

## 8. 房间状态持久化的后续方案

如果要求服务重启后房间继续存在，需要单独实施业务状态持久化：

1. 为 `RoomStore` 定义仓储端口。
2. 使用 Redis 保存房间快照、队列 revision、播放 seq 和过期时间。
3. 每次写操作使用 Lua 或事务保证 revision/seq 原子递增。
4. WebSocket 多实例时增加 Redis Pub/Sub 或 Streams 广播。
5. JWT 房间身份继续验证，但加入房间时从 Redis 恢复状态。

在完成这部分之前，必须保持单实例，并接受服务重启清空房间。
