import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../src/worker/lib/http.js';
import {
  buildSteamLoginUrl,
  fetchSteamProfile,
  verifySteamAssertion,
} from '../src/worker/lib/steam.js';

const ORIGIN = 'https://project.test';
const STATE = 'a'.repeat(64);
const STEAM_ID = '76561198000000123';

function assertionParams(overrides = {}) {
  const { callback } = buildSteamLoginUrl({ origin: ORIGIN, state: STATE, returnTo: '/account' });
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.return_to': callback,
    'openid.response_nonce': '2026-11-20T10:00:00Z1234567890',
    'openid.assoc_handle': '123',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'signature',
  });
  for (const [key, value] of Object.entries(overrides)) params.set(key, value);
  return { params, callback };
}

test('Steam login URL uses official OpenID 2.0 checkid_setup', () => {
  const { url, callback } = buildSteamLoginUrl({
    origin: ORIGIN,
    state: STATE,
    returnTo: '/account',
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://steamcommunity.com');
  assert.equal(parsed.pathname, '/openid/login');
  assert.equal(parsed.searchParams.get('openid.mode'), 'checkid_setup');
  assert.equal(parsed.searchParams.get('openid.realm'), ORIGIN);
  assert.equal(parsed.searchParams.get('openid.return_to'), callback);
  assert.match(callback, new RegExp(`state=${STATE}$`));
});

test('valid Steam assertion is checked against the OpenID endpoint', async () => {
  const { params, callback } = assertionParams();
  let posted = null;
  const result = await verifySteamAssertion(params, {
    expectedReturnTo: callback,
    fetchImpl: async (url, init) => {
      posted = { url, body: init.body };
      return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n', { status: 200 });
    },
  });
  assert.equal(result.steamId, STEAM_ID);
  assert.equal(posted.url, 'https://steamcommunity.com/openid/login');
  assert.match(posted.body, /openid.mode=check_authentication/);
  assert.match(posted.body, new RegExp(encodeURIComponent(STEAM_ID)));
});

test('Steam assertion fails closed on invalid signature, return URL and identity', async () => {
  const first = assertionParams();
  await assert.rejects(
    verifySteamAssertion(first.params, {
      expectedReturnTo: first.callback,
      fetchImpl: async () => new Response('is_valid:false\n', { status: 200 }),
    }),
    (error) => error instanceof HttpError && error.code === 'steam_invalid_assertion',
  );

  const second = assertionParams();
  await assert.rejects(
    verifySteamAssertion(second.params, {
      expectedReturnTo: 'https://project.test/other-callback',
      fetchImpl: async () => new Response('is_valid:true\n', { status: 200 }),
    }),
    (error) => error instanceof HttpError && error.code === 'steam_return_mismatch',
  );

  const third = assertionParams({
    'openid.claimed_id': 'https://evil.test/openid/id/76561198000000123',
  });
  await assert.rejects(
    verifySteamAssertion(third.params, {
      expectedReturnTo: third.callback,
      fetchImpl: async () => new Response('is_valid:true\n', { status: 200 }),
    }),
    (error) => error instanceof HttpError && error.code === 'steam_invalid_identity',
  );

  const fourth = assertionParams({ 'openid.signed': 'claimed_id' });
  await assert.rejects(
    verifySteamAssertion(fourth.params, {
      expectedReturnTo: fourth.callback,
      fetchImpl: async () => new Response('is_valid:true\n', { status: 200 }),
    }),
    (error) => error instanceof HttpError && error.code === 'steam_unsigned_field',
  );

  const fifth = assertionParams({
    'openid.op_endpoint': 'https://not-steam.test/openid',
  });
  await assert.rejects(
    verifySteamAssertion(fifth.params, {
      expectedReturnTo: fifth.callback,
      fetchImpl: async () => new Response('is_valid:true\n', { status: 200 }),
    }),
    (error) => error instanceof HttpError && error.code === 'steam_invalid_endpoint',
  );
});

test('Steam profile is fetched server-side and unsafe URLs are discarded', async () => {
  const profile = await fetchSteamProfile(
    STEAM_ID,
    { STEAM_API_KEY: 'secret-key' },
    {
      fetchImpl: async (url) => {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get('key'), 'secret-key');
        assert.equal(parsed.searchParams.get('steamids'), STEAM_ID);
        return Response.json({
          response: {
            players: [
              {
                steamid: STEAM_ID,
                personaname: '  Player\u0000Name  ',
                avatarfull: 'https://avatars.steamstatic.com/avatar.jpg',
                profileurl: `https://steamcommunity.com/profiles/${STEAM_ID}`,
              },
            ],
          },
        });
      },
    },
  );
  assert.equal(profile.personaName, 'PlayerName');
  assert.equal(profile.avatarUrl, 'https://avatars.steamstatic.com/avatar.jpg');
  assert.equal(profile.profileUrl, `https://steamcommunity.com/profiles/${STEAM_ID}`);

  const unsafe = await fetchSteamProfile(
    STEAM_ID,
    { STEAM_API_KEY: 'secret-key' },
    {
      fetchImpl: async () =>
        Response.json({
          response: {
            players: [
              {
                steamid: STEAM_ID,
                personaname: 'X',
                avatarfull: 'javascript:alert(1)',
                profileurl: 'https://evil.test/profile',
              },
            ],
          },
        }),
    },
  );
  assert.equal(unsafe.avatarUrl, '');
  assert.equal(unsafe.profileUrl, `https://steamcommunity.com/profiles/${STEAM_ID}`);
});

test('Steam profile fails closed when Steam returns another account', async () => {
  await assert.rejects(
    fetchSteamProfile(
      STEAM_ID,
      { STEAM_API_KEY: 'secret-key' },
      {
        fetchImpl: async () =>
          Response.json({
            response: {
              players: [{ steamid: '76561198000000001', personaname: 'Other' }],
            },
          }),
      },
    ),
    (error) => error instanceof HttpError && error.code === 'steam_profile_not_found',
  );
});
