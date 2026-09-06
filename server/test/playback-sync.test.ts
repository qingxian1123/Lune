import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClientMessage, PlaybackState, ProviderResolveResult, Track } from '@lune/shared';
import { PlaybackSync } from '../../apps/client/src/audio/PlaybackSync';
import { Room } from '../src/rooms/room.model';

const track = (id: string): Track => ({
  id, provider: 'test', name: id, artists: '', album: '', coverUrl: '', duration: 180_000,
});
const playback = (id: string, seq: number, position = 0): PlaybackState => ({
  track: track(id), seq, position, serverTimestamp: Date.now(), status: 'playing',
});
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

class FakeEngine {
  end: (() => void) | null = null;
  currentMs = 0;
  loads: string[] = [];
  stops = 0;
  seeks: number[] = [];
  onEnd(cb: (() => void) | null) { this.end = cb; }
  stop() { this.stops++; this.currentMs = 0; }
  setRate(_rate: number) {}
  seek(ms: number) { this.seeks.push(ms); this.currentMs = ms; }
  async load(url: string, offset: number) { this.loads.push(url); this.currentMs = offset; }
}

function deferredResolver() {
  const requests: Array<{ id: string; finish: (url: string | null) => void }> = [];
  return {
    requests,
    resolve: (id: string) => new Promise<ProviderResolveResult>((resolve) => {
      requests.push({ id, finish: (url) => resolve({ track: track(id), url }) });
    }),
  };
}

test('三人房间排序后，旧歌曲的延迟结束事件不能连续跳过后续歌曲', async (t) => {
  const room = new Room('MULTI');
  room.play(track('A'), 0, 0);
  room.enqueueMany(['B', 'C', 'D', 'E'].map(track), 'member');
  const messages: ClientMessage[] = [];
  const clients: Array<{ engine: FakeEngine; resolver: ReturnType<typeof deferredResolver>; sync: PlaybackSync }> = [];
  for (let i = 0; i < 3; i++) {
    const engine = new FakeEngine();
    const resolver = deferredResolver();
    const sync = new PlaybackSync(engine, resolver.resolve, (message) => {
      messages.push(message);
      if (message.type !== 'advance_playback') return;
      const { expectedPlaybackSeq, expectedTrackKey } = message.payload;
      if (room.advance(expectedPlaybackSeq, expectedTrackKey)) {
        for (const client of clients) client.sync.apply(room.playback, { restart: true });
      }
    }, () => 0);
    clients.push({ engine, resolver, sync });
    t.after(() => sync.dispose());
    sync.apply(room.playback);
    resolver.requests[0].finish('A');
  }
  await flush();
  const oldEnds = clients.map((client) => client.engine.end!);
  const [b, , d] = room.queue;
  const previousSeq = room.playback.seq;
  room.reorder(d.id, b.id, room.queueRevision);
  for (const client of clients) {
    // 模拟排序广播反序列化生成的新 playback 对象。
    client.sync.apply(structuredClone(room.playback));
    assert.equal(client.engine.loads.length, 1);
    assert.equal(client.engine.end, oldEnds[clients.indexOf(client)]);
  }
  assert.equal(room.playback.seq, previousSeq);

  oldEnds[0](); // 第一位成员先播完 A，房间进入排在首位的 D。
  oldEnds[1](); // 其他成员的 A 此时才结束，新 URL 仍未解析完成。
  oldEnds[2]();
  oldEnds[0](); // 同一次结束的重复回调。
  assert.equal(messages.length, 1);
  assert.equal(room.playback.track?.id, 'D');
  assert.deepEqual(room.queue.map((item) => item.track.id), ['B', 'C', 'E']);
  for (const client of clients) {
    assert.equal(client.engine.end, null);
    assert.equal(client.sync.resync(), false);
    client.resolver.requests[1].finish('D');
  }
  await flush();
  oldEnds.forEach((end) => end());
  assert.equal(messages.length, 1);
  clients[1].engine.end!(); // D 真正播放完后，才进入 B。
  assert.equal(messages.length, 2);
  assert.equal(room.playback.track?.id, 'B');
  assert.deepEqual(room.queue.map((item) => item.track.id), ['C', 'E']);
});

test('换歌和离开后，过期 URL 与不可播结果都不能影响新播放', async () => {
  const engine = new FakeEngine();
  const resolver = deferredResolver();
  const sent: ClientMessage[] = [];
  const sync = new PlaybackSync(engine, resolver.resolve, (msg) => sent.push(msg), () => 0);
  sync.apply(playback('A', 1));
  sync.apply(playback('B', 2), { restart: true });
  resolver.requests[1].finish('B');
  resolver.requests[0].finish(null);
  await flush();
  assert.deepEqual(engine.loads, ['B']);
  assert.deepEqual(sent, []);
  sync.apply(playback('C', 3), { restart: true });
  sync.dispose();
  resolver.requests[2].finish('C');
  await flush();
  assert.deepEqual(engine.loads, ['B']);
  assert.equal(engine.end, null);
});

test('加载期间 seek 不会丢失歌曲，结束事件使用 seek 后的版本且只发送一次', async (t) => {
  const engine = new FakeEngine();
  const resolver = deferredResolver();
  const sent: ClientMessage[] = [];
  const sync = new PlaybackSync(engine, resolver.resolve, (msg) => sent.push(msg), () => 0);
  t.after(() => sync.dispose());
  sync.apply(playback('A', 1));
  sync.apply(playback('A', 2, 60_000));
  resolver.requests[0].finish('old-A');
  resolver.requests[1].finish('new-A');
  await flush();
  assert.deepEqual(engine.loads, ['new-A']);
  assert.ok(engine.currentMs >= 60_000);
  const oldEnd = engine.end!;
  sync.apply(playback('A', 3, 90_000));
  oldEnd();
  assert.equal(sent.length, 0);
  engine.end!();
  engine.end!();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'advance_playback');
  if (sent[0].type === 'advance_playback') assert.equal(sent[0].payload.expectedPlaybackSeq, 3);
});

test('重复入队的同一歌曲切换时重新加载；旧版本广播不能倒退播放', async (t) => {
  const engine = new FakeEngine();
  const resolver = deferredResolver();
  const sent: ClientMessage[] = [];
  const sync = new PlaybackSync(engine, resolver.resolve, (msg) => sent.push(msg), () => 0);
  t.after(() => sync.dispose());
  sync.apply(playback('A', 1, 170_000));
  resolver.requests[0].finish('first-A');
  await flush();
  const oldEnd = engine.end!;
  sync.apply(playback('A', 2), { restart: true });
  oldEnd();
  resolver.requests[1].finish('second-A');
  await flush();
  const currentEnd = engine.end;
  sync.apply(playback('A', 1, 170_000));
  assert.deepEqual(engine.loads, ['first-A', 'second-A']);
  assert.equal(engine.end, currentEnd);
  assert.equal(sent.length, 0);
  assert.ok(engine.currentMs < 170_000);
});
