import { HttpError, json, readJson, safeHttpUrl } from '../lib/http.js';
import {
  assetPath,
  bool,
  cleanString,
  connectUrl,
  dateTime,
  integer,
  limitParam,
  oneOf,
  slug,
  slugify,
  stringArray,
} from '../lib/validate.js';
import { parseAdminSteamIds } from '../lib/config.js';
import { requireAdmin } from '../lib/session.js';

const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'UAH'];
const SERVER_STATUSES = ['online', 'offline', 'maintenance'];
const PURCHASE_STATUSES = ['pending', 'paid', 'cancelled', 'refunded'];
const PURCHASE_TRANSITIONS = {
  pending: ['paid', 'cancelled'],
  paid: ['refunded'],
  cancelled: [],
  refunded: [],
};

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function num(result) {
  return Number(result?.results?.[0]?.count || 0);
}

function serverAdmin(row) {
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
    tags: parseJsonArray(row.tags),
    sortOrder: Number(row.sort_order),
    isPublished: Boolean(row.is_published),
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function privilegeAdmin(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    imageUrl: row.image_url,
    priceCents: Number(row.price_cents),
    currency: row.currency,
    durationDays: row.duration_days === null ? null : Number(row.duration_days),
    features: parseJsonArray(row.features),
    badge: row.badge,
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function newsAdmin(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverUrl: row.cover_url,
    publishedAt: row.published_at,
    isPublished: Boolean(row.is_published),
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ruleAdmin(row) {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    categoryOrder: Number(row.category_order),
    title: row.title,
    content: row.content,
    sortOrder: Number(row.sort_order),
    isPublished: Boolean(row.is_published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function purchaseAdmin(row, now = new Date().toISOString()) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    steamId: row.steam_id,
    personaName: row.persona_name,
    avatarUrl: row.avatar_url,
    privilegeId: row.privilege_id,
    privilegeName: row.privilege_name,
    priceCents: Number(row.price_cents),
    currency: row.currency,
    durationDays: row.duration_days === null ? null : Number(row.duration_days),
    status: row.status,
    customerNote: row.customer_note || '',
    adminNote: row.admin_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
    isActive: row.status === 'paid' && (row.expires_at === null || row.expires_at > now),
  };
}

async function audit(env, actorUserId, action, entity, entityId, meta = {}) {
  try {
    await env.DB.prepare(
      `INSERT INTO admin_audit (actor_user_id, action, entity, entity_id, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        actorUserId,
        action,
        entity,
        String(entityId),
        JSON.stringify(meta).slice(0, 2000),
        new Date().toISOString(),
      )
      .run();
  } catch (error) {
    console.error('audit_write_failed', error instanceof Error ? error.message : 'unknown');
  }
}

function uniqueError(error, message) {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes('UNIQUE constraint failed')) {
    throw new HttpError(409, 'duplicate_value', message);
  }
  throw error;
}

export async function getOverview(request, env) {
  const { user } = await requireAdmin(request, env);
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS count FROM users'),
    env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE is_banned = 1'),
    env.DB.prepare('SELECT COUNT(*) AS count FROM servers'),
    env.DB.prepare('SELECT COUNT(*) AS count FROM servers WHERE is_published = 1'),
    env.DB.prepare("SELECT COUNT(*) AS count FROM servers WHERE status = 'online' AND is_published = 1"),
    env.DB.prepare('SELECT COUNT(*) AS count FROM privileges WHERE is_active = 1'),
    env.DB.prepare('SELECT COUNT(*) AS count FROM news WHERE is_published = 1'),
    env.DB.prepare('SELECT COUNT(*) AS count FROM rules WHERE is_published = 1'),
    env.DB.prepare("SELECT COUNT(*) AS count FROM purchases WHERE status = 'pending'"),
    env.DB.prepare(
      "SELECT COUNT(*) AS count FROM purchases WHERE status = 'paid' AND (expires_at IS NULL OR expires_at > ?)",
    ).bind(now),
    env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(price_cents), 0) AS revenue FROM purchases WHERE status = 'paid'"),
    env.DB.prepare(
      `SELECT p.*, u.steam_id, u.persona_name, u.avatar_url
         FROM purchases p JOIN users u ON u.id = p.user_id
        ORDER BY p.created_at DESC, p.id DESC LIMIT 8`,
    ),
    env.DB.prepare(
      `SELECT id, steam_id, persona_name, avatar_url, created_at, last_login_at, is_banned
         FROM users ORDER BY created_at DESC, id DESC LIMIT 6`,
    ),
    env.DB.prepare(
      `SELECT a.*, u.persona_name FROM admin_audit a
         LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC LIMIT 6`,
    ),
  ]);

  const paidStats = results[10]?.results?.[0] || {};
  return json({
    stats: {
      users: num(results[0]),
      bannedUsers: num(results[1]),
      servers: num(results[2]),
      publishedServers: num(results[3]),
      onlineServers: num(results[4]),
      privileges: num(results[5]),
      news: num(results[6]),
      rules: num(results[7]),
      pendingPurchases: num(results[8]),
      activePrivileges: num(results[9]),
      paidPurchases: Number(paidStats.count || 0),
      revenueCents: Number(paidStats.revenue || 0),
    },
    recentPurchases: (results[11]?.results || []).map((row) => purchaseAdmin(row, now)),
    recentUsers: (results[12]?.results || []).map((row) => ({
      id: row.id,
      steamId: row.steam_id,
      personaName: row.persona_name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      isBanned: Boolean(row.is_banned),
    })),
    recentAudit: (results[13]?.results || []).map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      personaName: row.persona_name || 'система',
      createdAt: row.created_at,
    })),
    actor: { steamId: user.steamId, personaName: user.personaName },
  });
}

export async function getAdminSettings(request, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare('SELECT key, value, updated_at FROM settings').all();
  const settings = {};
  for (const row of results || []) settings[row.key] = row.value;
  return json({ settings });
}

export async function updateAdminSettings(request, env) {
  const { user } = await requireAdmin(request, env);
  const body = await readJson(request);
  const values = {};
  const now = new Date().toISOString();

  if (body.projectName !== undefined) {
    values.project_name = cleanString(body.projectName, {
      field: 'projectName',
      required: true,
      max: 40,
    });
  }
  if (body.tagline !== undefined) {
    values.project_tagline = cleanString(body.tagline, { field: 'tagline', max: 140 });
  }
  if (body.demoNotice !== undefined) {
    values.demo_notice = bool(body.demoNotice, { field: 'demoNotice' }) ? 'true' : 'false';
  }
  if (body.supportLabel !== undefined) {
    values.support_label = cleanString(body.supportLabel, { field: 'supportLabel', max: 40 });
  }
  if (body.supportUrl !== undefined) {
    const raw = cleanString(body.supportUrl, { field: 'supportUrl', max: 500 });
    if (raw && !safeHttpUrl(raw)) {
      throw new HttpError(400, 'validation_error', 'Ссылка поддержки должна начинаться с http:// или https://.', {
        field: 'supportUrl',
      });
    }
    values.support_url = raw ? safeHttpUrl(raw) : '';
  }
  if (body.storeNotice !== undefined) {
    values.store_notice = cleanString(body.storeNotice, {
      field: 'storeNotice',
      max: 600,
      multiline: true,
    });
  }
  if (body.paymentInstructions !== undefined) {
    values.payment_instructions = cleanString(body.paymentInstructions, {
      field: 'paymentInstructions',
      max: 1200,
      multiline: true,
    });
  }

  if (!Object.keys(values).length) {
    throw new HttpError(400, 'nothing_to_update', 'Нет полей для обновления.');
  }

  const statements = Object.entries(values).map(([key, value]) =>
    env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(key, value, now),
  );
  await env.DB.batch(statements);
  await audit(env, user.id, 'update', 'settings', 'site', { keys: Object.keys(values) });
  return json({ ok: true, settings: values });
}

export async function listServers(request, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM servers ORDER BY sort_order ASC, id ASC',
  ).all();
  return json({ items: (results || []).map(serverAdmin) });
}

function serverFields(body, current = null) {
  const name = cleanString(body.name ?? current?.name, {
    field: 'name',
    required: true,
    max: 80,
  });
  const game = cleanString(body.game ?? current?.game, {
    field: 'game',
    required: true,
    max: 80,
  });
  const playersOnline = integer(body.playersOnline ?? current?.players_online ?? 0, {
    field: 'playersOnline',
    min: 0,
    max: 100000,
  });
  const maxPlayers = integer(body.maxPlayers ?? current?.max_players ?? 0, {
    field: 'maxPlayers',
    min: 0,
    max: 100000,
  });
  if (maxPlayers > 0 && playersOnline > maxPlayers) {
    throw new HttpError(400, 'validation_error', 'Число игроков не может превышать максимум.', {
      field: 'playersOnline',
    });
  }
  return {
    slug: slug(body.slug ?? current?.slug ?? '', { field: 'slug', source: name }) || slugify(name),
    name,
    game,
    description: cleanString(body.description ?? current?.description ?? '', {
      field: 'description',
      max: 800,
      multiline: true,
    }),
    address: cleanString(body.address ?? current?.address ?? '', { field: 'address', max: 120 }),
    connect_url: connectUrl(body.connectUrl ?? current?.connect_url ?? '', { field: 'connectUrl' }),
    status: oneOf(body.status ?? current?.status, SERVER_STATUSES, {
      field: 'status',
      fallback: 'offline',
    }),
    players_online: playersOnline,
    max_players: maxPlayers,
    region: cleanString(body.region ?? current?.region ?? '', { field: 'region', max: 32 }),
    version: cleanString(body.version ?? current?.version ?? '', { field: 'version', max: 32 }),
    tags: stringArray(body.tags ?? parseJsonArray(current?.tags), {
      field: 'tags',
      maxItems: 8,
      maxLength: 24,
    }),
    sort_order: integer(body.sortOrder ?? current?.sort_order ?? 0, {
      field: 'sortOrder',
      min: -10000,
      max: 10000,
    }),
    is_published: bool(body.isPublished, {
      field: 'isPublished',
      fallback: current ? Boolean(current.is_published) : true,
    }),
    is_demo: bool(body.isDemo, {
      field: 'isDemo',
      fallback: current ? Boolean(current.is_demo) : false,
    }),
  };
}

export async function createServer(request, env) {
  const { user } = await requireAdmin(request, env);
  const body = await readJson(request);
  const fields = serverFields(body);
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO servers
        (slug, name, game, description, address, connect_url, status, players_online, max_players,
         region, version, tags, sort_order, is_published, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
      .bind(
        fields.slug,
        fields.name,
        fields.game,
        fields.description,
        fields.address,
        fields.connect_url,
        fields.status,
        fields.players_online,
        fields.max_players,
        fields.region,
        fields.version,
        JSON.stringify(fields.tags),
        fields.sort_order,
        fields.is_published ? 1 : 0,
        fields.is_demo ? 1 : 0,
        now,
        now,
      )
      .first();
    await audit(env, user.id, 'create', 'server', row.id, { name: row.name });
    return json({ item: serverAdmin(row) }, { status: 201 });
  } catch (error) {
    uniqueError(error, 'Сервер с таким slug уже существует.');
  }
}

export async function updateServer(request, env, id) {
  const { user } = await requireAdmin(request, env);
  const current = await env.DB.prepare('SELECT * FROM servers WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'server_not_found', 'Сервер не найден.');
  const body = await readJson(request);
  const fields = serverFields(body, current);
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `UPDATE servers SET slug = ?, name = ?, game = ?, description = ?, address = ?, connect_url = ?,
        status = ?, players_online = ?, max_players = ?, region = ?, version = ?, tags = ?,
        sort_order = ?, is_published = ?, is_demo = ?, updated_at = ? WHERE id = ? RETURNING *`,
    )
      .bind(
        fields.slug,
        fields.name,
        fields.game,
        fields.description,
        fields.address,
        fields.connect_url,
        fields.status,
        fields.players_online,
        fields.max_players,
        fields.region,
        fields.version,
        JSON.stringify(fields.tags),
        fields.sort_order,
        fields.is_published ? 1 : 0,
        fields.is_demo ? 1 : 0,
        now,
        id,
      )
      .first();
    await audit(env, user.id, 'update', 'server', id, { name: row.name });
    return json({ item: serverAdmin(row) });
  } catch (error) {
    uniqueError(error, 'Сервер с таким slug уже существует.');
  }
}

export async function deleteServer(request, env, id) {
  const { user } = await requireAdmin(request, env);
  const current = await env.DB.prepare('SELECT name FROM servers WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'server_not_found', 'Сервер не найден.');
  await env.DB.prepare('DELETE FROM servers WHERE id = ?').bind(id).run();
  await audit(env, user.id, 'delete', 'server', id, { name: current.name });
  return json({ ok: true });
}

export async function listPrivileges(request, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM privileges ORDER BY sort_order ASC, id ASC',
  ).all();
  return json({ items: (results || []).map(privilegeAdmin) });
}

function privilegeFields(body, current = null) {
  const name = cleanString(body.name ?? current?.name, {
    field: 'name',
    required: true,
    max: 60,
  });
  const durationRaw = body.durationDays !== undefined ? body.durationDays : current?.duration_days;
  const durationDays =
    durationRaw === '' || durationRaw === null || durationRaw === undefined
      ? null
      : integer(durationRaw, { field: 'durationDays', min: 1, max: 3650 });
  return {
    slug: slug(body.slug ?? current?.slug ?? '', { field: 'slug', source: name }) || slugify(name),
    name,
    description: cleanString(body.description ?? current?.description ?? '', {
      field: 'description',
      max: 500,
      multiline: true,
    }),
    image_url: assetPath(body.imageUrl ?? current?.image_url ?? '', { field: 'imageUrl' }),
    price_cents: integer(body.priceCents ?? current?.price_cents ?? 0, {
      field: 'priceCents',
      min: 0,
      max: 100000000,
    }),
    currency: oneOf(body.currency ?? current?.currency, CURRENCIES, {
      field: 'currency',
      fallback: 'RUB',
    }),
    duration_days: durationDays,
    features: stringArray(body.features ?? parseJsonArray(current?.features), {
      field: 'features',
      maxItems: 20,
      maxLength: 160,
    }),
    badge: cleanString(body.badge ?? current?.badge ?? '', { field: 'badge', max: 32 }),
    sort_order: integer(body.sortOrder ?? current?.sort_order ?? 0, {
      field: 'sortOrder',
      min: -10000,
      max: 10000,
    }),
    is_active: bool(body.isActive, {
      field: 'isActive',
      fallback: current ? Boolean(current.is_active) : true,
    }),
    is_demo: bool(body.isDemo, {
      field: 'isDemo',
      fallback: current ? Boolean(current.is_demo) : false,
    }),
  };
}

export async function createPrivilege(request, env) {
  const { user } = await requireAdmin(request, env);
  const body = await readJson(request);
  const fields = privilegeFields(body);
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO privileges
        (slug, name, description, image_url, price_cents, currency, duration_days, features,
         badge, sort_order, is_active, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
      .bind(
        fields.slug,
        fields.name,
        fields.description,
        fields.image_url,
        fields.price_cents,
        fields.currency,
        fields.duration_days,
        JSON.stringify(fields.features),
        fields.badge,
        fields.sort_order,
        fields.is_active ? 1 : 0,
        fields.is_demo ? 1 : 0,
        now,
        now,
      )
      .first();
    await audit(env, user.id, 'create', 'privilege', row.id, { name: row.name });
    return json({ item: privilegeAdmin(row) }, { status: 201 });
  } catch (error) {
    uniqueError(error, 'Привилегия с таким slug уже существует.');
  }
}

export async function updatePrivilege(request, env, id) {
  const { user } = await requireAdmin(request, env);
  const current = await env.DB.prepare('SELECT * FROM privileges WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'privilege_not_found', 'Привилегия не найдена.');
  const body = await readJson(request);
  const fields = privilegeFields(body, current);
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `UPDATE privileges SET slug = ?, name = ?, description = ?, image_url = ?, price_cents = ?,
        currency = ?, duration_days = ?, features = ?, badge = ?, sort_order = ?, is_active = ?,
        is_demo = ?, updated_at = ? WHERE id = ? RETURNING *`,
    )
      .bind(
        fields.slug,
        fields.name,
        fields.description,
        fields.image_url,
        fields.price_cents,
        fields.currency,
        fields.duration_days,
        JSON.stringify(fields.features),
        fields.badge,
        fields.sort_order,
        fields.is_active ? 1 : 0,
        fields.is_demo ? 1 : 0,
        now,
        id,
      )
      .first();
    await audit(env, user.id, 'update', 'privilege', id, { name: row.name });
    return json({ item: privilegeAdmin(row) });
  } catch (error) {
    uniqueError(error, 'Привилегия с таким slug уже существует.');
  }
}

export async function deletePrivilege(request, env, id) {
  const { user } = await requireAdmin(request, env);
  const current = await env.DB.prepare('SELECT name FROM privileges WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'privilege_not_found', 'Привилегия не найдена.');
  const pending = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM purchases WHERE privilege_id = ? AND status = 'pending'",
  )
    .bind(id)
    .first();
  if (Number(pending?.count || 0) > 0) {
    throw new HttpError(409, 'privilege_has_pending', 'Сначала закройте ожидающие заявки по этой привилегии.');
  }
  await env.DB.prepare('DELETE FROM privileges WHERE id = ?').bind(id).run();
  await audit(env, user.id, 'delete', 'privilege', id, { name: current.name });
  return json({ ok: true });
}

export async function listNews(request, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM news ORDER BY published_at DESC, id DESC',
  ).all();
  return json({ items: (results || []).map(newsAdmin) });
}

function newsFields(body, current = null) {
  const title = cleanString(body.title ?? current?.title, {
    field: 'title',
    required: true,
    max: 140,
  });
  return {
    slug: slug(body.slug ?? current?.slug ?? '', { field: 'slug', source: title }) || slugify(title),
    title,
    excerpt: cleanString(body.excerpt ?? current?.excerpt ?? '', {
      field: 'excerpt',
      max: 320,
      multiline: true,
    }),
    content: cleanString(body.content ?? current?.content ?? '', {
      field: 'content',
      max: 40000,
      multiline: true,
    }),
    cover_url: assetPath(body.coverUrl ?? current?.cover_url ?? '', { field: 'coverUrl' }),
    published_at: dateTime(body.publishedAt ?? current?.published_at, {
      field: 'publishedAt',
      fallback: new Date().toISOString(),
    }),
    is_published: bool(body.isPublished, {
      field: 'isPublished',
      fallback: current ? Boolean(current.is_published) : true,
    }),
    is_demo: bool(body.isDemo, {
      field: 'isDemo',
      fallback: current ? Boolean(current.is_demo) : false,
    }),
  };
}

export async function createNews(request, env) {
  const { user } = await requireAdmin(request, env);
  const body = await readJson(request);
  const fields = newsFields(body);
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO news (slug, title, excerpt, content, cover_url, published_at, is_published, is_demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
      .bind(
        fields.slug,
        fields.title,
        fields.excerpt,
        fields.content,
        fields.cover_url,
        fields.published_at,
        fields.is_published ? 1 : 0,
        fields.is_demo ? 1 : 0,
        now,
        now,
      )
      .first();
    await audit(env, user.id, 'create', 'news', row.id, { title: row.title });
    return json({ item: newsAdmin(row) }, { status: 201 });
  } catch (error) {
    uniqueError(error, 'Новость с таким slug уже существует.');
  }
}

export async function updateNews(request, env, id) {
  const { user } = await requireAdmin(request, env);
  const current = await env.DB.prepare('SELECT * FROM news WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'news_not_found', 'Новость не найдена.');
  const body = await readJson(request);
  const fields = newsFields(body, current);
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `UPDATE news SET slug = ?, title = ?, excerpt = ?, content = ?, cover_url = ?, published_at = ?,
        is_published = ?, is_demo = ?, updated_at = ? WHERE id = ? RETURNING *`,
    )
      .bind(
        fields.slug,
        fields.title,
        fields.excerpt,
        fields.content,
        fields.cover_url,
        fields.published_at,
        fields.is_published ? 1 : 0,
        fields.is_demo ? 1 : 0,
        now,
        id,
      )
      .first();
    await audit(env, user.id, 'update', 'news', id, { title: row.title });
    return json({ item: newsAdmin(row) });
  } catch (error) {
    uniqueError(error, 'Новость с таким slug уже существует.');
  }
}

export async function deleteNews(request, env, id) {
  const { user } = await requireAdmin(request, env);
  const current = await env.DB.prepare('SELECT title FROM news WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'news_not_found', 'Новость не найдена.');
  await env.DB.prepare('DELETE FROM news WHERE id = ?').bind(id).run();
  await audit(env, user.id, 'delete', 'news', id, { title: current.title });
  return json({ ok: true });
}

export async function listRules(request, env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM rules ORDER BY category_order ASC, sort_order ASC, id ASC',
  ).all();
  return json({ items: (results || []).map(ruleAdmin) });
}

function ruleFields(body, current = null) {
  const title = cleanString(body.title ?? current?.title, {
    field: 'title',
    required: true,
    max: 140,
  });
  return {
    slug: slug(body.slug ?? current?.slug ?? '', { field: 'slug', source: title }) || slugify(title),
    category: cleanString(body.category ?? current?.category, {
      field: 'category',
      required: true,
      max: 80,
    }),
    category_order: integer(body.categoryOrder ?? current?.category_order ?? 0, {
      field: 'categoryOrder',
      min: 0,
      max: 10000,
    }),
    title,
    content: cleanString(body.content ?? current?.content ?? '', {
      field: 'content',
      max: 20000,
      multiline: true,
    }),
    sort_order: integer(body.sortOrder ?? current?.sort_order ?? 0, {
      field: 'sortOrder',
      min: 0,
      max: 10000,
    }),
    is_published: bool(body.isPublished, {
      field: 'isPublished',
      fallback: current ? Boolean(current.is_published) : true,
    }),
  };
}

export async function createRule(request, env) {
  const { user } = await requireAdmin(request, env);
  const body = await readJson(request);
  const fields = ruleFields(body);
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `INSERT INTO rules
        (slug, category, category_order, title, content, sort_order, is_published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
      .bind(
        fields.slug,
        fields.category,
        fields.category_order,
        fields.title,
        fields.content,
        fields.sort_order,
        fields.is_published ? 1 : 0,
        now,
        now,
      )
      .first();
    await audit(env, user.id, 'create', 'rule', row.id, { title: row.title });
    return json({ item: ruleAdmin(row) }, { status: 201 });
  } catch (error) {
    uniqueError(error, 'Правило с таким slug уже существует.');
  }
}

export async function updateRule(request, env, id) {
  const { user } = await requireAdmin(request, env);
  const current = await env.DB.prepare('SELECT * FROM rules WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'rule_not_found', 'Правило не найдено.');
  const body = await readJson(request);
  const fields = ruleFields(body, current);
  const now = new Date().toISOString();
  try {
    const row = await env.DB.prepare(
      `UPDATE rules SET slug = ?, category = ?, category_order = ?, title = ?, content = ?,
        sort_order = ?, is_published = ?, updated_at = ? WHERE id = ? RETURNING *`,
    )
      .bind(
        fields.slug,
        fields.category,
        fields.category_order,
        fields.title,
        fields.content,
        fields.sort_order,
        fields.is_published ? 1 : 0,
        now,
        id,
      )
      .first();
    await audit(env, user.id, 'update', 'rule', id, { title: row.title });
    return json({ item: ruleAdmin(row) });
  } catch (error) {
    uniqueError(error, 'Правило с таким slug уже существует.');
  }
}

export async function deleteRule(request, env, id) {
  const { user } = await requireAdmin(request, env);
  const current = await env.DB.prepare('SELECT title FROM rules WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'rule_not_found', 'Правило не найдено.');
  await env.DB.prepare('DELETE FROM rules WHERE id = ?').bind(id).run();
  await audit(env, user.id, 'delete', 'rule', id, { title: current.title });
  return json({ ok: true });
}

export async function listUsers(request, env) {
  const admin = await requireAdmin(request, env);
  const url = new URL(request.url);
  const search = cleanString(url.searchParams.get('search') || '', { field: 'search', max: 80 });
  const limit = limitParam(url.searchParams.get('limit'), { fallback: 50, max: 100 });
  const like = `%${search}%`;
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.steam_id, u.persona_name, u.avatar_url, u.created_at, u.last_login_at,
            u.is_banned, u.ban_reason,
            (SELECT COUNT(*) FROM purchases p WHERE p.user_id = u.id) AS purchase_count,
            (SELECT COUNT(*) FROM purchases p WHERE p.user_id = u.id AND p.status = 'paid'
               AND (p.expires_at IS NULL OR p.expires_at > ?)) AS active_count
       FROM users u
      WHERE (? = '' OR u.persona_name LIKE ? OR u.steam_id LIKE ?)
      ORDER BY u.created_at DESC, u.id DESC LIMIT ?`,
  )
    .bind(new Date().toISOString(), search, like, like, limit)
    .all();
  const adminIds = new Set(
    String(env.ADMIN_STEAM_IDS || '')
      .split(/[\s,;]+/)
      .filter((id) => /^\d{17}$/.test(id)),
  );
  return json({
    items: (results || []).map((row) => ({
      id: row.id,
      steamId: row.steam_id,
      personaName: row.persona_name,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      isBanned: Boolean(row.is_banned),
      banReason: row.ban_reason,
      purchaseCount: Number(row.purchase_count || 0),
      activePrivileges: Number(row.active_count || 0),
      isAdmin: adminIds.has(row.steam_id),
      isSelf: row.id === admin.user.id,
    })),
    meta: { search, limit },
  });
}

export async function updateUser(request, env, id) {
  const { user: actor } = await requireAdmin(request, env);
  const current = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (!current) throw new HttpError(404, 'user_not_found', 'Пользователь не найден.');
  if (current.steam_id === actor.steamId) {
    throw new HttpError(400, 'cannot_modify_self', 'Нельзя изменить блокировку собственного аккаунта.');
  }
  if (parseAdminSteamIds(env.ADMIN_STEAM_IDS).has(current.steam_id)) {
    throw new HttpError(400, 'cannot_modify_admin', 'Нельзя заблокировать другого администратора.');
  }
  const body = await readJson(request);
  if (body.isBanned === undefined) {
    throw new HttpError(400, 'nothing_to_update', 'Нет полей для обновления.');
  }
  const isBanned = bool(body.isBanned, { field: 'isBanned' });
  const banReason = isBanned
    ? cleanString(body.banReason ?? current.ban_reason, {
        field: 'banReason',
        max: 300,
        multiline: true,
      })
    : '';
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE users SET is_banned = ?, ban_reason = ?, updated_at = ? WHERE id = ?',
  )
    .bind(isBanned ? 1 : 0, banReason, now, id)
    .run();
  if (isBanned) {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  }
  await audit(env, actor.id, isBanned ? 'ban' : 'unban', 'user', id, {
    steamId: current.steam_id,
    reason: banReason,
  });
  return json({ ok: true });
}

export async function listPurchases(request, env) {
  await requireAdmin(request, env);
  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status') || 'all';
  const status = statusParam === 'all' ? 'all' : oneOf(statusParam, PURCHASE_STATUSES, { field: 'status' });
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.steam_id, u.persona_name, u.avatar_url
       FROM purchases p JOIN users u ON u.id = p.user_id
      WHERE (? = 'all' OR p.status = ?)
      ORDER BY p.created_at DESC, p.id DESC LIMIT 150`,
  )
    .bind(status, status)
    .all();
  return json({
    items: (results || []).map((row) => purchaseAdmin(row)),
    meta: { status },
  });
}

export async function updatePurchase(request, env, id) {
  const { user } = await requireAdmin(request, env);
  const current = await env.DB.prepare(
    `SELECT p.*, u.steam_id, u.persona_name, u.avatar_url
       FROM purchases p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
  )
    .bind(id)
    .first();
  if (!current) throw new HttpError(404, 'purchase_not_found', 'Заявка не найдена.');

  const body = await readJson(request);
  const targetStatus = oneOf(body.status ?? current.status, PURCHASE_STATUSES, {
    field: 'status',
    fallback: current.status,
  });
  if (targetStatus !== current.status && !PURCHASE_TRANSITIONS[current.status]?.includes(targetStatus)) {
    throw new HttpError(409, 'invalid_transition', 'Недопустимое изменение статуса заявки.');
  }
  const adminNote = cleanString(body.adminNote ?? current.admin_note ?? '', {
    field: 'adminNote',
    max: 500,
    multiline: true,
  });

  const nowDate = new Date();
  const now = nowDate.toISOString();
  let paidAt = current.paid_at;
  let expiresAt = current.expires_at;

  if (targetStatus === 'paid' && current.status !== 'paid') {
    paidAt = now;
    if (current.duration_days === null) {
      expiresAt = null;
    } else {
      expiresAt = new Date(nowDate.getTime() + Number(current.duration_days) * 86400000).toISOString();
    }
  }

  const row = await env.DB.prepare(
    `UPDATE purchases SET status = ?, admin_note = ?, paid_at = ?, expires_at = ?, updated_at = ?
      WHERE id = ? RETURNING *`,
  )
    .bind(targetStatus, adminNote, paidAt, expiresAt, now, id)
    .first();

  await audit(env, user.id, 'update_status', 'purchase', id, {
    from: current.status,
    to: targetStatus,
    orderNumber: current.order_number,
  });

  return json({
    item: purchaseAdmin({
      ...row,
      steam_id: current.steam_id,
      persona_name: current.persona_name,
      avatar_url: current.avatar_url,
    }),
  });
}
