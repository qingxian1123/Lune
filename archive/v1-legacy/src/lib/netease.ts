import type { Track } from '../types';

// 信号服务器地址（Vite 编译时从 .env 注入）
const BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://127.0.0.1:3001';
const BASE = `${BASE_URL}/api`;

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// 搜索歌曲
export async function searchTracks(
  keyword: string,
  limit = 20,
): Promise<Track[]> {
  const data = await request<{ songs: Track[] }>(
    `/search?keyword=${encodeURIComponent(keyword)}&limit=${limit}`,
  );
  return data.songs;
}

// 获取歌曲详情 + 播放 URL
export async function getTrackDetail(
  id: number,
): Promise<Track & { url: string | null }> {
  return request(`/track/${id}`);
}

// 获取歌单
export async function getPlaylist(
  id: number,
): Promise<{ id: number; name: string; coverUrl: string; trackCount: number; tracks: Track[] }> {
  return request(`/playlist/${id}`);
}

// 获取歌词
export async function getLyric(
  id: number,
): Promise<{ lines: { time: number; text: string; trans: string }[] }> {
  return request(`/lyric/${id}`);
}

// 获取播放 URL（用于刷新过期 URL）
export async function getTrackUrl(id: number): Promise<string | null> {
  const data = await getTrackDetail(id);
  return data.url;
}
