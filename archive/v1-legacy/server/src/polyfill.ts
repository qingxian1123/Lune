import crypto from 'crypto';

// NeteaseCloudMusicApi 依赖 uuid 包，但 ESM 模式下可能不可用
// 提供一个简易 polyfill
export function v4(): string {
  return crypto.randomUUID();
}
