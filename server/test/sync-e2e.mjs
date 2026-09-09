// P3 端到端验证脚本:HTTP 创建房间 + 两个 WS 客户端走完整流程
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

const testPort = process.env.LUNE_TEST_PORT ?? '9527';
const API = `http://127.0.0.1:${testPort}/api`;
const WS_URL = `ws://127.0.0.1:${testPort}/ws`;

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
      return new Promise((res, reject) => {
        const timeout = setTimeout(() => reject(new Error(`等待 ${type} 超时`)), 5000);
        let arr = waiters.get(type);
        if (!arr) { arr = []; waiters.set(type, arr); }
        arr.push((msg) => {
          clearTimeout(timeout);
          res(msg);
        });
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

  // 4. Alice 基于加入快照的 playback seq 开始播放
  a.send({
    type: 'play',
    payload: { track: trackA, position: 1000, expectedPlaybackSeq: aJoined.payload.snapshot.playback.seq },
  });
  const [, bPlay] = await Promise.all([
    a.once('room_state_changed'),
    b.once('room_state_changed'),
  ]);
  assert.equal(bPlay.payload.cause, 'play');
  log('bob', `playback status=${bPlay.payload.playback.status} track=${bPlay.payload.playback.track?.name} pos=${bPlay.payload.playback.position} seq=${bPlay.payload.playback.seq}`);

  // 5. Alice add_song
  a.send({ type: 'add_song', payload: { track: trackB } });
  const [, bQueue] = await Promise.all([a.once('room_state_changed'), b.once('room_state_changed')]);
  log('bob', `queue len=${bQueue.payload.queue.length} first=${bQueue.payload.queue[0]?.track.name}`);

  // 6. Bob 添加第二首待播歌曲并按稳定条目 ID 把它拖到队首
  b.send({ type: 'add_song', payload: { track: trackC } });
  const [, bQueueBeforeReorder] = await Promise.all([
    a.once('room_state_changed'),
    b.once('room_state_changed'),
  ]);
  const [itemB, itemC] = bQueueBeforeReorder.payload.queue;
  b.send({
    type: 'reorder_queue_item',
    payload: {
      itemId: itemC.id,
      beforeItemId: itemB.id,
      expectedQueueRevision: bQueueBeforeReorder.payload.queueRevision,
    },
  });
  const [aReordered, bReordered] = await Promise.all([
    a.once('room_state_changed'),
    b.once('room_state_changed'),
  ]);
  assert.deepEqual(aReordered.payload.queue.map((item) => item.track.id), ['3', '2']);
  assert.deepEqual(bReordered.payload.queue.map((item) => item.track.id), ['3', '2']);
  log('reorder', `queue=${bReordered.payload.queue.map((item) => item.track.name).join(' → ')}`);

  // 7. Alice advance → 播放和队列在一条事件中原子更新
  const observedPlayback = bReordered.payload.playback;
  const advancePayload = {
    requestId: 'advance-A-1',
    expectedPlaybackSeq: observedPlayback.seq,
    expectedTrackKey: `:${observedPlayback.track.id}`,
    reason: 'manual', // 本测试未等待歌曲时长；自然结束的时间校验由回归测试覆盖。
  };
  a.send({ type: 'advance_playback', payload: advancePayload });
  const [aAdvanced, bAdvanced] = await Promise.all([
    a.once('room_state_changed'),
    b.once('room_state_changed'),
  ]);
  assert.equal(aAdvanced.payload.appliedRequestId, advancePayload.requestId);
  assert.equal(bAdvanced.payload.cause, 'advance');
  assert.equal(bAdvanced.payload.playback.track?.id, '3');
  assert.deepEqual(bAdvanced.payload.queue.map((item) => item.track.id), ['2']);

  // 延迟到达的同版本 advance 只触发 resync，不能再弹出下一首
  b.send({
    type: 'advance_playback',
    payload: { ...advancePayload, requestId: 'advance-A-duplicate' },
  });
  const staleAdvance = await b.once('room_state_changed');
  assert.equal(staleAdvance.payload.cause, 'resync');
  assert.equal(staleAdvance.payload.playback.track?.id, '3');
  assert.deepEqual(staleAdvance.payload.queue.map((item) => item.track.id), ['2']);
  log('advance', `playing=${staleAdvance.payload.playback.track?.name} queue=${staleAdvance.payload.queue.length}`);

  // 8. Alice seek
  a.send({ type: 'seek', payload: { position: 5000, expectedTrackKey: ':3' } });
  const bSeek = await b.once('room_state_changed');
  log('bob', `seek pos=${bSeek.payload.playback.position} seq=${bSeek.payload.playback.seq}`);

  // 10. heartbeat
  a.send({ type: 'heartbeat', payload: { clientTime: 123 } });
  const hb = await a.once('heartbeat_ack');
  log('alice', `heartbeat serverTime=${hb.payload.serverTime}`);

  // 11. Bob 短暂断开后在 30s 宽限期内用原 token 恢复身份
  b.ws.close();
  await b.closed;
  const b2 = openClient();
  await new Promise((resolve) => b2.ws.on('open', resolve));
  b2.send({ type: 'join', payload: { token: joined.token } });
  const bRejoined = await b2.once('joined');
  assert.equal(bRejoined.payload.memberId, joined.member.id);
  assert.equal(bRejoined.payload.snapshot.members.length, 2);
  log('bob', `rejoined as=${bRejoined.payload.memberId} members=${bRejoined.payload.snapshot.members.length}`);

  // 12. 两端断开；房间会在宽限期结束后清理
  b2.ws.close();
  a.ws.close();
  await Promise.all([a.closed, b2.closed]);
  const snap = await http(`/rooms/${created.code}`);
  assert.equal(snap.members.length, 2);
  log('cleanup', 'room retained during disconnect grace period');

  console.log('\n=== P3 全部步骤完成 ===');
};

main().catch((e) => {
  console.error('FAIL:', e);
  process.exitCode = 1;
});
