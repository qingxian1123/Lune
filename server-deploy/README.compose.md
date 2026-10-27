# Docker Compose 部署

此目录提供 Linux 云服务器单实例部署。正式发布附件包含 `image.ref`，记录固定版本和摘要；部署机不需要克隆源码或安装 Node.js。使用 `sudo ./bin/lune install --domain music.example.com` 或 `sudo ./bin/lune install --proxy-url https://music.example.com` 安装，备份与升级命令由同一部署包提供。

## 准备

需要 Linux amd64、Docker Engine、Docker Compose v2。公网域名模式还需域名 DNS 指向服务器，并允许外部访问 TCP 80/443 及 UDP 443。已有反向代理模式无需 Caddy，也无需占用 80/443。

从项目正式发布页下载同一版本的 `lune-server-vX.Y.Z-linux-amd64.tar.gz` 和 `SHA256SUMS`，先在下载目录执行 `sha256sum -c SHA256SUMS`，再运行 `tar -xzf lune-server-vX.Y.Z-linux-amd64.tar.gz` 并进入解压后的 `lune-server/`。示例文件名中的版本需替换为实际发布版本。首次安装要求发布附件已可用、镜像可拉取；当前仓库中的配置文件本身不是已发布镜像。

部署状态保存在 `runtime/`：`config/providers.json`、`data/`、`caddy-data/` 和 `caddy-config/`。`data/` 中有管理员账号、加密凭据、房间和热榜。`.env` 含原始主密钥、管理 Token 和 JWT 密钥；备份必须同时保留完整 `runtime/` 和 `.env`。运行容器使用 UID/GID 10001，脚本应确保配置与数据目录对该用户可写。不要将 `runtime/` 或 `.env` 提交到 Git。

## 两种接入方式

公网域名：运行 `sudo ./bin/lune install --domain music.example.com`。脚本生成 `.env`，启动 Caddy，后者自动申请证书并只代理 `/api/*` 与 `/ws` 到业务端口。管理路径在公网返回 404。

已有宿主 Nginx：运行 `sudo ./bin/lune install --proxy-url https://music.example.com`，并将 [`nginx/lune-compose.conf`](nginx/lune-compose.conf) 放入已有 HTTPS server 块。业务端口仅绑定 `127.0.0.1:9527`；代理配置明确拒绝管理路径。若网关也运行在容器内，接入 Compose 网络并转发至 `lune:9527`，同样要加入管理路径拒绝规则。

管理入口只绑定宿主 `127.0.0.1:9528`。远程管理员使用 SSH 隧道，例如 `ssh -N -L 9528:127.0.0.1:9528 user@server`，然后在本机打开 `http://127.0.0.1:9528/api/admin/ui`。首次设置或忘记密码时使用一次性配对码；创建账号后直接使用账号密码登录。不要将 9527 或 9528 转发到公网。

在服务器执行 `sudo ./bin/lune manage` 获取一次性配对码；在浏览器展开「首次设置 / 忘记密码」，配对后进入「管理员」设置账号和密码，保存后重新登录。在「音乐源」扫码连接至少一个音源并检测单曲；服务器地址直接在客户端填写。详细步骤见 [ADMIN.md](ADMIN.md)。密钥和管理 Token 保留在服务器，朋友只需要完整服务地址。重复运行 `install` 会复用现有密钥和数据；已有数据但缺少 `.env` 时会停止，以便恢复原密钥。

健康检查用 `GET /api/health/live` 判断进程存活；`GET /api/health/ready` 在尚未登录音乐源时返回 503，这是待配置状态。Compose healthcheck 只检查 `live`。完整验收还要在外部网络用客户端验证 HTTP、WebSocket 和实际播放。

## 维护命令

所有命令在部署包根目录运行。脚本需要 root 权限读取受限密钥与数据，因此使用 `sudo ./bin/lune`。

| 命令 | 行为 |
| --- | --- |
| `status` | 显示容器、进程与音乐源状态及客户端服务地址 |
| `doctor` | 校验 Compose 配置并检查本机服务状态 |
| `manage` | 生成 10 分钟有效的一次性配对码 |
| `backup` | 停止单实例写入，归档 `.env` 与完整 `runtime/`，随后恢复原运行状态 |
| `upgrade <新发布包的 image.ref 或镜像引用>` | 拉取带摘要的镜像、验证数据格式标签、先备份再串行替换；启动失败时回切旧镜像 |
| `rollback` | 备份后切回记录中的前一个镜像，需数据格式兼容 |
| `restore <备份.tar.gz>` | 校验同目录的 `.sha256` 文件，停止服务，恢复密钥与数据；原数据留在旁边以备人工处理 |

`backup` 生成的归档包含能解密音乐账号凭据的主密钥，权限仅限管理员；离机保存前应加密。升级后要再次查看音乐源状态，并从外部 Windows／Android 客户端检查一次真实播放。服务端仅支持同一数据目录一个实例，更新时不要另开第二套容器。`upgrade` 与 `rollback` 只接受镜像声明的数据和 Provider 配置格式均为 1；出现不可兼容的迁移时，需要对应版本的明确迁移流程，不能直接切换。

从旧 systemd 部署迁移时，先停止并禁用旧服务，备份 `/etc/lune` 和整个 `/var/lib/lune`。把原 `providers.json` 放入 `runtime/config/`，把原数据目录内容放入 `runtime/data/`，并将原 `LUNE_MASTER_KEY`、`LUNE_ADMIN_TOKEN`、`JWT_SECRET` 写入部署包 `.env` 的相应字段，同时补齐 `LUNE_MODE`、`LUNE_IMAGE`、`LUNE_PUBLIC_URL` 等 Compose 字段。然后设置目录属主为 10001、启动新服务并完成外部验收。迁移期间不能让旧服务与容器同时写入同一数据目录；旧密钥丢失时不要重新初始化来覆盖现有凭据。

## 构建与发布约束

`Dockerfile` 使用根目录 `.dockerignore` 白名单，仅复制源码、构建配置和锁文件。镜像不内置 Provider 配置、密钥或数据。发布工作流只构建 `linux/amd64`；包内 `image.ref` 以镜像摘要锁定运行镜像。首次公开 GHCR 包时，需要在 GitHub 将包访问级别设为公开，或给部署机配置相应读取凭据。

Node.js + systemd 交付路径见仓库中的 [服务端部署与运维](https://github.com/qingxian1123/Lune/blob/main/docs/DEPLOYMENT.md)。
