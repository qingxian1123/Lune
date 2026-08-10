import { Injectable } from '@nestjs/common';
import KugouMusicApi from 'kugoumusicapi';
import { parseCookieParts } from '../domain/cookie';
import type {
  AccountSnapshot,
  LoginChallenge,
  LoginPollResult,
  LoginState,
  ProviderAuthDriver,
  ProviderCredentialEnvelope,
} from '../domain/provider-domain';

type ApiFunction = (params?: Record<string, unknown>) => Promise<any>;

export function mapKugouLoginState(status: number): LoginState {
  if (status === 0) return 'expired';
  if (status === 1) return 'waiting-scan';
  if (status === 2) return 'waiting-confirm';
  if (status === 4) return 'authorized';
  return 'failed';
}

@Injectable()
export class KugouAuthAdapter implements ProviderAuthDriver {
  readonly providerId = 'kugou';
  private readonly api = KugouMusicApi as unknown as Record<string, ApiFunction>;

  async beginLogin(): Promise<LoginChallenge> {
    const timestamp = Date.now();
    const keyResponse = await this.call('login_qr_key', { timestamp });
    const data = keyResponse.body?.data ?? keyResponse.data ?? {};
    const key = String(data.qrcode || data.key || '');
    if (!key) throw new Error('酷狗登录接口未返回二维码 key');
    const qrResponse = await this.call('login_qr_create', { key, qrimg: true, timestamp });
    const qrData = qrResponse.body?.data ?? qrResponse.data ?? {};
    if (!qrData.url) throw new Error('酷狗登录接口未返回二维码地址');
    return {
      providerId: this.providerId,
      key,
      qrUrl: String(qrData.url),
      qrImage: qrData.base64 ? String(qrData.base64) : undefined,
      expiresAt: new Date(timestamp + 180_000).toISOString(),
    };
  }

  async pollLogin(challenge: LoginChallenge): Promise<LoginPollResult> {
    const response = await this.call('login_qr_check', {
      key: challenge.key,
      timestamp: Date.now(),
    });
    const data = response.body?.data ?? response.data ?? {};
    const status = Number(data.status);
    const state = mapKugouLoginState(status);
    if (state === 'expired') return { state, message: '二维码已过期' };
    if (state === 'waiting-scan' || state === 'waiting-confirm') return { state };
    if (state !== 'authorized') {
      return { state: 'failed', message: `未知登录状态: ${String(data.status)}` };
    }
    const cookie = {
      ...parseCookieParts(response.cookie),
      ...(data.token ? { token: String(data.token) } : {}),
      ...(data.userid ? { userid: String(data.userid) } : {}),
    };
    if (!cookie.token || !cookie.userid) {
      return { state: 'failed', message: '登录成功但未收到 token 或 userid' };
    }
    const now = new Date().toISOString();
    return {
      state: 'authorized',
      credential: {
        schemaVersion: 1,
        providerId: this.providerId,
        accountId: cookie.userid,
        accountName: data.nickname ? String(data.nickname) : undefined,
        cookie,
        issuedAt: now,
        updatedAt: now,
      },
    };
  }

  async validate(credential: ProviderCredentialEnvelope): Promise<AccountSnapshot> {
    const refreshed = await this.refresh(credential);
    return {
      valid: Boolean(refreshed.cookie.token && refreshed.cookie.userid),
      accountId: refreshed.accountId || refreshed.cookie.userid,
      accountName: refreshed.accountName,
      metadata: refreshed.metadata,
    };
  }

  async refresh(credential: ProviderCredentialEnvelope): Promise<ProviderCredentialEnvelope> {
    const response = await this.call('login_token', {
      token: credential.cookie.token || '',
      userid: credential.cookie.userid || '0',
      cookie: credential.cookie,
      timestamp: Date.now(),
    });
    const body = response.body ?? response;
    if (Number(body?.status) !== 1) {
      throw new Error(body?.error || body?.message || '酷狗 Token 校验失败');
    }
    const data = body.data || {};
    const cookie = {
      ...credential.cookie,
      ...parseCookieParts(response.cookie),
      ...(data.token ? { token: String(data.token) } : {}),
      ...(data.userid ? { userid: String(data.userid) } : {}),
      ...(data.vip_token ? { vip_token: String(data.vip_token) } : {}),
    };
    if (!cookie.token || !cookie.userid) throw new Error('酷狗刷新响应缺少登录凭据');
    return {
      ...credential,
      accountId: String(data.userid || credential.accountId || cookie.userid),
      accountName: data.nickname ? String(data.nickname) : credential.accountName,
      cookie,
      updatedAt: new Date().toISOString(),
      lastValidatedAt: new Date().toISOString(),
      metadata: {
        ...(credential.metadata || {}),
        ...(data.vip_type === undefined ? {} : { vipType: Number(data.vip_type) }),
      },
    };
  }

  private call(name: string, params: Record<string, unknown>): Promise<any> {
    const fn = this.api[name];
    if (typeof fn !== 'function') throw new Error(`KuGouMusicApi 缺少程序化接口: ${name}`);
    return fn(params);
  }
}
