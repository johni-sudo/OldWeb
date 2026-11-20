import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from '../src/worker/app.js';
import { LocalD1Database, applyMigrations } from '../tests/helpers/d1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const localDir = path.join(root, '.local');
const port = Number(process.env.PORT || 8788);
const origin = `http://127.0.0.1:${port}`;
const databasePath = path.join(localDir, 'dev.sqlite');

fs.mkdirSync(localDir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  try {
    fs.rmSync(databasePath + suffix);
  } catch {
    // first run
  }
}

const db = new LocalD1Database(databasePath);
applyMigrations(db, path.join(root, 'migrations'));

const now = new Date();
const nowIso = now.toISOString();
const plusDays = (days) => new Date(now.getTime() + days * 86400000).toISOString();
const minusDays = (days) => new Date(now.getTime() - days * 86400000).toISOString();
const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function createUser({ steamId, persona, profile }) {
  const row = db.db
    .prepare(
      `INSERT INTO users (steam_id, persona_name, avatar_url, profile_url, created_at, updated_at, last_login_at)
       VALUES (?, ?, '', ?, ?, ?, ?) RETURNING *`,
    )
    .get(steamId, persona, profile, minusDays(42), nowIso, nowIso);
  return row;
}

const adminSteamId = '76561198000000001';
const playerSteamId = '76561198000000002';
const thirdSteamId = '76561198000000003';

const admin = createUser({
  steamId: adminSteamId,
  persona: 'OceanAdmin',
  profile: `https://steamcommunity.com/profiles/${adminSteamId}`,
});
const player = createUser({
  steamId: playerSteamId,
  persona: 'WaveRider',
  profile: `https://steamcommunity.com/profiles/${playerSteamId}`,
});
createUser({
  steamId: thirdSteamId,
  persona: 'MistWalker',
  profile: `https://steamcommunity.com/profiles/${thirdSteamId}`,
});

const tide = db.db.prepare("SELECT * FROM privileges WHERE slug = 'tide'").get();
const abyss = db.db.prepare("SELECT * FROM privileges WHERE slug = 'abyss'").get();

db.db
  .prepare(
    `INSERT INTO purchases
      (order_number, user_id, privilege_id, privilege_name, price_cents, currency, duration_days,
       status, customer_note, admin_note, created_at, updated_at, paid_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', '', 'Проверено вручную', ?, ?, ?, ?)`,
  )
  .run(
    'PRJ-DEV-0001',
    player.id,
    tide.id,
    tide.name,
    tide.price_cents,
    tide.currency,
    tide.duration_days,
    minusDays(4),
    minusDays(3),
    minusDays(3),
    plusDays(27),
  );

db.db
  .prepare(
    `INSERT INTO purchases
      (order_number, user_id, privilege_id, privilege_name, price_cents, currency, duration_days,
       status, customer_note, admin_note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'Тестовый комментарий для проверки кабинета', '', ?, ?)`,
  )
  .run(
    'PRJ-DEV-0002',
    player.id,
    abyss.id,
    abyss.name,
    abyss.price_cents,
    abyss.currency,
    abyss.duration_days,
    minusDays(1),
    minusDays(1),
  );

function createSession(userId, token) {
  db.db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      sha256(token),
      userId,
      nowIso,
      plusDays(30),
      nowIso,
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36',
      sha256('127.0.0.1'),
    );
}

const sessions = {
  admin: { token: randomBytes(32).toString('hex'), userId: admin.id, steamId: adminSteamId },
  player: { token: randomBytes(32).toString('hex'), userId: player.id, steamId: playerSteamId },
};
createSession(sessions.admin.userId, sessions.admin.token);
createSession(sessions.player.userId, sessions.player.token);
fs.writeFileSync(
  path.join(localDir, 'dev-sessions.json'),
  JSON.stringify(
    {
      origin,
      admin: { ...sessions.admin, cookie: `project_session=${sessions.admin.token}` },
      player: { ...sessions.player, cookie: `project_session=${sessions.player.token}` },
    },
    null,
    2,
  ),
);

const env = {
  DB: db,
  STEAM_API_KEY: process.env.STEAM_API_KEY || 'local-preview-key',
  ADMIN_STEAM_IDS: adminSteamId,
  SESSION_SALT: 'local-preview-salt',
  SITE_ORIGIN: origin,
};

const DEV_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://avatars.steamstatic.com https://shared.akamai.steamstatic.com " +
  'https://community.cloudflare.steamstatic.com https://steamcdn-a.akamaihd.net; ' +
  "font-src 'self'; connect-src 'self'; manifest-src 'self'; media-src 'self'; " +
  "object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const cleanRoutes = {
  '/': 'index.html',
  '/servers': 'servers.html',
  '/privileges': 'privileges.html',
  '/news': 'news.html',
  '/rules': 'rules.html',
  '/account': 'account.html',
  '/admin': 'admin.html',
  '/article': 'article.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
};

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function requestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (['host', 'connection', 'content-length', 'transfer-encoding'].includes(name)) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('CF-Connecting-IP', request.socket.remoteAddress || '127.0.0.1');
  return headers;
}

async function sendWorkerResponse(nodeResponse, response) {
  const headers = [];
  for (const [name, value] of response.headers.entries()) {
    if (name === 'set-cookie') continue;
    headers.push([name, value]);
  }
  const cookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie')
        ? [response.headers.get('set-cookie')]
        : [];
  for (const cookie of cookies) headers.push(['set-cookie', cookie]);
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
  nodeResponse.writeHead(response.status, headers);
  nodeResponse.end(body);
}

async function serveApi(request, response) {
  const body = await collectBody(request);
  const workerRequest = new Request(`${origin}${request.url}`, {
    method: request.method,
    headers: requestHeaders(request),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : body,
  });
  const workerResponse = await handleRequest(workerRequest, env);
  await sendWorkerResponse(response, workerResponse);
}

function safeFilePath(pathname) {
  let pathnameClean;
  try {
    pathnameClean = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (pathnameClean.includes('\0') || pathnameClean.includes('..')) return null;
  let relative = cleanRoutes[pathnameClean];
  if (!relative) {
    relative = pathnameClean.replace(/^\/+/, '');
    if (!relative) relative = 'index.html';
  }
  const full = path.resolve(publicDir, relative);
  if (!full.startsWith(publicDir)) return null;
  return full;
}

async function serveStatic(request, response) {
  const url = new URL(`${origin}${request.url}`);
  let filePath = safeFilePath(url.pathname);
  if (!filePath) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const fallback = path.join(publicDir, '404.html');
    response.writeHead(404, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(fs.readFileSync(fallback));
    return;
  }
  const extension = path.extname(filePath).toLowerCase();
  const file = fs.readFileSync(filePath);
  response.writeHead(200, {
    'Content-Type': MIME[extension] || 'application/octet-stream',
    'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': DEV_CSP,
  });
  if (request.method === 'HEAD') response.end();
  else response.end(file);
}

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith('/api/')) {
      await serveApi(request, response);
      return;
    }
    await serveStatic(request, response);
  } catch (error) {
    console.error('dev_server_error', error);
    if (!response.headersSent) {
      response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    response.end(JSON.stringify({ error: { code: 'dev_server_error', message: String(error) } }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`DEV_SERVER_READY ${origin}`);
  console.log(`DEV_ADMIN_STEAM_ID ${adminSteamId}`);
  console.log(`DEV_PLAYER_STEAM_ID ${playerSteamId}`);
  console.log('DEV_SESSIONS .local/dev-sessions.json');
});

function shutdown() {
  server.close();
  try {
    db.close();
  } catch {
    // already closed
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
