import { version } from '../../package.json';
import type { PlaybackAdvanceReason } from '@lune/shared';

type Diagnostic = {
  event: 'connection' | 'media' | 'recovery' | 'drift' | 'advance';
  reason?: PlaybackAdvanceReason;
  phase?: string; code?: string | null; hold?: string; attempt?: number; seq?: number;
  rtt?: number; drift?: number; readyState?: number; durationMs?: number; operation?: number;
};
const codes = new Set(['CONNECT_TIMEOUT', 'CONNECT_FAILED', 'JOIN_TIMEOUT', 'HEARTBEAT_TIMEOUT', 'SOCKET_CLOSED', 'SOCKET_ERROR',
  'SEND_FAILED', 'SUBSCRIBER_FAILED', 'AUTH_INVALID', 'MEMBER_INVALID', 'ROOM_NOT_FOUND', 'NOT_JOINED',
  'RESOLVE_TIMEOUT', 'RESOLVE_NETWORK', 'PROVIDER_AUTH_REQUIRED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_BUSY', 'PROVIDER_TIMEOUT',
  'MEDIA_NETWORK', 'MEDIA_STALL', 'MEDIA_START_TIMEOUT', 'MEDIA_DECODE', 'MEDIA_UNSUPPORTED', 'RECOVERY_EXHAUSTED',
  'CONNECTION', 'OUTPUT_HELD', 'UNPLAYABLE', 'NEXT_TRACK', 'HTTP_401', 'HTTP_403', 'HTTP_404', 'HTTP_429', 'HTTP_500', 'HTTP_503']);
const phases = new Set(['connecting', 'joining', 'joined', 'reconnecting', 'terminal', 'closed',
  'idle', 'resolving', 'loading', 'playing', 'buffering', 'recovering', 'waiting', 'failed', 'sent', 'received']);
const events = new Set(['connection', 'media', 'recovery', 'drift', 'advance']);
const advanceReasons = new Set(['manual', 'ended', 'unplayable']);
const holds = new Set(['none', 'manual', 'noisy', 'system', 'gesture']);
const entries: Array<Record<string, string | number | null>> = [];
const maxBytes = 256 * 1024;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Explicit whitelist: callers cannot accidentally export URLs, tokens or errors. */
export function recordPlaybackEvent(input: Diagnostic): void {
  const entry: Record<string, string | number | null> = { at: Date.now(), event: events.has(input.event) ? input.event : 'UNKNOWN' };
  if (input.reason && advanceReasons.has(input.reason)) entry.reason = input.reason;
  for (const key of ['phase', 'code', 'hold'] as const) {
    const value = input[key];
    if (typeof value === 'string') entry[key] = (key === 'code' ? codes : key === 'hold' ? holds : phases).has(value) ? value : 'UNKNOWN';
  }
  for (const key of ['attempt', 'seq', 'rtt', 'drift', 'readyState', 'durationMs', 'operation'] as const) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) entry[key] = value;
  }
  entries.push(entry);
  while (entries.length > 300 || bytes(entries) > maxBytes - 1024) entries.shift();
}

export function playbackDiagnosticReport(): string {
  const platform = typeof navigator === 'undefined' ? 'unknown'
    : /android/i.test(navigator.userAgent) ? 'android' : /windows/i.test(navigator.userAgent) ? 'windows' : 'other';
  return JSON.stringify({ schemaVersion: 1, version, platform, events: entries }, null, 0);
}

export async function exportPlaybackDiagnostics(): Promise<string> {
  const report = playbackDiagnosticReport();
  // Native file permissions are not installed. Clipboard is an explicit, local fallback.
  if ('__TAURI_INTERNALS__' in window) {
    await navigator.clipboard.writeText(report);
    return '脱敏诊断已复制，可粘贴保存为 JSON 文件';
  }
  const url = URL.createObjectURL(new Blob([report], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'lune-playback-diagnostics.json';
  document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return '已请求下载脱敏诊断';
}
