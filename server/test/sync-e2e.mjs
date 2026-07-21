// P3 端到端验证脚本:HTTP 创建房间 + 两个 WS 客户端走完整流程
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const testPort = process.env.LUNE_TEST_PORT ?? '9527';
const API = `http://localhost:${testPort}/api`;
const WS_URL = `ws://localhost:${testPort}/ws`;

const log = (tag, x) => console.log(`[${tag}]`, typeof x === 'string' ? x : JSON.stringify(x));

async function http(path, body) {
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function openClient() {
  const ws = new WebSocket(WS_URL);
  const waiters = new Map();
  const pending = new Map();
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const arr = waiters.get(msg.type);
    if (arr && arr.length) {
      arr.shift()(msg);
    } else {
      let p = pending.get(msg.type);
      if (!p) { p = []; pending.set(msg.type, p); }
      p.push(msg);
    }
  });
  return {
    ws,
    once(type) {
      const p = pending.get(type);
      if (p && p.length) return Promise.resolve(p.shift());
      return new Promise((res) => {
        let arr = waiters.get(type);
        if (!arr) { arr = []; waiters.set(type, arr); }
        arr.push(res);
      });
    },
    send(msg) { ws.send(JSON.stringify(msg)); },
    closed: new Promise((res) => ws.on('close', () => res())),
  };
}

const trackA = { id: '1', name: '晴天', artists: '周杰伦', album: '叶惠美', coverUrl: '', duration: 269000 };
const trackB = { id: '2', name: '稻香', artists: '周杰伦', album: '魔杰座', coverUrl: '', duration: 223000 };
const trackC = { id: '3', name: '夜曲', artists: '周杰伦', album: '十一月的萧邦', coverUrl: '', duration: 226000 };

const main = async () => {
  // 1. 创建房间(owner Alice)
  const created = await http('/rooms', { nickname: 'Alice' });
  log('create', `code=${created.code} owner=${created.member.isOwner}`);
  const ownerToken = created.token;

  // 2. Bob 通过 HTTP 加入拿 token
  const joined = await http(`/rooms/${created.code}/join`, { nickname: 'Bob' });
  log('bob-join', `isOwner=${joined.member.isOwner}`);

  // 3. 两个 WS 连接各自 join
  const a = openClient();
  const b = openClient();
  await Promise.all([new Promise((r) => a.ws.on('open', r)), new Promise((r) => b.ws.on('open', r))]);
  a.send({ type: 'join', payload: { token: ownerToken } });
  b.send({ type: 'join', payload: { token: joined.token } });

  const aJoined = await a.once('joined');
  log('alice', `joined snapshot members=${aJoined.payload.snapshot.members.length}`);
  // Alice 应该收到 Bob 的 member_joined
  const bobJoined = await a.once('member_joined');
  log('alice', `member_joined=${bobJoined.payload.member.nickname}`);
  const bJoined = await b.once('joined');
  log('bob', `joined snapshot members=${bJoined.payload.snapshot.members.length}`);

  // 4. Bob 非 owner 发 play 应被拒
  b.send({ type: 'play', payload: { track: trackA } });
  const denied = await b.once('error');
  log('bob', `play denied=${denied.payload.message}`);

  // 5. Alice(owner) 发 play
  a.send({ type: 'play', payload: { track: trackA, position: 1000 } });
  const bPlay = await b.once('playback_state');
  log('bob', `playback status=${bPlay.payload.status} track=${bPlay.payload.track?.name} pos=${bPlay.payload.position} seq=${bPlay.payload.seq}`);

  // 6. Alice add_song
  a.send({ type: 'add_song', payload: { track: trackB } });
  const [, bQueue] = await Promise.all([a.once('queue_updated'), b.once('queue_updated')]);
  log('bob', `queue len=${bQueue.payload.queue.length} first=${bQueue.payload.queue[0]?.name}`);

  // 7. Bob（非 owner）添加第二首待播歌曲并把它拖到队首
  b.send({ type: 'add_song', payload: { track: trackC } });
  const [, bQueueBeforeReorder] = await Promise.all([a.once('queue_updated'), b.once('queue_updated')]);
  b.send({
    type: 'reorder_song',
    payload: { fromIndex: 1, toIndex: 0, expectedRevision: bQueueBeforeReorder.payload.queueRevision },
  });
  const [aReordered, bReordered] = await Promise.all([a.once('queue_updated'), b.once('queue_updated')]);
  assert.deepEqual(aReordered.payload.queue.map((track) => track.id), ['3', '2']);
  assert.deepEqual(bReordered.payload.queue.map((track) => track.id), ['3', '2']);
  log('reorder', `non-owner moved queue to ${bReordered.payload.queue.map((track) => track.name).join(' → ')}`);

  // 8. Alice next → 应按调整后的顺序切到 trackC
  a.send({ type: 'next', payload: { endedTrackId: '1' } });
  const bNext = await b.once('playback_state');
  assert.equal(bNext.payload.track?.id, '3');
  log('bob', `next playback track=${bNext.payload.track?.name} status=${bNext.payload.status}`);
  const bNextQueue = await b.once('queue_updated');
  log('bob', `queue after next len=${bNextQueue.payload.queue.length}`);

  // 9. Alice seek
  a.send({ type: 'seek', payload: { position: 5000 } });
  const bSeek = await b.once('playback_state');
  log('bob', `seek pos=${bSeek.payload.position} seq=${bSeek.payload.seq}`);

  // 10. heartbeat
  a.send({ type: 'heartbeat', payload: { clientTime: 123 } });
  const hb = await a.once('heartbeat_ack');
  log('alice', `heartbeat serverTime=${hb.payload.serverTime}`);

  // 11. Bob 断开 → Alice 收到 member_left
  b.ws.close();
  const left = await a.once('member_left');
  log('alice', `member_left=${left.payload.memberId} ownerId=${left.payload.ownerId}`);

  // 12. Alice 断开 → 房间应被删空
  a.ws.close();
  await a.closed;
  const snap = await http(`/rooms/${created.code}`).catch(() => ({ status: 404 }));
  log('cleanup', `room after both left: statusCode=${snap.statusCode || 'gone'}`);

  console.log('\n=== P3 全部步骤完成 ===');
  process.exit(0);
};

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });
