import {
  HttpError,
  SECURITY_HEADERS,
  addSearchParams,
  clearCookie,
  getOrigin,
  isSecureRequest,
  json,
  parseCookies,
  redirect,
  safeLocalPath,
  serializeCookie,
} from '../lib/http.js';
import { steamConfigured } from '../lib/config.js';
import { sha256Hex } from '../lib/rate-limit.js';
import { enforceRateLimit } from '../lib/rate-limit.js';
import {
  clearSessionCookie,
  createSession,
  getSession,
  isAdminUser,
  publicUser,
  revokeSession,
  sessionCookie,
} from '../lib/session.js';
import { buildSteamLoginUrl, fetchSteamProfile, verifySteamAssertion } from '../lib/steam.js';

const STATE_COOKIE = 'project_steam_state';
const STATE_TTL_SECONDS = 10 * 60;

function randomState() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function stateCookie(request, env, value, maxAge = STATE_TTL_SECONDS) {
  return serializeCookie(STATE_COOKIE, value, {
    maxAge,
    path: '/api/auth/steam',
    httpOnly: true,
    secure: isSecureRequest(request, env),
    sameSite: 'Lax',
  });
}

function securedRedirect(location, extraCookies = []) {
  const headers = new Headers();
  headers.set('Location', location);
  headers.set('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  for (const cookie of extraCookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

function authErrorRedirect(request, env, code, extraCookies = []) {
  const target = addSearchParams('/account.html', { auth_error: code });
  return securedRedirect(target, extraCookies);
}

export async function startSteamLogin(request, env) {
  if (!steamConfigured(env)) {
    return authErrorRedirect(request, env, 'not_configured');
  }

  try {
    await enforceRateLimit(request, env, 'steam_login', 20, 10 * 60);
  } catch (error) {
    if (error instanceof HttpError) return authErrorRedirect(request, env, 'rate_limited');
    throw error;
  }

  const url = new URL(request.url);
  const returnTo = safeLocalPath(url.searchParams.get('return_to'), '/account.html');
  const origin = getOrigin(request, env);
  const state = randomState();
  const stateHash = await sha256Hex(state);
  const now = new Date();
  const expires = new Date(now.getTime() + STATE_TTL_SECONDS * 1000);

  await env.DB.prepare('DELETE FROM login_states WHERE expires_at < ?').bind(now.toISOString()).run();
  await env.DB.prepare(
    'INSERT INTO login_states (state_hash, created_at, expires_at, return_to) VALUES (?, ?, ?, ?)',
  )
    .bind(stateHash, now.toISOString(), expires.toISOString(), returnTo)
    .run();

  const { url: steamUrl } = buildSteamLoginUrl({ origin, state, returnTo });
  const response = redirect(steamUrl);
  response.headers.append('Set-Cookie', stateCookie(request, env, state));
  return response;
}

function authFailure(code) {
  const messages = {
    not_configured: 'Вход через Steam ещё не настроен на сервере.',
    state_mismatch: 'Сессия входа истекла или не совпала. Попробуйте снова.',
    invalid_response: 'Steam вернул некорректный ответ. Попробуйте снова.',
    banned: 'Этот аккаунт заблокирован.',
    profile_unavailable: 'Не удалось получить профиль Steam. Попробуйте позже.',
    rate_limited: 'Слишком много попыток входа. Попробуйте через несколько минут.',
    internal: 'Не удалось завершить вход. Попробуйте позже.',
  };
  return { code, message: messages[code] || 'Не удалось выполнить вход через Steam.' };
}

export async function steamCallback(request, env) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const cookies = parseCookies(request);
  const cookieState = cookies.get(STATE_COOKIE) || '';
  const clearedStateCookie = clearCookie(STATE_COOKIE, {
    path: '/api/auth/steam',
    httpOnly: true,
    secure: isSecureRequest(request, env),
    sameSite: 'Lax',
  });

  if (!/^[a-f0-9]{64}$/.test(state) || !timingSafeEqual(state, cookieState)) {
    return authErrorRedirect(request, env, 'state_mismatch', [clearedStateCookie]);
  }

  const stateHash = await sha256Hex(state);
  const stateRow = await env.DB.prepare(
    'DELETE FROM login_states WHERE state_hash = ? AND expires_at > ? RETURNING return_to',
  )
    .bind(stateHash, new Date().toISOString())
    .first();

  if (!stateRow) {
    return authErrorRedirect(request, env, 'state_mismatch', [clearedStateCookie]);
  }

  try {
    const origin = getOrigin(request, env);
    const expectedReturnTo = `${origin}/api/auth/steam/callback?state=${encodeURIComponent(state)}`;
    const { steamId } = await verifySteamAssertion(url.searchParams, { expectedReturnTo });
    const profile = await fetchSteamProfile(steamId, env);

    const now = new Date().toISOString();
    const user = await env.DB.prepare(
      `INSERT INTO users
         (steam_id, persona_name, avatar_url, profile_url, created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(steam_id) DO UPDATE SET
         persona_name = excluded.persona_name,
         avatar_url = excluded.avatar_url,
         profile_url = excluded.profile_url,
         last_login_at = excluded.last_login_at,
         updated_at = excluded.updated_at
       RETURNING *`,
    )
      .bind(
        steamId,
        profile.personaName,
        profile.avatarUrl,
        profile.profileUrl,
        now,
        now,
        now,
      )
      .first();

    if (!user) throw new HttpError(500, 'user_upsert_failed', 'Не удалось создать аккаунт.');
    if (user.is_banned) {
      return authErrorRedirect(request, env, 'banned', [clearedStateCookie]);
    }

    const session = await createSession(request, env, user.id);
    const returnTo = safeLocalPath(stateRow.return_to, '/account.html');
    const target = addSearchParams(returnTo, { login: 'success' });
    return securedRedirect(target, [sessionCookie(request, env, session.token), clearedStateCookie]);
  } catch (error) {
    if (error instanceof HttpError) {
      console.warn('steam_auth_failed', error.code);
      const code =
        error.code === 'steam_not_configured'
          ? 'not_configured'
          : error.code.includes('profile')
            ? 'profile_unavailable'
            : 'invalid_response';
      return authErrorRedirect(request, env, code, [clearedStateCookie]);
    }
    console.error('steam_auth_exception', error instanceof Error ? error.message : 'unknown');
    return authErrorRedirect(request, env, 'internal', [clearedStateCookie]);
  }
}

export async function getMe(request, env) {
  const session = await getSession(request, env);
  if (!session) {
    return json({ authenticated: false, user: null, isAdmin: false });
  }
  return json({
    authenticated: true,
    user: publicUser(session.user),
    isAdmin: isAdminUser(session.user, env),
    session: {
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    },
  });
}

export async function logout(request, env) {
  const session = await getSession(request, env, { touch: false });
  if (session) {
    await revokeSession(env, session.tokenHash);
  }
  const response = json({ ok: true });
  response.headers.append('Set-Cookie', clearSessionCookie(request, env));
  return response;
}

export function authErrorInfo(code) {
  return authFailure(code);
}
