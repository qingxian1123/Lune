import type { MusicProvider, ProviderResolveResult } from '@lune/shared';

export class ResolveUnavailable extends Error {
  constructor(readonly code: 'PROVIDER_BUSY' | 'PROVIDER_TIMEOUT') { super('音乐源暂时繁忙，请稍后重试'); }
}

/** Timeout ends callers' wait, but the actual upstream task retains its slot. */
export class ResolvePool {
  private active = new Map<string, { provider: string; result: Promise<ProviderResolveResult> }>();
  constructor(private timeoutMs = 8000, private globalLimit = 8, private providerLimit = 4) {}

  resolve(provider: MusicProvider, id: string): Promise<ProviderResolveResult> {
    const key = JSON.stringify([provider.id, id]);
    const existing = this.active.get(key);
    if (existing) return existing.result;
    const count = [...this.active.values()].filter((entry) => entry.provider === provider.id).length;
    if (this.active.size >= this.globalLimit || count >= this.providerLimit) return Promise.reject(new ResolveUnavailable('PROVIDER_BUSY'));
    let timer: ReturnType<typeof setTimeout>;
    const upstream = Promise.resolve().then(() => provider.resolve(id));
    const result = Promise.race([
      upstream,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ResolveUnavailable('PROVIDER_TIMEOUT')), this.timeoutMs); }),
    ]);
    const entry = { provider: provider.id, result };
    this.active.set(key, entry);
    const release = () => { clearTimeout(timer); if (this.active.get(key) === entry) this.active.delete(key); };
    void upstream.then(release, release);
    return result;
  }
}

// Shared by HTTP resolution and gateway unplayable verification in this single-instance server.
export const providerResolvePool = new ResolvePool();
