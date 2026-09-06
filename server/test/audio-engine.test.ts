import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioEngine } from '../../apps/client/src/audio/AudioEngine';

class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  ended = false;
  pending: Array<() => void> = [];
  load() { this.currentTime = 0; this.ended = false; }
  play() { return new Promise<void>((resolve) => this.pending.push(resolve)); }
  pause() {}
  removeAttribute() { this.src = ''; }
}

test('音频加载竞态：旧 play 完成、stop 和过期 ended 都不能修改新音频', async (t) => {
  const audio = new FakeAudio();
  class FakeAudioContext {
    createGain() { return { gain: { value: 1 }, connect() {} }; }
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
});
