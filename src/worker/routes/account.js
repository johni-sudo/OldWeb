import { HttpError, json, readJson } from '../lib/http.js';
import { bool, cleanString, integer } from '../lib/validate.js';
import { enforceRateLimit } from '../lib/rate-limit.js';
import {
  publicUser,
  requireUser,
  revokeOtherSessions,
} from '../lib/session.js';

function parseFeatures(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function purchasePayload(row, now = new Date().toISOString()) {
  const active =
    row.status === 'paid' && (row.expires_at === null || row.expires_at > now);
  return {
    id: row.id,
    orderNumber: row.order_number,
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
    isActive: active,
    privilege: {
      imageUrl: row.image_url || '',
      features: parseFeatures(row.features),
    },
  };
}

export async function getAccountPurchases(request, env) {
  const { user } = await requireUser(request, env);
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(
    `SELECT p.*, pr.image_url, pr.features
       FROM purchases p
       LEFT JOIN privileges pr ON pr.id = p.privilege_id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC, p.id DESC`,
  )
    .bind(user.id)
    .all();

  const items = (results || []).map((row) => purchasePayload(row, now));
  const active = items.filter((item) => item.isActive);
  return json({
    items,
    meta: {
      total: items.length,
      active: active.length,
      pending: items.filter((item) => item.status === 'pending').length,
    },
  });
}

function orderNumber() {
  const date = new Date();
  const ymd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((byte) => byte.toString(36).padStart(2, '0')).join('').toUpperCase().slice(0, 6);
  return `PRJ-${ymd}-${suffix}`;
}

export async function createPurchase(request, env) {
  const { user } = await requireUser(request, env);
  const body = await readJson(request, 8 * 1024);
  const privilegeId = integer(body.privilegeId, { field: 'privilegeId', min: 1, required: true });
  const customerNote = cleanString(body.customerNote, {
    field: 'customerNote',
    max: 300,
    multiline: true,
  });

  await enforceRateLimit(request, env, 'purchase_create', 8, 10 * 60);

  const privilege = await env.DB.prepare(
    'SELECT * FROM privileges WHERE id = ? AND is_active = 1',
  )
    .bind(privilegeId)
    .first();
  if (!privilege) throw new HttpError(404, 'privilege_not_found', 'Привилегия не найдена.');

  const existing = await env.DB.prepare(
    `SELECT order_number FROM purchases
      WHERE user_id = ? AND privilege_id = ? AND status = 'pending' LIMIT 1`,
  )
    .bind(user.id, privilegeId)
    .first();
  if (existing) {
    throw new HttpError(409, 'order_already_pending', 'Заявка на эту привилегию уже ожидает подтверждения.', {
      orderNumber: existing.order_number,
    });
  }

  const now = new Date().toISOString();
  let row = null;
  let attempt = 0;
  while (!row && attempt < 4) {
    attempt += 1;
    try {
      row = await env.DB.prepare(
        `INSERT INTO purchases
           (order_number, user_id, privilege_id, privilege_name, price_cents, currency,
            duration_days, status, customer_note, admin_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, '', ?, ?)
         RETURNING *`,
      )
        .bind(
          orderNumber(),
          user.id,
          privilege.id,
          privilege.name,
          Number(privilege.price_cents),
          privilege.currency,
          privilege.duration_days,
          customerNote,
          now,
          now,
        )
        .first();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (!text.includes('UNIQUE constraint failed')) throw error;
      const pending = await env.DB.prepare(
        `SELECT order_number FROM purchases
          WHERE user_id = ? AND privilege_id = ? AND status = 'pending' LIMIT 1`,
      )
        .bind(user.id, privilegeId)
        .first();
      if (pending) {
        throw new HttpError(
          409,
          'order_already_pending',
          'Заявка на эту привилегию уже ожидает подтверждения.',
          { orderNumber: pending.order_number },
        );
      }
      // Very unlikely: generated order number collided. Retry with a new one.
      if (!text.includes('order_number') && !text.includes('purchases.order_number')) throw error;
    }
  }
  if (!row) {
    throw new HttpError(500, 'order_create_failed', 'Не удалось создать заявку. Попробуйте ещё раз.');
  }

  return json(
    {
      item: purchasePayload({ ...row, image_url: privilege.image_url, features: privilege.features }),
      message: 'Заявка создана. Оплата пока не списывалась.',
    },
    { status: 201 },
  );
}

export async function cancelPurchase(request, env, purchaseId) {
  const { user } = await requireUser(request, env);
  const row = await env.DB.prepare('SELECT * FROM purchases WHERE id = ? AND user_id = ?')
    .bind(purchaseId, user.id)
    .first();
  if (!row) throw new HttpError(404, 'purchase_not_found', 'Заявка не найдена.');
  if (row.status !== 'pending') {
    throw new HttpError(409, 'purchase_not_cancellable', 'Отменить можно только заявку, ожидающую подтверждения.');
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE purchases SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending'",
  )
    .bind(now, purchaseId)
    .run();
  return json({ ok: true });
}

export async function getAccountSessions(request, env) {
  const session = await requireUser(request, env);
  const { results } = await env.DB.prepare(
    `SELECT token_hash, created_at, last_seen_at, expires_at, user_agent
       FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC`,
  )
    .bind(session.user.id)
    .all();
  return json({
    items: (results || []).map((row) => ({
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      userAgent: row.user_agent,
      current: row.token_hash === session.tokenHash,
    })),
  });
}

export async function revokeOtherAccountSessions(request, env) {
  const session = await requireUser(request, env);
  const revoked = await revokeOtherSessions(env, session.user.id, session.tokenHash);
  return json({ ok: true, revoked });
}

export async function updateAccountSettings(request, env) {
  const session = await requireUser(request, env);
  const body = await readJson(request, 8 * 1024);
  const compactUi = bool(body.compactUi, {
    field: 'compactUi',
    fallback: session.user.compactUi,
  });
  const reduceMotion = bool(body.reduceMotion, {
    field: 'reduceMotion',
    fallback: session.user.reduceMotion,
  });
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE users SET compact_ui = ?, reduce_motion = ?, updated_at = ? WHERE id = ?',
  )
    .bind(compactUi ? 1 : 0, reduceMotion ? 1 : 0, now, session.user.id)
    .run();

  return json({
    ok: true,
    user: publicUser({
      ...session.user,
      compactUi,
      reduceMotion,
      updatedAt: now,
    }),
  });
}
