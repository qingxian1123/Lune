import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const serverRoot = resolve(__dirname, '..', '..', '..', '..');
  const workspaceRoot = resolve(serverRoot, '..');
  const deploySource = resolve(workspaceRoot, 'server-deploy');
  const target = resolve(workspaceRoot, 'server-release-clean');
  const sourceDist = resolve(serverRoot, 'dist');
  await stat(resolve(sourceDist, 'main.js'));
  const { version } = JSON.parse(await readFile(resolve(serverRoot, 'package.json'), 'utf8')) as { version: string };
  const releaseNotes = resolve(deploySource, 'releases', `v${version}.md`);
  await stat(releaseNotes);

  const allowlist = [
    'dist/',
    'admin-public/',
    'config/providers.json',
    'systemd/',
    'bin/lune-provider',
    'bin/lune-admin-code',
    'nginx/lune.conf',
    'ecosystem.config.cjs',
    '.env.example',
    'package.json',
    'package-lock.json',
    'README.md',
    'ADMIN.md',
    'RELEASE-NOTES.md',
  ];
  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, target, allowlist }, null, 2));
    return;
  }

  const stage = resolve(workspaceRoot, `.server-release-clean-next-${process.pid}-${Date.now()}`);
  await mkdir(stage, { recursive: true });
  await copyDirectory(sourceDist, resolve(stage, 'dist'));
  await copyFile(resolve(serverRoot, 'admin-public', 'dashboard.html'), resolve(stage, 'admin-public', 'dashboard.html'));
  await copyFile(resolve(serverRoot, 'config', 'providers.json'), resolve(stage, 'config', 'providers.json'));
  await copyDirectory(resolve(deploySource, 'systemd'), resolve(stage, 'systemd'));
  await copyFile(resolve(deploySource, 'bin', 'lune-provider'), resolve(stage, 'bin', 'lune-provider'));
  await copyFile(resolve(deploySource, 'bin', 'lune-admin-code'), resolve(stage, 'bin', 'lune-admin-code'));
  await chmod(resolve(stage, 'bin', 'lune-provider'), 0o755);
  await chmod(resolve(stage, 'bin', 'lune-admin-code'), 0o755);
  await copyFile(resolve(deploySource, 'ADMIN.md'), resolve(stage, 'ADMIN.md'));
  await copyFile(releaseNotes, resolve(stage, 'RELEASE-NOTES.md'));
  await copyFile(resolve(deploySource, 'nginx', 'lune.conf'), resolve(stage, 'nginx', 'lune.conf'));
  for (const name of [
    'ecosystem.config.cjs',
    '.env.example',
    'package.json',
    'package-lock.json',
  ]) {
    await copyFile(resolve(deploySource, name), resolve(stage, name));
  }
  const deploymentGuide = (await readFile(resolve(workspaceRoot, 'docs', 'DEPLOYMENT.md'), 'utf8'))
    .replaceAll('](../server-deploy/ADMIN.md)', '](ADMIN.md)');
  await writeFile(resolve(stage, 'README.md'), deploymentGuide, 'utf8');

  const release = {
    schemaVersion: 1,
    version,
    dataSchemaVersion: 1,
    providerConfigSchemaVersion: 1,
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
