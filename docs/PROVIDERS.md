# 音乐源配置与管理

Lune 通过服务端进程内 Provider 接入音乐平台。当前注册 `netease` 和 `kugou`，两者都支持歌曲搜索、播放地址解析、歌词、歌单搜索和歌单导入，并通过二维码完成账号登录。

## 配置

默认配置位于 `server/config/providers.json`：

```json
{
  "schemaVersion": 1,
  "defaultProvider": "netease",
  "providers": {
    "netease": {
      "enabled": true,
      "requestTimeoutMs": 10000,
      "healthCheckIntervalMs": 1800000
    },
    "kugou": {
      "enabled": true,
      "requestTimeoutMs": 10000,
      "healthCheckIntervalMs": 1800000,
      "refreshIntervalMs": 21600000
    }
  },
  "routing": {
    "failureThreshold": 3,
    "circuitOpenMs": 30000
  }
}
```

`defaultProvider` 必须存在且已启用。配置路径由 `LUNE_CONFIG_FILE` 指定。

## 初始化与登录

在仓库中执行：

```bash
pnpm --filter @lune/server provider init
```

命令创建 `config/`、`data/`、`logs/`，并生成 `.env.provider.generated`。将其中变量写入 `server/.env`，保存好密钥后删除生成文件。随后登录和检查：

```bash
pnpm --filter @lune/server provider login netease
pnpm --filter @lune/server provider login kugou
pnpm --filter @lune/server provider status
pnpm --filter @lune/server provider doctor
```

部署包内使用 `npm run provider -- <command>`；安装 `server-deploy/bin/lune-provider` 后也可直接使用 `lune-provider <command>`。

## CLI

| 命令 | 作用 |
|---|---|
| `provider init` | 创建目录、默认配置和随机密钥 |
| `provider status [id]` | 查看账号与运行状态 |
| `provider login <id>` | 发起二维码登录并等待结果 |
| `provider validate <id>` | 立即校验凭据 |
| `provider refresh <id>` | 刷新支持刷新的凭据 |
| `provider logout <id>` | 删除本地凭据并退出账号 |
| `provider config validate` | 校验配置文件 |
| `provider config set-enabled <id> <true\|false>` | 修改启用状态；重启后生效 |
| `provider doctor` | 检查配置、凭据目录和上游可用性 |

所有读取类命令都支持 `--json`。登录凭据写入 `LUNE_DATA_DIR/provider-credentials.enc.json`，文件内容由 `LUNE_MASTER_KEY` 使用 AES-256-GCM 加密。

## 运行状态

Provider 状态可能为：

- `disabled`：配置中未启用
- `starting`：正在启动或检查
- `ready`：可以处理业务请求
- `degraded`：部分能力异常
- `auth-required`：需要重新登录
- `unavailable`：当前不可用

`GET /api/health/live` 只表示进程存活。`GET /api/health/ready` 要求至少一个启用的 Provider 处于 `ready`。

## 管理 API

管理路由只在本机管理端口 `http://127.0.0.1:9528/api/admin/` 提供。CLI 或直接调用管理 API 可使用以下请求头：

```http
Authorization: Bearer <LUNE_ADMIN_TOKEN>
```

| 方法与路由 | 作用 |
|---|---|
| `GET /api/admin/providers` | 查看全部 Provider、状态和账号摘要 |
| `POST /api/admin/providers/:id/login` | 创建登录会话 |
| `GET /api/admin/providers/:id/login/:sessionId` | 查询登录状态 |
| `DELETE /api/admin/providers/:id/login/:sessionId` | 取消登录 |
| `POST /api/admin/providers/:id/validate` | 校验凭据 |
| `POST /api/admin/providers/:id/refresh` | 刷新凭据 |
| `POST /api/admin/providers/:id/logout` | 退出并删除凭据 |
| `PATCH /api/admin/providers/:id/config` | 设置 `{ "enabled": boolean }`；重启后生效 |

生产环境不要把管理端口直接暴露到公网。仓库的 Nginx 模板不转发 `/api/admin/`，远程管理使用 SSH 隧道或 Provider CLI。
