const STORAGE_KEY = 'lune.server.base-url.v1';
const BUILD_DEFAULT = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim() ?? '';

export interface ServerHealth {
  ok: boolean;
  providers?: Array<{ id: string; status: string }>;
}

export function normalizeServerUrl(input: string): string {
  let value = input.trim();
  if (!value) throw new Error('请先填写服务器地址');
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) value = `http://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('服务器地址格式不正确');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('服务器地址只支持 HTTP 或 HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new Error('服务器地址不能包含用户名或密码');
  }

  parsed.search = '';
  parsed.hash = '';
  let pathname = parsed.pathname.replace(/\/+$/, '');
  if (pathname === '/api') pathname = '';
  return `${parsed.origin}${pathname}`;
}

export function getServerBaseUrl(): string {
  const stored = readStoredUrl();
  if (stored) return stored;
  if (BUILD_DEFAULT) return normalizeServerUrl(BUILD_DEFAULT);
  throw new Error('尚未配置服务器，请返回首页填写服务器地址');
}

export function getInitialServerUrl(): string {
  return readStoredUrl() || (BUILD_DEFAULT ? normalizeServerUrl(BUILD_DEFAULT) : '');
}

export function saveServerUrl(input: string): string {
  const normalized = normalizeServerUrl(input);
  window.localStorage.setItem(STORAGE_KEY, normalized);
  window.dispatchEvent(new Event('lune-server-changed'));
  return normalized;
}

export function getWebSocketUrl(): string {
  const base = new URL(getServerBaseUrl());
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/ws`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

export async function testServerConnection(input: string): Promise<{
  url: string;
  health: ServerHealth;
}> {
  const url = normalizeServerUrl(input);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${url}/api/health/ready`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`服务器健康检查返回 HTTP ${response.status}`);
    const health = await response.json() as ServerHealth;
    if (!health.ok) throw new Error('服务器尚未就绪');
    return { url, health };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('连接服务器超时，请检查地址和网络');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function readStoredUrl(): string {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? normalizeServerUrl(value) : '';
  } catch {
    return '';
  }
}
