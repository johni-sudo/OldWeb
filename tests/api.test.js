import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGIN,
  cookieValue,
  createEnv,
  createSession,
  insertUser,
  loginAs,
  requestApi,
} from './helpers/app.mjs';

const ADMIN_ID = '76561198000000001';
const PLAYER_ID = '76561198000000002';

test('public API exposes only the published catalogue', async () => {
  const { env } = createEnv();
  const health = await requestApi(env, '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.ok, true);

  const site = await requestApi(env, '/api/site');
  assert.equal(site.status, 200);
  assert.equal(site.data.project.projectName, 'PROJECT');
  assert.equal(site.data.project.steamLoginEnabled, true);
  assert.equal(site.data.stats.servers, 3);
  assert.equal(site.data.stats.playersOnline, 0);

  const servers = await requestApi(env, '/api/servers');
  assert.equal(servers.status, 200);
  assert.equal(servers.data.items.length, 3);
  assert.ok(servers.data.items.every((server) => server.isDemo));
  assert.ok(servers.data.items.every((server) => server.status !== 'online'));

  const privileges = await requestApi(env, '/api/privileges');
  assert.equal(privileges.data.items.length, 4);
  assert.equal(privileges.data.items[0].features.length > 0, true);

  const news = await requestApi(env, '/api/news?limit=2');
  assert.equal(news.data.items.length, 2);
  assert.equal(news.data.meta.total, 3);
  assert.equal(news.data.items[0].content, undefined);

  const article = await requestApi(env, `/api/news/${news.data.items[0].slug}`);
  assert.equal(article.status, 200);
  assert.match(article.data.item.content, /демонстрационная/i);
  assert.ok(Array.isArray(article.data.related));

  const missing = await requestApi(env, '/api/news/not-a-real-article');
  assert.equal(missing.status, 404);

  const rules = await requestApi(env, '/api/rules');
  assert.equal(rules.data.meta.total, 12);
  assert.equal(rules.data.categories.length, 6);
  assert.ok(rules.data.categories[0].rules.length > 0);
});

test('mutating endpoints reject missing CSRF header and foreign origins', async () => {
  const { env } = createEnv();
  const admin = await loginAs(env, { steamId: ADMIN_ID, personaName: 'Admin' });

  const missing = await requestApi(env, '/api/admin/servers', {
    method: 'POST',
    cookie: admin.cookie,
    csrf: false,
    body: { name: 'X', game: 'Y' },
  });
  assert.equal(missing.status, 403);
  assert.equal(missing.data.error.code, 'csrf_header_missing');

  const foreign = await requestApi(env, '/api/admin/servers', {
    method: 'POST',
    cookie: admin.cookie,
    origin: 'https://evil.test',
    body: { name: 'X', game: 'Y' },
  });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.data.error.code, 'origin_mismatch');

  const badJson = await requestApi(env, '/api/admin/servers', {
    method: 'POST',
    cookie: admin.cookie,
    headers: { 'Content-Type': 'text/plain' },
    body: undefined,
  });
  assert.equal(badJson.status, 415);
});

test('Steam OpenID login creates an account, verifies assertion server-side and sets a session', async () => {
  const { env } = createEnv();
  const start = await requestApi(env, '/api/auth/steam/login?return_to=%2Fservers');
  assert.equal(start.status, 302);
  const steamUrl = new URL(start.location);
  assert.equal(steamUrl.origin, 'https://steamcommunity.com');
  assert.equal(steamUrl.searchParams.get('openid.mode'), 'checkid_setup');
  const returnTo = steamUrl.searchParams.get('openid.return_to');
  const state = new URL(returnTo).searchParams.get('state');
  assert.match(state, /^[a-f0-9]{64}$/);
  const stateCookie = cookieValue(start.setCookie, 'project_steam_state');
  assert.equal(stateCookie, state);

  const steamId = '76561198000000999';
  const callbackParams = new URLSearchParams({
    state,
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${steamId}`,
    'openid.return_to': returnTo,
    'openid.response_nonce': '2026-11-20T10:00:00Z1234567890',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'test-signature',
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === 'https://steamcommunity.com/openid/login') {
      return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n', { status: 200 });
    }
    if (url.startsWith('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')) {
      return Response.json({
        response: {
          players: [
            {
              steamid: steamId,
              personaname: 'SteamTester',
              avatarfull: 'https://avatars.steamstatic.com/test-avatar.jpg',
              profileurl: `https://steamcommunity.com/profiles/${steamId}`,
            },
          ],
        },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  let callback;
  try {
    callback = await requestApi(env, `/api/auth/steam/callback?${callbackParams}`, {
      cookie: `project_steam_state=${stateCookie}`,
      csrf: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/servers?login=success');
  const sessionCookie = cookieValue(callback.setCookie, 'project_session');
  assert.match(sessionCookie, /^[a-f0-9]{64}$/);
  assert.ok(callback.setCookie.some((value) => value.startsWith('project_steam_state=; Max-Age=0')));

  const me = await requestApi(env, '/api/auth/me', {
    cookie: `project_session=${sessionCookie}`,
  });
  assert.equal(me.status, 200);
  assert.equal(me.data.authenticated, true);
  assert.equal(me.data.user.steamId, steamId);
  assert.equal(me.data.user.personaName, 'SteamTester');
  assert.equal(me.data.isAdmin, false);

  const persisted = await env.DB.prepare('SELECT * FROM users WHERE steam_id = ?').bind(steamId).first();
  assert.ok(persisted);
  assert.equal(persisted.persona_name, 'SteamTester');
  const stateRows = await env.DB.prepare('SELECT COUNT(*) AS count FROM login_states').first();
  assert.equal(Number(stateRows.count), 0);
});

test('Steam callback rejects a mismatched state and an invalid signature', async () => {
  const { env } = createEnv();
  const start = await requestApi(env, '/api/auth/steam/login');
  const steamUrl = new URL(start.location);
  const returnTo = steamUrl.searchParams.get('openid.return_to');
  const state = new URL(returnTo).searchParams.get('state');
  const stateCookie = cookieValue(start.setCookie, 'project_steam_state');
  assert.equal(stateCookie, state);

  const wrong = await requestApi(env, '/api/auth/steam/callback?state=deadbeef', {
    cookie: `project_steam_state=${stateCookie}`,
    csrf: false,
  });
  assert.equal(wrong.status, 302);
  assert.match(wrong.location, /auth_error=state_mismatch/);

  const params = new URLSearchParams({
    state,
    'openid.mode': 'id_res',
    'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000998',
    'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000998',
    'openid.return_to': returnTo,
    'openid.response_nonce': '2026-11-20T10:00:00Z1234567890',
    'openid.signed': 'claimed_id,identity,return_to,response_nonce',
    'openid.sig': 'bad',
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n', { status: 200 });
  let response;
  try {
    response = await requestApi(env, `/api/auth/steam/callback?${params}`, {
      cookie: `project_steam_state=${stateCookie}`,
      csrf: false,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(response.status, 302);
  assert.match(response.location, /auth_error=invalid_response/);
});

test('account access, sessions and settings are server-side and isolated', async () => {
  const { env } = createEnv();
  const unauth = await requestApi(env, '/api/auth/me');
  assert.equal(unauth.status, 200);
  assert.equal(unauth.data.authenticated, false);

  const player = await loginAs(env, { steamId: PLAYER_ID, personaName: 'Player' });
  const secondSession = await createSession(env, player.user.id);

  const me = await requestApi(env, '/api/auth/me', { cookie: player.cookie });
  assert.equal(me.data.user.personaName, 'Player');

  const settings = await requestApi(env, '/api/account/settings', {
    method: 'PATCH',
    cookie: player.cookie,
    body: { compactUi: true, reduceMotion: true },
  });
  assert.equal(settings.status, 200);
  assert.equal(settings.data.user.compactUi, true);
  assert.equal(settings.data.user.reduceMotion, true);

  const sessions = await requestApi(env, '/api/account/sessions', { cookie: player.cookie });
  assert.equal(sessions.data.items.length, 2);
  assert.equal(sessions.data.items.filter((item) => item.current).length, 1);

  const revoke = await requestApi(env, '/api/account/sessions/revoke-others', {
    method: 'POST',
    cookie: player.cookie,
  });
  assert.equal(revoke.status, 200);
  assert.equal(revoke.data.revoked, 1);

  const oldSession = await requestApi(env, '/api/auth/me', { cookie: secondSession.cookie });
  assert.equal(oldSession.data.authenticated, false);

  const normalAdmin = await requestApi(env, '/api/admin/overview', { cookie: player.cookie });
  assert.equal(normalAdmin.status, 403);
  assert.equal(normalAdmin.data.error.code, 'admin_required');

  const noAuth = await requestApi(env, '/api/account/purchases');
  assert.equal(noAuth.status, 401);
});

test('purchase lifecycle: pending request, manual confirmation, active privilege and refund', async () => {
  const { env } = createEnv();
  const player = await loginAs(env, { steamId: PLAYER_ID, personaName: 'Player' });
  const admin = await loginAs(env, { steamId: ADMIN_ID, personaName: 'Admin' });
  const privileges = await requestApi(env, '/api/privileges');
  const tide = privileges.data.items.find((item) => item.slug === 'tide');
  const wave = privileges.data.items.find((item) => item.slug === 'wave');

  const created = await requestApi(env, '/api/purchases', {
    method: 'POST',
    cookie: player.cookie,
    body: { privilegeId: tide.id, customerNote: 'Свяжитесь со мной' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.item.status, 'pending');
  assert.equal(created.data.item.isActive, false);
  assert.match(created.data.item.orderNumber, /^PRJ-\d{8}-/);

  const duplicate = await requestApi(env, '/api/purchases', {
    method: 'POST',
    cookie: player.cookie,
    body: { privilegeId: tide.id },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.error.details.orderNumber, created.data.item.orderNumber);

  const second = await requestApi(env, '/api/purchases', {
    method: 'POST',
    cookie: player.cookie,
    body: { privilegeId: wave.id },
  });
  assert.equal(second.status, 201);

  const cancel = await requestApi(env, `/api/purchases/${second.data.item.id}/cancel`, {
    method: 'POST',
    cookie: player.cookie,
  });
  assert.equal(cancel.status, 200);

  const before = await requestApi(env, '/api/account/purchases', { cookie: player.cookie });
  assert.equal(before.data.meta.active, 0);
  assert.equal(before.data.items.find((item) => item.id === second.data.item.id).status, 'cancelled');

  const adminList = await requestApi(env, '/api/admin/purchases?status=pending', {
    cookie: admin.cookie,
  });
  assert.equal(adminList.status, 200);
  assert.ok(adminList.data.items.some((item) => item.id === created.data.item.id));

  const paid = await requestApi(env, `/api/admin/purchases/${created.data.item.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'paid', adminNote: 'Оплата получена' },
  });
  assert.equal(paid.status, 200);
  assert.equal(paid.data.item.status, 'paid');
  assert.ok(paid.data.item.expiresAt);

  const after = await requestApi(env, '/api/account/purchases', { cookie: player.cookie });
  assert.equal(after.data.meta.active, 1);
  assert.equal(after.data.items.find((item) => item.id === created.data.item.id).isActive, true);

  const invalidTransition = await requestApi(env, `/api/admin/purchases/${created.data.item.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'cancelled' },
  });
  assert.equal(invalidTransition.status, 409);

  const refunded = await requestApi(env, `/api/admin/purchases/${created.data.item.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'refunded', adminNote: 'Возврат' },
  });
  assert.equal(refunded.status, 200);
  const afterRefund = await requestApi(env, '/api/account/purchases', { cookie: player.cookie });
  assert.equal(afterRefund.data.meta.active, 0);
});

test('admin CRUD validates data, writes audit records and updates the public site', async () => {
  const { env } = createEnv();
  const admin = await loginAs(env, { steamId: ADMIN_ID, personaName: 'Admin' });

  const invalid = await requestApi(env, '/api/admin/servers', {
    method: 'POST',
    cookie: admin.cookie,
    body: { name: 'Broken', game: 'Test', playersOnline: 10, maxPlayers: 5 },
  });
  assert.equal(invalid.status, 400);

  const created = await requestApi(env, '/api/admin/servers', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      name: 'Test Realm',
      game: 'Test Game',
      address: 'test.example.com:27015',
      status: 'online',
      playersOnline: 5,
      maxPlayers: 20,
      tags: ['PvE', 'Test'],
      isPublished: true,
      isDemo: false,
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.item.slug, 'test-realm');

  const publicServers = await requestApi(env, '/api/servers');
  assert.ok(publicServers.data.items.some((item) => item.slug === 'test-realm'));

  const updated = await requestApi(env, `/api/admin/servers/${created.data.item.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'offline', playersOnline: 0, name: 'Test Realm Updated' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.item.status, 'offline');

  const news = await requestApi(env, '/api/admin/news', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      title: 'Integration test news',
      excerpt: 'Short excerpt',
      content: '## Heading\n\nBody **bold**.',
      coverUrl: '/assets/images/news/welcome.svg',
      isPublished: true,
      isDemo: false,
    },
  });
  assert.equal(news.status, 201);
  const publicNews = await requestApi(env, `/api/news/${news.data.item.slug}`);
  assert.equal(publicNews.status, 200);
  assert.match(publicNews.data.item.content, /bold/);

  const rule = await requestApi(env, '/api/admin/rules', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      title: 'Integration test rule',
      category: 'Tests',
      categoryOrder: 100,
      content: 'A test rule.',
      isPublished: true,
    },
  });
  assert.equal(rule.status, 201);

  const privilege = await requestApi(env, '/api/admin/privileges', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      name: 'Test tier',
      description: 'Tier for tests',
      priceCents: 1000,
      currency: 'RUB',
      durationDays: 30,
      imageUrl: '/assets/images/privileges/wave.svg',
      features: ['One', 'Two'],
      isActive: true,
    },
  });
  assert.equal(privilege.status, 201);

  const settings = await requestApi(env, '/api/admin/settings', {
    method: 'PATCH',
    cookie: admin.cookie,
    body: {
      projectName: 'PROJECT TEST',
      demoNotice: false,
      supportUrl: 'https://example.org/support',
      supportLabel: 'Help',
    },
  });
  assert.equal(settings.status, 200);
  const site = await requestApi(env, '/api/site');
  assert.equal(site.data.project.projectName, 'PROJECT TEST');
  assert.equal(site.data.project.demoNotice, false);
  assert.equal(site.data.project.supportUrl, 'https://example.org/support');

  const badUrl = await requestApi(env, '/api/admin/settings', {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { supportUrl: 'javascript:alert(1)' },
  });
  assert.equal(badUrl.status, 400);

  const overview = await requestApi(env, '/api/admin/overview', { cookie: admin.cookie });
  assert.equal(overview.status, 200);
  assert.ok(overview.data.stats.servers >= 4);
  const audit = await env.DB.prepare('SELECT COUNT(*) AS count FROM admin_audit').first();
  assert.ok(Number(audit.count) >= 5);

  const deleted = await requestApi(env, `/api/admin/servers/${created.data.item.id}`, {
    method: 'DELETE',
    cookie: admin.cookie,
  });
  assert.equal(deleted.status, 200);
});

test('moderation protects administrators and revokes banned users sessions', async () => {
  const { env } = createEnv();
  const admin = await loginAs(env, { steamId: ADMIN_ID, personaName: 'Admin' });
  const player = await loginAs(env, { steamId: PLAYER_ID, personaName: 'Player' });

  const selfBan = await requestApi(env, `/api/admin/users/${admin.user.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { isBanned: true, banReason: 'test' },
  });
  assert.equal(selfBan.status, 400);

  const ban = await requestApi(env, `/api/admin/users/${player.user.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { isBanned: true, banReason: 'Интеграционный тест' },
  });
  assert.equal(ban.status, 200);

  const bannedSession = await requestApi(env, '/api/auth/me', { cookie: player.cookie });
  assert.equal(bannedSession.data.authenticated, false);

  const users = await requestApi(env, '/api/admin/users?search=Player', { cookie: admin.cookie });
  assert.equal(users.status, 200);
  assert.equal(users.data.items[0].isBanned, true);

  const unban = await requestApi(env, `/api/admin/users/${player.user.id}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { isBanned: false },
  });
  assert.equal(unban.status, 200);
});

test('login throttling returns a retryable error instead of leaking details', async () => {
  const { env } = createEnv();
  let last;
  for (let index = 0; index < 22; index += 1) {
    last = await requestApi(env, '/api/auth/steam/login', { csrf: false, headers: { 'CF-Connecting-IP': '192.0.2.99' } });
  }
  assert.equal(last.status, 302);
  assert.match(last.location, /auth_error=rate_limited/);
  assert.ok(last.location.startsWith('/account.html'));
  assert.ok(!last.location.includes('steamcommunity.com'));
});
