# 音乐源 Provider 插件开发指南

Lune 的音乐源以插件方式接入。默认提供网易云（`netease`）provider，由 `NeteaseCloudMusicApi` 这个 node 库实现。本文说明如何实现并注册自定义 provider。

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

客户端无需知道源细节，统一通过以下路由访问（默认使用激活列表第一个 provider，可用 `?provider=<id>` 指定）：

| 路由 | 说明 |
|---|---|
| `GET /api/providers` | 列出已激活 provider id |
| `GET /api/providers/search?kw=<keyword>&limit=<n>&provider=<id>` | 搜索 |
| `GET /api/providers/resolve?id=<songId>&provider=<id>` | 解析为可播 URL |
| `GET /api/providers/lyric?id=<songId>&provider=<id>` | 歌词 |
| `GET /api/providers/playlist?id=<playlistId>&provider=<id>` | 歌单导入(provider 未实现该能力时返回空数组) |

## 网易云 VIP/登录态

网易云 provider 通过 `server/.env` 的 `MUSIC_COOKIE` 注入，值即浏览器登录后的 `MUSIC_U=...` cookie 字符串。生产移植到服务器时务必设置此项。此文件不提交 git。