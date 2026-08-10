# Lune Provider V1 操作手册

本手册对应网易云与酷狗 Provider 第一版账号自动化实现。详细架构见 `PROVIDER_SYSTEM_V1_PLAN.md`。

## 1. 当前实现范围

- 网易云、酷狗统一插件注册和能力描述。
- 二维码登录会话、后台自动轮询和登录状态统一映射。
- Cookie/Token 自动采集、AES-256-GCM 加密保存和热加载。
- 网易云登录状态验证、酷狗 Token 验证与定时刷新。
- 旧 `MUSIC_COOKIE`、`KUGOU_COOKIE` 自动迁移。
- Provider 配置文件校验、启停修改、CLI 和受保护管理 API。
- 存活、就绪检查和 Provider 脱敏状态查询。

## 2. 初始化

在 `server` 目录运行：

```bash
npm run provider -- init
```

命令会创建：

- `config/providers.json`：非敏感 Provider 配置；已存在时不覆盖。
- `data/`：加密凭据目录。
- `.env.provider.generated`：一次性生成的主密钥、管理 Token 和 JWT 密钥。

将 `.env.provider.generated` 中的变量安全写入 `server/.env` 或部署平台 Secret，随后删除生成文件。不得把真实密钥提交到 Git。

最小环境变量：

```dotenv
PORT=9527
LUNE_CONFIG_FILE=./config/providers.json
LUNE_DATA_DIR=./data
LUNE_MASTER_KEY=<32 字节 Base64 或 64 位 hex>
LUNE_ADMIN_TOKEN=<高强度随机 Token>
JWT_SECRET=<高强度随机 Token>
```

配置校验：

```bash
npm run provider -- config validate
```

## 3. 二维码登录

```bash
npm run provider -- login netease
npm run provider -- login kugou
```

CLI 输出登录 URL、会话 ID 和过期时间，并等待服务端后台轮询结束。使用对应音乐 App 完成扫码和确认。成功后凭据自动加密写入：

```text
<LUNE_DATA_DIR>/provider-credentials.enc.json
```

无需人工复制 Cookie，也无需重启服务。

常用命令：

```bash
npm run provider -- status
npm run provider -- validate netease
npm run provider -- refresh kugou
npm run provider -- logout kugou
npm run provider -- doctor
```

自动化脚本可追加 `--json` 获取结构化输出。

## 4. Provider 配置

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

修改启停状态：

```bash
npm run provider -- config set-enabled kugou false
```

不能直接禁用 `defaultProvider`。修改配置后重启服务使 Provider 激活集合生效。

## 5. 管理 API

所有管理请求都必须使用：

```http
Authorization: Bearer <LUNE_ADMIN_TOKEN>
```

主要路由：

| 方法与路由 | 说明 |
|---|---|
| `GET /api/admin/providers` | 全部 Provider、账号摘要和运行状态 |
| `POST /api/admin/providers/:id/login` | 发起二维码登录 |
| `GET /api/admin/providers/:id/login/:sessionId` | 查询登录状态 |
| `DELETE /api/admin/providers/:id/login/:sessionId` | 取消登录 |
| `POST /api/admin/providers/:id/validate` | 校验登录态 |
| `POST /api/admin/providers/:id/refresh` | 刷新登录态 |
| `POST /api/admin/providers/:id/logout` | 退出并删除本地凭据 |
| `PATCH /api/admin/providers/:id/config` | 修改启停状态，返回是否需要重启 |

二维码创建和状态响应使用 `Cache-Control: no-store`。当前仍建议只通过 CLI、回环地址或 SSH 隧道调用管理 API。

## 6. 健康检查

```text
GET /api/health       兼容旧健康检查
GET /api/health/live  进程存活
GET /api/health/ready 至少一个 Provider 为 ready
```

登录凭据缺失时进程仍可启动，对应 Provider 状态为 `auth-required`。所有 Provider 均不可用时，就绪检查返回 503。

## 7. 旧环境变量迁移

如果仍配置了：

```dotenv
MUSIC_COOKIE=...
KUGOU_COOKIE=...
```

且加密凭据库中没有对应记录，服务启动时会自动解析并迁移。只有配置了 `LUNE_MASTER_KEY` 才会持久化；迁移成功后应从 `.env` 删除旧 Cookie。

## 8. 构建与部署制品

本地构建：

```bash
npm --prefix server run build
```

检查部署打包目标：

```bash
npm --prefix server run deploy:pack -- --dry-run
```

生成部署制品：

```bash
npm --prefix server run deploy:pack
```

脚本将新 `dist` 复制到 `server-deploy/dist`；已有 `dist` 会先重命名为带时间戳的备份，并生成 `server-deploy/RELEASE.json`。

当前 pnpm 的供应链发布时间检查可能无法验证固定 GitHub tarball 形式的酷狗依赖。遇到 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 时，不要删除锁文件；可使用 `npm --prefix server run ...` 或已安装的本地工具执行构建。

## 9. 安全注意事项

- 不记录或返回 Cookie、Token、二维码 key 和主密钥。
- 不将管理 API 暴露到无访问控制的公网。
- `LUNE_MASTER_KEY` 丢失后无法解密现有凭据文件，必须重新扫码登录。
- 修改主密钥前先完成凭据重新加密；不能直接替换环境变量。
- 备份 `data/` 时必须按敏感数据处理。
- 二维码登录不绕过平台验证码、设备风控、会员或地区限制。
