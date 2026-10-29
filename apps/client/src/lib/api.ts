import type {
  HotChart,
  PlaylistSummary,
  ProviderLyricResult,
  ProviderPlaylistSearchResult,
  ProviderResolveResult,
  ProviderSearchResult,
  Track,
} from '@lune/shared';
import { getServerBaseUrl } from './serverConfig';
import { ApiError, boundedRequest, retryAfterMs } from './apiError';

function endpoint(path: string): string {
  return `${getServerBaseUrl()}${path}`;
}

export async function getHotChart(serverUrl: string, provider: string, signal: AbortSignal): Promise<HotChart> {
  return json(fetch(`${serverUrl}/api/charts/hot?window=7d&limit=50&provider=${encodeURIComponent(provider || 'all')}`, { signal }));
}

function providerParam(provider?: string): string {
  return provider ? `&provider=${encodeURIComponent(provider)}` : '';
}

async function json<T>(resP: Promise<Response> | Response): Promise<T> {
  const res = await resP;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(typeof body?.message === 'string' ? body.message : `HTTP ${res.status}`,
      res.status, typeof body?.code === 'string' ? body.code : `HTTP_${res.status}`,
      typeof body?.retryable === 'boolean' ? body.retryable : res.status === 429 || res.status >= 500,
      retryAfterMs(res.headers.get('Retry-After')) || (Number(body?.retryAfterMs) > 0 ? Number(body.retryAfterMs) : 0),
      typeof body?.provider === 'string' ? body.provider : undefined);
  }
  return res.json() as Promise<T>;
}

/** 创建房间,返回 code + member + token */
export async function createRoom(nickname: string): Promise<{
  code: string;
  member: { id: string; nickname: string; isOwner: boolean };
  token: string;
}> {
  return json(fetch(endpoint('/api/rooms'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  }));
}

/** 加入房间 */
export async function joinRoom(code: string, nickname: string): Promise<{
  code: string;
  member: { id: string; nickname: string; isOwner: boolean };
  token: string;
}> {
  return json(fetch(endpoint(`/api/rooms/${code}/join`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  }));
}

export async function getProviders(): Promise<string[]> {
  const result = await json<{ providers: string[] }>(fetch(endpoint('/api/providers')));
  return result.providers;
}

export async function checkProviderReady(provider?: string): Promise<boolean> {
  const data = await boundedRequest((signal) => json<{
    defaultProvider?: string; details?: Array<{ id: string; status: string }>;
  }>(fetch(endpoint('/api/providers'), { signal })));
  const status = data.details?.find((entry) => entry.id === (provider || data.defaultProvider))?.status;
  return status === 'ready' || status === 'degraded';
}

export async function searchTracks(kw: string, limit = 20, provider?: string): Promise<Track[]> {
  const r: ProviderSearchResult = await json(
    fetch(endpoint(`/api/providers/search?kw=${encodeURIComponent(kw)}&limit=${limit}${providerParam(provider)}`)),
  );
  return r.songs;
}

export async function resolveTrack(id: string, provider?: string, signal?: AbortSignal): Promise<ProviderResolveResult> {
  return boundedRequest((requestSignal) => json(fetch(
    endpoint(`/api/providers/resolve?id=${encodeURIComponent(id)}${providerParam(provider)}`), { signal: requestSignal },
  )), signal);
}

export async function getLyric(id: string, provider?: string): Promise<ProviderLyricResult> {
  return json(fetch(endpoint(`/api/providers/lyric?id=${encodeURIComponent(id)}${providerParam(provider)}`)));
}

/** 按名搜歌单,返回歌单摘要列表 */
export async function searchPlaylists(kw: string, limit = 20, provider?: string): Promise<PlaylistSummary[]> {
  const r: ProviderPlaylistSearchResult = await json(
    fetch(endpoint(`/api/providers/playlist-search?kw=${encodeURIComponent(kw)}&limit=${limit}${providerParam(provider)}`)),
  );
  return r.playlists;
}

/** 拉歌单全部曲目 */
export async function getPlaylist(id: string, provider?: string): Promise<Track[]> {
  return json<Track[]>(
    fetch(endpoint(`/api/providers/playlist?id=${encodeURIComponent(id)}${providerParam(provider)}`)),
  );
}
