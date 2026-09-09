import assert from 'node:assert/strict';
import test from 'node:test';
import NeteaseCloudMusicApi from 'NeteaseCloudMusicApi';

test('网易解析：详情异常、音质请求全部失败与确定无版权分别处理', async (t) => {
  let detailFailure = false;
  let urlMode: 'error' | 'unavailable' | 'playable' = 'error';
  t.mock.method(NeteaseCloudMusicApi, 'song_detail', async () => {
    if (detailFailure) throw new Error('rate limited');
    return { body: { songs: [{ id: 1, name: 'A', ar: [], al: {}, dt: 180_000 }] } };
  });
  t.mock.method(NeteaseCloudMusicApi, 'song_url_v1', async () => {
    if (urlMode === 'error') throw new Error('timeout');
    return { body: { data: [{ url: urlMode === 'playable' ? 'https://audio.example/A.mp3' : null }] } };
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
  assert.equal((await provider.resolve('1')).url, 'https://audio.example/A.mp3');
});
