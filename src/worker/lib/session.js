import { HttpError, clearCookie, getClientIp, isSecureRequest, parseCookies, serializeCookie } from './http.js';
import { parseAdminSteamIds } from './config.js';
import { sha256Hex } from './rate-limit.js';

export const SESSION_COOKIE = 'project_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function randomToken(bytes = 32) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    steamId: row.steam_id,
    personaName: row.persona_name,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    isBanned: Boolean(row.is_banned),
    banReason: row.ban_reason || '',
    compactUi: Boolean(row.compact_ui),
    reduceMotion: Boolean(row.reduce_motion),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    steamId: user.steamId,
    personaName: user.personaName,
    avatarUrl: user.avatarUrl,
    profileUrl: user.profileUrl,
    isBanned: user.isBanned,
    compactUi: user.compactUi,
    reduceMotion: user.reduceMotion,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export function isAdminUser(user, env) {
  if (!user || user.isBanned) return false;
  return parseAdminSteamIds(env.ADMIN_STEAM_IDS).has(String(user.steamId));
}

export async function createSession(request, env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const userAgent = (request.headers.get('User-Agent') || '').slice(0, 280);
  const ipHash = await sha256Hex(`${getClientIp(request)}:${env.SESSION_SALT || 'project-session'}`);

  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(tokenHash, userId, now.toISOString(), expires.toISOString(), now.toISOString(), userAgent, ipHash)
    .run();

  // Keep the number of concurrent sessions bounded without surprising the user:
  // only old expired sessions are removed here, active ones are managed in the UI.
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?')
    .bind(userId, now.toISOString())
    .run();

  return { token, tokenHash, expiresAt: expires.toISOString() };
}

export function sessionCookie(request, env, token) {
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    httpOnly: true,
    secure: isSecureRequest(request, env),
    sameSite: 'Lax',
  });
}

export function clearSessionCookie(request, env) {
  return clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    secure: isSecureRequest(request, env),
    sameSite: 'Lax',
  });
}

export async function getSession(request, env, { touch = true } = {}) {
  const token = parseCookies(request).get(SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.created_at AS session_created_at, s.expires_at, s.last_seen_at,
            u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first();

  if (!row) return null;
  const user = mapUser(row);
  if (!user) return null;

  if (touch) {
    const lastSeen = new Date(row.last_seen_at).getTime();
    if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 60 * 60 * 1000) {
      await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?')
        .bind(new Date().toISOString(), tokenHash)
        .run();
    }
  }

  return {
    user,
    tokenHash,
    createdAt: row.session_created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
  };
}

export async function requireUser(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    throw new HttpError(401, 'authentication_required', 'Требуется вход через Steam.');
  }
  if (session.user.isBanned) {
    throw new HttpError(403, 'account_banned', 'Аккаунт заблокирован.');
  }
  return session;
}

export async function requireAdmin(request, env) {
  const session = await requireUser(request, env);
  if (!isAdminUser(session.user, env)) {
    throw new HttpError(403, 'admin_required', 'Недостаточно прав для этого действия.');
  }
  return session;
}

export async function revokeSession(env, tokenHash) {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export async function revokeOtherSessions(env, userId, currentTokenHash) {
  const result = await env.DB.prepare(
    'DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?',
  )
    .bind(userId, currentTokenHash)
    .run();
  return result.meta?.changes || 0;
}
