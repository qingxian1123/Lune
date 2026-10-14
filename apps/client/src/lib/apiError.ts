export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly code = 'NETWORK',
    readonly retryable = true,
    readonly retryAfterMs = 0,
    readonly provider?: string,
  ) { super(message); this.name = 'ApiError'; }
}

export function retryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

/** Abort both fetch and response-body reading; always remove the caller listener. */
export async function boundedRequest<T>(
  work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, timeoutMs = 8_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(new DOMException('Cancelled', 'AbortError')); };
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      reject(new ApiError('歌曲解析超时', 0, 'RESOLVE_TIMEOUT'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    let request: Promise<T>;
    try {
      request = controller.signal.aborted
        ? Promise.reject(new DOMException('Cancelled', 'AbortError')) : work(controller.signal);
    } catch (error) { request = Promise.reject(error); }
    return await Promise.race([interrupted, request]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
