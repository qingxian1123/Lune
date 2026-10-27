import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

interface AdminAccount {
  schemaVersion: 1;
  username: string;
  salt: string;
  passwordHash: string;
  updatedAt: string;
}

/** One persistent administrator; passwords never enter the Provider credential store. */
@Injectable()
export class AdminAccountService implements OnModuleInit {
  private account: AdminAccount | null = null;
  private saving = false;
  private deriving = 0;
  private readonly path: string;

  constructor(config: ConfigService) {
    this.path = resolve(config.get<string>('LUNE_DATA_DIR')?.trim() || resolve(process.cwd(), 'data'), 'admin-account.json');
  }

  async onModuleInit(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.path, 'utf8')) as AdminAccount;
      if (value.schemaVersion !== 1 || !/^[A-Za-z0-9_.-]{3,32}$/.test(value.username)
        || !/^[a-f0-9]{32}$/.test(value.salt) || !/^[a-f0-9]{128}$/.test(value.passwordHash)) {
        throw new Error('管理员账号文件格式无效，请从备份恢复');
      }
      this.account = value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  info(): { configured: boolean; username: string | null; updatedAt: string | null } {
    return { configured: Boolean(this.account), username: this.account?.username ?? null, updatedAt: this.account?.updatedAt ?? null };
  }

  async verify(username: string, password: string): Promise<boolean> {
    const account = this.account;
    // Derive even for an unknown username to avoid a cheap account existence oracle.
    const hash = await this.derive(password, account?.salt ?? '00000000000000000000000000000000');
    return Boolean(account && account.username === username && timingSafeEqual(hash, Buffer.from(account.passwordHash, 'hex')));
  }

  async save(username: string, password: string, currentPassword: string | undefined, recovery: boolean): Promise<void> {
    if (this.saving) throw new ConflictException('账号正在保存，请稍后重试');
    this.saving = true;
    const temporary = `${this.path}.${randomBytes(8).toString('hex')}.tmp`;
    try {
      if (this.account && !recovery && !(await this.verify(this.account.username, currentPassword ?? ''))) {
        throw new BadRequestException('当前密码不正确');
      }
      const salt = randomBytes(16).toString('hex');
      const next: AdminAccount = { schemaVersion: 1, username, salt,
        passwordHash: (await this.derive(password, salt)).toString('hex'), updatedAt: new Date().toISOString() };
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path);
      this.account = next;
    } finally {
      this.saving = false;
      await unlink(temporary).catch(() => undefined);
    }
  }

  private async derive(password: string, salt: string): Promise<Buffer> {
    if (this.deriving >= 2) throw new HttpException('登录请求繁忙，请稍后重试', HttpStatus.TOO_MANY_REQUESTS);
    this.deriving++;
    try {
      return await new Promise<Buffer>((resolveHash, reject) => {
        scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, hash) => error ? reject(error) : resolveHash(hash));
      });
    } finally {
      this.deriving--;
    }
  }
}
