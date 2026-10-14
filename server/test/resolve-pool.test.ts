import assert from 'node:assert/strict';
import test from 'node:test';
import { ResolvePool } from '../src/providers/application/resolve-pool';
import type { MusicProvider, ProviderResolveResult } from '@lune/shared';

test('超时的上游仍占名额；HTTP 与复核复用结果，晚结果只释放名额', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pool = new ResolvePool(100, 1, 1);
  let finish: (value: ProviderResolveResult) => void = () => {};
  let calls = 0;
  const provider = { id: 'test', resolve: () => { calls++; return new Promise<ProviderResolveResult>((resolve) => { finish = resolve; }); } } as unknown as MusicProvider;
  const first = pool.resolve(provider, 'a');
  assert.equal(pool.resolve(provider, 'a'), first);
  await Promise.resolve();
  const expired = assert.rejects(first, { code: 'PROVIDER_TIMEOUT' });
  t.mock.timers.tick(100); await expired;
  await assert.rejects(pool.resolve(provider, 'b'), { code: 'PROVIDER_BUSY' });
  await assert.rejects(pool.resolve(provider, 'a'), { code: 'PROVIDER_TIMEOUT' });
  assert.equal(calls, 1);
  finish({ track: { id: 'a', name: '', artists: '', album: '', coverUrl: '', duration: 0 }, url: 'late' });
  await Promise.resolve(); await Promise.resolve();
  const next = pool.resolve(provider, 'b');
  await Promise.resolve();
  finish({ track: { id: 'b', name: '', artists: '', album: '', coverUrl: '', duration: 0 }, url: 'ok' });
  assert.equal((await next).url, 'ok');
});
