import { Injectable } from '@nestjs/common';
import NeteaseCloudMusicApi from 'NeteaseCloudMusicApi';
import { parseCookieParts, serializeCookie } from '../domain/cookie';
import type {
  AccountSnapshot,
  LoginChallenge,
  LoginPollResult,
  LoginState,
  ProviderAuthDriver,
  ProviderCredentialEnvelope,
} from '../domain/provider-domain';

const { login_qr_key, login_qr_create, login_qr_check, login_status, logout } =
  NeteaseCloudMusicApi;

export function mapNeteaseLoginState(code: number): LoginState {
  if (code === 800) return 'expired';
  if (code === 801) return 'waiting-scan';
  if (code === 802) return 'waiting-confirm';
  if (code === 803) return 'authorized';
  return 'failed';
}

@Injectable()
export class NeteaseAuthAdapter implements ProviderAuthDriver {
  readonly providerId = 'netease';

  async beginLogin(): Promise<LoginChallenge> {
    const timestamp = Date.now();
    const keyResponse: any = await login_qr_key({ timestamp } as any);
    const key = String(keyResponse.body?.data?.unikey || '');
    if (!key) throw new Error('网易云登录接口未返回二维码 key');
    const qrResponse: any = await login_qr_create({ key, qrimg: true, timestamp } as any);
    const data = qrResponse.body?.data || {};
    if (!data.qrurl) throw new Error('网易云登录接口未返回二维码地址');
    return {
      providerId: this.providerId,
      key,
      qrUrl: String(data.qrurl),
      qrImage: data.qrimg ? String(data.qrimg) : undefined,
      expiresAt: new Date(timestamp + 180_000).toISOString(),
    };
  }

  async pollLogin(challenge: LoginChallenge): Promise<LoginPollResult> {
    const response: any = await login_qr_check({
      key: challenge.key,
      timestamp: Date.now(),
      noCookie: true,
    } as any);
    const body = response.body || {};
    const code = Number(body.code);
    const state = mapNeteaseLoginState(code);
    if (state === 'expired') return { state, message: body.message || '二维码已过期' };
    if (state === 'waiting-scan' || state === 'waiting-confirm') {
      return { state, message: body.message };
    }
    if (state !== 'authorized') {
      return { state: 'failed', message: body.message || `未知登录状态: ${String(body.code)}` };
    }
    const cookie = {
      ...parseCookieParts(response.cookie),
      ...parseCookieParts(body.cookie),
    };
    if (Object.keys(cookie).length === 0) {
      return { state: 'failed', message: '登录成功但未收到 Cookie' };
    }
    const now = new Date().toISOString();
    return {
      state: 'authorized',
      credential: {
        schemaVersion: 1,
        providerId: this.providerId,
        cookie,
        issuedAt: now,
        updatedAt: now,
      },
    };
  }

  async validate(credential: ProviderCredentialEnvelope): Promise<AccountSnapshot> {
    const response: any = await login_status({
      cookie: serializeCookie(credential.cookie),
      timestamp: Date.now(),
    } as any);
    const data = response.body?.data || response.body || {};
    const account = data.account || data.data?.account;
    const profile = data.profile || data.data?.profile;
    const valid = Boolean(account?.id || profile?.userId);
    return {
      valid,
      accountId: account?.id ? String(account.id) : profile?.userId ? String(profile.userId) : undefined,
      accountName: profile?.nickname ? String(profile.nickname) : undefined,
    };
  }

  async logout(credential: ProviderCredentialEnvelope): Promise<void> {
    await logout({ cookie: serializeCookie(credential.cookie) } as any);
  }
}
