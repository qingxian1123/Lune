import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioEngine } from '../../apps/client/src/audio/AudioEngine';
import type { MediaResult } from '../../apps/client/src/audio/playbackTypes';

class FakeAudio extends EventTarget {
  src = ''; currentTime = 0; duration = 180; ended = false; paused = true;
  readyState = 4; seeking = false; volume = 1;
  error: { code: number } | null = null;
  failure: Error | null = null;
  pending: Array<() => void> = [];
  load() { this.currentTime = 0; this.ended = false; this.error = null; }
  play(): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    this.paused = false;
    return new Promise<void>((resolve) => this.pending.push(resolve));
  }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  removeAttribute() { this.src = ''; }
}

test('音频执行器：取消、实际进度确认、系统限制及旧事件隔离', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let now = 100;
  t.mock.method(performance, 'now', () => now);
  const audio = new FakeAudio();
  let context: FakeContext;
  class FakeContext extends EventTarget {
    state = 'running'; currentTime = 0; resumes = 0;
    constructor() { super(); context = this; }
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: { value: 1, cancelAndHoldAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
    createMediaElementSource() { return { connect: (gain: unknown) => gain }; }
  }
  const replacements = {
    Audio: function () { return audio; },
    window: { AudioContext: FakeContext },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  };
  const originals = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const engine = AudioEngine.instance();
  t.after(() => {
    engine.stop();
    for (const key of Object.keys(replacements)) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]!);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const tick = (ms: number) => { now += ms; t.mock.timers.tick(ms); };
  const complete = async (operation: Promise<MediaResult>) => {
    audio.pending.at(-1)!(); await flush();
    audio.currentTime += 0.1; tick(100); await flush();
    return operation;
  };
  const reset = () => {
    engine.stop(); engine.releaseHold(); audio.failure = null; audio.error = null; audio.readyState = 4;
  };

  await t.test('新加载和 stop 取消旧任务；旧位置不会写入新源', async () => {
    const first = engine.load('A', 170000);
    const second = engine.load('B', 0);
    assert.equal((await first).status, 'cancelled');
    audio.pending[0](); await flush();
    assert.equal((await complete(second)).status, 'playing');
    assert.equal(audio.src, 'B'); assert.ok(audio.currentTime < 1);
    const stopped = engine.load('C'); engine.stop();
    assert.equal((await stopped).status, 'cancelled');
    assert.equal(audio.src, '');
  });

  await t.test('play Promise 完成但没有自然进度不能宣称恢复成功', async () => {
    reset();
    const operation = engine.load('stuck');
    audio.pending.at(-1)!(); await flush();
    assert.equal(engine.isPlaying, false);
    tick(3000);
    assert.deepEqual(await operation, { status: 'failed', code: 'MEDIA_START_TIMEOUT' });
    assert.equal(audio.paused, true);
    audio.paused = false; audio.dispatchEvent(new Event('playing'));
    assert.equal(audio.paused, true, '超时任务的迟到 playing 必须被阻止');
  });

  await t.test('请求取消立刻停止未完成启动，旧取消不影响新任务', async () => {
    reset();
    const controller = new AbortController();
    const old = engine.load('cancel', 0, controller.signal);
    const current = engine.load('current', 42000);
    controller.abort();
    assert.equal((await old).status, 'cancelled');
    assert.equal((await complete(current)).status, 'playing');
    assert.ok(engine.currentMs >= 42000);
  });

  await t.test('耳机锁定跨切歌保持，恢复途中再次断开仍不外放', async () => {
    reset();
    await complete(engine.load('before'));
    engine.setHold('noisy');
    const count = audio.pending.length;
    assert.equal((await engine.load('after', 12000)).status, 'held');
    assert.equal(audio.pending.length, count);
    engine.releaseHold();
    const pending = engine.resume();
    engine.setHold('noisy');
    audio.pending.at(-1)!(); await flush();
    assert.equal((await pending).status, 'cancelled');
    assert.equal(engine.snapshot.hold, 'noisy');
    assert.equal(audio.paused, true);
  });

  await t.test('系统暂停期间换源不抢焦点，显式恢复启动 Context 和媒体', async () => {
    reset(); await complete(engine.load('first'));
    audio.pause(); context.state = 'suspended';
    context.dispatchEvent(new Event('statechange'));
    assert.equal(engine.snapshot.hold, 'system');
    const count = audio.pending.length;
    assert.equal((await engine.load('second', 30000)).status, 'held');
    assert.equal(audio.pending.length, count);
    const resume = engine.resume(undefined, () => 31000);
    assert.equal(context.state, 'running');
    assert.equal(audio.pending.length, count + 1);
    assert.equal((await complete(resume)).status, 'playing');
    assert.ok(engine.currentMs >= 31000);
  });

  await t.test('启动中的外部 pause 属于系统限制，不按网络故障自动重试', async () => {
    reset();
    const operation = engine.load('interrupted');
    audio.pause(); tick(100);
    assert.deepEqual(await operation, { status: 'held', reason: 'system' });
  });

  await t.test('策略拒绝和不支持格式返回不同结果', async () => {
    reset(); audio.failure = new DOMException('blocked', 'NotAllowedError');
    assert.deepEqual(await engine.load('gesture'), { status: 'held', reason: 'gesture' });
    reset(); audio.failure = new DOMException('format', 'NotSupportedError');
    assert.deepEqual(await engine.load('format'), { status: 'failed', code: 'MEDIA_UNSUPPORTED' });
  });

  await t.test('持续缓冲识别依赖实际进度；有缓冲的 stalled 不误报', async () => {
    reset(); await complete(engine.load('buffer'));
    audio.dispatchEvent(new Event('stalled')); tick(15000);
    assert.equal(engine.snapshot.failure, null);
    audio.readyState = 2; audio.dispatchEvent(new Event('waiting'));
    tick(10000); audio.dispatchEvent(new Event('stalled')); tick(5000);
    assert.equal(engine.snapshot.failure, 'MEDIA_STALL');
    const position = engine.currentMs;
    assert.equal((await complete(engine.resume())).status, 'playing');
    assert.ok(engine.currentMs >= position);
  });

  await t.test('停止后的旧 ended 被忽略，音量零不属于故障', async () => {
    reset(); let ends = 0; engine.onEnd(() => ends++);
    engine.setVolume(0); await complete(engine.load('muted'));
    assert.equal(engine.isPlaying, true); assert.equal(engine.getVolume(), 0);
    audio.ended = true; audio.dispatchEvent(new Event('ended'));
    assert.equal(ends, 1);
    engine.stop(); audio.ended = true; audio.dispatchEvent(new Event('ended'));
    assert.equal(ends, 1);
  });
});
