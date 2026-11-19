import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  BilibiliSearchPrecision, BilibiliVideoSummary, MusicProvider, ProviderLyricResult, ProviderResolveResult, ProviderSearchResult, Track,
} from '@lune/shared';
import { ProviderConfigService } from '../infrastructure/config/provider-config.service';
import { BilibiliApi, BilibiliResponseError, bilibiliHeaders } from './bilibili-api';

const videoId = /^BV[0-9A-Za-z]{10}$/;
const audioId = /^au([1-9]\d{0,14})$/;
const partId = /^(BV[0-9A-Za-z]{10}):([1-9]\d{0,14})$/;
const streamPath = '/api/providers/bilibili/audio';
const mediaDomains = ['bilivideo.com', 'bilivideo.cn', 'hdslb.com', 'acgvideo.com'];
const musicTerms = /音乐|歌曲|翻唱|演奏|纯音|原声|钢琴|吉他|混音|音声|现场|串烧|concert|\b(?:music|ost|bgm|mv|cover|live|remix)\b/i;
const noiseTerms = /教程|教学|开箱|测评|解说|盘点|乐评|如何提取|reaction/i;

type VideoHit = {
  bvid?: string; title?: string; author?: string; pic?: string; duration?: string; typename?: string; tag?: string;
};
type VideoPage = { cid: number; page: number; part?: string; duration?: number };
type VideoView = {
  bvid?: string; title?: string; pic?: string; owner?: { name?: string }; duration?: number; pages?: VideoPage[];
};
type AudioInfo = {
  id?: number | string; sid?: number | string; song_id?: number | string; title?: string;
  author?: string; uname?: string; cover?: string; duration?: number;
};
type DashAudio = {
  baseUrl?: string; base_url?: string; backupUrl?: string[]; backup_url?: string[]; bandwidth?: number; codecs?: string;
};

function text(value?: string): string {
  return typeof value === 'string'
    ? value.replace(/<\/?em\b[^>]*>/gi, '').replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => ({
      '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'",
    })[entity] ?? entity).trim()
    : '';
}

function cover(value?: string): string {
  if (typeof value !== 'string') return '';
  return /^\/\//.test(value) ? 'https:' + value : /^https?:\/\//i.test(value) ? value.replace(/^http:/i, 'https:') : '';
}

function milliseconds(seconds: unknown): number {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : 0;
}

function isMissing(error: unknown): boolean {
  return error instanceof BilibiliResponseError && [-404, 62002, 62004, 7201006, 72010027].includes(error.code);
}

function score(hit: VideoHit, keyword: string): number {
  const title = text(hit.title).toLowerCase();
  const normalized = keyword.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const evidence = `${title} ${hit.typename ?? ''} ${hit.tag ?? ''}`;
  const relevance = title.includes(normalized) ? 5 : words.filter((word) => title.includes(word)).length * 2;
  return relevance + (musicTerms.test(evidence) ? 4 : 0) - (noiseTerms.test(title) ? 6 : 0);
}

function mediaUrls(values: string[]): string[] {
  return [...new Set(values)].flatMap((value) => {
    try {
      const url = new URL(value.replace(/^http:/, 'https:'));
      if (url.protocol !== 'https:' || url.port || url.username || url.password ||
          !mediaDomains.some((domain) => url.hostname === domain || url.hostname.endsWith('.' + domain))) return [];
      return [url.href];
    } catch {
      return [];
    }
  });
}

function inputId(value: string): { id: string; part?: number } | undefined {
  if (videoId.test(value) || audioId.test(value)) return { id: value };
  try {
    const url = new URL(value);
    if (url.hostname !== 'www.bilibili.com' && url.hostname !== 'bilibili.com') return;
    const match = /^\/(?:video\/(BV[0-9A-Za-z]{10})|audio\/(au[1-9]\d{0,14}))\/?$/.exec(url.pathname);
    if (!match) return;
    const part = Number(url.searchParams.get('p'));
    return { id: match[1] || match[2], part: Number.isSafeInteger(part) && part > 0 ? part : undefined };
  } catch {
    return;
  }
}

@Injectable()
export class BilibiliProvider implements MusicProvider {
  readonly id = 'bilibili';
  private readonly api: BilibiliApi;
  private readonly timeoutMs: number;
  private readonly views = new Map<string, { expires: number; value: Promise<VideoView | null> }>();
  private readonly urls = new Map<string, { expires: number; value: Promise<string[]> }>();

  constructor(@Inject(ProviderConfigService) config: ProviderConfigService) {
    this.timeoutMs = config.getProvider(this.id)?.requestTimeoutMs ?? 8_000;
    this.api = new BilibiliApi(this.timeoutMs);
  }

  async search(keyword: string, limit = 20, precision: BilibiliSearchPrecision = 'balanced'): Promise<ProviderSearchResult> {
    try {
      const direct = inputId(keyword.trim());
      if (direct) return await this.directSearch(direct.id, direct.part);
      const query = keyword.trim();
      if (!query) return { songs: [] };
      const [video, audio] = await Promise.allSettled([
        this.api.get<{ result?: VideoHit[] }>('/x/web-interface/wbi/search/type', { search_type: 'video', keyword: query, page: 1 }, { signed: true }),
        this.api.get<AudioInfo[] | { result?: AudioInfo[]; data?: AudioInfo[]; songs?: AudioInfo[] }>(
          '/audio/music-service-c/s', { keyword: query, page: 1, pagesize: Math.min(limit, 20), search_type: 'music' },
        ),
      ]);
      if (video.status === 'rejected' && audio.status === 'rejected') throw video.reason;
      const minimum = { strict: 8, balanced: 4, broad: 0 }[precision];
      const seen = new Set<string>();
      const hits = video.status === 'fulfilled' && Array.isArray(video.value.result) ? video.value.result : [];
      const videos = hits.flatMap((hit) => {
        if (!hit?.bvid || !videoId.test(hit.bvid) || !text(hit.title) || seen.has(hit.bvid)) return [];
        const rank = score(hit, query);
        if (rank < minimum) return [];
        seen.add(hit.bvid);
        const seconds = (typeof hit.duration === 'string' ? hit.duration : '').split(':')
          .reduce((total, unit) => total * 60 + Number(unit), 0);
        return [{
          score: rank,
          video: { id: hit.bvid, name: text(hit.title), creator: text(hit.author), coverUrl: cover(hit.pic), duration: milliseconds(seconds) },
        }];
      }).sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.video);
      const rawAudio = audio.status === 'fulfilled' ? audio.value : [];
      const audioList = Array.isArray(rawAudio) ? rawAudio : rawAudio.result ?? rawAudio.data ?? rawAudio.songs ?? [];
      const tracks = Array.isArray(audioList) ? audioList.flatMap((item) => {
        const aid = `au${item?.id ?? item?.sid ?? item?.song_id ?? ''}`;
        if (!audioId.test(aid) || !text(item.title) || seen.has(aid)) return [];
        seen.add(aid);
        return [this.audioTrack(aid, item)];
      }) : [];
      if (video.status === 'rejected' && tracks.length === 0) throw video.reason;
      return { songs: tracks.slice(0, limit), videos };
    } catch {
      throw new ServiceUnavailableException('哔哩哔哩搜索暂时不可用');
    }
  }

  async videoParts(id: string): Promise<Track[]> {
    const view = await this.view(id).catch(() => { throw new ServiceUnavailableException('暂时无法读取哔哩哔哩投稿'); });
    return view ? this.parts(id, view).map(({ track }) => track) : [];
  }

  async resolve(id: string): Promise<ProviderResolveResult> {
    let track: Track | undefined;
    const audio = audioId.exec(id);
    const part = partId.exec(id);
    if (audio) {
      const info = await this.audioInfo(audio[1]);
      if (info) track = this.audioTrack(id, info);
    } else if (part) {
      const view = await this.view(part[1]);
      if (view) track = this.parts(part[1], view).find((item) => item.track.id === id)?.track;
    }
    const urls = track ? await this.audioUrls(id) : [];
    return {
      track: track ?? { id, provider: this.id, name: id, artists: '', album: '', coverUrl: '', duration: 0 },
      url: urls.length ? `${streamPath}?id=${encodeURIComponent(id)}` : null,
      ...(!urls.length && { unplayable: true }),
    };
  }

  async lyric(): Promise<ProviderLyricResult> {
    return { lines: [] };
  }

  async openAudio(id: string, range: string | undefined, signal: AbortSignal, head: boolean): Promise<Response | undefined> {
    if (!partId.test(id) && !audioId.test(id)) return;
    for (const refresh of [false, true]) {
      const urls = await this.audioUrls(id, refresh);
      if (!urls.length) return;
      for (const url of urls) {
        if (signal.aborted) return;
        const timer = new AbortController();
        const timeout = setTimeout(() => timer.abort(), this.timeoutMs);
        const stop = () => timer.abort();
        signal.addEventListener('abort', stop, { once: true });
        try {
          const upstream = await fetch(url, {
            method: head ? 'HEAD' : 'GET',
            headers: { ...bilibiliHeaders, ...(range && { Range: range }), 'Accept-Encoding': 'identity' },
            signal: timer.signal,
            redirect: 'error',
          });
          if (upstream.ok || upstream.status === 416) return upstream;
          await upstream.body?.cancel();
        } catch {
          if (signal.aborted) return;
        } finally {
          clearTimeout(timeout);
          signal.removeEventListener('abort', stop);
        }
      }
    }
    throw new ServiceUnavailableException('暂时无法连接哔哩哔哩音频');
  }

  private async directSearch(id: string, page?: number): Promise<ProviderSearchResult> {
    const audio = audioId.exec(id);
    if (audio) {
      const info = await this.audioInfo(audio[1]);
      return { songs: info ? [this.audioTrack(id, info)] : [] };
    }
    const view = await this.view(id);
    if (!view) return { songs: [] };
    const parts = this.parts(id, view);
    if (page) return { songs: parts.filter((part) => part.page === page).map(({ track }) => track) };
    if (parts.length === 1) return { songs: [parts[0].track] };
    const video: BilibiliVideoSummary = {
      id, name: text(view.title), creator: text(view.owner?.name), coverUrl: cover(view.pic), duration: milliseconds(view.duration),
    };
    return { songs: [], videos: parts.length ? [video] : [] };
  }

  private audioTrack(id: string, item: AudioInfo): Track {
    return { id, provider: this.id, name: text(item.title) || id, artists: text(item.author) || text(item.uname),
      album: '', coverUrl: cover(item.cover), duration: milliseconds(item.duration) };
  }

  private parts(id: string, view: VideoView): Array<{ page: number; track: Track }> {
    const pages = Array.isArray(view.pages) ? view.pages : [];
    const title = text(view.title) || id;
    return pages.filter((item) => item && Number.isSafeInteger(item.cid) && item.cid > 0 && Number.isSafeInteger(item.page) && item.page > 0)
      .sort((a, b) => a.page - b.page).map((item) => ({
        page: item.page,
        track: { id: `${id}:${item.cid}`, provider: this.id,
          name: pages.length === 1 ? title : `P${item.page} · ${text(item.part) || title}`,
          artists: text(view.owner?.name), album: pages.length > 1 ? title : '',
          coverUrl: cover(view.pic), duration: milliseconds(item.duration ?? view.duration) },
      }));
  }

  private view(id: string): Promise<VideoView | null> {
    if (!videoId.test(id)) return Promise.resolve(null);
    return this.cached(this.views, id, 5 * 60_000, () =>
      this.api.get<VideoView>('/x/web-interface/view', { bvid: id }).catch((error) => {
        if (isMissing(error)) return null;
        throw error;
      }));
  }

  private audioInfo(sid: string): Promise<AudioInfo | null> {
    return this.api.get<AudioInfo>('/audio/music-service-c/web/song/info', { sid }, { site: true }).catch((error) => {
      if (isMissing(error)) return null;
      throw error;
    });
  }

  private audioUrls(id: string, refresh = false): Promise<string[]> {
    if (refresh) this.urls.delete(id);
    return this.cached(this.urls, id, 4 * 60_000, async () => {
      try {
        const audio = audioId.exec(id);
        if (audio) {
          const result = await this.api.get<{ cdns?: string[] }>('/audio/music-service-c/web/url', {
            sid: audio[1], privilege: 2, quality: 0,
          }, { site: true });
          return mediaUrls(Array.isArray(result.cdns) ? result.cdns : []);
        }
        const part = partId.exec(id);
        if (!part) return [];
        const result = await this.api.get<{ dash?: { audio?: DashAudio[] } }>('/x/player/wbi/playurl', {
          bvid: part[1], cid: part[2], fnval: 16, fnver: 0, qn: 16,
        }, { signed: true });
        const audioTracks = Array.isArray(result.dash?.audio) ? result.dash.audio : [];
        return mediaUrls(audioTracks.filter((track) => !track.codecs || track.codecs.startsWith('mp4a'))
          .sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0))
          .flatMap((track) => [track.baseUrl ?? track.base_url ?? '', ...(track.backupUrl ?? track.backup_url ?? [])]));
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
    });
  }

  private cached<T>(cache: Map<string, { expires: number; value: Promise<T> }>, id: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const existing = cache.get(id);
    if (existing && existing.expires > Date.now()) return existing.value;
    if (cache.size >= 128 && !existing) {
      const first = cache.keys().next();
      if (!first.done) cache.delete(first.value);
    }
    const value = load().catch((error) => {
      if (cache.get(id)?.value === value) cache.delete(id);
      throw error;
    });
    cache.set(id, { expires: Date.now() + ttl, value });
    return value;
  }
}
