// P4 端到端:从客户端视角验证 HTTP+WS+Provider 闭环(不含 Web Audio 发声,需真浏览器)
import { WebSocket } from 'ws';

const API = 'http://localhost:9527/api';
const WS_URL = 'ws://localhost:9527/ws';
const log = (t, x) => console.log(`[${t}]`, typeof x === 'string' ? x : JSON.stringify(x));

async function http(path, body) {
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const main = async () => {
  // 1. daily-best 接口预留
  const db = await http('/daily-best');
  log('daily-best', `date=${db.date} tracks=${db.tracks.length}`);

  // 2. 创建房间
  const created = await http('/rooms', { nickname: 'Alice' });
  log('create', `code=${created.code}`);

  // 3. WS join
  const ws = new WebSocket(WS_URL);
  await new Promise((r) => ws.on('open', r));
  const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const arr = pending.get(m.type);
    if (arr && arr.length) arr.shift()(m);
    else { let p = pending.get('_buf_' + m.type); if (!p) { p = []; pending.set('_buf_' + m.type, p); } p.push(m); }
  });
  const once = (type) => {
    const buf = pending.get('_buf_' + type);
    if (buf && buf.length) return Promise.resolve(buf.shift());
    return new Promise((r) => { let a = pending.get(type); if (!a) { a = []; pending.set(type, a); } a.push(r); });
  };
  ws.send(JSON.stringify({ type: 'join', payload: { token: created.token } }));
  const joined = await once('joined');
  log('ws-join', `snapshot members=${joined.payload.snapshot.members.length} ownerId=${joined.payload.snapshot.ownerId === created.member.id}`);

  // 4. 搜索
  const songs = await http(`/providers/search?kw=${encodeURIComponent('晴天 周杰伦')}&limit=3`);
  log('search', `count=${songs.songs.length} first=${songs.songs[0].name}/${songs.songs[0].artists}`);

  // 5. resolve 第一首
  const resolved = await http(`/providers/resolve?id=${songs.songs[0].id}`);
  log('resolve', `name=${resolved.track.name} url=${resolved.url ? '已拿到' : '空'} unplayable=${resolved.unplayable}`);

  // 6. owner 发 play(用第一首)
  ws.send(JSON.stringify({
    type: 'play',
    payload: {
      track: resolved.track,
      position: 0,
      expectedPlaybackSeq: joined.payload.snapshot.playback.seq,
    },
  }));
  const pb = await once('room_state_changed');
  log('play', `status=${pb.payload.playback.status} track=${pb.payload.playback.track?.name} seq=${pb.payload.playback.seq}`);

  // 7. add_song(第二首)
  ws.send(JSON.stringify({ type: 'add_song', payload: { track: songs.songs[1] } }));
  const q1 = await once('room_state_changed');
  log('add_song', `queue len=${q1.payload.queue.length}`);

  // 8. next → 应切到队列第一首
  ws.send(JSON.stringify({
    type: 'advance_playback',
    payload: {
      requestId: 'p4-next-1',
      expectedPlaybackSeq: q1.payload.playback.seq,
      expectedTrackKey: `${q1.payload.playback.track.provider || ''}:${q1.payload.playback.track.id}`,
      reason: 'manual',
    },
  }));
  const pb2 = await once('room_state_changed');
  log('next', `track=${pb2.payload.playback.track?.name} status=${pb2.payload.playback.status}`);
  log('next-queue', `len=${pb2.payload.queue.length}`);

  // 9. lyric
  const lyric = await http(`/providers/lyric?id=${songs.songs[0].id}`);
  log('lyric', `lines=${lyric.lines.length}`);

  ws.close();
  console.log('\n=== P4 闭环验证完成(Web Audio 发声需真浏览器手动确认) ===');
  process.exit(0);
};
main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
