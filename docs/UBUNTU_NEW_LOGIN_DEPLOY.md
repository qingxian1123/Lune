# Ubuntu 全新登录模式部署与持久化运行指南

本指南用于把 Lune 服务端部署到全新的 Ubuntu 服务器，重点验证网易云与酷狗二维码登录、加密凭据持久化和服务器重启恢复。

部署包采用白名单生成，**不会包含本地 `.env`、旧账号 Cookie、旧 Token、`data/`、凭据文件、日志或历史压缩包**。

## 1. 部署约定

本文使用以下路径：

```text
/opt/lune/releases/<release-id>/  不可变版本目录
/opt/lune/current                 当前版本符号链接
/etc/lune/providers.json          Provider 非敏感配置
/etc/lune/lune.env                新生成的服务密钥
/var/lib/lune/                    新账号加密凭据
```

运行方式：

- Ubuntu systemd
- 单 Node.js 进程
- `HOST=127.0.0.1`，由 Nginx 提供公网 HTTP/WebSocket
- 管理 API 不对公网开放
- 房间仍为内存态，必须保持单实例

## 2. 本地生成无历史登录态的干净发布包

在 Windows 项目根目录运行：

```powershell
npm run deploy:server:clean
```

输出目录：

```text
server-release-clean/
├─ dist/
├─ config/providers.json
├─ systemd/
├─ bin/lune-provider
├─ nginx/lune.conf
├─ ecosystem.config.cjs
├─ .env.new-login.example
├─ package.json
├─ package-lock.json
├─ RELEASE.json
└─ README.md
```

本地安全检查：

```powershell
Test-Path .\server-release-clean\.env
Test-Path .\server-release-clean\data
Get-ChildItem .\server-release-clean -Recurse -Force -Filter provider-credentials.enc.json
```

预期：前两个命令都是 `False`，第三个命令没有输出。

不要上传现有 `server-deploy/.env`，也不要直接上传整个 `server-deploy` 目录。

上传干净包：

```powershell
scp -r .\server-release-clean ubuntu@<SERVER_IP>:/tmp/lune-release
```

## 3. Ubuntu 基础环境

以下命令在服务器执行：

```bash
sudo apt update
sudo apt install -y ca-certificates curl xz-utils openssl nginx
```

项目使用 Node.js 24 LTS。[Node.js 官方发布周期](https://nodejs.org/en/about/previous-releases)将 v24 标记为 LTS；本文固定使用经过本项目验证的 24.18.1：

```bash
NODE_VERSION=v24.18.1
case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 ;;
  aarch64|arm64) NODE_ARCH=arm64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

cd /tmp
curl -fSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
curl -fSLO "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
grep " node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz$" SHASUMS256.txt | sha256sum --check
sudo tar -xJf "node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /usr/local --strip-components=1
hash -r
node --version
npm --version
```

预期 Node 输出 `v24.18.1`。如果服务器已经使用 `/usr/local/bin/node` 安装兼容的 Node 24 LTS，可以跳过安装部分。

## 4. 创建服务用户和版本目录

```bash
id lune >/dev/null 2>&1 || \
  sudo useradd --system --home-dir /var/lib/lune --shell /usr/sbin/nologin lune

sudo install -d -o root -g lune -m 0750 /opt/lune
sudo install -d -o root -g lune -m 0750 /opt/lune/releases
sudo install -d -o root -g lune -m 0750 /etc/lune
sudo install -d -o lune -g lune -m 0700 /var/lib/lune

RELEASE_ID="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="/opt/lune/releases/${RELEASE_ID}"
sudo install -d -o lune -g lune -m 0750 "$RELEASE_DIR"
sudo cp -a /tmp/lune-release/. "$RELEASE_DIR/"
sudo chown -R lune:lune "$RELEASE_DIR"
```

确认服务器收到的是干净包：

```bash
test ! -e "$RELEASE_DIR/.env"
test ! -d "$RELEASE_DIR/data"
test -z "$(find "$RELEASE_DIR" -name 'provider-credentials.enc.json' -print -quit)"
echo "clean release verified"
```

## 5. 安装生产依赖

```bash
cd "$RELEASE_DIR"
sudo -u lune npm ci --omit=dev
sudo chmod 0750 bin/lune-provider
```

安装完成后，将发布目录改为服务只读：

```bash
sudo chown -R root:lune "$RELEASE_DIR"
sudo chmod -R g-w,o-rwx "$RELEASE_DIR"
sudo find "$RELEASE_DIR" -type d -exec chmod 0750 {} \;
sudo chmod 0750 "$RELEASE_DIR/bin/lune-provider"
sudo ln -sfn "$RELEASE_DIR" /opt/lune/current
```

`node_modules` 只需要读取权限；运行时唯一可写目录是 `/var/lib/lune`。

## 6. 创建全新的配置和密钥

复制非敏感配置：

```bash
sudo install -o root -g lune -m 0640 \
  /opt/lune/current/config/providers.json /etc/lune/providers.json
```

在服务器上生成全新密钥，不使用本地任何旧 `.env`：

```bash
umask 077
TEMP_ENV="$(mktemp)"
MASTER_KEY="$(openssl rand -base64 32 | tr -d '\n')"
ADMIN_TOKEN="$(openssl rand -hex 32)"
JWT_SECRET_VALUE="$(openssl rand -hex 48)"

cat >"$TEMP_ENV" <<EOF
PORT=9527
HOST=127.0.0.1
NODE_OPTIONS=--dns-result-order=ipv4first
LUNE_CONFIG_FILE=/etc/lune/providers.json
LUNE_DATA_DIR=/var/lib/lune
LUNE_MASTER_KEY=${MASTER_KEY}
LUNE_ADMIN_TOKEN=${ADMIN_TOKEN}
JWT_SECRET=${JWT_SECRET_VALUE}
EOF

sudo install -o root -g lune -m 0640 "$TEMP_ENV" /etc/lune/lune.env
shred --remove "$TEMP_ENV"
unset MASTER_KEY ADMIN_TOKEN JWT_SECRET_VALUE TEMP_ENV
```

确认只包含新模式所需字段：

```bash
sudo cut -d= -f1 /etc/lune/lune.env
sudo stat -c '%U %G %a %n' /etc/lune/lune.env /etc/lune/providers.json /var/lib/lune
```

预期权限：

```text
root lune 640 /etc/lune/lune.env
root lune 640 /etc/lune/providers.json
lune lune 700 /var/lib/lune
```

## 7. 安装 Provider 操作命令

```bash
sudo ln -sfn /opt/lune/current/bin/lune-provider /usr/local/sbin/lune-provider
sudo -u lune /usr/local/sbin/lune-provider config validate --json
```

预期 `ok: true`，并显示 `/etc/lune/providers.json`。

## 8. 全新二维码登录

此时不要启动 systemd 服务，先完成两个账号登录，避免 CLI 与后台刷新任务同时写凭据文件。

### 8.1 网易云

```bash
sudo -u lune /usr/local/sbin/lune-provider login netease
```

终端会显示：

- `sessionId`
- `qrUrl`
- `expiresAt`
- 当前状态

打开 `qrUrl`，使用网易云音乐 App 扫码并确认。最终必须看到：

```text
"state": "authorized"
```

二维码过期时重新执行命令即可。

### 8.2 酷狗

```bash
sudo -u lune /usr/local/sbin/lune-provider login kugou
```

使用酷狗音乐 App 完成扫码确认，同样等待：

```text
"state": "authorized"
```

### 8.3 登录结果检查

```bash
sudo -u lune /usr/local/sbin/lune-provider doctor --json
sudo stat -c '%U %G %a %s %n' /var/lib/lune/provider-credentials.enc.json
```

预期：

- `doctor.ok` 为 `true`。
- 两个 Provider 状态为 `ready`。
- 凭据文件属于 `lune:lune`，普通用户不可读。
- 不需要创建或复制任何旧登录态环境变量。

不要输出或复制凭据文件内容。该文件虽然已加密，仍应按敏感数据处理。

## 9. 安装 systemd 持久化服务

```bash
sudo install -o root -g root -m 0644 \
  /opt/lune/current/systemd/lune-server.service \
  /etc/systemd/system/lune-server.service

sudo systemd-analyze verify /etc/systemd/system/lune-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now lune-server
```

检查进程、启动日志和健康状态：

```bash
sudo systemctl status lune-server --no-pager
sudo journalctl -u lune-server -n 100 --no-pager
curl --fail http://127.0.0.1:9527/api/health/live
curl --fail http://127.0.0.1:9527/api/health/ready
curl --silent http://127.0.0.1:9527/api/providers
```

systemd 已配置：

- 开机自动启动
- 异常退出 5 秒后重启
- 60 秒内最多快速失败 5 次
- SIGTERM 优雅停止，最长等待 20 秒
- 单实例运行
- 仅 `/var/lib/lune` 可写
- 基础 systemd 沙箱

## 10. Nginx 公共访问与 WebSocket

安装配置：

```bash
sudo install -o root -g root -m 0644 \
  /opt/lune/current/nginx/lune.conf /etc/nginx/conf.d/lune.conf

if [ -L /etc/nginx/sites-enabled/default ]; then
  sudo unlink /etc/nginx/sites-enabled/default
fi

sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

防火墙：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

不要对公网开放 9527。Nginx 只代理公共接口和 WebSocket，并拒绝外网访问 `/api/admin/`。

公网验证：

```bash
curl --fail http://<SERVER_IP>/api/health/live
curl --fail http://<SERVER_IP>/api/health/ready
```

客户端服务地址设置为：

```text
http://<SERVER_IP>
```

有域名时应继续配置 HTTPS，并把客户端地址改为 `https://<DOMAIN>`。

## 11. 验证登录态跨重启持久化

记录凭据文件信息：

```bash
sudo stat -c '%i %s %y %n' /var/lib/lune/provider-credentials.enc.json
```

重启服务：

```bash
sudo systemctl restart lune-server
sleep 5
curl --fail http://127.0.0.1:9527/api/health/ready
sudo -u lune /usr/local/sbin/lune-provider doctor --json
```

再验证两个 Provider 的业务接口：

```bash
curl --get --fail 'http://127.0.0.1:9527/api/providers/search' \
  --data-urlencode 'kw=周杰伦' \
  --data-urlencode 'limit=3' \
  --data-urlencode 'provider=netease'

curl --get --fail 'http://127.0.0.1:9527/api/providers/search' \
  --data-urlencode 'kw=周杰伦' \
  --data-urlencode 'limit=3' \
  --data-urlencode 'provider=kugou'
```

重启后无需重新扫码、两个搜索均能返回正常业务响应，即证明新登录态已持久化。

最后验证开机自启：

```bash
systemctl is-enabled lune-server
systemctl is-active lune-server
```

## 12. 日常运维

```bash
sudo systemctl restart lune-server
sudo systemctl stop lune-server
sudo systemctl start lune-server
sudo journalctl -u lune-server -f
sudo journalctl -u lune-server --since '1 hour ago'
```

登录状态失效时，不要反复重启服务。重新登录：

```bash
sudo systemctl stop lune-server
sudo -u lune /usr/local/sbin/lune-provider login netease
sudo -u lune /usr/local/sbin/lune-provider login kugou
sudo systemctl start lune-server
```

## 13. 备份与恢复

需要备份：

```text
/var/lib/lune/provider-credentials.enc.json
/etc/lune/providers.json
/etc/lune/lune.env
```

凭据文件必须配合原 `LUNE_MASTER_KEY` 才能解密。建议密钥和凭据备份分别放在两个受控位置。

恢复时：

1. 停止服务。
2. 恢复三项文件及其所有者和权限。
3. 运行 `lune-provider config validate`。
4. 启动服务并检查 `health/ready`。

## 14. 版本升级和回滚

每次升级都重新生成干净发布包并上传到新的 release 目录，不覆盖 `/var/lib/lune` 和 `/etc/lune`。

切换版本：

```bash
sudo systemctl stop lune-server
sudo ln -sfn /opt/lune/releases/<NEW_RELEASE_ID> /opt/lune/current
sudo systemctl start lune-server
curl --fail http://127.0.0.1:9527/api/health/ready
```

回滚：

```bash
sudo systemctl stop lune-server
sudo ln -sfn /opt/lune/releases/<PREVIOUS_RELEASE_ID> /opt/lune/current
sudo systemctl start lune-server
```

## 15. 常见问题

### `health/live` 成功但 `health/ready` 返回 503

进程正常，但没有可用 Provider。执行：

```bash
sudo -u lune /usr/local/sbin/lune-provider doctor --json
```

若状态为 `auth-required`，重新扫码。

### 无法解密凭据文件

`LUNE_MASTER_KEY` 与生成该文件时的密钥不一致。不要覆盖原文件；恢复正确密钥或移走旧凭据文件后重新扫码。

### 二维码一直等待或过期

检查服务器能否访问网易云和酷狗上游 HTTPS 服务，然后重新执行登录命令。二维码会话不会跨进程重启恢复。

### systemd 报 Node 路径不存在

本文 unit 使用 `/usr/local/bin/node`。确认：

```bash
command -v node
```

如果实际路径不同，同时修改 unit 的 `ExecStartPre`、`ExecStart` 和 `bin/lune-provider`。

### 服务重启后房间消失

这是当前版本的预期行为。Provider 登录态已经持久化，但房间、队列和播放状态仍是内存数据。
