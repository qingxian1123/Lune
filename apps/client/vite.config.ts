import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri Android dev 时由 CLI 注入,指向局域网内可被设备访问的地址
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Source folders also contain historical transpiled .js files. Prefer the
  // TypeScript sources so Vite dev never renders a stale generated copy.
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts', '.json'],
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5174,
        }
      : undefined,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
