import { Injectable, Logger } from '@nestjs/common';
import type { MusicProvider } from '@lune/shared';

/**
 * Provider 注册中心。
 *
 * - 各 Provider 实现 `MusicProvider`,在 ProvidersModule 中通过 DI 注入此 registry 并调 `register`
 * - 激活集合由 `MUSIC_PROVIDERS` env(逗号分隔)决定,未列出的不实例化
 * - 提供 `get(id)` 与默认 provider `getActive()`(取激活列表第一个)
 */
@Injectable()
export class ProviderRegistry {
  private readonly logger = new Logger(ProviderRegistry.name);
  private readonly providers = new Map<string, MusicProvider>();
  private activeIds: string[] = [];

  register(provider: MusicProvider): void {
    this.providers.set(provider.id, provider);
    this.logger.log(`registered provider ${provider.id}`);
  }

  setActive(ids: string[]): void {
    const valid = ids.filter((id) => this.providers.has(id));
    const dropped = ids.filter((id) => !this.providers.has(id));
    this.activeIds = valid;
    if (dropped.length > 0) {
      this.logger.warn(`MUSIC_PROVIDERS 中未实现/未注册的 provider 被忽略: ${dropped.join(', ')}`);
    }
    this.logger.log(`active providers: ${valid.join(', ') || '(无)'}`);
  }

  get(id: string): MusicProvider | undefined {
    return this.providers.get(id);
  }

  listActive(): MusicProvider[] {
    return this.activeIds.map((id) => this.providers.get(id)!).filter(Boolean);
  }

  /** 默认 provider:激活列表第一个,供无 provider 参数的调用使用 */
  getActive(): MusicProvider | undefined {
    return this.listActive()[0];
  }
}