import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../../../app.module';
import { ProviderAuthService } from '../../application/provider-auth.service';
import { ProviderConfigService } from '../../infrastructure/config/provider-config.service';
import { EncryptedCredentialStore } from '../../infrastructure/credentials/encrypted-credential.store';
import { ProviderRegistry } from '../../provider.registry';

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const positional = args.filter((arg) => arg !== '--json');

async function main(): Promise<void> {
  const [command = 'help', subcommand, value, extra] = positional;
  if (command === 'init') {
    await initializeFiles();
    return;
  }
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  // CLI 命令只执行显式请求的操作，避免 status/config 等只读命令触发上游网络校验。
  if (command !== 'doctor') process.env.LUNE_SKIP_PROVIDER_STARTUP_CHECKS = '1';

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: jsonOutput ? false : ['error', 'warn'],
  });
  try {
    const auth = app.get(ProviderAuthService);
    const registry = app.get(ProviderRegistry);
    const credentials = app.get(EncryptedCredentialStore);
    const config = app.get(ProviderConfigService);

    if (command === 'status') {
      const providerId = subcommand;
      const rows = registry
        .listAllDetails()
        .filter(({ descriptor }) => !providerId || descriptor.id === providerId)
        .map(({ descriptor, active, status }) => {
          const credential = credentials.get(descriptor.id);
          return {
            id: descriptor.id,
            name: descriptor.displayName,
            active,
            status: status.status,
            reason: status.reason,
            accountId: credential?.accountId,
            accountName: credential?.accountName,
            lastValidatedAt: credential?.lastValidatedAt,
            credentialVersion: credentials.getVersion(descriptor.id),
          };
        });
      output(rows);
      return;
    }

    if (command === 'login') {
      requireProviderId(subcommand);
      let session = await auth.beginLogin(subcommand!);
      output({
        sessionId: session.id,
        providerId: session.providerId,
        state: session.state,
        qrUrl: session.qrUrl,
        expiresAt: session.expiresAt,
      });
      while (!['authorized', 'expired', 'failed', 'cancelled'].includes(session.state)) {
        await delay(1_000);
        session = auth.getLoginSession(subcommand!, session.id);
        if (!jsonOutput) process.stdout.write(`\r${session.state.padEnd(20)}`);
      }
      if (!jsonOutput) process.stdout.write('\n');
      output(session);
      if (session.state !== 'authorized') process.exitCode = 2;
      return;
    }

    if (command === 'validate') {
      requireProviderId(subcommand);
      output(await auth.validate(subcommand!));
      return;
    }

    if (command === 'refresh') {
      requireProviderId(subcommand);
      output(await auth.refresh(subcommand!));
      return;
    }

    if (command === 'logout') {
      requireProviderId(subcommand);
      await auth.logout(subcommand!);
      output({ ok: true, providerId: subcommand });
      return;
    }

    if (command === 'config' && subcommand === 'validate') {
      const snapshot = config.getSnapshot();
      output({ ok: true, path: config.path, config: snapshot });
      return;
    }

    if (command === 'doctor') {
      const providers = registry.listAllDetails().map(({ descriptor, active, status }) => ({
        id: descriptor.id,
        active,
        status: status.status,
        reason: status.reason,
        hasCredential: Boolean(credentials.get(descriptor.id)),
      }));
      output({
        ok: providers.some((provider) => provider.active && provider.status === 'ready'),
        node: process.version,
        configPath: config.path,
        credentialPath: credentials.path,
        credentialStoreWritable: credentials.isWritable(),
        providers,
      });
      if (!providers.some((provider) => provider.active && provider.status === 'ready')) {
        process.exitCode = 2;
      }
      return;
    }

    if (command === 'config' && subcommand === 'set-enabled') {
      if (!value || !['true', 'false'].includes(extra || '')) {
        throw new Error('用法: config set-enabled <providerId> <true|false>');
      }
      output({ ok: true, config: await config.setEnabled(value, extra === 'true') });
      return;
    }

    throw new Error(`未知命令: ${positional.join(' ')}`);
  } finally {
    await app.close();
  }
}

async function initializeFiles(): Promise<void> {
  const configDir = resolve(process.cwd(), 'config');
  const dataDir = resolve(process.cwd(), 'data');
  const logsDir = resolve(process.cwd(), 'logs');
  const configPath = resolve(configDir, 'providers.json');
  const envPath = resolve(process.cwd(), '.env.provider.generated');
  await mkdir(configDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });
  if (!existsSync(configPath)) {
    await writeFile(
      configPath,
      `${JSON.stringify(defaultConfig(), null, 2)}\n`,
      { encoding: 'utf8' },
    );
  }
  if (!existsSync(envPath)) {
    const content = [
      '# Copy these values into the deployment secret store or .env, then remove this file.',
      `LUNE_CONFIG_FILE=${configPath}`,
      `LUNE_DATA_DIR=${dataDir}`,
      `LUNE_MASTER_KEY=${randomBytes(32).toString('base64')}`,
      `LUNE_ADMIN_TOKEN=${randomBytes(32).toString('hex')}`,
      `JWT_SECRET=${randomBytes(48).toString('hex')}`,
      '',
    ].join('\n');
    await writeFile(envPath, content, { encoding: 'utf8', mode: 0o600 });
  }
  output({
    ok: true,
    configPath,
    dataDir,
    logsDir,
    generatedSecretsPath: envPath,
    next: '将生成的变量写入 .env 或部署平台 Secret，然后删除 .env.provider.generated',
  });
}

function defaultConfig() {
  return {
    schemaVersion: 1,
    defaultProvider: 'netease',
    providers: {
      netease: {
        enabled: true,
        requestTimeoutMs: 10_000,
        healthCheckIntervalMs: 1_800_000,
      },
      kugou: {
        enabled: true,
        requestTimeoutMs: 10_000,
        healthCheckIntervalMs: 1_800_000,
        refreshIntervalMs: 21_600_000,
      },
    },
    routing: { failureThreshold: 3, circuitOpenMs: 30_000 },
  };
}

function requireProviderId(value?: string): void {
  if (!value) throw new Error('缺少 Provider ID');
}

function output(value: unknown): void {
  if (jsonOutput || typeof value !== 'string') console.log(JSON.stringify(value, null, 2));
  else console.log(value);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function printHelp(): void {
  console.log(`Lune Provider CLI

Usage:
  pnpm --filter @lune/server provider init
  pnpm --filter @lune/server provider status [providerId] [--json]
  pnpm --filter @lune/server provider login <providerId> [--json]
  pnpm --filter @lune/server provider validate <providerId> [--json]
  pnpm --filter @lune/server provider refresh <providerId> [--json]
  pnpm --filter @lune/server provider logout <providerId> [--json]
  pnpm --filter @lune/server provider config validate [--json]
  pnpm --filter @lune/server provider config set-enabled <providerId> <true|false> [--json]
  pnpm --filter @lune/server provider doctor [--json]`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (jsonOutput) console.error(JSON.stringify({ ok: false, error: message }));
  else console.error(`Provider CLI failed: ${message}`);
  process.exitCode = 1;
});
