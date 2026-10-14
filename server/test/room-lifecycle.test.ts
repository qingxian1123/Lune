import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { JwtService } from '@nestjs/jwt';
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, Track } from '@lune/shared';
import { RoomStore } from '../src/rooms/room.store';
import { RoomsService } from '../src/rooms/rooms.service';
import { SyncGateway } from '../src/sync/sync.gateway';
import { ConnectionRegistry } from '../src/sync/connection.registry';
import type { HeartStore } from '../src/charts/heart.store';
import type { ProviderRegistry } from '../src/providers/provider.registry';

const RETENTION = 86_400_000;
const GRACE = 30_000;
const track = (id: string, duration = 180_000): Track => ({
  id, provider: 'test', name: id, artists: '', album: '', coverUrl: '', duration,
});

function socket(gateway: SyncGateway) {
  const messages: ServerMessage[] = [];
  const ws = Object.assign(new EventEmitter(), {
    OPEN: 1, readyState: 1,
    send: (raw: string) => messages.push(JSON.parse(raw)),
    close: () => { Object.assign(ws, { readyState: 3 }); gateway.handleDisconnect(ws); },
  }) as unknown as WebSocket;
  gateway.handleConnection(ws);
  return {
    ws, messages,
    send(message: ClientMessage) { ws.emit('message', Buffer.from(JSON.stringify(message))); },
    disconnect() { Object.assign(ws, { readyState: 3 }); gateway.handleDisconnect(ws); },
  };
}

test('断线 32 秒后仍能查询并用原身份恢复，查询不延长 24 小时期限', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new RoomStore({ now: () => now, retentionMs: RETENTION, graceMs: GRACE });
  const service = new RoomsService(store, new JwtService({ secret: 'test-only' }));
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  service.connect(created.code, created.member.id, room.id);
  service.disconnect(created.code, created.member.id);
  const expiresAt = room.expiresAt;
  assert.equal(expiresAt, now + RETENTION);
  now += 32_000;
  store.sweep();
  assert.equal(service.snapshot(created.code).members.length, 0);
  assert.equal(room.hasIdentity(created.member.id, now), true);
  assert.equal(room.expiresAt, expiresAt);
  now += 60_000;
  service.snapshot(created.code);
  assert.equal(room.expiresAt, expiresAt);
  const recovered = service.connect(created.code, created.member.id, room.id);
  assert.equal(recovered.member.id, created.member.id);
  assert.equal(room.members.size, 1);
  assert.equal(room.onlineMembers.size, 1);
  assert.equal(room.expiresAt, null);
  assert.equal(room.emptySince, null);
});

test('24 小时截止前可搜索，截止时过期并使身份失效；HTTP 入场不延期', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new RoomStore({ now: () => now, retentionMs: RETENTION, graceMs: GRACE });
  const service = new RoomsService(store, new JwtService({ secret: 'test-only' }));
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  service.connect(created.code, created.member.id, room.id);
  service.disconnect(created.code, created.member.id);
  const cutoff = room.expiresAt!;
  now = cutoff - 1;
  assert.equal(service.snapshot(created.code).code, created.code);
  service.join(created.code, 'Unconnected');
  assert.equal(room.expiresAt, cutoff);
  now = cutoff;
  assert.equal(store.getRoom(created.code), undefined);
  assert.throws(() => service.connect(created.code, created.member.id, room.id));
});

test('宽限期内重连取消旧清理，恢复后的在线房间不会被过期扫描删除', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new RoomStore({ now: () => now, retentionMs: RETENTION, graceMs: GRACE });
  const service = new RoomsService(store, new JwtService({ secret: 'test-only' }));
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  service.connect(created.code, created.member.id, room.id);
  service.disconnect(created.code, created.member.id);
  now += GRACE - 1;
  service.connect(created.code, created.member.id, room.id);
  now += RETENTION;
  store.sweep();
  assert.equal(store.getRoom(created.code), room);
  assert.equal(room.members.has(created.member.id), true);
  assert.equal(room.memberDeadlines.has(created.member.id), false);
});

test('主动退出撤销身份且保留房间；跨房间内部 ID 的 token 身份被拒绝', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new RoomStore({ now: () => now, retentionMs: RETENTION, graceMs: GRACE });
  const jwt = new JwtService({ secret: 'test-only' });
  const service = new RoomsService(store, jwt);
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  assert.equal(jwt.verify(created.token).roomId, room.id);
  assert.throws(() => service.connect(created.code, created.member.id, 'another-room-id'));
  service.connect(created.code, created.member.id, room.id);
  service.leave(created.code, created.member.id);
  assert.equal(store.getRoom(created.code), room);
  assert.equal(room.hasIdentity(created.member.id, now), false);
  assert.throws(() => service.connect(created.code, created.member.id, room.id));
});

test('只取得 HTTP 入场身份而没有 WebSocket 的成员不会永久保住房间', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new RoomStore({ now: () => now, retentionMs: RETENTION, graceMs: GRACE });
  const service = new RoomsService(store, new JwtService({ secret: 'test-only' }));
  const created = service.create('Never connected');
  now += 60_001;
  store.sweep();
  const room = store.getRoom(created.code)!;
  assert.equal(room.onlineMembers.size, 0);
  assert.equal(room.members.size, 0);
  assert.notEqual(room.expiresAt, null);
  now += RETENTION;
  assert.equal(store.getRoom(created.code), undefined);
});

test('全员离线冻结播放，长时间休眠不消耗队列，恢复会更新播放版本', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new RoomStore({ now: () => now, retentionMs: RETENTION, graceMs: GRACE });
  const service = new RoomsService(store, new JwtService({ secret: 'test-only' }));
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  service.connect(created.code, created.member.id, room.id);
  room.play(track('A'), 1_000, room.playback.seq);
  room.enqueueMany([track('B'), track('C')], created.member.id);
  service.disconnect(created.code, created.member.id);
  now += GRACE;
  store.sweep();
  assert.equal(room.dormant, true);
  const frozenPosition = room.playback.position;
  const frozenSeq = room.playback.seq;
  assert.equal(frozenPosition, 31_000);
  now += 3_600_000;
  store.sweep();
  assert.equal(room.playback.position, frozenPosition);
  assert.deepEqual(room.queue.map((item) => item.track.id), ['B', 'C']);
  service.connect(created.code, created.member.id, room.id);
  assert.equal(room.dormant, false);
  assert.equal(room.playback.position, frozenPosition);
  assert.equal(room.playback.serverTimestamp, now);
  assert.ok(room.playback.seq > frozenSeq);
  assert.equal(room.advance(frozenSeq, 'test:A'), false);
});

test('房间文件恢复房间码、队列 ID、播放和原身份，反复重启不延长过期时间', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const dataDir = mkdtempSync(join(tmpdir(), 'lune-rooms-recovery-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const options = { dataDir, now: () => now, retentionMs: RETENTION, graceMs: GRACE };
  const store = new RoomStore(options);
  const service = new RoomsService(store, new JwtService({ secret: 'test-only' }));
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  service.connect(created.code, created.member.id, room.id);
  store.transact(room, () => {
    room.play(track('A'), 10_000, room.playback.seq);
    room.enqueueMany([track('B'), track('B')], created.member.id);
  });
  service.disconnect(created.code, created.member.id);
  now += GRACE;
  store.sweep();
  store.persist(room);
  const cutoff = room.expiresAt;
  const queueIds = room.queue.map((item) => item.id);
  const frozenPosition = room.playback.position;
  now += 60_000;
  const recoveredStore = new RoomStore(options);
  const recovered = recoveredStore.getRoom(created.code)!;
  assert.equal(recovered.id, room.id);
  assert.equal(recovered.onlineMembers.size, 0);
  assert.equal(recovered.hasIdentity(created.member.id, now), true);
  assert.equal(recovered.expiresAt, cutoff);
  assert.deepEqual(recovered.queue.map((item) => item.id), queueIds);
  assert.equal(recovered.playback.track?.id, 'A');
  assert.equal(recovered.playback.position, frozenPosition);
  recoveredStore.persist(recovered);
  now += 60_000;
  const restarted = new RoomStore(options);
  assert.equal(restarted.getRoom(created.code)!.expiresAt, cutoff);
  now = cutoff!;
  assert.equal(new RoomStore(options).getRoom(created.code), undefined);
});

test('休眠前歌曲已经播完，唤醒最多推进一次并保持后续队列', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new RoomStore({ now: () => now, retentionMs: RETENTION, graceMs: GRACE });
  const service = new RoomsService(store, new JwtService({ secret: 'test-only' }));
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  service.connect(created.code, created.member.id, room.id);
  room.play(track('short', 10_000), 0, room.playback.seq);
  room.enqueueMany([track('B'), track('C')], created.member.id);
  service.disconnect(created.code, created.member.id);
  now += 3_600_000;
  store.sweep();
  assert.equal(room.playback.position, 10_000);
  service.connect(created.code, created.member.id, room.id);
  assert.equal(room.playback.track?.id, 'B');
  assert.equal(room.playback.position, 0);
  assert.equal(room.playback.serverTimestamp, now);
  assert.deepEqual(room.queue.map((item) => item.track.id), ['C']);
  // 同一身份的第二条连接不能再次推进。
  service.connect(created.code, created.member.id, room.id);
  assert.equal(room.playback.track?.id, 'B');
  assert.deepEqual(room.queue.map((item) => item.track.id), ['C']);
});

test('在线房间异常退出按持久化检查点恢复；不会因重启无限续期', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const dataDir = mkdtempSync(join(tmpdir(), 'lune-rooms-checkpoint-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const options = { dataDir, now: () => now, retentionMs: RETENTION, graceMs: GRACE };
  const store = new RoomStore(options);
  const service = new RoomsService(store, new JwtService({ secret: 'test-only' }));
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  service.connect(created.code, created.member.id, room.id);
  store.persist(room);
  const checkpoint = now;
  now += 60_000;
  const recoveredStore = new RoomStore(options);
  const recovered = recoveredStore.getRoom(created.code)!;
  assert.equal(recovered.onlineMembers.size, 0);
  assert.equal(recovered.emptySince, checkpoint);
  assert.equal(recovered.expiresAt, checkpoint + RETENTION);
  recoveredStore.persist(recovered);
  now += 60_000;
  assert.equal(new RoomStore(options).getRoom(created.code)!.expiresAt, checkpoint + RETENTION);
});

test('损坏的已保存房间使启动报错，不静默变成空房间库', (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'lune-rooms-corrupt-'));
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  const store = new RoomStore({ dataDir });
  const room = store.createRoom();
  store.persist(room);
  const file = readdirSync(dataDir).find((name) => name.endsWith('.json'));
  assert.ok(file);
  const path = join(dataDir, file);
  assert.doesNotThrow(() => JSON.parse(readFileSync(path, 'utf8')));
  writeFileSync(path, '{invalid', 'utf8');
  assert.throws(() => new RoomStore({ dataDir }));
  writeFileSync(path, JSON.stringify({ version: 1, code: room.code, queue: [] }), 'utf8');
  assert.throws(() => new RoomStore({ dataDir }));
});

test('保存失败回滚同一房间对象的队列与播放，避免广播未持久化的状态', (t) => {
  const parent = mkdtempSync(join(tmpdir(), 'lune-rooms-failure-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dataDir = join(parent, 'rooms');
  const store = new RoomStore({ dataDir });
  const room = store.createRoom();
  const before = JSON.stringify(room.toSnapshot());
  // 使用普通文件占据目录位置，模拟所有平台都可重现的磁盘写入失败。
  rmSync(dataDir, { recursive: true, force: true });
  writeFileSync(dataDir, 'not a directory', 'utf8');
  assert.throws(() => store.transact(room, () => {
    room.enqueue(track('must roll back'), 'Alice');
    room.play(track('must roll back'), 0, room.playback.seq);
  }));
  assert.equal(JSON.stringify(room.toSnapshot()), before);
});

test('断线写盘失败仍清理在线状态，磁盘恢复后重试保存且不延长保留期', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const parent = mkdtempSync(join(tmpdir(), 'lune-rooms-disconnect-failure-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dataDir = join(parent, 'rooms');
  const options = { dataDir, now: () => now, retentionMs: RETENTION, graceMs: GRACE };
  const store = new RoomStore(options);
  const service = new RoomsService(store, new JwtService({ secret: 'test-only' }));
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  service.connect(created.code, created.member.id, room.id);
  store.persist(room);
  rmSync(dataDir, { recursive: true, force: true });
  writeFileSync(dataDir, 'not a directory', 'utf8');
  now += 10_000;
  const disconnectedAt = now;
  assert.throws(() => service.disconnect(created.code, created.member.id));
  assert.equal(room.onlineMembers.has(created.member.id), false);
  assert.equal(room.emptySince, disconnectedAt);
  assert.equal(room.expiresAt, disconnectedAt + RETENTION);
  // 房间状态已经离线，数据目录恢复后维护循环必须补写原断线时间。
  rmSync(dataDir);
  now += 1_000;
  store.sweep();
  assert.equal(room.dormant, false);
  const restored = new RoomStore(options).getRoom(created.code)!;
  assert.equal(restored.onlineMembers.size, 0);
  assert.equal(restored.emptySince, disconnectedAt);
  assert.equal(restored.expiresAt, disconnectedAt + RETENTION);
  assert.equal(restored.hasIdentity(created.member.id, now), true);
  now = disconnectedAt + GRACE + 1;
  store.sweep();
  assert.equal(room.dormant, true);
  assert.equal(new RoomStore(options).getRoom(created.code)!.expiresAt, disconnectedAt + RETENTION);
});

test('真实网关：同一身份新连接加入后旧连接关闭不能触发空房清理', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new RoomStore({ now: () => now, retentionMs: RETENTION, graceMs: GRACE });
  const jwt = new JwtService({ secret: 'test-only' });
  const service = new RoomsService(store, jwt);
  const created = service.create('Alice');
  const gateway = new SyncGateway(jwt, service, store, new ConnectionRegistry(), {} as HeartStore, {} as ProviderRegistry);
  const oldSocket = socket(gateway);
  const newSocket = socket(gateway);
  oldSocket.send({ type: 'join', payload: { token: created.token } });
  newSocket.send({ type: 'join', payload: { token: created.token } });
  assert.ok(newSocket.messages.some((message) => message.type === 'joined'));
  oldSocket.disconnect();
  now += GRACE + 1;
  store.sweep();
  const room = store.getRoom(created.code)!;
  assert.equal(room.onlineMembers.has(created.member.id), true);
  assert.equal(room.members.has(created.member.id), true);
  assert.equal(room.expiresAt, null);
  newSocket.send({ type: 'add_song', payload: { track: track('still online') } });
  assert.equal(room.queue.length, 1);
  newSocket.disconnect();
  now += GRACE + 1;
  store.sweep();
  assert.equal(room.members.size, 0);
  assert.equal(room.hasIdentity(created.member.id, now), true);
  assert.equal(store.getRoom(created.code), room);
  const restoredSocket = socket(gateway);
  restoredSocket.send({ type: 'join', payload: { token: created.token } });
  const joined = restoredSocket.messages.find((message) => message.type === 'joined');
  assert.equal(joined?.type, 'joined');
  if (joined?.type === 'joined') assert.equal(joined.payload.memberId, created.member.id);
});

test('真实网关：主动退出撤销同一身份的所有连接，其他连接不能继续改队列', (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, 'now', () => now);
  const store = new RoomStore({ now: () => now, retentionMs: RETENTION, graceMs: GRACE });
  const jwt = new JwtService({ secret: 'test-only' });
  const service = new RoomsService(store, jwt);
  const created = service.create('Alice');
  const room = store.getRoom(created.code)!;
  const gateway = new SyncGateway(jwt, service, store, new ConnectionRegistry(), {} as HeartStore, {} as ProviderRegistry);
  const first = socket(gateway);
  const second = socket(gateway);
  first.send({ type: 'join', payload: { token: created.token } });
  second.send({ type: 'join', payload: { token: created.token } });
  first.send({ type: 'leave', payload: {} });
  assert.ok(first.messages.some((message) => message.type === 'left'));
  assert.equal(room.hasIdentity(created.member.id, now), false);
  second.send({ type: 'add_song', payload: { track: track('must not enqueue') } });
  assert.equal(room.queue.length, 0);
  const outsider = socket(gateway);
  outsider.send({ type: 'join', payload: { token: created.token } });
  assert.equal(outsider.messages.at(-1)?.type, 'error');
  assert.equal(store.getRoom(created.code), room);
});
