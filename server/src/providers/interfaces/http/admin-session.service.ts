import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const PAIRING_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 30 * 60_000;
const FAILURE_WINDOW_MS = 5 * 60_000;
const MAX_FAILURES = 5;

export interface AdminRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { localPort?: number };
}

interface AdminSession {
  hash: Buffer;
  csrf: string;
  expiresAt: number;
}

@Injectable()
export class AdminSessionService {
  private pairing: { hash: Buffer; expiresAt: number } | null = null;
  private readonly sessions = new Map<string, AdminSession>();
  private failures: number[] = [];

  constructor(private readonly config: ConfigService) {}

  assertAdminListener(request: AdminRequest): void {
    const port = Number(this.config.get<string>('LUNE_MANAGE_PORT') || '9528');
    if (request.socket.localPort !== port) throw new ForbiddenException('管理入口不可从此端口访问');
    const host = this.header(request, 'host');
    if (!new RegExp(`^(localhost|127\\.0\\.0\\.1):${port}$`, 'i').test(host)) {
      throw new ForbiddenException('请通过本机管理地址访问');
    }
    const origin = this.header(request, 'origin');
    if (origin && origin !== `http://${host}` && origin !== `https://${host}`) {
      throw new ForbiddenException('管理请求来源不匹配');
    }
  }

  requireBearer(request: AdminRequest): void {
    const expected = this.config.get<string>('LUNE_ADMIN_TOKEN')?.trim();
    if (!expected) throw new ServiceUnavailableException('Provider 管理接口尚未配置');
    const authorization = this.header(request, 'authorization');
    const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!this.equal(Buffer.from(expected), Buffer.from(supplied))) {
      throw new UnauthorizedException('Provider 管理凭据无效');
    }
  }

  authorize(request: AdminRequest): void {
    this.assertAdminListener(request);
    if (this.header(request, 'authorization').startsWith('Bearer ')) {
      this.requireBearer(request);
      return;
    }
    const token = this.cookie(request, 'lune_admin_session');
    const session = token ? this.sessions.get(this.hash(token).toString('hex')) : undefined;
    if (!session || Date.now() >= session.expiresAt || !this.equal(session.hash, this.hash(token))) {
      if (token) this.sessions.delete(this.hash(token).toString('hex'));
      throw new UnauthorizedException('管理会话已过期，请重新配对');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) {
      const origin = this.header(request, 'origin');
      const host = this.header(request, 'host');
      if (!origin || (origin !== `http://${host}` && origin !== `https://${host}`)) {
        throw new ForbiddenException('管理请求缺少同源信息');
      }
      const csrf = this.header(request, 'x-lune-csrf');
      if (!this.equal(Buffer.from(session.csrf), Buffer.from(csrf))) {
        throw new ForbiddenException('管理请求校验失败');
      }
    }
  }

  issuePairingCode(request: AdminRequest): { code: string; expiresAt: string } {
    this.assertAdminListener(request);
    this.requireBearer(request);
    const code = randomBytes(9).toString('hex').toUpperCase();
    const expiresAt = Date.now() + PAIRING_TTL_MS;
    this.pairing = { hash: this.hash(code), expiresAt };
    this.failures = [];
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  pair(request: AdminRequest, code: string): { token: string; csrf: string; expiresAt: string } {
    this.assertAdminListener(request);
    this.requireSameOrigin(request);
    const now = Date.now();
    this.failures = this.failures.filter((at) => now - at < FAILURE_WINDOW_MS);
    if (this.failures.length >= MAX_FAILURES) {
      throw new HttpException('配对尝试过多，请稍后重试', HttpStatus.TOO_MANY_REQUESTS);
    }
    const pairing = this.pairing;
    if (!pairing || now >= pairing.expiresAt || !this.equal(pairing.hash, this.hash(code.trim().toUpperCase()))) {
      this.failures.push(now);
      throw new UnauthorizedException('配对码无效或已过期');
    }
    this.pairing = null;
    this.failures = [];
    this.pruneSessions();
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    const expiresAt = now + SESSION_TTL_MS;
    const hash = this.hash(token);
    this.sessions.set(hash.toString('hex'), { hash, csrf, expiresAt });
    return { token, csrf, expiresAt: new Date(expiresAt).toISOString() };
  }

  current(request: AdminRequest): { csrf: string; expiresAt: string } {
    this.authorize(request);
    const token = this.cookie(request, 'lune_admin_session');
    const session = this.sessions.get(this.hash(token).toString('hex'));
    if (!session) throw new UnauthorizedException('请通过浏览器会话访问');
    return { csrf: session.csrf, expiresAt: new Date(session.expiresAt).toISOString() };
  }

  revoke(request: AdminRequest): void {
    this.authorize(request);
    const token = this.cookie(request, 'lune_admin_session');
    if (token) this.sessions.delete(this.hash(token).toString('hex'));
  }

  private requireSameOrigin(request: AdminRequest): void {
    const host = this.header(request, 'host');
    const origin = this.header(request, 'origin');
    if (!origin || (origin !== `http://${host}` && origin !== `https://${host}`)) {
      throw new ForbiddenException('管理请求缺少同源信息');
    }
  }

  private pruneSessions(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (now >= session.expiresAt) this.sessions.delete(key);
    }
  }

  private header(request: AdminRequest, name: string): string {
    const value = request.headers[name];
    return typeof value === 'string' ? value : '';
  }

  private cookie(request: AdminRequest, name: string): string {
    const raw = this.header(request, 'cookie');
    const entry = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return entry ? entry.slice(name.length + 1) : '';
  }

  private hash(value: string): Buffer {
    return createHash('sha256').update(value).digest();
  }

  private equal(a: Buffer, b: Buffer): boolean {
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
