import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HeartStore, HEART_WINDOW_MS } from '../src/charts/heart.store';
import { ChartsController } from '../src/charts/charts.module';
import type { Track } from '@lune/shared';
import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import { JwtService } from '@nestjs/jwt';
import { RoomStore } from '../src/rooms/room.store';
import { RoomsService } from '../src/rooms/rooms.service';
import { ConnectionRegistry } from '../src/sync/connection.registry';
import { SyncGateway } from '../src/sync/sync.gateway';
import type { ProviderRegistry } from '../src/providers/provider.registry';

const track: Track = { id: '1', provider: 'netease', name: '月光', artists: '测试歌手', album: '夜', coverUrl: '', duration: 180000 };

test('gateway: membership, validation, replay, rate protection and persistence acknowledgements', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lune-hearts-'));
  try {
    const hearts = new HeartStore(join(dir, 'hearts.json'));
    const rooms = new RoomStore();
    const room = rooms.createRoom();
    const member = room.addMember('测试');
    const connections = new ConnectionRegistry();
    const jwt = new JwtService({ secret: 'test-only' });
    const providers = { getDefaultId: () => 'netease', getActiveById: (id: string) => id === 'netease' } as unknown as ProviderRegistry;
    const gateway = new SyncGateway(jwt, new RoomsService(rooms, jwt), rooms, connections, hearts, providers);
    const responses: Array<{ type: string; payload: { requestId: string } }> = [];
    const socket = Object.assign(new EventEmitter(), { OPEN: 1, readyState: 1, send: (raw: string) => responses.push(JSON.parse(raw)) }) as unknown as WebSocket;
    gateway.handleConnection(socket);
    const send = (payload: unknown) => socket.emit('message', Buffer.from(JSON.stringify({ type: 'send_heart', payload })));
    const waitFor = async (count: number) => {
      for (let i = 0; i < 100 && responses.length < count; i++) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(responses.length, count);
    };
    send({ requestId: 'unjoined', track });
    await waitFor(1);
    assert.equal(responses[0].type, 'heart_failed');
    connections.bind(socket, { memberId: member.id, roomCode: room.code, nickname: member.nickname });
    send({ requestId: 'valid', track: { ...track, provider: undefined } });
    await waitFor(2);
    assert.equal(responses[1].type, 'heart_recorded');
    assert.equal(new HeartStore(join(dir, 'hearts.json')).chart().tracks[0].heartCount, 1);
    send({ requestId: 'valid', track });
    await waitFor(3);
    assert.equal(hearts.chart().tracks[0].heartCount, 1);
    for (const payload of [{ track }, { requestId: 'bad-source', track: { ...track, provider: 'missing' } }, { requestId: 'large', track: { ...track, name: 'a'.repeat(9000) } }]) send(payload);
    await waitFor(6);
    assert.ok(responses.slice(3).every((response) => response.type === 'heart_failed'));
    for (let i = 0; i < 30; i++) send({ requestId: `burst-${i}`, track });
    await waitFor(36);
    assert.ok(responses.slice(6).some((response) => response.type === 'heart_failed'));
    assert.equal(hearts.chart().tracks[0].heartCount, responses.filter((response) => response.type === 'heart_recorded').length - 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('hearts: concurrent clicks, duplicate deliveries and restart are counted correctly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lune-hearts-'));
  try {
    const path = join(dir, 'hearts.json');
    const store = new HeartStore(path);
    const now = Date.now();
    await Promise.all(Array.from({ length: 15 }, (_, i) => store.record(`click-${i}`, track, now)));
    await store.record('click-0', track, now);
    assert.equal(store.chart('all', 20, now).tracks[0].heartCount, 15);
    const reloaded = new HeartStore(path);
    await reloaded.record('click-0', track, now);
    assert.equal(reloaded.chart('all', 20, now).tracks[0].heartCount, 15);
    await assert.rejects(reloaded.record('click-0', { ...track, provider: 'kugou' }, now));
    assert.equal(reloaded.chart('all', 20, now).tracks.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('hearts: exact 168-hour cutoff, lifetime count, provider isolation and stable ordering', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lune-hearts-'));
  try {
    const path = join(dir, 'hearts.json');
    const store = new HeartStore(path);
    const now = 1800000123456;
    await store.record('expired', track, now - HEART_WINDOW_MS);
    await store.record('edge', track, now - HEART_WINDOW_MS + 1);
    await store.record('latest', { ...track, id: '2' }, now);
    await store.record('other-provider', { ...track, provider: 'kugou' }, now);
    const chart = store.chart('all', 20, now);
    assert.deepEqual(chart.tracks.map((row) => [row.track.provider, row.track.id, row.heartCount]), [['kugou', '1', 1], ['netease', '2', 1], ['netease', '1', 1]]);
    assert.equal(store.chart('netease', 1, now).tracks[0].track.id, '2');
    assert.equal(store.chart('all', 20, now + HEART_WINDOW_MS).tracks.length, 0);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(saved.tracks[JSON.stringify(['netease', '1'])].lifetimeHeartCount, 2);
    assert.throws(() => new ChartsController(store).hot('1d'));
    assert.throws(() => new ChartsController(store).hot('7d', '0'));
    assert.throws(() => new ChartsController(store).hot('7d', 'NaN'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('hearts: failed persistence never publishes a count and a retry can succeed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lune-hearts-'));
  try {
    const parent = join(dir, 'blocked');
    const store = new HeartStore(join(parent, 'hearts.json'));
    await writeFile(parent, 'not a directory');
    await assert.rejects(store.record('retry', track));
    assert.equal(store.chart().tracks.length, 0);
    await rm(parent);
    await store.record('retry', track);
    assert.equal(store.chart().tracks[0].heartCount, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
