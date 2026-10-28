import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const clientRoot = fileURLToPath(new URL('../', import.meta.url));
const windowsConfigPath = fileURLToPath(new URL('../src-tauri/tauri.windows.conf.json', import.meta.url));
const frontendOverridePath = fileURLToPath(new URL('../tauri.build-no-frontend.json', import.meta.url));

if (process.platform !== 'win32') throw new Error('Windows exe 构建需要 Windows 环境。');
const config = JSON.parse(readFileSync(windowsConfigPath, 'utf8'));
const mainWindow = config.app?.windows?.find((window) => (window.label || 'main') === 'main');
if (mainWindow?.decorations !== false) throw new Error('Windows 主窗口必须使用 decorations: false，构建已停止。');

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: clientRoot, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['scripts/check-input-focus.mjs']);
run(['node_modules/typescript/bin/tsc', '--noEmit']);
run(['node_modules/vite/bin/vite.js', 'build']);
console.log(`Windows window configuration: decorations=${mainWindow.decorations}, shadow=${mainWindow.shadow}, resizable=${mainWindow.resizable}`);
run([
  'node_modules/@tauri-apps/cli/tauri.js', 'build',
  '--config', windowsConfigPath,
  '--config', frontendOverridePath,
  '--no-bundle',
  ...(process.argv.includes('--offline') ? ['--', '--offline'] : []),
]);
