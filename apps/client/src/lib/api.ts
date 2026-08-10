import type {
  PlaylistSummary,
  ProviderLyricResult,
  ProviderPlaylistSearchResult,
  ProviderResolveResult,
  ProviderSearchResult,
  Track,
} from '@lune/shared';
import { getServerBaseUrl } from './serverConfig';

function endpoint(path: string): string {
  return `${getServerBaseUrl()}${path}`;
}

function providerParam(provider?: string): string {
  return provider ? `&provider=${encodeURIComponent(provider)}` : '';
}

async function json<T>(resP: Promise<Response> | Response): Promise<T> {
  const res = await resP;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${res.status}`);
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

export async function searchTracks(kw: string, limit = 20, provider?: string): Promise<Track[]> {
  const r: ProviderSearchResult = await json(
    fetch(endpoint(`/api/providers/search?kw=${encodeURIComponent(kw)}&limit=${limit}${providerParam(provider)}`)),
  );
  return r.songs;
}

export async function resolveTrack(id: string, provider?: string): Promise<ProviderResolveResult> {
  return json(fetch(endpoint(`/api/providers/resolve?id=${encodeURIComponent(id)}${providerParam(provider)}`)));
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
