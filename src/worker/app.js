import {
  HttpError,
  assertMutationRequest,
  json,
} from './lib/http.js';
import {
  getHealth,
  getNews,
  getNewsArticle,
  getPrivileges,
  getRules,
  getServers,
  getSite,
} from './routes/public.js';
import { getMe, logout, startSteamLogin, steamCallback } from './routes/auth.js';
import {
  cancelPurchase,
  createPurchase,
  getAccountPurchases,
  getAccountSessions,
  revokeOtherAccountSessions,
  updateAccountSettings,
} from './routes/account.js';
import {
  createNews,
  createPrivilege,
  createRule,
  createServer,
  deleteNews,
  deletePrivilege,
  deleteRule,
  deleteServer,
  getAdminSettings,
  getOverview,
  listNews,
  listPrivileges,
  listPurchases,
  listRules,
  listServers,
  listUsers,
  updateAdminSettings,
  updateNews,
  updatePrivilege,
  updatePurchase,
  updateRule,
  updateServer,
  updateUser,
} from './routes/admin.js';

const routes = [
  ['GET', /^\/api\/health$/, getHealth],
  ['GET', /^\/api\/site$/, getSite],
  ['GET', /^\/api\/servers$/, getServers],
  ['GET', /^\/api\/privileges$/, getPrivileges],
  ['GET', /^\/api\/news$/, getNews],
  ['GET', /^\/api\/news\/([a-z0-9-]+)$/, (request, env, match) => getNewsArticle(request, env, match[1])],
  ['GET', /^\/api\/rules$/, getRules],
  ['GET', /^\/api\/auth\/steam\/login$/, startSteamLogin],
  ['GET', /^\/api\/auth\/steam\/callback$/, steamCallback],
  ['GET', /^\/api\/auth\/me$/, getMe],
  ['POST', /^\/api\/auth\/logout$/, logout],
  ['GET', /^\/api\/account\/purchases$/, getAccountPurchases],
  ['POST', /^\/api\/purchases$/, createPurchase],
  ['POST', /^\/api\/purchases\/(\d+)\/cancel$/, (request, env, match) => cancelPurchase(request, env, Number(match[1]))],
  ['GET', /^\/api\/account\/sessions$/, getAccountSessions],
  ['POST', /^\/api\/account\/sessions\/revoke-others$/, revokeOtherAccountSessions],
  ['PATCH', /^\/api\/account\/settings$/, updateAccountSettings],
  ['GET', /^\/api\/admin\/overview$/, getOverview],
  ['GET', /^\/api\/admin\/settings$/, getAdminSettings],
  ['PATCH', /^\/api\/admin\/settings$/, updateAdminSettings],
  ['GET', /^\/api\/admin\/servers$/, listServers],
  ['POST', /^\/api\/admin\/servers$/, createServer],
  ['PATCH', /^\/api\/admin\/servers\/(\d+)$/, (request, env, match) => updateServer(request, env, Number(match[1]))],
  ['DELETE', /^\/api\/admin\/servers\/(\d+)$/, (request, env, match) => deleteServer(request, env, Number(match[1]))],
  ['GET', /^\/api\/admin\/privileges$/, listPrivileges],
  ['POST', /^\/api\/admin\/privileges$/, createPrivilege],
  ['PATCH', /^\/api\/admin\/privileges\/(\d+)$/, (request, env, match) => updatePrivilege(request, env, Number(match[1]))],
  ['DELETE', /^\/api\/admin\/privileges\/(\d+)$/, (request, env, match) => deletePrivilege(request, env, Number(match[1]))],
  ['GET', /^\/api\/admin\/news$/, listNews],
  ['POST', /^\/api\/admin\/news$/, createNews],
  ['PATCH', /^\/api\/admin\/news\/(\d+)$/, (request, env, match) => updateNews(request, env, Number(match[1]))],
  ['DELETE', /^\/api\/admin\/news\/(\d+)$/, (request, env, match) => deleteNews(request, env, Number(match[1]))],
  ['GET', /^\/api\/admin\/rules$/, listRules],
  ['POST', /^\/api\/admin\/rules$/, createRule],
  ['PATCH', /^\/api\/admin\/rules\/(\d+)$/, (request, env, match) => updateRule(request, env, Number(match[1]))],
  ['DELETE', /^\/api\/admin\/rules\/(\d+)$/, (request, env, match) => deleteRule(request, env, Number(match[1]))],
  ['GET', /^\/api\/admin\/users$/, listUsers],
  ['PATCH', /^\/api\/admin\/users\/(\d+)$/, (request, env, match) => updateUser(request, env, Number(match[1]))],
  ['GET', /^\/api\/admin\/purchases$/, listPurchases],
  ['PATCH', /^\/api\/admin\/purchases\/(\d+)$/, (request, env, match) => updatePurchase(request, env, match[1])],
];

function addCommonHeaders(response, id) {
  const headers = new Headers(response.headers);
  headers.set('X-Request-Id', id);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleRequest(request, env) {
  const id = crypto.randomUUID();
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (!url.pathname.startsWith('/api/')) {
    return new Response('Not found', { status: 404 });
  }

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        Allow: 'GET, POST, PATCH, DELETE, OPTIONS',
        'Cache-Control': 'no-store',
        'X-Request-Id': id,
      },
    });
  }

  try {
    if (method !== 'GET' && method !== 'HEAD') {
      assertMutationRequest(request);
    }

    let pathMatched = false;
    const allowed = new Set();
    for (const [routeMethod, pattern, handler] of routes) {
      const match = pattern.exec(url.pathname);
      if (!match) continue;
      pathMatched = true;
      allowed.add(routeMethod);
      if (routeMethod !== method) continue;
      const response = await handler(request, env, match);
      return addCommonHeaders(response, id);
    }

    if (pathMatched) {
      const response = json(
        { error: { code: 'method_not_allowed', message: 'Метод не поддерживается.' } },
        { status: 405, headers: { Allow: [...allowed].join(', ') } },
      );
      return addCommonHeaders(response, id);
    }

    const response = json(
      { error: { code: 'not_found', message: 'Маршрут API не найден.' } },
      { status: 404 },
    );
    return addCommonHeaders(response, id);
  } catch (error) {
    if (error instanceof HttpError) {
      const headers = new Headers();
      if (error.details?.retryAfter) headers.set('Retry-After', String(error.details.retryAfter));
      const response = json(
        {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        },
        { status: error.status, headers },
      );
      return addCommonHeaders(response, id);
    }

    console.error('api_unhandled_error', {
      requestId: id,
      method,
      path: url.pathname,
      message: error instanceof Error ? error.message : 'unknown',
      stack: error instanceof Error ? error.stack : undefined,
    });
    const response = json(
      {
        error: {
          code: 'internal_error',
          message: 'Внутренняя ошибка сервера. Попробуйте позже.',
          requestId: id,
        },
      },
      { status: 500 },
    );
    return addCommonHeaders(response, id);
  }
}
