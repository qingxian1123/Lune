import { randomUUID } from 'node:crypto';
import type {
  LoginChallenge,
  LoginState,
  ProviderCredentialEnvelope,
  ProviderStatusSnapshot,
} from '../domain/provider-domain';
import {
  ProviderApplicationError,
  type ProviderAuthRegistryPort,
  type ProviderConfigPort,
  type ProviderCredentialStorePort,
  type ProviderEventPublisherPort,
  type ProviderLoggerPort,
  type ProviderStatusPort,
} from './provider-ports';

interface LoginSession {
  id: string;
  providerId: string;
  challenge: LoginChallenge;
  state: LoginState;
  message?: string;
  createdAt: string;
  updatedAt: string;
  timer?: NodeJS.Timeout;
  polling: boolean;
}

export interface LoginSessionView {
  id: string;
  providerId: string;
  state: LoginState;
  message?: string;
  qrUrl?: string;
  qrImage?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export class ProviderAuthService {
  private readonly sessions = new Map<string, LoginSession>();
  private readonly providerSessions = new Map<string, string>();
  private readonly maintenanceTimers = new Map<string, NodeJS.Timeout>();
  private stopped = false;

  constructor(
    private readonly registry: ProviderAuthRegistryPort,
    private readonly credentials: ProviderCredentialStorePort,
    private readonly statuses: ProviderStatusPort,
    private readonly config: ProviderConfigPort,
    private readonly events: ProviderEventPublisherPort,
    private readonly logger: ProviderLoggerPort,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.shouldSkipStartupChecks()) return;
    const providerIds = this.config.getActiveProviderIds();
    await Promise.all(providerIds.map((providerId) => this.validateOnStartup(providerId)));
    for (const providerId of providerIds) this.scheduleMaintenance(providerId);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    for (const session of this.sessions.values()) {
      if (session.timer) clearTimeout(session.timer);
    }
    for (const timer of this.maintenanceTimers.values()) clearTimeout(timer);
  }

  async beginLogin(providerId: string): Promise<LoginSessionView> {
    if (!this.credentials.isWritable()) {
      throw new ProviderApplicationError(
        'PROVIDER_CREDENTIAL_STORE_READONLY',
        'LUNE_MASTER_KEY 未配置，无法安全保存登录凭据',
      );
    }
    const auth = this.registry.getAuth(providerId);
    if (!auth) {
      throw new ProviderApplicationError(
        'PROVIDER_AUTH_UNSUPPORTED',
        `Provider 不支持账号登录: ${providerId}`,
      );
    }
    const existingId = this.providerSessions.get(providerId);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing && !this.isTerminal(existing.state)) return this.view(existing);
    }

    const challenge = await this.withTimeout(providerId, auth.beginLogin());
    const now = new Date().toISOString();
    const session: LoginSession = {
      id: randomUUID(),
      providerId,
      challenge,
      state: 'created',
      createdAt: now,
      updatedAt: now,
      polling: false,
    };
    this.sessions.set(session.id, session);
    this.providerSessions.set(providerId, session.id);
    this.statuses.set(providerId, 'auth-required', '等待管理员扫码授权');
    this.schedulePoll(session, 0);
    return this.view(session);
  }

  getLoginSession(providerId: string, sessionId: string): LoginSessionView {
    const session = this.sessions.get(sessionId);
    if (!session || session.providerId !== providerId) {
      throw new ProviderApplicationError('PROVIDER_LOGIN_SESSION_NOT_FOUND', '登录会话不存在');
    }
    return this.view(session);
  }

  cancelLogin(providerId: string, sessionId: string): LoginSessionView {
    const session = this.sessions.get(sessionId);
    if (!session || session.providerId !== providerId) {
      throw new ProviderApplicationError('PROVIDER_LOGIN_SESSION_NOT_FOUND', '登录会话不存在');
    }
    if (!this.isTerminal(session.state)) {
      this.finishSession(session, 'cancelled', '登录已取消');
    }
    return this.view(session);
  }

  async validate(providerId: string): Promise<ProviderStatusSnapshot> {
    const auth = this.registry.getAuth(providerId);
    if (!auth) {
      throw new ProviderApplicationError(
        'PROVIDER_AUTH_UNSUPPORTED',
        `Provider 不支持账号校验: ${providerId}`,
      );
    }
    const credential = this.credentials.get(providerId);
    if (!credential) {
      this.statuses.set(providerId, 'auth-required', '未配置登录凭据');
      return this.statuses.get(providerId);
    }
    try {
      const snapshot = await this.withTimeout(providerId, auth.validate(credential));
      if (!snapshot.valid) {
        this.statuses.set(providerId, 'auth-required', '登录凭据已失效');
        this.events.publish({
          type: 'provider.auth-required',
          providerId,
          reason: 'credential-invalid',
        });
        return this.statuses.get(providerId);
      }
      const updated: ProviderCredentialEnvelope = {
        ...credential,
        accountId: snapshot.accountId || credential.accountId,
        accountName: snapshot.accountName || credential.accountName,
        metadata: { ...(credential.metadata || {}), ...(snapshot.metadata || {}) },
        lastValidatedAt: new Date().toISOString(),
      };
      await this.persistIfChanged(providerId, credential, updated);
      this.statuses.set(providerId, 'ready');
    } catch (error) {
      this.statuses.set(
        providerId,
        'degraded',
        error instanceof Error ? error.message : '登录状态校验失败',
      );
    }
    return this.statuses.get(providerId);
  }

  async refresh(providerId: string): Promise<ProviderStatusSnapshot> {
    const auth = this.registry.getAuth(providerId);
    if (!auth?.refresh) {
      throw new ProviderApplicationError(
        'PROVIDER_REFRESH_UNSUPPORTED',
        `Provider 不支持登录刷新: ${providerId}`,
      );
    }
    const credential = this.credentials.get(providerId);
    if (!credential) {
      this.statuses.set(providerId, 'auth-required', '未配置登录凭据');
      return this.statuses.get(providerId);
    }
    try {
      const refreshed = await this.withTimeout(providerId, auth.refresh(credential));
      const version = await this.credentials.put(this.credentials.getVersion(providerId), refreshed);
      this.events.publish({ type: 'provider.credential-updated', providerId, version });
      this.statuses.set(providerId, 'ready');
    } catch (error) {
      this.statuses.set(
        providerId,
        'degraded',
        error instanceof Error ? error.message : '登录刷新失败',
      );
    }
    return this.statuses.get(providerId);
  }

  async logout(providerId: string): Promise<void> {
    const auth = this.registry.getAuth(providerId);
    const credential = this.credentials.get(providerId);
    if (!auth) {
      throw new ProviderApplicationError(
        'PROVIDER_AUTH_UNSUPPORTED',
        `Provider 不支持账号退出: ${providerId}`,
      );
    }
    if (credential && auth.logout) {
      try {
        await auth.logout(credential);
      } catch (error) {
        this.logger.warn(
          `${providerId} upstream logout failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    await this.credentials.remove(providerId);
    this.statuses.set(providerId, 'auth-required', '登录凭据已清除');
  }

  private schedulePoll(session: LoginSession, delayMs: number): void {
    session.timer = setTimeout(() => void this.poll(session.id), delayMs);
    session.timer.unref?.();
  }

  private async poll(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || this.stopped || session.polling || this.isTerminal(session.state)) return;
    if (Date.now() >= Date.parse(session.challenge.expiresAt)) {
      this.finishSession(session, 'expired', '二维码已过期');
      return;
    }
    const auth = this.registry.getAuth(session.providerId);
    if (!auth) {
      this.finishSession(session, 'failed', 'Provider 登录适配器不存在');
      return;
    }
    session.polling = true;
    try {
      const result = await this.withTimeout(session.providerId, auth.pollLogin(session.challenge));
      session.state = result.state;
      session.message = result.message;
      session.updatedAt = new Date().toISOString();
      if (result.state === 'authorized' && result.credential) {
        const candidate = auth.refresh
          ? await this.withTimeout(session.providerId, auth.refresh(result.credential))
          : result.credential;
        const snapshot = auth.refresh
          ? {
              valid: true,
              accountId: candidate.accountId,
              accountName: candidate.accountName,
              metadata: candidate.metadata,
            }
          : await this.withTimeout(session.providerId, auth.validate(candidate));
        if (!snapshot.valid) {
          this.finishSession(session, 'failed', '上游返回的登录凭据校验失败');
          return;
        }
        const credential: ProviderCredentialEnvelope = {
          ...candidate,
          accountId: snapshot.accountId || candidate.accountId,
          accountName: snapshot.accountName || candidate.accountName,
          metadata: { ...(candidate.metadata || {}), ...(snapshot.metadata || {}) },
          lastValidatedAt: new Date().toISOString(),
        };
        const version = await this.credentials.put(
          this.credentials.getVersion(session.providerId),
          credential,
        );
        this.events.publish({
          type: 'provider.credential-updated',
          providerId: session.providerId,
          version,
        });
        this.statuses.set(session.providerId, 'ready');
        this.finishSession(session, 'authorized', '登录成功');
        return;
      }
      if (this.isTerminal(result.state)) {
        this.finishSession(session, result.state, result.message);
        return;
      }
    } catch (error) {
      session.message = error instanceof Error ? error.message : '登录状态查询失败';
      session.updatedAt = new Date().toISOString();
    } finally {
      session.polling = false;
    }
    if (!this.isTerminal(session.state)) this.schedulePoll(session, 2_000 + Math.floor(Math.random() * 500));
  }

  private finishSession(session: LoginSession, state: LoginState, message?: string): void {
    session.state = state;
    session.message = message;
    session.updatedAt = new Date().toISOString();
    if (session.timer) clearTimeout(session.timer);
    this.providerSessions.delete(session.providerId);
    session.timer = setTimeout(() => this.sessions.delete(session.id), 600_000);
    session.timer.unref?.();
  }

  private view(session: LoginSession): LoginSessionView {
    const includeChallenge = !this.isTerminal(session.state);
    return {
      id: session.id,
      providerId: session.providerId,
      state: session.state,
      message: session.message,
      qrUrl: includeChallenge ? session.challenge.qrUrl : undefined,
      qrImage: includeChallenge ? session.challenge.qrImage : undefined,
      expiresAt: session.challenge.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private isTerminal(state: LoginState): boolean {
    return ['authorized', 'expired', 'failed', 'cancelled'].includes(state);
  }

  private async validateOnStartup(providerId: string): Promise<void> {
    const auth = this.registry.getAuth(providerId);
    if (!auth) {
      this.statuses.set(providerId, 'ready');
      return;
    }
    const cfg = this.config.getProvider(providerId);
    if (auth.refresh && cfg?.refreshIntervalMs && this.credentials.isWritable()) {
      await this.refresh(providerId);
      return;
    }
    await this.validate(providerId);
  }

  private scheduleMaintenance(providerId: string): void {
    const cfg = this.config.getProvider(providerId);
    if (!cfg) return;
    const interval = cfg.refreshIntervalMs || cfg.healthCheckIntervalMs;
    const jitter = Math.floor(Math.random() * Math.min(interval * 0.1, 60_000));
    const timer = setTimeout(async () => {
      if (this.stopped) return;
      const auth = this.registry.getAuth(providerId);
      if (auth?.refresh && cfg.refreshIntervalMs) await this.refresh(providerId);
      else await this.validate(providerId);
      this.scheduleMaintenance(providerId);
    }, interval + jitter);
    timer.unref?.();
    this.maintenanceTimers.set(providerId, timer);
  }

  private async persistIfChanged(
    providerId: string,
    before: ProviderCredentialEnvelope,
    after: ProviderCredentialEnvelope,
  ): Promise<void> {
    if (!this.credentials.isWritable()) return;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const version = await this.credentials.put(this.credentials.getVersion(providerId), after);
    this.events.publish({ type: 'provider.credential-updated', providerId, version });
  }

  private async withTimeout<T>(providerId: string, operation: Promise<T>): Promise<T> {
    const timeoutMs = this.config.getProvider(providerId)?.requestTimeoutMs || 10_000;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Provider 请求超时（${timeoutMs}ms）`)),
            timeoutMs,
          );
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
