import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { JwtService } from '@nestjs/jwt';
import type { WebSocket } from 'ws';
import type { ClientMessage, ProviderResolveResult, ServerMessage, Track } from '@lune/shared';
import { RoomStore } from '../src/rooms/room.store';
import { RoomsService } from '../src/rooms/rooms.service';
import { ConnectionRegistry } from '../src/sync/connection.registry';
import { SyncGateway } from '../src/sync/sync.gateway';
import type { ProviderRegistry } from '../src/providers/provider.registry';
import type { HeartStore } from '../src/charts/heart.store';

const track = (id: string): Track => ({ id, provider: 'test', name: id, artists: '', album: '', coverUrl: '', duration: 180_000 });
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(resolve: (id: string) => Promise<ProviderResolveResult>) {
  const store = new RoomStore();
  const room = store.createRoom();
  const conns = new ConnectionRegistry();
  const jwt = new JwtService({ secret: 'test-only' });
  const provider = { resolve };
  const registry = { getActiveById: () => provider, getActive: () => provider } as unknown as ProviderRegistry;
  const gateway = new SyncGateway(jwt, new RoomsService(store, jwt), store, conns, {} as HeartStore, registry);
  const clients = ['Alice', 'Bob', 'Carol'].map((name) => {
    const member = room.addMember(name);
    const messages: ServerMessage[] = [];
    const ws = Object.assign(new EventEmitter(), {
      OPEN: 1, readyState: 1, send: (raw: string) => messages.push(JSON.parse(raw)),
    }) as unknown as WebSocket;
    gateway.handleConnection(ws);
    const send = (message: ClientMessage) => ws.emit('message', Buffer.from(JSON.stringify(message)));
    send({ type: 'join', payload: { token: jwt.sign({ roomCode: room.code, memberId: member.id, nickname: name }) } });
    return { messages, send };
  });
  room.play(track('A'), 0, 0);
  room.enqueueMany(['B', 'C', 'D'].map(track), 'Alice');
  const advance = (reason: 'manual' | 'ended' | 'unplayable'): ClientMessage => ({
    type: 'advance_playback', payload: {
      requestId: `request-${reason}`, reason,
      expectedPlaybackSeq: room.playback.seq,
      expectedTrackKey: `test:${room.playback.track!.id}`,
    },
  });
  return { room, clients, advance };
}

test('真实网关分发：排序后阻止有效版本的提前结束，广播提供独立服务器时间', async (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const { room, clients, advance } = setup(async (id) => ({ track: track(id), url: id }));
  const [b, c] = room.queue;
  now += 90_000;
  clients[1].send({ type: 'reorder_queue_item', payload: { itemId: c.id, beforeItemId: b.id, expectedQueueRevision: room.queueRevision } });
  const reordered = clients[0].messages.at(-1)!;
  assert.equal(reordered.type, 'room_state_changed');
  if (reordered.type === 'room_state_changed') {
    assert.equal(reordered.payload.serverTime, now);
    assert.equal(reordered.payload.playback.serverTimestamp, now - 90_000);
  }
  clients[1].send(advance('ended'));
  await flush();
  assert.equal(room.playback.track?.id, 'A');
  now += 90_000;
  const ended = advance('ended');
  clients.forEach((client) => client.send(ended));
  await flush();
  assert.equal(room.playback.track?.id, 'C');
  // 即使异常客户端取得新版本后立刻再报 ended，也只能得到 resync。
  clients[2].send(advance('ended'));
  await flush();
  assert.equal(room.playback.track?.id, 'C');
  assert.deepEqual(room.queue.map((item) => item.track.id), ['B', 'D']);
  assert.ok(clients[0].messages.some((msg) => msg.type === 'joined' && msg.payload.serverTime !== undefined));
});

test('一个成员报告不可播，服务端复核有 URL 时不能跳过正在播放的歌', async () => {
  const { room, clients, advance } = setup(async (id) => ({ track: track(id), url: 'playable', unplayable: false }));
  clients[1].send(advance('unplayable'));
  await flush();
  assert.equal(room.playback.track?.id, 'A');
  assert.equal(room.queue.length, 3);
});

test('多人不可播报告合并复核，确认后只推进一次；复核过期不能切新歌', async () => {
  let finish!: (result: ProviderResolveResult) => void;
  let calls = 0;
  const { room, clients, advance } = setup(() => {
    calls++;
    return new Promise((resolve) => { finish = resolve; });
  });
  const message = advance('unplayable');
  clients.forEach((client) => client.send(message));
  await flush();
  assert.equal(calls, 1);
  finish({ track: track('A'), url: null, unplayable: true });
  await flush();
  assert.equal(room.playback.track?.id, 'B');
  assert.equal(room.queue.length, 2);
  clients[0].send(advance('unplayable'));
  await flush();
  clients[1].send(advance('manual'));
  finish({ track: track('B'), url: null, unplayable: true });
  await flush();
  assert.equal(room.playback.track?.id, 'C');
  assert.equal(room.queue.length, 1);
});

test('音乐源复核异常或未确认不可播，都保留队列', async () => {
  for (const resolve of [
    async (): Promise<ProviderResolveResult> => { throw new Error('rate limited'); },
    async () => ({ track: track('A'), url: null, unplayable: false }),
  ]) {
    const { room, clients, advance } = setup(resolve);
    clients[0].send(advance('unplayable'));
    await flush();
    assert.equal(room.playback.track?.id, 'A');
    assert.equal(room.queue.length, 3);
  }
});
