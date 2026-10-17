# 服务端部署与运维

本文以 Ubuntu、systemd 和 Nginx 为例部署单实例 Lune 服务端。发布包不包含账号凭据、环境变量或运行数据。

## 生成发布包

在仓库根目录执行：

```bash
pnpm install
npm run deploy:server:clean
```

命令先构建服务端，再生成 `server-release-clean/`。目录包含编译产物、管理页面、生产依赖清单、Provider 默认配置、CLI、systemd、Nginx 和 PM2 模板。

## 服务器准备

- Node.js 18 或更高版本，建议使用当前维护中的 LTS
- npm
- systemd
- Nginx（需要反向代理或 HTTPS 时）

创建专用账号和目录：

```bash
sudo useradd --system --home /opt/lune --shell /usr/sbin/nologin lune
sudo install -d -o lune -g lune -m 0755 /opt/lune/releases
sudo install -d -o root -g lune -m 0750 /etc/lune
sudo install -d -o lune -g lune -m 0700 /var/lib/lune
```

把发布包上传到一个新的发行目录，例如 `/opt/lune/releases/release-id/`（将 `release-id` 替换为本次发布标识），安装生产依赖并切换 `current`：

```bash
sudo chown -R lune:lune /opt/lune/releases/release-id
cd /opt/lune/releases/release-id
sudo -u lune npm ci --omit=dev
sudo ln -sfn /opt/lune/releases/release-id /opt/lune/current
```

发行目录名称只是部署标识，不参与程序版本判断。

## 配置密钥

先在发行目录生成配置和密钥：

```bash
cd /opt/lune/current
sudo -u lune npm run provider -- init
```

将 `.env.provider.generated` 的值安全地写入 `/etc/lune/lune.env`，并使用发布包内的生产模板补齐监听配置：

```dotenv
PORT=9527
HOST=127.0.0.1
LUNE_MANAGE_PORT=9528
LUNE_MANAGE_HOST=127.0.0.1
NODE_OPTIONS=--dns-result-order=ipv4first
LUNE_CONFIG_FILE=/etc/lune/providers.json
LUNE_DATA_DIR=/var/lib/lune
LUNE_ROOM_RETENTION_MS=86400000
LUNE_ROOM_GRACE_MS=30000
LUNE_ROOM_CHECKPOINT_MS=30000
LUNE_MASTER_KEY=<32 字节 Base64 或 64 位十六进制>
LUNE_ADMIN_TOKEN=<高强度随机值>
JWT_SECRET=<高强度随机值>
```

复制并保护文件：

```bash
sudo install -o root -g lune -m 0640 /opt/lune/current/config/providers.json /etc/lune/providers.json
sudo chmod 0640 /etc/lune/lune.env
sudo rm -f /opt/lune/current/.env.provider.generated
```

`LUNE_MASTER_KEY` 丢失后无法解密 Provider 凭据；必须与 `/var/lib/lune` 一起备份。`JWT_SECRET` 和管理 Token 不应与主密钥复用。

房间原子保存于 `LUNE_DATA_DIR/rooms/`。该目录必须可写，发布或清理发行目录时不得删除。空房保留时间默认 24 小时，从最后一条连接断开时计算；断线宽限和恢复检查点默认 30 秒。以上三个 `LUNE_ROOM_*_MS` 参数均为毫秒正整数。

## 登录 Provider

安装 CLI 包装器：

```bash
sudo install -o root -g root -m 0755 /opt/lune/current/bin/lune-provider /usr/local/bin/lune-provider
```

校验配置并扫码登录：

```bash
sudo -u lune lune-provider config validate
sudo -u lune lune-provider login netease
sudo -u lune lune-provider login kugou
sudo -u lune lune-provider doctor
```

`doctor` 成功时至少一个启用的 Provider 为 `ready`，凭据保存在 `/var/lib/lune/provider-credentials.enc.json`。

## systemd

模板固定使用 `/usr/local/bin/node`。先确认实际路径：

```bash
command -v node
```

路径不同时修改 `systemd/lune-server.service` 中的 `ExecStartPre` 和 `ExecStart`。然后安装并启动：

```bash
sudo install -o root -g root -m 0644 /opt/lune/current/systemd/lune-server.service /etc/systemd/system/lune-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now lune-server
sudo systemctl status lune-server
sudo journalctl -u lune-server -f
```

验证本机接口：

```bash
curl --fail http://127.0.0.1:9527/api/health/live
curl --fail http://127.0.0.1:9527/api/health/ready
```

存活检查仅确认进程响应；就绪检查还要求至少一个 Provider 可用。

## Nginx 与 HTTPS

`server-deploy/nginx/lune.conf` 转发应用与 WebSocket，并对 `/api/admin/` 返回 404。管理页面只监听 `127.0.0.1:9528`；可在服务器本机打开 `http://127.0.0.1:9528/api/admin/ui`，远程使用 SSH 隧道或 Provider CLI。安装代理后检查并重载：

```bash
sudo install -o root -g root -m 0644 /opt/lune/current/nginx/lune.conf /etc/nginx/sites-available/lune
sudo ln -sfn /etc/nginx/sites-available/lune /etc/nginx/sites-enabled/lune
sudo nginx -t
sudo systemctl reload nginx
```

公网部署应配置域名和 TLS。客户端使用 HTTPS 地址时会自动改用 `wss://`。不要单独暴露 `/api/admin/`；远程管理优先使用 CLI 或 SSH 隧道。

## 更新

每次更新都生成新的干净发布包并上传到新的发行目录：

```bash
cd /opt/lune/releases/release-id
sudo -u lune npm ci --omit=dev
sudo -u lune /usr/local/bin/node dist/providers/interfaces/cli/provider-cli.js config validate --json
sudo ln -sfn /opt/lune/releases/release-id /opt/lune/current
sudo systemctl restart lune-server
curl --fail http://127.0.0.1:9527/api/health/ready
```

不要覆盖以下持久数据：

- `/etc/lune/lune.env`
- `/etc/lune/providers.json`
- `/var/lib/lune/provider-credentials.enc.json`
- `/var/lib/lune/rooms/`

如新进程无法启动，把 `current` 链接切回上一发行目录并重启服务。支持持久化的版本会恢复未过期房间；保留原 `JWT_SECRET` 才能继续使用原成员 token。重启不会重新获得完整的 24 小时保留期，异常退出恢复使用最后一次检查点。

首次从旧版内存模型升级，旧进程没有可恢复文件；应在无活跃房间时更新，或先完成明确的旧状态导出迁移。回滚到只支持内存房间的旧版本不会读取新房间文件，应保留数据目录供后续恢复。

## 备份

停止服务或确保文件未在写入时，备份：

```bash
sudo systemctl stop lune-server
sudo tar -czf /root/lune-secrets-backup.tar.gz /etc/lune /var/lib/lune
sudo systemctl start lune-server
```

备份包含可解密音乐账号凭据的密钥，应按高敏感数据管理。恢复时保持原属主和权限，再运行 `lune-provider doctor`。

## PM2 可选方案

不使用 systemd 时可在发布目录运行：

```bash
npm install --global pm2
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

执行 `pm2 startup` 输出的命令才能启用开机启动。`instances` 必须保持为 `1`，且不能同时运行 systemd 与 PM2。

## 故障检查

```bash
systemctl status lune-server
journalctl -u lune-server -n 200 --no-pager
sudo -u lune lune-provider config validate
sudo -u lune lune-provider status
sudo -u lune lune-provider doctor
```

- `live` 成功但 `ready` 返回 503：检查 Provider 登录态和上游连接。
- 无法解密凭据：确认 `LUNE_MASTER_KEY` 与创建凭据时完全一致。
- 配置校验失败：确认默认 Provider 已存在且启用，数值字段均为正整数。
- 客户端 HTTP 正常但 WebSocket 断开：检查 Nginx 的 Upgrade/Connection 请求头和 `/ws` 转发。
- 房间搜不到：检查休眠和过期删除日志、`LUNE_DATA_DIR/rooms/` 的权限及文件、实际保留配置；查询不会延长 24 小时离线期限。
- 服务重启无法恢复：确认数据目录路径与升级前一致，未覆盖 `JWT_SECRET`；检查启动日志中的房间恢复或文件损坏错误，不要删除损坏文件后直接重启来掩盖数据问题。
