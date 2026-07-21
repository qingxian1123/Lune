import type {
  PlaylistSummary,
  ProviderLyricResult,
  ProviderPlaylistSearchResult,
  ProviderResolveResult,
  ProviderSearchResult,
  Track,
} from '@lune/shared';

/** 服务端基址,末尾不带斜杠 */
const BASE = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:9527';

/** WS URL 由 HTTP 基址推导 */
export const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

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
  return json(fetch(`${BASE}/api/rooms`, {
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
  return json(fetch(`${BASE}/api/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname }),
  }));
}

export async function searchTracks(kw: string, limit = 20): Promise<Track[]> {
  const r: ProviderSearchResult = await json(
    fetch(`${BASE}/api/providers/search?kw=${encodeURIComponent(kw)}&limit=${limit}`),
  );
  return r.songs;
}

export async function resolveTrack(id: string): Promise<ProviderResolveResult> {
  return json(fetch(`${BASE}/api/providers/resolve?id=${encodeURIComponent(id)}`));
}

export async function getLyric(id: string): Promise<ProviderLyricResult> {
  return json(fetch(`${BASE}/api/providers/lyric?id=${encodeURIComponent(id)}`));
}

/** 按名搜歌单,返回歌单摘要列表 */
export async function searchPlaylists(kw: string, limit = 20): Promise<PlaylistSummary[]> {
  const r: ProviderPlaylistSearchResult = await json(
    fetch(`${BASE}/api/providers/playlist-search?kw=${encodeURIComponent(kw)}&limit=${limit}`),
  );
  return r.playlists;
}

/** 拉歌单全部曲目 */
export async function getPlaylist(id: string): Promise<Track[]> {
  return json<Track[]>(fetch(`${BASE}/api/providers/playlist?id=${encodeURIComponent(id)}`));
}