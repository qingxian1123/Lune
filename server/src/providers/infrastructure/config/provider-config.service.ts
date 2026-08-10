import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface ProviderRuntimeConfig {
  enabled: boolean;
  requestTimeoutMs: number;
  healthCheckIntervalMs: number;
  refreshIntervalMs?: number;
}

export interface ProviderSystemConfig {
  schemaVersion: 1;
  defaultProvider: string;
  providers: Record<string, ProviderRuntimeConfig>;
  routing: {
    failureThreshold: number;
    circuitOpenMs: number;
  };
}

const DEFAULT_PROVIDER_CONFIG: ProviderRuntimeConfig = {
  enabled: true,
  requestTimeoutMs: 10_000,
  healthCheckIntervalMs: 1_800_000,
};

@Injectable()
export class ProviderConfigService {
  private readonly logger = new Logger(ProviderConfigService.name);
  private readonly value: ProviderSystemConfig;
  readonly path: string | null;

  constructor(@Inject(ConfigService) private readonly env: ConfigService) {
    const explicitPath = this.env.get<string>('LUNE_CONFIG_FILE')?.trim();
    const candidate = explicitPath || resolve(process.cwd(), 'config', 'providers.json');
    if (existsSync(candidate)) {
      this.path = candidate;
      this.value = this.parseFile(candidate);
      this.logger.log(`provider config loaded: ${candidate}`);
    } else {
      if (explicitPath) throw new Error(`LUNE_CONFIG_FILE does not exist: ${candidate}`);
      this.path = null;
      this.value = this.fromLegacyEnvironment();
      this.logger.warn('providers.json not found; using MUSIC_PROVIDERS compatibility mode');
    }
  }

  getSnapshot(): ProviderSystemConfig {
    return structuredClone(this.value);
  }

  getActiveProviderIds(): string[] {
    const ids = Object.entries(this.value.providers)
      .filter(([, config]) => config.enabled)
      .map(([id]) => id);
    const defaultIndex = ids.indexOf(this.value.defaultProvider);
    if (defaultIndex > 0) {
      ids.splice(defaultIndex, 1);
      ids.unshift(this.value.defaultProvider);
    }
    return ids;
  }

  getProvider(id: string): ProviderRuntimeConfig | undefined {
    const value = this.value.providers[id];
    return value ? { ...value } : undefined;
  }

  shouldSkipStartupChecks(): boolean {
    return this.env.get<string>('LUNE_SKIP_PROVIDER_STARTUP_CHECKS') === '1';
  }

  async setEnabled(providerId: string, enabled: boolean): Promise<ProviderSystemConfig> {
    if (!this.path) throw new Error('当前处于 MUSIC_PROVIDERS 兼容模式，无法写入 providers.json');
    if (!this.value.providers[providerId]) throw new Error(`unknown provider: ${providerId}`);
    if (!enabled && providerId === this.value.defaultProvider) {
      throw new Error('不能禁用 defaultProvider；请先修改默认 Provider');
    }
    const next = this.getSnapshot();
    next.providers[providerId].enabled = enabled;
    const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.path);
    this.value.providers[providerId].enabled = enabled;
    return this.getSnapshot();
  }

  private parseFile(path: string): ProviderSystemConfig {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new Error(
        `cannot parse provider config: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    return this.validate(raw);
  }

  private validate(raw: unknown): ProviderSystemConfig {
    if (!raw || typeof raw !== 'object') throw new Error('provider config must be an object');
    const input = raw as Record<string, unknown>;
    if (input.schemaVersion !== 1) throw new Error('provider config schemaVersion must be 1');
    if (typeof input.defaultProvider !== 'string' || !input.defaultProvider.trim()) {
      throw new Error('provider config defaultProvider is required');
    }
    if (!input.providers || typeof input.providers !== 'object' || Array.isArray(input.providers)) {
      throw new Error('provider config providers must be an object');
    }

    const providers: Record<string, ProviderRuntimeConfig> = {};
    for (const [id, value] of Object.entries(input.providers as Record<string, unknown>)) {
      if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`invalid provider id: ${id}`);
      if (!value || typeof value !== 'object') throw new Error(`provider ${id} config must be an object`);
      const cfg = value as Record<string, unknown>;
      providers[id] = {
        enabled: this.boolean(cfg.enabled, true, `${id}.enabled`),
        requestTimeoutMs: this.positiveInt(
          cfg.requestTimeoutMs,
          DEFAULT_PROVIDER_CONFIG.requestTimeoutMs,
          `${id}.requestTimeoutMs`,
        ),
        healthCheckIntervalMs: this.positiveInt(
          cfg.healthCheckIntervalMs,
          DEFAULT_PROVIDER_CONFIG.healthCheckIntervalMs,
          `${id}.healthCheckIntervalMs`,
        ),
        ...(cfg.refreshIntervalMs === undefined
          ? {}
          : {
              refreshIntervalMs: this.positiveInt(
                cfg.refreshIntervalMs,
                21_600_000,
                `${id}.refreshIntervalMs`,
              ),
            }),
      };
    }

    const defaultProvider = input.defaultProvider.trim();
    if (!providers[defaultProvider]?.enabled) {
      throw new Error(`default provider is missing or disabled: ${defaultProvider}`);
    }
    const routingInput =
      input.routing && typeof input.routing === 'object'
        ? (input.routing as Record<string, unknown>)
        : {};
    return {
      schemaVersion: 1,
      defaultProvider,
      providers,
      routing: {
        failureThreshold: this.positiveInt(
          routingInput.failureThreshold,
          3,
          'routing.failureThreshold',
        ),
        circuitOpenMs: this.positiveInt(
          routingInput.circuitOpenMs,
          30_000,
          'routing.circuitOpenMs',
        ),
      },
    };
  }

  private fromLegacyEnvironment(): ProviderSystemConfig {
    const ids = (this.env.get<string>('MUSIC_PROVIDERS') || 'netease')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const unique = [...new Set(ids)];
    const providers = Object.fromEntries(
      unique.map((id) => [
        id,
        {
          ...DEFAULT_PROVIDER_CONFIG,
          ...(id === 'kugou' ? { refreshIntervalMs: 21_600_000 } : {}),
        },
      ]),
    );
    return {
      schemaVersion: 1,
      defaultProvider: unique[0] || 'netease',
      providers,
      routing: { failureThreshold: 3, circuitOpenMs: 30_000 },
    };
  }

  private positiveInt(value: unknown, fallback: number, path: string): number {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new Error(`${path} must be a positive integer`);
    }
    return value;
  }

  private boolean(value: unknown, fallback: boolean, path: string): boolean {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
    return value;
  }
}
