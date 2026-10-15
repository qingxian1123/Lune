import { Body, Controller, Get, Header, Post, Req, Res } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { accessSync, constants, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { EncryptedCredentialStore } from '../../infrastructure/credentials/encrypted-credential.store';
import { AdminSessionService, type AdminRequest } from './admin-session.service';

class PairDto {
  @IsString()
  @Length(18, 18)
  code!: string;
}

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

@Controller('admin')
export class AdminSessionController {
  constructor(
    private readonly sessions: AdminSessionService,
    private readonly config: ConfigService,
    private readonly credentials: EncryptedCredentialStore,
  ) {}

  @Get('ui')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
  ui(@Req() request: AdminRequest): string {
    this.sessions.assertAdminListener(request);
    return readFileSync(resolve(__dirname, '../../../../admin-public/index.html'), 'utf8');
  }

  @Post('session/pairing-code')
  @Header('Cache-Control', 'no-store')
  pairingCode(@Req() request: AdminRequest) {
    return this.sessions.issuePairingCode(request);
  }

  @Post('session/pair')
  @Header('Cache-Control', 'no-store')
  pair(@Req() request: AdminRequest, @Res({ passthrough: true }) response: HeaderResponse, @Body() body: PairDto) {
    const session = this.sessions.pair(request, body.code);
    response.setHeader('Set-Cookie', `lune_admin_session=${session.token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=1800`);
    return { csrf: session.csrf, expiresAt: session.expiresAt };
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  current(@Req() request: AdminRequest) {
    return this.sessions.current(request);
  }

  @Get('setup')
  @Header('Cache-Control', 'no-store')
  setup(@Req() request: AdminRequest) {
    this.sessions.authorize(request);
    const packagePath = resolve(__dirname, '../../../../package.json');
    const metadata = JSON.parse(readFileSync(packagePath, 'utf8')) as { version?: string };
    let storageWritable = false;
    try {
      accessSync(dirname(this.credentials.path), constants.W_OK);
      storageWritable = this.credentials.isWritable();
    } catch {
      storageWritable = false;
    }
    return {
      version: metadata.version || 'unknown',
      storageWritable,
      publicUrl: this.config.get<string>('LUNE_PUBLIC_URL')?.trim() || '',
    };
  }

  @Post('session/logout')
  @Header('Cache-Control', 'no-store')
  logout(@Req() request: AdminRequest, @Res({ passthrough: true }) response: HeaderResponse) {
    this.sessions.revoke(request);
    response.setHeader('Set-Cookie', 'lune_admin_session=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0');
    return { ok: true };
  }
}
