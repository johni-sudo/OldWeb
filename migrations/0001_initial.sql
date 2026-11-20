-- PROJECT — initial D1 schema.
-- All timestamps are ISO-8601 UTC strings.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

INSERT INTO settings (key, value, updated_at) VALUES
  ('project_name',        'PROJECT', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('project_tagline',     'Игровое сообщество новой волны', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('demo_notice',         'true', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('support_url',         '', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('support_label',       'Поддержка', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('store_notice',        'Цены и состав привилегий приведены для примера. Замените их в админ-панели перед запуском.', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('payment_instructions','После создания заявки администратор свяжется с вами, подтвердит состав привилегии и пришлёт актуальные реквизиты. Автоматическое списание не производится.', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
;

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  steam_id        TEXT NOT NULL UNIQUE,
  persona_name    TEXT NOT NULL,
  avatar_url      TEXT NOT NULL DEFAULT '',
  profile_url     TEXT NOT NULL DEFAULT '',
  is_banned       INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0, 1)),
  ban_reason      TEXT NOT NULL DEFAULT '',
  compact_ui      INTEGER NOT NULL DEFAULT 0 CHECK (compact_ui IN (0, 1)),
  reduce_motion   INTEGER NOT NULL DEFAULT 0 CHECK (reduce_motion IN (0, 1)),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  last_login_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_steam_id ON users (steam_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent   TEXT NOT NULL DEFAULT '',
  ip_hash      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS login_states (
  state_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  return_to  TEXT NOT NULL DEFAULT '/account.html'
);

CREATE INDEX IF NOT EXISTS idx_login_states_expiry ON login_states (expires_at);

CREATE TABLE IF NOT EXISTS servers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  game           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  connect_url    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'maintenance')),
  players_online INTEGER NOT NULL DEFAULT 0 CHECK (players_online >= 0),
  max_players    INTEGER NOT NULL DEFAULT 0 CHECK (max_players >= 0),
  region         TEXT NOT NULL DEFAULT '',
  version        TEXT NOT NULL DEFAULT '',
  tags           TEXT NOT NULL DEFAULT '[]',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_published   INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  is_demo        INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK (max_players = 0 OR players_online <= max_players)
);

CREATE INDEX IF NOT EXISTS idx_servers_public ON servers (is_published, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_servers_status ON servers (status);

CREATE TABLE IF NOT EXISTS privileges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  image_url     TEXT NOT NULL DEFAULT '',
  price_cents   INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency      TEXT NOT NULL DEFAULT 'RUB' CHECK (currency IN ('RUB', 'USD', 'EUR', 'KZT', 'UAH')),
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
  features      TEXT NOT NULL DEFAULT '[]',
  badge         TEXT NOT NULL DEFAULT '',
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  is_demo       INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_privileges_active ON privileges (is_active, sort_order, id);

CREATE TABLE IF NOT EXISTS news (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  excerpt      TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL DEFAULT '',
  cover_url    TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  is_demo      INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_news_public ON news (is_published, published_at DESC);

CREATE TABLE IF NOT EXISTS rules (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  slug           TEXT NOT NULL UNIQUE,
  category       TEXT NOT NULL,
  category_order INTEGER NOT NULL DEFAULT 0,
  title          TEXT NOT NULL,
  content        TEXT NOT NULL DEFAULT '',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_published   INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rules_public ON rules (is_published, category_order, sort_order);

CREATE TABLE IF NOT EXISTS purchases (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number   TEXT NOT NULL UNIQUE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  privilege_id   INTEGER REFERENCES privileges(id) ON DELETE SET NULL,
  privilege_name TEXT NOT NULL,
  price_cents    INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency       TEXT NOT NULL DEFAULT 'RUB',
  duration_days  INTEGER,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  customer_note  TEXT NOT NULL DEFAULT '',
  admin_note     TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  paid_at        TEXT,
  expires_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_one_pending
  ON purchases (user_id, privilege_id)
  WHERE status = 'pending' AND privilege_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity        TEXT NOT NULL,
  entity_id     TEXT NOT NULL DEFAULT '',
  meta          TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit (created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  reset_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_reset ON rate_limits (reset_at);
