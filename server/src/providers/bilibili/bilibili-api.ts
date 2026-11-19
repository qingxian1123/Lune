import { createHash } from 'node:crypto';

const api = 'https://api.bilibili.com';
const site = 'https://www.bilibili.com';
const mixin = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

export const bilibiliHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
  Referer: site + '/',
};
type Params = Record<string, string | number>;

export class BilibiliResponseError extends Error {
  constructor(readonly code: number) {
    super(`Bilibili API error ${code}`);
  }
}

export class BilibiliApi {
  private signingKey?: { value: string; expires: number };
  private keyRequest?: Promise<string>;
  private session?: { expires: number; cookie: Promise<string | undefined> };

  constructor(private readonly timeoutMs: number) {}

  async get<T>(path: string, params: Params = {}, options: { signed?: boolean; site?: boolean } = {}): Promise<T> {
    const [query, cookie] = await Promise.all([options.signed ? this.sign(params) : new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    ).toString(), this.getSessionCookie()]);
    const result = await this.request<T>((options.site ? site : api) + path + '?' + query, cookie);
    if (result.code !== 0 || result.data == null) throw new BilibiliResponseError(result.code);
    return result.data;
  }

  private async request<T>(url: string, cookie?: string): Promise<{ code: number; data?: T }> {
    const response = await fetch(url, {
      headers: { ...bilibiliHeaders, ...(cookie && { Cookie: cookie }) },
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Bilibili HTTP ${response.status}`);
    return await response.json() as { code: number; data?: T };
  }

  private getSessionCookie(): Promise<string | undefined> {
    if (this.session && this.session.expires > Date.now()) return this.session.cookie;
    const session = {
      expires: Date.now() + 60_000,
      cookie: this.request<{ b_3?: string; b_4?: string }>(api + '/x/frontend/finger/spi')
        .then(({ data }) => {
          const pairs = [['buvid3', data?.b_3], ['buvid4', data?.b_4]]
            .filter(([, value]) => typeof value === 'string' && /^[a-zA-Z0-9-]{16,128}$/.test(value));
          if (!pairs.length) return undefined;
          session.expires = Date.now() + 60 * 60_000;
          return pairs.map(([name, value]) => `${name}=${value}`).join('; ');
        })
        .catch(() => undefined),
    };
    this.session = session;
    return session.cookie;
  }

  private async getKey(): Promise<string> {
    if (this.signingKey && this.signingKey.expires > Date.now()) return this.signingKey.value;
    this.keyRequest ??= this.request<{ wbi_img?: { img_url: string; sub_url: string } }>(api + '/x/web-interface/nav')
      .then(({ data }) => {
        const images = data?.wbi_img;
        const keys = [images?.img_url, images?.sub_url].map((url) => url?.split('/').pop()?.split('.')[0] || '').join('');
        if (keys.length < mixin.length) throw new Error('Bilibili signing key missing');
        const value = mixin.slice(0, 32).map((index) => keys[index]).join('');
        this.signingKey = { value, expires: Date.now() + 30 * 60_000 };
        return value;
      }).finally(() => { this.keyRequest = undefined; });
    return this.keyRequest;
  }

  private async sign(params: Params): Promise<string> {
    const key = await this.getKey();
    const entries = Object.entries({ ...params, wts: Math.floor(Date.now() / 1000) });
    const query = entries.sort(([a], [b]) => a < b ? -1 : a === b ? 0 : 1)
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value).replace(/[!'()*]/g, ''))}`)
      .join('&');
    return query + '&w_rid=' + createHash('md5').update(query + key).digest('hex');
  }
}
