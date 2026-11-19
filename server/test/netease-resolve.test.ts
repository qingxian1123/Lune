import assert from 'node:assert/strict';
import test from 'node:test';
import NeteaseCloudMusicApi from 'NeteaseCloudMusicApi';

test('网易解析：按码率回退，区分请求失败、试听和完整音频', async (t) => {
  let detailFailure = false;
  let urlMode: 'error' | 'risk-control' | 'unavailable' | 'playable' = 'error';
  let fallbackMode: 'error' | 'preview' | 'unavailable' | 'playable' = 'error';
  t.mock.method(NeteaseCloudMusicApi, 'song_detail', async () => {
    if (detailFailure) throw new Error('rate limited');
    return { body: { songs: [{ id: 1, name: 'A', ar: [], al: {}, dt: 180_000 }] } };
  });
  const primary = t.mock.method(NeteaseCloudMusicApi, 'song_url_v1', async () => {
    if (urlMode === 'error') throw new Error('timeout');
    if (urlMode === 'risk-control') throw { body: { code: -460 } };
    return { body: { data: [{ url: urlMode === 'playable' ? 'https://audio.example/A.mp3' : null }] } };
  });
  const fallback = t.mock.method(NeteaseCloudMusicApi, 'song_url', async () => {
    if (fallbackMode === 'error') throw new Error('timeout');
    return { body: { data: [{
      url: fallbackMode === 'unavailable' ? null : 'https://audio.example/fallback.mp3',
      freeTrialInfo: fallbackMode === 'preview' ? { start: 0, end: 30 } : null,
    }] } };
  });
  // Provider 会解构上游函数，替换网络边界后再加载模块。
  const { NeteaseProvider } = await import('../src/providers/netease/netease.provider');
  const provider = new NeteaseProvider();
  assert.equal((await provider.resolve('1')).unplayable, false);
  detailFailure = true;
  assert.equal((await provider.resolve('1')).unplayable, false);
  detailFailure = false;
  urlMode = 'unavailable';
  assert.equal((await provider.resolve('1')).unplayable, true);
  urlMode = 'playable';
  const callsBeforeSuccess = fallback.mock.callCount();
  assert.equal((await provider.resolve('1')).url, 'https://audio.example/A.mp3');
  assert.equal(fallback.mock.callCount(), callsBeforeSuccess);

  urlMode = 'risk-control';
  fallbackMode = 'playable';
  const primaryCallsBeforeRejection = primary.mock.callCount();
  assert.equal((await provider.resolve('1')).url, 'https://audio.example/fallback.mp3');
  assert.equal(primary.mock.callCount() - primaryCallsBeforeRejection, 1);
  fallbackMode = 'unavailable';
  assert.equal((await provider.resolve('1')).unplayable, true);
  fallbackMode = 'preview';
  assert.equal((await provider.resolve('1')).url, null);
});
