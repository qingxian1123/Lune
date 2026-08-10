/** 服务端基址,末尾不带斜杠 */
const BASE = import.meta.env.VITE_SERVER_URL?.replace(/\/$/, '') || 'http://localhost:9527';
/** WS URL 由 HTTP 基址推导 */
export const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
function providerParam(provider) {
    return provider ? `&provider=${encodeURIComponent(provider)}` : '';
}
async function json(resP) {
    const res = await resP;
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
    }
    return res.json();
}
/** 创建房间,返回 code + member + token */
export async function createRoom(nickname) {
    return json(fetch(`${BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
    }));
}
/** 加入房间 */
export async function joinRoom(code, nickname) {
    return json(fetch(`${BASE}/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
    }));
}
export async function getProviders() {
    const result = await json(fetch(`${BASE}/api/providers`));
    return result.providers;
}
export async function searchTracks(kw, limit = 20, provider) {
    const r = await json(fetch(`${BASE}/api/providers/search?kw=${encodeURIComponent(kw)}&limit=${limit}${providerParam(provider)}`));
    return r.songs;
}
export async function resolveTrack(id, provider) {
    return json(fetch(`${BASE}/api/providers/resolve?id=${encodeURIComponent(id)}${providerParam(provider)}`));
}
export async function getLyric(id, provider) {
    return json(fetch(`${BASE}/api/providers/lyric?id=${encodeURIComponent(id)}${providerParam(provider)}`));
}
/** 按名搜歌单,返回歌单摘要列表 */
export async function searchPlaylists(kw, limit = 20, provider) {
    const r = await json(fetch(`${BASE}/api/providers/playlist-search?kw=${encodeURIComponent(kw)}&limit=${limit}${providerParam(provider)}`));
    return r.playlists;
}
/** 拉歌单全部曲目 */
export async function getPlaylist(id, provider) {
    return json(fetch(`${BASE}/api/providers/playlist?id=${encodeURIComponent(id)}${providerParam(provider)}`));
}
