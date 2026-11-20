import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from '../../src/worker/app.js';
import { LocalD1Database, applyMigrations } from './d1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ORIGIN = 'https://project.test';

export function createEnv({ adminSteamIds = '76561198000000001', steamKey = 'test-steam-key' } = {}) {
  const db = new LocalD1Database(':memory:');
  applyMigrations(db, path.join(ROOT, 'migrations'));
  return {
    db,
    env: {
      DB: db,
      STEAM_API_KEY: steamKey,
      ADMIN_STEAM_IDS: adminSteamIds,
      SESSION_SALT: 'test-session-salt',
      SITE_ORIGIN: ORIGIN,
    },
  };
}

export async function insertUser(
  env,
  {
    steamId = '76561198000000002',
    personaName = 'TestPlayer',
    isBanned = false,
    avatarUrl = '',
    profileUrl = '',
  } = {},
) {
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO users (steam_id, persona_name, avatar_url, profile_url, is_banned, created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      steamId,
      personaName,
      avatarUrl,
      profileUrl || `https://steamcommunity.com/profiles/${steamId}`,
      isBanned ? 1 : 0,
      now,
      now,
      now,
    )
    .first();
  return row;
}

export async function createSession(env, userId) {
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 86400000).toISOString();
  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(hash, userId, now.toISOString(), expires, now.toISOString(), 'test-agent', 'test-ip-hash')
    .run();
  return { token, cookie: `project_session=${token}`, hash, expires };
}

export async function loginAs(env, options = {}) {
  const user = await insertUser(env, options);
  const session = await createSession(env, user.id);
  return { user, ...session };
}

export async function requestApi(
  env,
  route,
  { method = 'GET', body, cookie, csrf = method !== 'GET', headers = {}, origin } = {},
) {
  const requestHeaders = new Headers({
    'user-agent': 'Project Integration Tests/1.0',
    'CF-Connecting-IP': '192.0.2.10',
    Accept: 'application/json',
    ...headers,
  });
  if (cookie) requestHeaders.set('Cookie', cookie);
  if (csrf) requestHeaders.set('X-Requested-With', 'PROJECTWeb');
  if (origin) requestHeaders.set('Origin', origin);
  let requestBody;
  if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }
  const request = new Request(`${ORIGIN}${route}`, {
    method,
    headers: requestHeaders,
    body: requestBody,
  });
  const response = await handleRequest(request, env);
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return {
    status: response.status,
    headers: response.headers,
    data,
    setCookie: response.headers.getSetCookie?.() || [],
    location: response.headers.get('location'),
  };
}

export function cookieValue(setCookie, name) {
  for (const value of setCookie) {
    if (value.startsWith(`${name}=`)) {
      return decodeURIComponent(value.split(';')[0].slice(name.length + 1));
    }
  }
  return '';
}
