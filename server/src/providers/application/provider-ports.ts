import type {
  CredentialStorePort,
  ProviderAuthDriver,
  ProviderDomainEvent,
  ProviderStatusSnapshot,
  ProviderRuntimeStatus,
} from '../domain/provider-domain';

export interface ProviderAuthRegistryPort {
  getAuth(providerId: string): ProviderAuthDriver | undefined;
}

export interface ProviderStatusPort {
  get(providerId: string): ProviderStatusSnapshot;
  set(providerId: string, status: ProviderRuntimeStatus, reason?: string): void;
}

export interface ProviderAuthRuntimeConfig {
  requestTimeoutMs: number;
  healthCheckIntervalMs: number;
  refreshIntervalMs?: number;
}

export interface ProviderConfigPort {
  getActiveProviderIds(): string[];
  getProvider(providerId: string): ProviderAuthRuntimeConfig | undefined;
  shouldSkipStartupChecks(): boolean;
}

export interface ProviderEventPublisherPort {
  publish(event: ProviderDomainEvent): void;
}

export interface ProviderLoggerPort {
  warn(message: string): void;
}

export type ProviderCredentialStorePort = CredentialStorePort & {
  isWritable(): boolean;
};

export class ProviderApplicationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderApplicationError';
  }
}
