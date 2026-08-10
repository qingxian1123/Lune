import { Inject, Injectable, Optional } from '@nestjs/common';
import KugouMusicApi from 'kugoumusicapi';
import { EncryptedCredentialStore } from '../infrastructure/credentials/encrypted-credential.store';
import { parseCookieString } from '../domain/cookie';

type KugouApiFunction = (params?: Record<string, unknown>) => Promise<any>;
type KugouCookie = Record<string, string>;

/**
 * MakcRe/KuGouMusicApi 程序化 API 适配层。
 *
 * 上游包的 main.js 直接导出 search/song_url/lyric 等函数，与
 * NeteaseCloudMusicApi 一样在 Lune 服务端进程内运行，不启动额外 HTTP 服务。
 */
@Injectable()
export class KugouApiService {
  constructor(
    @Optional()
    @Inject(EncryptedCredentialStore)
    private readonly credentials?: EncryptedCredentialStore,
  ) {}

  search(params: Record<string, unknown>): Promise<any> {
    return this.call('search', params);
  }

  songUrl(params: Record<string, unknown>): Promise<any> {
    return this.call('song_url', params);
  }

  searchLyric(params: Record<string, unknown>): Promise<any> {
    return this.call('search_lyric', params);
  }

  lyric(params: Record<string, unknown>): Promise<any> {
    return this.call('lyric', params);
  }

  playlistTrackAll(params: Record<string, unknown>): Promise<any> {
    return this.call('playlist_track_all', params);
  }

  /**
   * 搜索接口返回的歌单标识是 specialid，而 playlist_track_all 需要
   * global_collection_id。通过同一酷狗网关调用传统歌单歌曲接口，
   * 才能用 specialid 拉取详情。
   */
  async playlistSpecialTracks(params: Record<string, unknown>): Promise<any> {
    const api = KugouMusicApi as unknown as Record<string, KugouApiFunction>;
    const request = api.createRequest;
    if (typeof request !== 'function') {
      throw new Error('KuGouMusicApi 缺少程序化接口: createRequest');
    }
    const response = await request({
      url: '/api/v3/special/song',
      method: 'GET',
      params: { ...params, format: 'json' },
      encryptType: 'android',
      headers: { 'x-router': 'mobilecdn.kugou.com' },
      cookie: this.cookieObject(),
    });
    return response?.body ?? response;
  }

  private async call(name: string, params: Record<string, unknown>): Promise<any> {
    // v1.5.1 的声明文件中个别参数名与运行时实现不一致，统一在此边界适配。
    const api = KugouMusicApi as unknown as Record<string, KugouApiFunction>;
    const fn = api[name];
    if (typeof fn !== 'function') throw new Error(`KuGouMusicApi 缺少程序化接口: ${name}`);
    const cookie = this.cookieString();
    const response = await fn({ ...params, ...(cookie ? { cookie } : {}) });
    // 程序化 API 返回 { status, body, cookie, headers }，Provider 只消费 body。
    return response?.body ?? response;
  }

  private cookieObject(): KugouCookie {
    return this.credentials
      ? this.credentials.getCookieObject('kugou', process.env.KUGOU_COOKIE || '')
      : parseCookieString(process.env.KUGOU_COOKIE || '');
  }

  private cookieString(): string {
    return this.credentials
      ? this.credentials.getCookieString('kugou', process.env.KUGOU_COOKIE || '')
      : process.env.KUGOU_COOKIE?.trim() || '';
  }
}
