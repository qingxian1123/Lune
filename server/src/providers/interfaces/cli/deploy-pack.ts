import { execFileSync } from 'node:child_process';
import { cp, mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const serverRoot = resolve(__dirname, '..', '..', '..', '..');
  const workspaceRoot = resolve(serverRoot, '..');
  const deployRoot = resolve(workspaceRoot, 'server-deploy');
  const sourceDist = resolve(serverRoot, 'dist');
  const targetDist = resolve(deployRoot, 'dist');
  await stat(resolve(sourceDist, 'main.js'));
  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, sourceDist, targetDist }, null, 2));
    return;
  }
  await mkdir(deployRoot, { recursive: true });

  const nextDist = resolve(deployRoot, `.dist-next-${process.pid}-${Date.now()}`);
  await cp(sourceDist, nextDist, { recursive: true, force: true });
  if (await exists(targetDist)) {
    const backup = resolve(deployRoot, `dist.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    await rename(targetDist, backup);
  }
  await rename(nextDist, targetDist);

  const release = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    node: process.version,
    gitCommit: gitCommit(workspaceRoot),
    providerConfigSchemaVersion: 1,
    upstream: {
      netease: 'NeteaseCloudMusicApi@4.32.0',
      kugou: 'MakcRe/KuGouMusicApi@v1.5.1',
    },
  };
  await writeFile(
    resolve(deployRoot, 'RELEASE.json'),
    `${JSON.stringify(release, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify({ ok: true, deployRoot, release }, null, 2));
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
