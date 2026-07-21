import { Router } from 'express';
import NeteaseCloudMusicApi from 'NeteaseCloudMusicApi';

const {
  cloudsearch,
  song_url_v1,
  song_detail,
  playlist_detail,
  lyric,
} = NeteaseCloudMusicApi;

const router = Router();

// 读取 VIP Cookie
function getCookie(): string {
  return process.env.MUSIC_COOKIE || '';
}

// 带 cookie 的通用调用选项
function withCookie(extra?: Record<string, any>): Record<string, any> {
  const cookie = getCookie();
  return cookie ? { ...extra, cookie } : (extra || {});
}

// 搜歌
router.get('/search', async (req, res) => {
  try {
    const keyword = req.query.keyword as string;
    const limit = Number(req.query.limit) || 20;
    if (!keyword) {
      res.status(400).json({ error: '缺少 keyword 参数' });
      return;
    }
    const result: any = await cloudsearch(withCookie({ keywords: keyword, limit, type: 1 }) as any);
    const songs = (result.body?.result?.songs || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      artists: (s.ar || []).map((a: any) => a.name).join('/'),
      album: s.al?.name || '',
      coverUrl: s.al?.picUrl || '',
      duration: Math.floor((s.dt || 0) / 1000),
    }));
    res.json({ songs });
  } catch (e: any) {
    console.error('搜索失败:', e.message);
    res.status(500).json({ error: '搜索失败' });
  }
});

// 获取歌曲播放 URL（从高到低尝试多个音质等级）
router.get('/track/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    const levels = ['exhigh', 'higher', 'standard'] as const;
    let bestUrl: string | null = null;

    const [detailRes] = await Promise.all([
      song_detail(withCookie({ ids: String(id) }) as any),
    ]);

    const song = (detailRes.body?.songs || [])[0];
    if (!song) {
      res.status(404).json({ error: '歌曲不存在' });
      return;
    }

    // 从高到低取第一个可播放的 URL
    for (const level of levels) {
      try {
        const urlRes: any = await song_url_v1(withCookie({ id, level }) as any);
        const urlData = (urlRes.body?.data || [])[0];
        if (urlData?.url) {
          bestUrl = urlData.url;
          break;
        }
      } catch {
        // 某个等级获取失败，尝试下一级
      }
    }

    res.json({
      id: song.id,
      name: song.name,
      artists: (song.ar || []).map((a: any) => a.name).join('/'),
      album: song.al?.name || '',
      coverUrl: song.al?.picUrl || '',
      duration: Math.floor((song.dt || 0) / 1000),
      url: bestUrl,
    });
  } catch (e: any) {
    console.error('获取歌曲失败:', e.message);
    res.status(500).json({ error: '获取歌曲失败' });
  }
});

// 获取歌单
router.get('/playlist/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result: any = await playlist_detail(withCookie({ id }) as any);

    const playlist = result.body?.playlist;
    if (!playlist) {
      res.status(404).json({ error: '歌单不存在' });
      return;
    }

    const tracks = (playlist.tracks || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      artists: (t.ar || []).map((a: any) => a.name).join('/'),
      album: t.al?.name || '',
      coverUrl: t.al?.picUrl || '',
      duration: Math.floor((t.dt || 0) / 1000),
    }));

    res.json({
      id: playlist.id,
      name: playlist.name,
      coverUrl: playlist.coverImgUrl || '',
      trackCount: playlist.trackCount || 0,
      tracks,
    });
  } catch (e: any) {
    console.error('获取歌单失败:', e.message);
    res.status(500).json({ error: '获取歌单失败' });
  }
});

// 获取歌词
router.get('/lyric/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result: any = await lyric(withCookie({ id }) as any);

    const lrc = result.body?.lrc?.lyric || '';
    const tlrc = result.body?.tlyric?.lyric || '';

    // 解析歌词文本为 { time, text } 数组
    const lines = parseLyric(lrc);
    const transLines = parseLyric(tlrc);

    // 合并翻译
    const merged = lines.map((l, i) => ({
      time: l.time,
      text: l.text,
      trans: transLines[i]?.text || '',
    }));

    res.json({ lines: merged });
  } catch (e: any) {
    console.error('获取歌词失败:', e.message);
    res.status(500).json({ error: '获取歌词失败' });
  }
});

// 解析 LRC 歌词
function parseLyric(lrc: string): { time: number; text: string }[] {
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

export default router;
