# 音乐源 Provider 插件开发指南

Lune 的音乐源以插件方式接入。当前提供网易云（`netease`）与酷狗（`kugou`）provider。两者都作为 Node.js 依赖在 Lune 服务端进程内运行：网易云使用 `NeteaseCloudMusicApi`，酷狗使用固定版本的 `MakcRe/KuGouMusicApi`。

## 接口约定

所有 provider 实现 `@lune/shared` 中的 `MusicProvider` 接口：

```ts
export interface MusicProvider {
  readonly id: string;                    // 唯一标识,用于 MUSIC_PROVIDERS env
  search(keyword: string, limit?: number): Promise<ProviderSearchResult>;
  resolve(songId: string): Promise<ProviderResolveResult>;
  lyric(songId: string): Promise<ProviderLyricResult>;
  playlist?(playlistId: string): Promise<Track[]>;  // 可选
}
```

返回类型（`Track` / `ProviderSearchResult` / `ProviderResolveResult` / `ProviderLyricResult`）均定义在 `@lune/shared`。

约定：

- **时间单位统一为毫秒**（`Track.duration`、`PlaybackState.position`）。歌词行 `LyricLine.time` 用秒（小数）。
- `resolve` 取不到 URL 时返回 `url: null` 且 `unplayable: true`，前端会据此跳下一首。
- `id` 必须与 `MUSIC_PROVIDERS` env 中的字符串一致。

## 实现一个新 Provider

1. 在 `server/src/providers/<your-id>/` 下新建一个 `*.provider.ts`，导出 `@Injectable()` 类实现 `MusicProvider`。
2. 在 `server/src/providers/providers.module.ts` 的 `providers` 数组里加入你的类。
3. 在 `PROVIDER_BOOTSTRAP` 工厂中调用 `registry.register(yourProvider)`。
4. 在 `server/.env` 的 `MUSIC_PROVIDERS` 逗号列表里加上你的 `id`（顺序即优先级，第一个为默认 provider）。

例如新增 QQ 音乐源：

```ts
// server/src/providers/qq/qq.provider.ts
@Injectable()
export class QqProvider implements MusicProvider {
  readonly id = 'qq';
  async search(keyword: string, limit = 20) { /* ... */ }
  async resolve(songId: string) { /* ... */ }
  async lyric(songId: string) { /* ... */ }
}
```

```ts
// providers.module.ts
providers: [
  ProviderRegistry,
  NeteaseProvider,
  QqProvider,
  { provide: 'PROVIDER_BOOTSTRAP', inject: [ProviderRegistry, NeteaseProvider, QqProvider, ConfigService],
    useFactory: (reg, netease, qq, cfg) => {
      reg.register(netease);
      reg.register(qq);
      reg.setActive((cfg.get<string>('MUSIC_PROVIDERS') || 'netease').split(',').map(s => s.trim()).filter(Boolean));
      return reg;
    } },
],
```

```
# server/.env
MUSIC_PROVIDERS=netease,qq
```

## HTTP API

客户端统一通过以下路由访问。默认使用激活列表第一个 provider，也可用 `?provider=<id>` 指定；显式指定的 provider 仍必须出现在 `MUSIC_PROVIDERS` 中：

| 路由 | 说明 |
|---|---|
| `GET /api/providers` | 列出已激活 provider id |
| `GET /api/providers/search?kw=<keyword>&limit=<n>&provider=<id>` | 搜索 |
| `GET /api/providers/resolve?id=<songId>&provider=<id>` | 解析为可播 URL |
| `GET /api/providers/lyric?id=<songId>&provider=<id>` | 歌词 |
| `GET /api/providers/playlist?id=<playlistId>&provider=<id>` | 歌单导入(provider 未实现该能力时返回空数组) |

## 网易云 VIP/登录态

新版本通过 Provider CLI 或受保护管理 API 发起网易云二维码登录，服务端自动轮询授权状态、校验账号并把 Cookie 加密保存到 `LUNE_DATA_DIR`。推荐执行：

```bash
npm run provider -- login netease
```

`MUSIC_COOKIE` 仅作为旧部署兼容迁移入口：加密凭据库没有网易云记录时，启动过程会自动解析并迁移；迁移成功后应从 `.env` 删除旧 Cookie。

## 酷狗第三方 API

酷狗 provider 对接 [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)，不复制酷狗签名逻辑，也不需要另外启动该项目的 HTTP 服务。依赖固定到 `v1.5.1`，由 Lune 服务端直接调用其 `main.js` 导出的程序化 API。

```bash
npm run provider -- login kugou
```

默认源和启用状态由 `config/providers.json` 管理；没有该文件时才回退到 `MUSIC_PROVIDERS`，其中第一个值为默认源。前端会读取已激活列表并显示音乐源选择器。

上游搜索通常要求酷狗认证信息，否则可能返回 `error_code: 152`。Lune 从加密凭据库读取结构化 Cookie，并支持通过 `login_token` 定时校验和刷新；`KUGOU_COOKIE` 只保留为旧部署迁移入口。登录态不会放入 URL。播放 URL 受会员、版权和地区限制，不可播放时 provider 返回 `unplayable: true`。

酷狗的歌曲 hash、专辑 ID、音频 ID及歌曲时长会编码到不透明的 `Track.id`；业务代码不应解析该 ID。`Track.provider` 会随队列和房间播放状态同步，确保酷狗歌曲始终由酷狗解析播放地址与歌词。旧房间数据没有 `provider` 时仍回落到默认源。
