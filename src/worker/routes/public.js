import { HttpError, json } from '../lib/http.js';
import { loadSettings, publicSettings, steamConfigured } from '../lib/config.js';
import { limitParam, offsetParam } from '../lib/validate.js';

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function serverPayload(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    game: row.game,
    description: row.description,
    address: row.address,
    connectUrl: row.connect_url,
    status: row.status,
    playersOnline: Number(row.players_online),
    maxPlayers: Number(row.max_players),
    region: row.region,
    version: row.version,
    tags: parseArray(row.tags),
    isDemo: Boolean(row.is_demo),
    updatedAt: row.updated_at,
  };
}

function privilegePayload(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    priceCents: Number(row.price_cents),
    currency: row.currency,
    durationDays: row.duration_days === null ? null : Number(row.duration_days),
    features: parseArray(row.features),
    badge: row.badge,
    isDemo: Boolean(row.is_demo),
    updatedAt: row.updated_at,
  };
}

function newsPayload(row, { full = false } = {}) {
  const payload = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.cover_url,
    publishedAt: row.published_at,
    isDemo: Boolean(row.is_demo),
    readingMinutes: Math.max(1, Math.ceil(Number(row.content_length || 0) / 750)),
  };
  if (full) payload.content = row.content || '';
  return payload;
}

export async function getHealth(request, env) {
  let dbOk = false;
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return json(
    {
      ok: dbOk,
      database: dbOk ? 'ok' : 'unavailable',
      steamLogin: steamConfigured(env) ? 'configured' : 'not_configured',
    },
    { status: dbOk ? 200 : 503 },
  );
}

export async function getSite(request, env) {
  const settings = await loadSettings(env.DB);
  const [servers, members, news] = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END), 0) AS online,
              COALESCE(SUM(CASE WHEN status = 'online' THEN players_online ELSE 0 END), 0) AS players,
              COALESCE(SUM(CASE WHEN is_demo = 1 THEN 1 ELSE 0 END), 0) AS demo
         FROM servers WHERE is_published = 1`,
    ),
    env.DB.prepare('SELECT COUNT(*) AS total FROM users'),
    env.DB.prepare('SELECT COUNT(*) AS total FROM news WHERE is_published = 1'),
  ]);

  const serverStats = servers.results?.[0] || {};
  return json({
    project: {
      ...publicSettings(settings),
      steamLoginEnabled: steamConfigured(env),
    },
    stats: {
      servers: Number(serverStats.total || 0),
      onlineServers: Number(serverStats.online || 0),
      playersOnline: Number(serverStats.players || 0),
      demoServers: Number(serverStats.demo || 0),
      members: Number(members.results?.[0]?.total || 0),
      news: Number(news.results?.[0]?.total || 0),
    },
  });
}

export async function getServers(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM servers WHERE is_published = 1 ORDER BY sort_order ASC, id ASC`,
  ).all();
  const items = (results || []).map(serverPayload);
  return json({
    items,
    meta: {
      total: items.length,
      online: items.filter((item) => item.status === 'online').length,
      players: items
        .filter((item) => item.status === 'online')
        .reduce((sum, item) => sum + item.playersOnline, 0),
    },
  });
}

export async function getPrivileges(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM privileges WHERE is_active = 1 ORDER BY sort_order ASC, id ASC`,
  ).all();
  return json({ items: (results || []).map(privilegePayload) });
}

export async function getNews(request, env) {
  const url = new URL(request.url);
  const limit = limitParam(url.searchParams.get('limit'), { fallback: 9, max: 24 });
  const offset = offsetParam(url.searchParams.get('offset'));

  const [rows, count] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, slug, title, excerpt, cover_url, published_at, is_demo,
              LENGTH(content) AS content_length
         FROM news
        WHERE is_published = 1
        ORDER BY published_at DESC, id DESC
        LIMIT ? OFFSET ?`,
    ).bind(limit, offset),
    env.DB.prepare('SELECT COUNT(*) AS total FROM news WHERE is_published = 1'),
  ]);

  return json({
    items: (rows.results || []).map((row) => newsPayload(row)),
    meta: {
      total: Number(count.results?.[0]?.total || 0),
      limit,
      offset,
    },
  });
}

export async function getNewsArticle(request, env, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '')) {
    throw new HttpError(404, 'news_not_found', 'Новость не найдена.');
  }
  const row = await env.DB.prepare(
    `SELECT id, slug, title, excerpt, content, cover_url, published_at, is_demo,
            LENGTH(content) AS content_length
       FROM news WHERE slug = ? AND is_published = 1`,
  )
    .bind(slug)
    .first();
  if (!row) throw new HttpError(404, 'news_not_found', 'Новость не найдена.');

  const related = await env.DB.prepare(
    `SELECT id, slug, title, excerpt, cover_url, published_at, is_demo,
            LENGTH(content) AS content_length
       FROM news
      WHERE is_published = 1 AND slug <> ?
      ORDER BY published_at DESC LIMIT 3`,
  )
    .bind(slug)
    .all();

  return json({
    item: newsPayload(row, { full: true }),
    related: (related.results || []).map((item) => newsPayload(item)),
  });
}

export async function getRules(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT id, slug, category, category_order, title, content, sort_order, updated_at
       FROM rules
      WHERE is_published = 1
      ORDER BY category_order ASC, sort_order ASC, id ASC`,
  ).all();

  const categories = [];
  const index = new Map();
  let updatedAt = '';
  for (const row of results || []) {
    if (!index.has(row.category)) {
      const category = {
        name: row.category,
        order: Number(row.category_order),
        rules: [],
      };
      index.set(row.category, category);
      categories.push(category);
    }
    index.get(row.category).rules.push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      content: row.content,
      updatedAt: row.updated_at,
    });
    if (!updatedAt || row.updated_at > updatedAt) updatedAt = row.updated_at;
  }

  return json({
    categories,
    meta: {
      total: Number(results?.length || 0),
      updatedAt,
    },
  });
}
