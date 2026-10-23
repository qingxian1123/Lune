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

export function hasSavedServerUrl(): boolean {
  return Boolean(readStoredUrl());
}

export function saveServerUrl(input: string): string {
  const normalized = normalizeServerUrl(input);
  window.localStorage.setItem(STORAGE_KEY, normalized);
  window.dispatchEvent(new Event('lune-server-changed'));
  return normalized;
}

export function getWebSocketUrl(): string {
  return webSocketUrlFor(getServerBaseUrl());
}

function webSocketUrlFor(url: string): string {
  const base = new URL(url);
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
    const live = await fetch(`${url}/api/health/live`, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
    const liveHealth = await live.json().catch(() => null) as ServerHealth | null;
    if (!live.ok || liveHealth?.ok !== true) {
      throw new Error('此地址未返回 Lune 服务。请核对服务器地址，或联系服务管理员。');
    }

    const response = await fetch(`${url}/api/health/ready`, {
      headers: { Accept: 'application/json' }, signal: controller.signal,
    });
    const health = await response.json().catch(() => null) as ServerHealth | null;
    if (response.status === 503 && health?.ok === false && Array.isArray(health.providers)) {
      throw new Error('服务已启动，但音乐源暂不可用。请联系服务管理员检查音乐源。');
    }
    if (!response.ok || health?.ok !== true) {
      throw new Error('服务暂时无法使用。请稍后重试，或联系服务管理员。');
    }
    await testWebSocket(webSocketUrlFor(url));
    return { url, health };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('连接超时。请核对服务器地址、网络和服务状态。');
    }
    if (error instanceof TypeError || error instanceof SyntaxError) {
      throw new Error('无法连接此地址。请核对服务器地址、网络，以及服务是否已启动。');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function testWebSocket(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      reject(new Error('服务可访问，但实时连接失败。请联系服务管理员检查 WebSocket 转发。'));
      return;
    }

    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      socket.onopen = socket.onerror = socket.onclose = null;
      try { socket.close(); } catch { /* The connection has already closed. */ }
      if (connected) resolve();
      else reject(new Error('服务可访问，但实时连接失败。请联系服务管理员检查 WebSocket 转发。'));
    };
    const timer = window.setTimeout(() => finish(false), 5_000);
    socket.onopen = () => finish(true);
    socket.onerror = () => finish(false);
    socket.onclose = () => finish(false);
  });
}

function readStoredUrl(): string {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? normalizeServerUrl(value) : '';
  } catch {
    return '';
  }
}
