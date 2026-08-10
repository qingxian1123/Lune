import type { MusicProvider } from '@lune/shared';

export type ProviderCapability =
  | 'search'
  | 'resolve'
  | 'lyric'
  | 'playlist-search'
  | 'playlist';

export type ProviderRuntimeStatus =
  | 'disabled'
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'auth-required'
  | 'unavailable';

export interface ProviderStatusSnapshot {
  status: ProviderRuntimeStatus;
  reason?: string;
  changedAt: string;
  lastCheckedAt?: string;
}

export interface ProviderDescriptor {
  id: string;
  displayName: string;
  capabilities: ProviderCapability[];
  requiresAccount: boolean;
}

export type LoginState =
  | 'created'
  | 'waiting-scan'
  | 'waiting-confirm'
  | 'authorized'
  | 'expired'
  | 'failed'
  | 'cancelled';

export interface LoginChallenge {
  providerId: string;
  key: string;
  qrUrl: string;
  qrImage?: string;
  expiresAt: string;
}

export interface ProviderCredentialEnvelope {
  schemaVersion: 1;
  providerId: string;
  accountId?: string;
  accountName?: string;
  cookie: Record<string, string>;
  issuedAt: string;
  updatedAt: string;
  lastValidatedAt?: string;
  expiresAt?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface AccountSnapshot {
  valid: boolean;
  accountId?: string;
  accountName?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface LoginPollResult {
  state: LoginState;
  message?: string;
  credential?: ProviderCredentialEnvelope;
}

export interface ProviderAuthDriver {
  readonly providerId: string;
  beginLogin(): Promise<LoginChallenge>;
  pollLogin(challenge: LoginChallenge): Promise<LoginPollResult>;
  validate(credential: ProviderCredentialEnvelope): Promise<AccountSnapshot>;
  refresh?(credential: ProviderCredentialEnvelope): Promise<ProviderCredentialEnvelope>;
  logout?(credential: ProviderCredentialEnvelope): Promise<void>;
}

export interface ProviderPlugin {
  descriptor: ProviderDescriptor;
  catalog: MusicProvider;
  auth?: ProviderAuthDriver;
}

export type ProviderDomainEvent =
  | { type: 'provider.credential-updated'; providerId: string; version: number }
  | { type: 'provider.auth-required'; providerId: string; reason: string }
  | {
      type: 'provider.status-changed';
      providerId: string;
      from: ProviderRuntimeStatus;
      to: ProviderRuntimeStatus;
    }
  | { type: 'provider.config-updated'; providerId: string; revision: number };

export interface ProviderEventBusPort {
  publish(event: ProviderDomainEvent): void;
  subscribe(listener: (event: ProviderDomainEvent) => void): () => void;
}

export interface CredentialStorePort {
  get(providerId: string): ProviderCredentialEnvelope | null;
  getVersion(providerId: string): number | null;
  put(
    expectedVersion: number | null,
    credential: ProviderCredentialEnvelope,
  ): Promise<number>;
  remove(providerId: string): Promise<void>;
}
