import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioEngine } from '../../apps/client/src/audio/AudioEngine';

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  ended = false;
  paused = true;
  error: { code: number } | null = null;
  failure: Error | null = null;
  pending: Array<() => void> = [];
  load() { this.currentTime = 0; this.ended = false; this.error = null; }
  play() {
    if (this.failure) return Promise.reject(this.failure);
    this.paused = false;
    return new Promise<void>((resolve) => this.pending.push(resolve));
  }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  removeAttribute() { this.src = ''; }
}

test('音频引擎：加载竞态与本机打断恢复', async (t) => {
  const audio = new FakeAudio();
  let context: FakeAudioContext;
  class FakeAudioContext extends EventTarget {
    state = 'running';
    currentTime = 0;
    resumes = 0;
    constructor() { super(); context = this; }
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: { value: 1, cancelAndHoldAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} }; }
    createMediaElementSource() { return { connect: (gain: unknown) => gain }; }
  }
  // Node 没有 DOM；只替换此测试实际使用的浏览器边界。
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: function () { return audio; } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: FakeAudioContext } });
  t.after(() => {
    if (originalAudio) Object.defineProperty(globalThis, 'Audio', originalAudio);
    else Reflect.deleteProperty(globalThis, 'Audio');
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const engine = AudioEngine.instance();
  t.after(() => engine.stop());

  const oldLoad = engine.load('A', 170_000);
  await Promise.resolve();
  const newLoad = engine.load('B', 0);
  await Promise.resolve();
  audio.pending[1]();
  await newLoad;
  audio.pending[0]();
  await oldLoad;
  assert.equal(audio.src, 'B');
  assert.equal(audio.currentTime, 0, '旧曲目的 170 秒进度不能写入新曲目');

  const stoppedLoad = engine.load('C', 160_000);
  engine.stop();
  await stoppedLoad;
  assert.equal(audio.src, '', 'stop 必须取消尚未越过 ensureGraph 的加载');
  assert.equal(audio.currentTime, 0);

  let ends = 0;
  engine.onEnd(() => ends++);
  audio.dispatchEvent(new Event('ended'));
  assert.equal(ends, 0, '换源后迟到的 ended 不属于当前音频');
  audio.ended = true;
  audio.dispatchEvent(new Event('ended'));
  assert.equal(ends, 1);

  await t.test('恢复同时启动挂起的 AudioContext 和暂停的媒体，保留进度', async () => {
    audio.ended = false;
    const load = engine.load('resume-track', 12_000);
    await Promise.resolve();
    audio.pending.at(-1)!();
    await load;
    audio.pause();
    context.state = 'suspended';
    let issue: string | null = null;
    engine.onPlaybackIssue((value) => { issue = value; });
    assert.equal(issue, 'paused');
    const count = audio.pending.length;
    const resume = engine.resume();
    assert.equal(context.resumes, 1, 'AudioContext.resume 必须在当前调用中发起');
    assert.equal(audio.pending.length, count + 1, 'HTMLAudio.play 也必须在当前调用中发起');
    audio.pending.at(-1)!();
    await resume;
    assert.equal(issue, null);
    assert.equal(audio.currentTime, 12);
  });

  await t.test('暂停期间切歌和回前台不能自动抢回播放', async () => {
    audio.pause();
    const count = audio.pending.length;
    engine.stop();
    await engine.load('next-during-interruption', 20_000);
    engine.seek(25_000);
    assert.equal(audio.pending.length, count);
    let issue: string | null = null;
    engine.onPlaybackIssue((value) => { issue = value; });
    assert.equal(issue, 'paused');
    const resume = engine.resume();
    audio.pending.at(-1)!();
    await resume;
    assert.equal(audio.src, 'next-during-interruption');
    assert.equal(audio.currentTime, 25);
    assert.equal(issue, null);
  });

  await t.test('耳机断开后必须明确解锁，恢复中的再次断开仍保持暂停', async () => {
    const volume = engine.getVolume();
    engine.setOutputSuppressed(true, { immediate: true });
    const count = audio.pending.length;
    await engine.resume();
    await engine.load('headphone-track');
    assert.equal(audio.pending.length, count);
    engine.setOutputSuppressed(false);
    const resume = engine.resume();
    engine.setOutputSuppressed(true, { immediate: true });
    audio.pending.at(-1)!();
    await resume;
    assert.equal(audio.paused, true);
    assert.equal(engine.isOutputSuppressed, true);
    assert.equal(engine.getVolume(), volume);
    engine.setOutputSuppressed(false);
    const finalResume = engine.resume();
    audio.pending.at(-1)!();
    await finalResume;
  });

  await t.test('播放被策略拦截时暴露可重试状态，失败不能伪装恢复成功', async () => {
    audio.pause();
    audio.failure = new DOMException('gesture required', 'NotAllowedError');
    let issue: string | null = null;
    engine.onPlaybackIssue((value) => { issue = value; });
    await assert.rejects(engine.resume(), { name: 'NotAllowedError' });
    assert.equal(issue, 'blocked');
    audio.failure = null;
    const resume = engine.resume();
    audio.pending.at(-1)!();
    await resume;
    assert.equal(issue, null);
  });

  await t.test('媒体错误与系统暂停区分，主动 stop 的 pause 事件不报打断', () => {
    let issue: string | null = null;
    engine.onPlaybackIssue((value) => { issue = value; });
    audio.error = { code: 2 };
    audio.dispatchEvent(new Event('error'));
    assert.equal(issue, 'error');
    engine.stop();
    assert.equal(issue, null);
    audio.error = null;
  });

  await t.test('网络错误后恢复会重新加载媒体源并保留房间进度', async () => {
    const load = engine.load('retry-network', 42_000);
    await Promise.resolve();
    audio.pending.at(-1)!();
    await load;
    audio.error = { code: 2 };
    audio.dispatchEvent(new Event('error'));
    const resume = engine.resume();
    assert.equal(audio.error, null, '必须先清除媒体错误再调用 play');
    assert.equal(audio.currentTime, 42);
    audio.pending.at(-1)!();
    await resume;
  });
});
