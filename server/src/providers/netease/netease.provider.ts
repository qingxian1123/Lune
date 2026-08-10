import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import NeteaseCloudMusicApi from 'NeteaseCloudMusicApi';
import type {
  LyricLine,
  MusicProvider,
  ProviderLyricResult,
  ProviderPlaylistSearchResult,
  ProviderResolveResult,
  ProviderSearchResult,
  Track,
} from '@lune/shared';
import { EncryptedCredentialStore } from '../infrastructure/credentials/encrypted-credential.store';

const { cloudsearch, song_url_v1, song_detail, playlist_detail, lyric } = NeteaseCloudMusicApi;

/** 取流时从高到低尝试的音质等级 */
const RESOLVE_LEVELS = ['exhigh', 'higher', 'standard'] as const;

/**
 * 网易云音乐 Provider。
 *
 * - VIP/登录态通过 `MUSIC_COOKIE` env 注入(沿用 V1 约定,即 `MUSIC_U=...` cookie)
 * - 所有网易云 API 调用都用 `withCookie` 包装
 * - 时间统一毫秒(V1 用秒,P2 改为毫秒以匹配 apps/shared 的 Track.duration/position)
 */
@Injectable()
export class NeteaseProvider implements MusicProvider {
  readonly id = 'netease';
  private readonly logger = new Logger(NeteaseProvider.name);

  constructor(
    @Optional()
    @Inject(EncryptedCredentialStore)
    private readonly credentials?: EncryptedCredentialStore,
  ) {}

  private get cookie(): string {
    return this.credentials?.getCookieString(this.id, process.env.MUSIC_COOKIE || '') || '';
  }

  private withCookie(extra?: Record<string, unknown>): Record<string, unknown> {
    return this.cookie ? { ...(extra || {}), cookie: this.cookie } : (extra || {});
  }

  /**
   * NeteaseCloudMusicApi 在参数非法或无权限时会抛非 Error 的裸对象(带 status/body),
   * Nest 异常过滤器无法识别。统一在此捕获,返回安全空值,避免 500。
   */
  private safe<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    return run().catch((e) => {
      const msg = e?.body?.message || e?.message || '未知错误';
      this.logger.warn(`${label} 失败: ${msg}`);
      return fallback;
    });
  }

  async search(keyword: string, limit = 20): Promise<ProviderSearchResult> {
    if (!keyword) return { songs: [] };
    return this.safe('search', { songs: [] }, async () => {
      const result: any = await cloudsearch(
        this.withCookie({ keywords: keyword, limit, type: 1 }) as any,
      );
      const songs = (result.body?.result?.songs || []).map((s: any): Track => ({
        id: String(s.id),
        provider: this.id,
        name: s.name,
        artists: (s.ar || []).map((a: any) => a.name).join('/'),
        album: s.al?.name || '',
        coverUrl: s.al?.picUrl || '',
        duration: s.dt || 0,
      }));
      return { songs };
    });
  }

  async resolve(songId: string): Promise<ProviderResolveResult> {
    const id = Number(songId);
    const fallback: ProviderResolveResult = {
      track: this.emptyTrack(songId),
      url: null,
      unplayable: true,
    };
    return this.safe('resolve', fallback, async () => {
      const detailRes: any = await song_detail(this.withCookie({ ids: String(id) }) as any);
      const song = (detailRes.body?.songs || [])[0];
      if (!song) return fallback;
      const track: Track = {
        id: String(song.id),
        provider: this.id,
        name: song.name,
        artists: (song.ar || []).map((a: any) => a.name).join('/'),
        album: song.al?.name || '',
        coverUrl: song.al?.picUrl || '',
        duration: song.dt || 0,
      };

      // 从高到低取第一个可播 URL
      let url: string | null = null;
      for (const level of RESOLVE_LEVELS) {
        try {
          const urlRes: any = await song_url_v1(this.withCookie({ id, level }) as any);
          const urlData = (urlRes.body?.data || [])[0];
          if (urlData?.url) {
            url = urlData.url;
            break;
          }
        } catch {
          // 某音质失败则尝试下一级
        }
      }
      if (!url) this.logger.warn(`resolve 无可播 URL: id=${songId}`);
      return { track, url, unplayable: !url };
    });
  }

  async lyric(songId: string): Promise<ProviderLyricResult> {
    const id = Number(songId);
    return this.safe('lyric', { lines: [] }, async () => {
      const result: any = await lyric(this.withCookie({ id }) as any);
      const lrcText: string = result.body?.lrc?.lyric || '';
      const tlrcText: string = result.body?.tlyric?.lyric || '';
      const lines = this.parseLyric(lrcText);
      const transLines = this.parseLyric(tlrcText);

      // 合并翻译:按同序下标对齐(V1 同款)
      const merged: LyricLine[] = lines.map((l, i) => ({
        time: l.time,
        text: l.text,
        trans: transLines[i]?.text || '',
      }));
      return { lines: merged };
    });
  }

  async playlist(playlistId: string): Promise<Track[]> {
    const id = Number(playlistId);
    return this.safe('playlist', [], async () => {
      const result: any = await playlist_detail(this.withCookie({ id }) as any);
      const playlist = result.body?.playlist;
      if (!playlist) return [];
      return (playlist.tracks || []).map((t: any): Track => ({
        id: String(t.id),
        provider: this.id,
        name: t.name,
        artists: (t.ar || []).map((a: any) => a.name).join('/'),
        album: t.al?.name || '',
        coverUrl: t.al?.picUrl || '',
        duration: t.dt || 0,
      }));
    });
  }

  async searchPlaylists(keyword: string, limit = 20): Promise<ProviderPlaylistSearchResult> {
    if (!keyword) return { playlists: [] };
    return this.safe('playlist-search', { playlists: [] }, async () => {
      const result: any = await cloudsearch(this.withCookie({ keywords: keyword, limit, type: 1000 }) as any);
      // cloudsearch type=1000 返回 result.body.result.playlists[](字段名以实测为准)
      const playlists = (result.body?.result?.playlists || []).map((p: any) => ({
        id: String(p.id),
        provider: this.id,
        name: p.name || '',
        coverUrl: p.coverImgUrl || p.picUrl || '',
        trackCount: p.trackCount || 0,
        creator: p.creator?.nickname || (typeof p.creator === 'string' ? p.creator : ''),
      }));
      return { playlists };
    });
  }

  /** 解析 LRC 歌词文本为 { time, text }[] */
  private parseLyric(lrc: string): { time: number; text: string }[] {
    const lines: { time: number; text: string }[] = [];
    const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
    for (const line of lrc.split('\n')) {
      const matches = [...line.matchAll(regex)];
      if (matches.length === 0) continue;
      const text = line.replace(regex, '').trim();
      if (!text) continue;
      for (const m of matches) {
        const min = parseInt(m[1], 10);
        const sec = parseInt(m[2], 10);
        const ms = parseInt((m[3] || '0').padEnd(3, '0'), 10);
        lines.push({ time: min * 60 + sec + ms / 1000, text });
      }
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
  }

  private emptyTrack(id: string): Track {
    return { id, provider: this.id, name: '', artists: '', album: '', coverUrl: '', duration: 0 };
  }
}
