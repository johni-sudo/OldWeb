import { HttpError } from './http.js';

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const STEAM_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const STEAM_API_ENDPOINT = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/';

export function buildSteamLoginUrl({ origin, state, returnTo }) {
  const callback = `${origin}/api/auth/steam/callback?state=${encodeURIComponent(state)}`;
  const url = new URL(STEAM_OPENID_ENDPOINT);
  url.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
  url.searchParams.set('openid.mode', 'checkid_setup');
  url.searchParams.set('openid.return_to', callback);
  url.searchParams.set('openid.realm', origin);
  url.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
  url.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');
  return { url: url.toString(), callback, returnTo };
}

function assertOpenIdResponse(searchParams) {
  if (searchParams.get('openid.mode') !== 'id_res') {
    throw new HttpError(400, 'steam_invalid_mode', 'Steam вернул неожиданный ответ.');
  }
  const signed = (searchParams.get('openid.signed') || '').split(',');
  for (const required of ['claimed_id', 'identity', 'return_to', 'response_nonce']) {
    if (!signed.includes(required)) {
      throw new HttpError(400, 'steam_unsigned_field', 'Ответ Steam не содержит обязательных подписанных полей.');
    }
  }
  const nonce = searchParams.get('openid.response_nonce') || '';
  if (nonce.length < 16) {
    throw new HttpError(400, 'steam_invalid_nonce', 'Некорректный ответ Steam.');
  }
}

export async function verifySteamAssertion(searchParams, { expectedReturnTo, fetchImpl = fetch }) {
  assertOpenIdResponse(searchParams);

  const claimedId = searchParams.get('openid.claimed_id') || '';
  const match = claimedId.match(STEAM_ID_PATTERN);
  if (!match) {
    throw new HttpError(400, 'steam_invalid_identity', 'SteamID64 не найден в ответе Steam.');
  }

  const returnTo = searchParams.get('openid.return_to') || '';
  if (returnTo !== expectedReturnTo) {
    throw new HttpError(400, 'steam_return_mismatch', 'Адрес возврата не совпадает с ожидаемым.');
  }

  const endpoint = searchParams.get('openid.op_endpoint');
  if (endpoint && endpoint !== STEAM_OPENID_ENDPOINT) {
    throw new HttpError(400, 'steam_invalid_endpoint', 'Неверный OpenID-провайдер.');
  }

  const body = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('openid.') && key !== 'openid.mode') body.append(key, value);
  }
  body.set('openid.mode', 'check_authentication');

  let response;
  try {
    response = await fetchImpl(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new HttpError(502, 'steam_unreachable', 'Не удалось проверить ответ Steam. Попробуйте позже.');
  }

  if (!response.ok) {
    throw new HttpError(502, 'steam_validation_failed', 'Steam не подтвердил вход.');
  }
  const text = await response.text();
  if (!/(?:^|\n)is_valid:true(?:\r?\n|$)/.test(text.trim())) {
    throw new HttpError(401, 'steam_invalid_assertion', 'Подпись Steam недействительна.');
  }

  return { steamId: match[1] };
}

function safeAvatarUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    if (url.hostname === 'steamcdn-a.akamaihd.net' || url.hostname.endsWith('.steamstatic.com')) {
      return url.toString();
    }
  } catch {
    return '';
  }
  return '';
}

function safeProfileUrl(value, steamId) {
  const fallback = `https://steamcommunity.com/profiles/${steamId}`;
  if (typeof value !== 'string') return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'steamcommunity.com') return fallback;
    if (!/^\/(id|profiles)\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

function cleanPersona(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 64) || 'Steam Player';
}

export async function fetchSteamProfile(steamId, env, { fetchImpl = fetch } = {}) {
  if (!env.STEAM_API_KEY) {
    throw new HttpError(503, 'steam_not_configured', 'Steam Web API не настроен.');
  }
  const url = new URL(STEAM_API_ENDPOINT);
  url.searchParams.set('key', env.STEAM_API_KEY);
  url.searchParams.set('steamids', steamId);
  url.searchParams.set('format', 'json');

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new HttpError(502, 'steam_profile_unreachable', 'Не удалось получить профиль Steam.');
  }
  if (!response.ok) {
    throw new HttpError(502, 'steam_profile_failed', 'Steam не вернул профиль игрока.');
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new HttpError(502, 'steam_profile_invalid', 'Некорректный ответ Steam Web API.');
  }
  const player = data?.response?.players?.[0];
  if (!player || String(player.steamid) !== String(steamId)) {
    throw new HttpError(404, 'steam_profile_not_found', 'Профиль Steam не найден.');
  }

  return {
    steamId,
    personaName: cleanPersona(player.personaname),
    avatarUrl: safeAvatarUrl(player.avatarfull) || safeAvatarUrl(player.avatarmedium),
    profileUrl: safeProfileUrl(player.profileurl, steamId),
  };
}
