import assert from 'node:assert/strict';
import test from 'node:test';
import { PlaybackRecovery, type RecoveryEngine } from '../../apps/client/src/audio/PlaybackRecovery';
import { ApiError, boundedRequest } from '../../apps/client/src/lib/apiError';
import { playbackDiagnosticReport, recordPlaybackEvent } from '../../apps/client/src/lib/playbackDiagnostics';
import type { EngineSnapshot, MediaResult } from '../../apps/client/src/audio/playbackTypes';
import type { PlaybackState } from '@lune/shared';

const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const pb: PlaybackState = { status: 'playing', seq: 1, position: 0, serverTimestamp: 0,
  track: { id: 'one', provider: 'test', name: '', artists: '', album: '', coverUrl: '', duration: 180000 } };
class Engine implements RecoveryEngine {
  snapshot: EngineSnapshot = { playing: false, buffering: false, hold: 'none', failure: null, position: 0, readyState: 4, seeking: false };
  calls: string[] = [];
  listeners = new Set<(state: EngineSnapshot) => void>();
  result: MediaResult = { status: 'playing' };
  load(url: string): Promise<MediaResult> { this.calls.push(url); return Promise.resolve(this.result); }
  resume(): Promise<MediaResult> { this.calls.push('resume'); return Promise.resolve(this.result); }
  stop() { this.snapshot.playing = false; }
  unlock() {}
  releaseHold() { this.snapshot.hold = 'none'; }
  setHold(reason: 'noisy' | 'manual') { this.snapshot.hold = reason; this.emit(); }
  subscribe(fn: (state: EngineSnapshot) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit() { this.listeners.forEach((fn) => fn(this.snapshot)); }
}

test('解析失败预算不会被重连刷新；明确手动重试可重开一轮', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const engine = new Engine(); let requests = 0;
  const recovery = new PlaybackRecovery(engine, async () => { requests++; throw new ApiError('', 0, 'RESOLVE_NETWORK'); }, () => assert.fail('不能跳歌'), () => 100, () => 0.5);
  t.after(() => recovery.dispose());
  recovery.prepare(pb, () => 1000, true);
  await recovery.start();
  t.mock.timers.tick(1000); await flush();
  t.mock.timers.tick(3000); await flush();
  assert.equal(requests, 3);
  assert.equal(recovery.state.phase, 'failed');
  recovery.setConnected(false); recovery.setConnected(true);
  recovery.prepare({ ...pb, seq: 2 }, () => 5000, false);
  await recovery.start();
  assert.equal(requests, 3);
  await recovery.retry();
  assert.equal(requests, 4);
});

test('旧解析、耳机限制与并发恢复不会启动过期媒体', async (t) => {
  const engine = new Engine();
  let finish: (value: { track: NonNullable<PlaybackState['track']>; url: string }) => void = () => {};
  const recovery = new PlaybackRecovery(engine, () => new Promise((resolve) => { finish = resolve; }), () => assert.fail());
  t.after(() => recovery.dispose());
  recovery.prepare(pb, () => 0, true);
  const first = recovery.start();
  assert.equal(recovery.start(), first);
  recovery.hold('noisy');
  finish({ track: pb.track!, url: 'old' });
  await first;
  assert.deepEqual(engine.calls, []);
  assert.equal(recovery.state.hold, 'noisy');
  await recovery.start();
  assert.deepEqual(engine.calls, []);
});

test('媒体网络恢复先重载，再重新解析；Provider 登录失效不自动重试', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const engine = new Engine(); engine.result = { status: 'failed', code: 'MEDIA_NETWORK' };
  let requests = 0;
  const recovery = new PlaybackRecovery(engine, async () => ({ track: pb.track!, url: String(++requests) }), () => assert.fail(), () => 100, () => 0.5);
  t.after(() => recovery.dispose());
  recovery.prepare(pb, () => 0, true); await recovery.start();
  t.mock.timers.tick(1000); await flush();
  t.mock.timers.tick(3000); await flush();
  assert.deepEqual(engine.calls, ['1', '1', '2']);
  const auth = new PlaybackRecovery(new Engine(), async () => { throw new ApiError('', 503, 'PROVIDER_AUTH_REQUIRED', false); }, () => assert.fail());
  t.after(() => auth.dispose());
  auth.prepare(pb, () => 0, true); await auth.start();
  assert.equal(auth.state.phase, 'failed');
  assert.equal(auth.state.attempt, 0);
});

test('请求取消和超时都能终止不响应的读取且原因不同', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  let aborted = false;
  const cancelled = boundedRequest((signal) => { signal.addEventListener('abort', () => { aborted = true; }); return new Promise(() => {}); }, controller.signal);
  const cancellation = assert.rejects(cancelled, { name: 'AbortError' });
  controller.abort(); await cancellation; assert.equal(aborted, true);
  const timed = boundedRequest(() => new Promise(() => {}), undefined, 50);
  const timeout = assert.rejects(timed, { code: 'RESOLVE_TIMEOUT' });
  t.mock.timers.tick(50); await timeout;
  const rejectingOnAbort = boundedRequest((signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted fetch', 'AbortError')));
  }), undefined, 50);
  const deadline = assert.rejects(rejectingOnAbort, { code: 'RESOLVE_TIMEOUT' });
  t.mock.timers.tick(50); await deadline;
});

test('诊断白名单丢弃任意敏感字段并限制事件和字节数', () => {
  for (let i = 0; i < 600; i++) recordPlaybackEvent({ event: 'media', attempt: i,
    ...{ token: 'secret-token', url: 'https://private/song', code: 'https://private/token' } });
  const report = playbackDiagnosticReport();
  assert.ok(!report.includes('secret-token')); assert.ok(!report.includes('https://'));
  assert.ok(JSON.parse(report).events.length <= 300);
  assert.ok(Buffer.byteLength(report) <= 256 * 1024);
});

test('恢复成功不立即刷新预算，持续自然播放二十秒才刷新', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 100;
  const engine = new Engine(); engine.result = { status: 'failed', code: 'MEDIA_NETWORK' };
  const recovery = new PlaybackRecovery(engine, async () => ({ track: pb.track!, url: 'one' }), () => assert.fail(), () => now, () => 0.5);
  t.after(() => recovery.dispose());
  recovery.prepare(pb, () => 0, true); await recovery.start();
  engine.result = { status: 'playing' };
  t.mock.timers.tick(1000); await flush();
  assert.equal(recovery.state.attempt, 1);
  engine.snapshot.playing = true;
  for (let i = 0; i <= 4; i++) {
    now = 100 + i * 5000; engine.snapshot.position = i * 5000; recovery.sample();
  }
  engine.snapshot.failure = 'MEDIA_NETWORK'; engine.snapshot.playing = false; engine.emit(); await flush();
  assert.equal(recovery.state.attempt, 1, '新的故障使用刷新后的第一档预算');
});

test('正常结束取消解析与恢复期限，晚结果不能重新启动', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const engine = new Engine();
  let finish: (value: { track: NonNullable<PlaybackState['track']>; url: string }) => void = () => {};
  const recovery = new PlaybackRecovery(engine, () => new Promise((resolve) => { finish = resolve; }), () => assert.fail());
  t.after(() => recovery.dispose());
  recovery.prepare(pb, () => 0, true);
  const pending = recovery.start(); recovery.ended();
  await pending;
  finish({ track: pb.track!, url: 'late' }); await flush();
  t.mock.timers.tick(60000); await flush();
  assert.equal(recovery.state.code, 'NEXT_TRACK');
  assert.equal(recovery.state.phase, 'waiting');
  assert.deepEqual(engine.calls, []);
});
