import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { MusicProvider } from '@lune/shared';
import { EncryptedCredentialStore } from '../src/providers/infrastructure/credentials/encrypted-credential.store';
import { ProviderConfigService } from '../src/providers/infrastructure/config/provider-config.service';
import { LocalProviderEventBus } from '../src/providers/infrastructure/events/local-provider-event-bus';
import { ProviderRegistry } from '../src/providers/provider.registry';
import { ProviderStatusStore } from '../src/providers/runtime/provider-status.store';
import { mapNeteaseLoginState } from '../src/providers/netease/netease-auth.adapter';
import { mapKugouLoginState } from '../src/providers/kugou/kugou-auth.adapter';
import { parseCookieParts, parseCookieString } from '../src/providers/domain/cookie';

async function main(): Promise<void> {
  const temporary = await mkdtemp(resolve(tmpdir(), 'lune-provider-test-'));
  const legacyNetease = process.env.MUSIC_COOKIE;
  const legacyKugou = process.env.KUGOU_COOKIE;
  delete process.env.MUSIC_COOKIE;
  delete process.env.KUGOU_COOKIE;
  try {
    await testEncryptedCredentialStore(temporary);
    await testConfigValidation(temporary);
    await testArchitectureBoundaries();
    testPluginRegistry();
    testLoginStateMapping();
    console.log('Provider system foundation tests passed');
  } finally {
    if (legacyNetease === undefined) delete process.env.MUSIC_COOKIE;
    else process.env.MUSIC_COOKIE = legacyNetease;
    if (legacyKugou === undefined) delete process.env.KUGOU_COOKIE;
    else process.env.KUGOU_COOKIE = legacyKugou;
    if (temporary.startsWith(resolve(tmpdir(), 'lune-provider-test-'))) {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

async function testArchitectureBoundaries(): Promise<void> {
  const roots = [
    resolve(__dirname, '../src/providers/domain'),
    resolve(__dirname, '../src/providers/application'),
  ];
  const forbidden = /@nestjs|node:fs|process\.env|NeteaseCloudMusicApi|kugoumusicapi/;
  for (const root of roots) {
    for (const path of await typescriptFiles(root)) {
      const source = await readFile(path, 'utf8');
      assert.equal(forbidden.test(source), false, `forbidden core dependency: ${path}`);
    }
  }
}

async function typescriptFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...(await typescriptFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) result.push(path);
  }
  return result;
}

function testLoginStateMapping(): void {
  assert.equal(mapNeteaseLoginState(800), 'expired');
  assert.equal(mapNeteaseLoginState(801), 'waiting-scan');
  assert.equal(mapNeteaseLoginState(802), 'waiting-confirm');
  assert.equal(mapNeteaseLoginState(803), 'authorized');
  assert.equal(mapNeteaseLoginState(500), 'failed');
  assert.equal(mapKugouLoginState(0), 'expired');
  assert.equal(mapKugouLoginState(1), 'waiting-scan');
  assert.equal(mapKugouLoginState(2), 'waiting-confirm');
  assert.equal(mapKugouLoginState(4), 'authorized');
  assert.equal(mapKugouLoginState(9), 'failed');
  assert.deepEqual(parseCookieString('token=a=b; userid=42; empty='), {
    token: 'a=b',
    userid: '42',
    empty: '',
  });
  assert.deepEqual(parseCookieParts(['token=a', 'userid=42']), {
    token: 'a',
    userid: '42',
  });
}

async function testEncryptedCredentialStore(temporary: string): Promise<void> {
  const dataDir = resolve(temporary, 'credentials');
  const key = randomBytes(32).toString('base64');
  const config = new ConfigService({ LUNE_DATA_DIR: dataDir, LUNE_MASTER_KEY: key });
  const store = new EncryptedCredentialStore(config);
  await store.onModuleInit();
  const now = new Date().toISOString();
  const version = await store.put(null, {
    schemaVersion: 1,
    providerId: 'fake',
    accountId: 'account-1',
    cookie: { token: 'secret-value' },
    issuedAt: now,
    updatedAt: now,
  });
  assert.equal(version, 1);
  assert.equal(store.get('fake')?.cookie.token, 'secret-value');

  const persistedText = await import('node:fs/promises').then(({ readFile }) =>
    readFile(store.path, 'utf8'),
  );
  assert.equal(persistedText.includes('secret-value'), false, 'credential must not be plaintext');

  const reloaded = new EncryptedCredentialStore(config);
  await reloaded.onModuleInit();
  assert.equal(reloaded.getVersion('fake'), 1);
  assert.equal(reloaded.getCookieString('fake'), 'token=secret-value');
  await assert.rejects(() => reloaded.put(null, reloaded.get('fake')!), /version conflict/);

  const wrongKeyStore = new EncryptedCredentialStore(
    new ConfigService({
      LUNE_DATA_DIR: dataDir,
      LUNE_MASTER_KEY: randomBytes(32).toString('base64'),
    }),
  );
  await assert.rejects(() => wrongKeyStore.onModuleInit(), /cannot decrypt credential file/);
}

async function testConfigValidation(temporary: string): Promise<void> {
  const validPath = resolve(temporary, 'providers.json');
  await writeFile(
    validPath,
    JSON.stringify({
      schemaVersion: 1,
      defaultProvider: 'fake',
      providers: { fake: { enabled: true }, spare: { enabled: true } },
      routing: {},
    }),
  );
  const config = new ProviderConfigService(new ConfigService({ LUNE_CONFIG_FILE: validPath }));
  assert.deepEqual(config.getActiveProviderIds(), ['fake', 'spare']);
  assert.equal(config.getProvider('fake')?.requestTimeoutMs, 10_000);
  await config.setEnabled('spare', false);
  assert.deepEqual(config.getActiveProviderIds(), ['fake']);
  await assert.rejects(() => config.setEnabled('fake', false), /不能禁用 defaultProvider/);

  const invalidPath = resolve(temporary, 'invalid-providers.json');
  await writeFile(
    invalidPath,
    JSON.stringify({
      schemaVersion: 1,
      defaultProvider: 'missing',
      providers: { fake: { enabled: true } },
    }),
  );
  assert.throws(
    () => new ProviderConfigService(new ConfigService({ LUNE_CONFIG_FILE: invalidPath })),
    /default provider is missing or disabled/,
  );
}

function testPluginRegistry(): void {
  const events = new LocalProviderEventBus();
  const statuses = new ProviderStatusStore(events);
  const registry = new ProviderRegistry(statuses);
  const catalog: MusicProvider = {
    id: 'fake',
    async search() {
      return { songs: [] };
    },
    async resolve(id) {
      return {
        track: {
          id,
          provider: 'fake',
          name: '',
          artists: '',
          album: '',
          coverUrl: '',
          duration: 0,
        },
        url: null,
      };
    },
    async lyric() {
      return { lines: [] };
    },
  };
  registry.register({
    descriptor: {
      id: 'fake',
      displayName: 'Fake Provider',
      capabilities: ['search', 'resolve', 'lyric'],
      requiresAccount: false,
    },
    catalog,
  });
  registry.setActive(['fake']);
  assert.equal(registry.getActive()?.id, 'fake');
  assert.equal(registry.getDescriptor('fake')?.displayName, 'Fake Provider');
  assert.equal(registry.listAllDetails()[0].active, true);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
