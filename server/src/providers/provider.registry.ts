import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MusicProvider } from '@lune/shared';
import type {
  ProviderAuthDriver,
  ProviderDescriptor,
  ProviderPlugin,
} from './domain/provider-domain';
import { ProviderStatusStore } from './runtime/provider-status.store';

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
  private readonly plugins = new Map<string, ProviderPlugin>();
  private activeIds: string[] = [];

  constructor(@Inject(ProviderStatusStore) private readonly statuses: ProviderStatusStore) {}

  register(plugin: ProviderPlugin): void {
    const { id } = plugin.descriptor;
    if (id !== plugin.catalog.id) {
      throw new Error(`provider plugin id mismatch: ${id} != ${plugin.catalog.id}`);
    }
    if (plugin.auth && plugin.auth.providerId !== id) {
      throw new Error(`provider auth id mismatch: ${id} != ${plugin.auth.providerId}`);
    }
    if (this.plugins.has(id)) throw new Error(`provider already registered: ${id}`);
    this.plugins.set(id, plugin);
    this.statuses.initialize(id, 'disabled');
    this.logger.log(`registered provider plugin ${id}`);
  }

  setActive(ids: string[]): void {
    const valid = ids.filter((id) => this.plugins.has(id));
    const dropped = ids.filter((id) => !this.plugins.has(id));
    this.activeIds = valid;
    for (const id of this.plugins.keys()) {
      this.statuses.set(id, valid.includes(id) ? 'starting' : 'disabled');
    }
    if (dropped.length > 0) {
      this.logger.warn(`MUSIC_PROVIDERS 中未实现/未注册的 provider 被忽略: ${dropped.join(', ')}`);
    }
    this.logger.log(`active providers: ${valid.join(', ') || '(无)'}`);
  }

  get(id: string): MusicProvider | undefined {
    return this.plugins.get(id)?.catalog;
  }

  getAuth(id: string): ProviderAuthDriver | undefined {
    return this.plugins.get(id)?.auth;
  }

  getDescriptor(id: string): ProviderDescriptor | undefined {
    const descriptor = this.plugins.get(id)?.descriptor;
    return descriptor ? structuredClone(descriptor) : undefined;
  }

  /** 仅返回已激活的 provider，避免通过显式参数绕过 MUSIC_PROVIDERS */
  getActiveById(id: string): MusicProvider | undefined {
    return this.activeIds.includes(id) ? this.plugins.get(id)?.catalog : undefined;
  }

  listActive(): MusicProvider[] {
    return this.activeIds.map((id) => this.plugins.get(id)?.catalog).filter(Boolean) as MusicProvider[];
  }

  listActiveDetails(): Array<{
    descriptor: ProviderDescriptor;
    status: ReturnType<ProviderStatusStore['get']>;
  }> {
    return this.activeIds.flatMap((id) => {
      const descriptor = this.getDescriptor(id);
      return descriptor ? [{ descriptor, status: this.statuses.get(id) }] : [];
    });
  }

  listAllDetails(): Array<{
    descriptor: ProviderDescriptor;
    active: boolean;
    status: ReturnType<ProviderStatusStore['get']>;
  }> {
    return [...this.plugins.keys()].flatMap((id) => {
      const descriptor = this.getDescriptor(id);
      return descriptor
        ? [{ descriptor, active: this.activeIds.includes(id), status: this.statuses.get(id) }]
        : [];
    });
  }

  getDefaultId(): string | undefined {
    return this.activeIds[0];
  }

  getRuntimeStatus(id: string): ReturnType<ProviderStatusStore['get']> {
    return this.statuses.get(id);
  }

  /** 默认 provider:激活列表第一个,供无 provider 参数的调用使用 */
  getActive(): MusicProvider | undefined {
    return this.listActive()[0];
  }
}
