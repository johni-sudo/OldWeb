import { HttpError, getClientIp } from './http.js';

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function clientKey(request, env, scope) {
  const ip = getClientIp(request);
  const salt = env.SESSION_SALT || 'project-rate-limit';
  return `${scope}:${await sha256Hex(`${ip}:${salt}`)}`;
}

export async function consumeRateLimit(env, key, { limit, windowSeconds }) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();
  const nowIso = now.toISOString();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
         reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
       RETURNING count, reset_at`,
    )
      .bind(key, resetAt, nowIso, nowIso)
      .first();

    // Opportunistic cleanup; cheap enough and keeps the table bounded.
    if (Math.random() < 0.03) {
      await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(nowIso).run();
    }

    if (row && Number(row.count) > limit) {
      const retryAfter = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - now.getTime()) / 1000));
      throw new HttpError(429, 'rate_limited', 'Слишком много запросов. Попробуйте немного позже.', {
        retryAfter,
      });
    }
    return row;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Rate limiting must not take the whole API down if the table is not
    // available yet during a migration window.
    console.error('rate_limit_failed', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

export async function enforceRateLimit(request, env, scope, limit, windowSeconds) {
  const key = await clientKey(request, env, scope);
  return consumeRateLimit(env, key, { limit, windowSeconds });
}
