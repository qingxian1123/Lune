import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseCookieString, serializeCookie } from '../../domain/cookie';
import type {
  CredentialStorePort,
  ProviderCredentialEnvelope,
} from '../../domain/provider-domain';

interface StoredCredential {
  version: number;
  credential: ProviderCredentialEnvelope;
}

interface CredentialPayload {
  schemaVersion: 1;
  records: Record<string, StoredCredential>;
}

interface EncryptedDocument {
  schemaVersion: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

@Injectable()
export class EncryptedCredentialStore implements CredentialStorePort, OnModuleInit {
  private readonly logger = new Logger(EncryptedCredentialStore.name);
  private readonly records = new Map<string, StoredCredential>();
  private readonly key: Buffer | null;
  readonly path: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(@Inject(ConfigService) private readonly env: ConfigService) {
    const dataDir = this.env.get<string>('LUNE_DATA_DIR')?.trim() || resolve(process.cwd(), 'data');
    this.path = resolve(dataDir, 'provider-credentials.enc.json');
    this.key = this.decodeKey(this.env.get<string>('LUNE_MASTER_KEY'));
  }

  async onModuleInit(): Promise<void> {
    await this.load();
    await this.loadLegacyCredential('netease', this.env.get<string>('MUSIC_COOKIE'));
    await this.loadLegacyCredential('kugou', this.env.get<string>('KUGOU_COOKIE'));
    if (!this.key) {
      this.logger.warn(
        'LUNE_MASTER_KEY is not configured; legacy credentials work in memory, but login persistence is disabled',
      );
    }
  }

  get(providerId: string): ProviderCredentialEnvelope | null {
    const value = this.records.get(providerId)?.credential;
    return value ? structuredClone(value) : null;
  }

  getVersion(providerId: string): number | null {
    return this.records.get(providerId)?.version ?? null;
  }

  isWritable(): boolean {
    return Boolean(this.key);
  }

  getCookieString(providerId: string, legacyFallback = ''): string {
    const credential = this.records.get(providerId)?.credential;
    return credential ? serializeCookie(credential.cookie) : legacyFallback;
  }

  getCookieObject(providerId: string, legacyFallback = ''): Record<string, string> {
    const credential = this.records.get(providerId)?.credential;
    return credential ? { ...credential.cookie } : parseCookieString(legacyFallback);
  }

  async put(
    expectedVersion: number | null,
    credential: ProviderCredentialEnvelope,
  ): Promise<number> {
    this.assertWritable();
    this.validateCredential(credential);
    return this.enqueue(async () => {
      const currentVersion = this.records.get(credential.providerId)?.version ?? null;
      if (currentVersion !== expectedVersion) {
        throw new Error(
          `credential version conflict for ${credential.providerId}: expected ${String(expectedVersion)}, actual ${String(currentVersion)}`,
        );
      }
      const nextVersion = (currentVersion ?? 0) + 1;
      this.records.set(credential.providerId, {
        version: nextVersion,
        credential: structuredClone(credential),
      });
      await this.persist();
      return nextVersion;
    });
  }

  async remove(providerId: string): Promise<void> {
    this.assertWritable();
    await this.enqueue(async () => {
      if (!this.records.delete(providerId)) return;
      await this.persist();
    });
  }

  private async load(): Promise<void> {
    let documentText: string;
    try {
      documentText = await readFile(this.path, 'utf8');
    } catch (error: any) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (!this.key) {
      throw new Error(`credential file exists but LUNE_MASTER_KEY is not configured: ${this.path}`);
    }
    let document: EncryptedDocument;
    try {
      document = JSON.parse(documentText) as EncryptedDocument;
    } catch {
      throw new Error(`credential file is not valid JSON: ${this.path}`);
    }
    if (document.schemaVersion !== 1 || document.algorithm !== 'aes-256-gcm') {
      throw new Error(`unsupported credential document format: ${this.path}`);
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(document.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(document.tag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(document.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      const payload = JSON.parse(plaintext) as CredentialPayload;
      if (payload.schemaVersion !== 1 || !payload.records) throw new Error('invalid payload');
      for (const [providerId, value] of Object.entries(payload.records)) {
        this.validateCredential(value.credential);
        this.records.set(providerId, structuredClone(value));
      }
      this.logger.log(`loaded ${this.records.size} provider credential(s)`);
    } catch (error) {
      throw new Error(
        `cannot decrypt credential file: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async loadLegacyCredential(providerId: string, cookieValue?: string): Promise<void> {
    if (this.records.has(providerId) || !cookieValue?.trim()) return;
    const now = new Date().toISOString();
    const credential: ProviderCredentialEnvelope = {
      schemaVersion: 1,
      providerId,
      cookie: parseCookieString(cookieValue),
      issuedAt: now,
      updatedAt: now,
      metadata: { source: 'legacy-env' },
    };
    if (Object.keys(credential.cookie).length === 0) return;
    this.records.set(providerId, { version: 0, credential });
    if (this.key) {
      await this.persist();
      this.logger.warn(`${providerId} credential migrated from legacy environment variable`);
    }
  }

  private async persist(): Promise<void> {
    this.assertWritable();
    const records = Object.fromEntries(
      [...this.records.entries()].map(([providerId, value]) => [providerId, structuredClone(value)]),
    );
    const payload: CredentialPayload = { schemaVersion: 1, records };
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key!, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    const document: EncryptedDocument = {
      schemaVersion: 1,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
    await mkdir(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.path);
  }

  private decodeKey(value?: string): Buffer | null {
    const input = value?.trim();
    if (!input) return null;
    const key = /^[a-fA-F0-9]{64}$/.test(input)
      ? Buffer.from(input, 'hex')
      : Buffer.from(input, 'base64');
    if (key.length !== 32) {
      throw new Error('LUNE_MASTER_KEY must be 32 bytes encoded as base64 or 64 hex characters');
    }
    return key;
  }

  private validateCredential(credential: ProviderCredentialEnvelope): void {
    if (
      credential.schemaVersion !== 1 ||
      !credential.providerId ||
      !credential.cookie ||
      typeof credential.cookie !== 'object'
    ) {
      throw new Error('invalid provider credential');
    }
  }

  private assertWritable(): void {
    if (!this.key) throw new Error('LUNE_MASTER_KEY is required to persist provider credentials');
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
