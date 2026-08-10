import { execFileSync } from 'node:child_process';
import { cp, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const serverRoot = resolve(__dirname, '..', '..', '..', '..');
  const workspaceRoot = resolve(serverRoot, '..');
  const deploySource = resolve(workspaceRoot, 'server-deploy');
  const target = resolve(workspaceRoot, 'server-release-clean');
  const sourceDist = resolve(serverRoot, 'dist');
  await stat(resolve(sourceDist, 'main.js'));

  const allowlist = [
    'dist/',
    'config/providers.json',
    'systemd/',
    'bin/lune-provider',
    'nginx/lune.conf',
    'ecosystem.config.cjs',
    '.env.new-login.example',
    'package.json',
    'package-lock.json',
    'README.md',
  ];
  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, target, allowlist }, null, 2));
    return;
  }

  const stage = resolve(workspaceRoot, `.server-release-clean-next-${process.pid}-${Date.now()}`);
  await mkdir(stage, { recursive: true });
  await copyDirectory(sourceDist, resolve(stage, 'dist'));
  await copyFile(resolve(serverRoot, 'config', 'providers.json'), resolve(stage, 'config', 'providers.json'));
  await copyDirectory(resolve(deploySource, 'systemd'), resolve(stage, 'systemd'));
  await copyFile(resolve(deploySource, 'bin', 'lune-provider'), resolve(stage, 'bin', 'lune-provider'));
  await copyFile(resolve(deploySource, 'nginx', 'lune.conf'), resolve(stage, 'nginx', 'lune.conf'));
  for (const name of [
    'ecosystem.config.cjs',
    '.env.new-login.example',
    'package.json',
    'package-lock.json',
  ]) {
    await copyFile(resolve(deploySource, name), resolve(stage, name));
  }
  await copyFile(
    resolve(workspaceRoot, 'docs', 'UBUNTU_NEW_LOGIN_DEPLOY.md'),
    resolve(stage, 'README.md'),
  );

  const release = {
    schemaVersion: 1,
    cleanDeployment: true,
    includesLegacyCredentials: false,
    builtAt: new Date().toISOString(),
    node: process.version,
    gitCommit: gitCommit(workspaceRoot),
    upstream: {
      netease: 'NeteaseCloudMusicApi@4.32.0',
      kugou: 'MakcRe/KuGouMusicApi@v1.5.1',
    },
  };
  await writeFile(resolve(stage, 'RELEASE.json'), `${JSON.stringify(release, null, 2)}\n`, 'utf8');

  if (await exists(target)) {
    const backup = resolve(
      workspaceRoot,
      `server-release-clean.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    );
    await rename(target, backup);
  }
  await rename(stage, target);
  console.log(JSON.stringify({ ok: true, target, release, allowlist }, null, 2));
}

async function copyDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
}

async function copyFile(source: string, target: string): Promise<void> {
  await mkdir(resolve(target, '..'), { recursive: true });
  await cp(source, target, { force: true });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function gitCommit(cwd: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
