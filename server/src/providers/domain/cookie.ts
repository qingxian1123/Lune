export function parseCookieString(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of value.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    if (!key) continue;
    result[key] = part.slice(separator + 1).trim();
  }
  return result;
}

export function parseCookieParts(parts: unknown): Record<string, string> {
  if (typeof parts === 'string') return parseCookieString(parts);
  if (!Array.isArray(parts)) return {};
  return parts.reduce<Record<string, string>>((result, part) => {
    if (typeof part === 'string') Object.assign(result, parseCookieString(part));
    return result;
  }, {});
}

export function serializeCookie(cookie: Record<string, string>): string {
  return Object.entries(cookie)
    .filter(([key]) => key.length > 0)
    .map(([key, value]) => `${key}=${value}`)
    .join(';');
}
