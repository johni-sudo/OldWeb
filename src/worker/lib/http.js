export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
};

export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function redirect(location, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('Location', location);
  headers.set('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(null, { ...init, status: init.status || 302, headers });
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie');
  const cookies = new Map();
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      cookies.set(name, value);
    }
  }
  return cookies;
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  parts.push(`Path=${options.path || '/'}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  return parts.join('; ');
}

export function clearCookie(name, options = {}) {
  return serializeCookie(name, '', { ...options, maxAge: 0 });
}

export function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

export function getOrigin(request, env) {
  if (env.SITE_ORIGIN) {
    try {
      const configured = new URL(env.SITE_ORIGIN);
      if (configured.protocol === 'https:' || configured.protocol === 'http:') {
        return configured.origin;
      }
    } catch {
      // fall through to request origin
    }
  }
  return new URL(request.url).origin;
}

export function isSecureRequest(request, env) {
  return getOrigin(request, env).startsWith('https://');
}

export async function readJson(request, maxBytes = 48 * 1024) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'unsupported_media_type', 'Ожидается JSON-запрос.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, 'payload_too_large', 'Запрос слишком большой.');
  }
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not an object');
    }
    return value;
  } catch {
    throw new HttpError(400, 'invalid_json', 'Некорректный JSON в запросе.');
  }
}

export function assertMutationRequest(request) {
  if (request.headers.get('X-Requested-With') !== 'PROJECTWeb') {
    throw new HttpError(403, 'csrf_header_missing', 'Запрос отклонён проверкой безопасности.');
  }
  const origin = request.headers.get('Origin');
  if (origin) {
    const expected = new URL(request.url).origin;
    if (origin !== expected) {
      throw new HttpError(403, 'origin_mismatch', 'Запрос отклонён проверкой источника.');
    }
  }
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw new HttpError(403, 'cross_site_request', 'Запрос отклонён проверкой безопасности.');
  }
}

export function addSearchParams(path, values) {
  const url = new URL(path, 'https://local.invalid');
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function safeLocalPath(value, fallback = '/account.html') {
  if (typeof value !== 'string') return fallback;
  const path = value.trim();
  if (!path || path.length > 160 || !path.startsWith('/') || path.startsWith('//')) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return fallback;
  return path;
}

export function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function requestId() {
  return crypto.randomUUID();
}
