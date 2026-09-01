# Provider 配置与开发

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

## 公共 API

未提供 `provider` 查询参数时使用默认 Provider；显式指定的 Provider 也必须处于启用状态。

| 路由 | 查询参数 | 返回 |
|---|---|---|
| `GET /api/providers` | 无 | Provider 描述、状态和默认项 |
| `GET /api/providers/search` | `kw`、`limit?`、`provider?` | `{ songs }` |
| `GET /api/providers/resolve` | `id`、`provider?` | 音轨、播放 URL 与不可播放标记 |
| `GET /api/providers/lyric` | `id`、`provider?` | `{ lines }` |
| `GET /api/providers/playlist-search` | `kw`、`limit?`、`provider?` | `{ playlists }` |
| `GET /api/providers/playlist` | `id`、`provider?` | 音轨数组 |

歌曲时长和播放位置使用毫秒，歌词行时间使用秒。`Track.provider` 必须随音轨进入队列，确保解析地址和歌词时仍使用原音乐源。`Track.id` 对业务层是不透明值，不应解析或跨 Provider 复用。

## 管理 API

管理路由位于 `/api/admin/providers`，请求头必须包含：

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

生产环境不要把管理接口直接暴露到公网。仓库的 Nginx 模板仅允许本机访问该路径。

## 新增 Provider

1. 在 `server/src/providers/<id>/` 实现 `MusicProvider`。基础接口定义在 `apps/shared/src/index.ts`。
2. 如果需要账号，实现 `ProviderAuthDriver`。领域类型定义在 `server/src/providers/domain/provider-domain.ts`。
3. 在 `ProvidersModule` 中加入实现和依赖，并在组合根中注册 `ProviderPlugin`：

   ```ts
   registry.register({
     descriptor: {
       id: 'example',
       displayName: 'Example Music',
       capabilities: ['search', 'resolve', 'lyric'],
       requiresAccount: true,
     },
     catalog: exampleProvider,
     auth: exampleAuth,
   });
   ```

4. 在 `config/providers.json` 增加同名配置。Provider ID 只能使用小写字母、数字和连字符，并以字母开头。
5. 为字段转换、不可播放情况、登录状态映射、凭据校验和上游错误添加测试。

核心约定：

- `resolve` 无法取得可播放 URL 时返回 `url: null` 和 `unplayable: true`。
- 可选能力未实现时，歌单接口返回空结果。
- Provider 领域与应用层不直接依赖具体第三方 SDK；SDK 调用留在各 Provider 适配实现内。
- Cookie、Token 和登录 URL 不写入普通业务日志。
- 上游 API 不具备稳定 SLA，必须把超时、认证失败和不可播放作为正常运行分支处理。
