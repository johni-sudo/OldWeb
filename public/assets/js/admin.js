import { api, steamLoginUrl } from './api.js';
import {
  getAuthState,
  getSiteConfig,
  loadAuth,
  loadSite,
} from './app.js';
import {
  closeDialog,
  debounce,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatDuration,
  formatPrice,
  icon,
  openDialog,
  safeAsset,
  setButtonLoading,
  statusInfo,
  toast,
} from './utils.js';

const gate = document.querySelector('#admin-gate');
const gateTitle = document.querySelector('#admin-gate-title');
const gateText = document.querySelector('#admin-gate-text');
const gateActions = document.querySelector('#admin-gate-actions');
const gateNotice = document.querySelector('#admin-gate-notice');
const gateLogin = document.querySelector('#admin-gate-login');
const shell = document.querySelector('#admin-shell');
const sidebar = document.querySelector('#admin-sidebar');
const overlay = document.querySelector('#admin-overlay');
const viewTitle = document.querySelector('#admin-view-title');
const adminDialog = document.querySelector('#admin-dialog');
const dialogTitle = document.querySelector('#admin-dialog-title');
const dialogSubtitle = document.querySelector('#admin-dialog-subtitle');
const dialogBody = document.querySelector('#admin-dialog-body');
const confirmDialog = document.querySelector('#confirm-dialog');
const confirmTitle = document.querySelector('#confirm-title');
const confirmText = document.querySelector('#confirm-text');
const confirmOk = document.querySelector('#confirm-ok');
const confirmCancel = document.querySelector('#confirm-cancel');
const saveState = document.querySelector('#admin-save-state');
const userSearch = document.querySelector('#user-search');
const purchaseFilter = document.querySelector('#purchase-filter');

const VIEWS = {
  overview: { label: 'Обзор проекта', short: 'Обзор' },
  servers: { label: 'Серверы', short: 'Серверы' },
  privileges: { label: 'Привилегии', short: 'Привилегии' },
  news: { label: 'Новости', short: 'Новости' },
  rules: { label: 'Правила', short: 'Правила' },
  users: { label: 'Пользователи', short: 'Пользователи' },
  purchases: { label: 'Покупки', short: 'Покупки' },
  settings: { label: 'Настройки сайта', short: 'Настройки' },
};

const state = {
  view: 'overview',
  overview: null,
  servers: [],
  privileges: [],
  news: [],
  rules: [],
  users: [],
  purchases: [],
  settings: {},
  userQuery: '',
  purchaseStatus: 'all',
  initialized: false,
};

const COVER_OPTIONS = [
  '/assets/images/news/welcome.svg',
  '/assets/images/news/store.svg',
  '/assets/images/news/security.svg',
];

const PRIVILEGE_IMAGE_OPTIONS = [
  '/assets/images/privileges/wave.svg',
  '/assets/images/privileges/tide.svg',
  '/assets/images/privileges/abyss.svg',
  '/assets/images/privileges/legacy.svg',
];

const PURCHASE_TRANSITIONS = {
  pending: ['pending', 'paid', 'cancelled'],
  paid: ['paid', 'refunded'],
  cancelled: ['cancelled'],
  refunded: ['refunded'],
};

function avatar(value) {
  return escapeHtml(safeAsset(value));
}

function checked(value) {
  return value ? ' checked' : '';
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function statusBadge(status) {
  const info = statusInfo(status);
  return `<span class="badge ${info.className}"><span class="status-dot ${info.dot}"></span>${escapeHtml(info.label)}</span>`;
}

function publishedBadge(value) {
  return value
    ? '<span class="badge badge-online"><span class="status-dot status-dot-online"></span>Опубликовано</span>'
    : '<span class="badge badge-offline"><span class="status-dot status-dot-offline"></span>Черновик</span>';
}

function demoMark(value) {
  return value ? '<span class="admin-demo-mark">демо</span>' : '<span class="text-faint">—</span>';
}

function setSaveState(text) {
  if (!saveState) return;
  saveState.innerHTML = `<span class="status-dot status-dot-online"></span>${escapeHtml(text)}`;
}

function nowTime() {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function showGate({ title, text, notice = '', actions = true, error = false }) {
  if (gate) gate.hidden = false;
  if (shell) shell.hidden = true;
  if (gateTitle) gateTitle.textContent = title;
  if (gateText) gateText.textContent = text;
  if (gateActions) gateActions.hidden = !actions;
  if (gateNotice) {
    gateNotice.innerHTML = notice
      ? `<div class="notice ${error ? 'error-state' : 'notice-demo'}" style="margin-top:18px;text-align:left">${icon(
          error ? 'triangle-alert' : 'lock',
        )}<span>${notice}</span></div>`
      : '';
  }
}

function handleAuthFailure(error) {
  if (error?.status !== 401 && error?.status !== 403) return false;
  showGate({
    title: error.status === 401 ? 'Сессия истекла' : 'Нет доступа',
    text:
      error.status === 401
        ? 'Войдите через Steam снова, чтобы продолжить работу.'
        : 'Этот Steam-аккаунт не входит в список администраторов проекта.',
    notice:
      error.status === 403
        ? 'Доступ проверяется сервером по переменной ADMIN_STEAM_IDS. Обновите список в Cloudflare и войдите заново.'
        : '',
    actions: true,
    error: true,
  });
  return true;
}

function panelError(selector, message) {
  const node = document.querySelector(selector);
  if (!node) return;
  node.innerHTML = `<div class="admin-empty">${icon('triangle-alert')}<div>${escapeHtml(
    message || 'Не удалось загрузить данные.',
  )}</div></div>`;
}

function openAdminDialog(title, subtitle, body) {
  if (dialogTitle) dialogTitle.textContent = title;
  if (dialogSubtitle) dialogSubtitle.textContent = subtitle || '';
  if (dialogBody) dialogBody.innerHTML = body;
  openDialog(adminDialog);
}

function editorActions(submitLabel) {
  return `
    <div class="admin-form-actions">
      <span class="admin-form-hint">Изменения сохраняются на сервере и сразу видны на сайте.</span>
      <button class="btn btn-ghost btn-sm" type="button" data-dialog-close>Отмена</button>
      <button class="btn btn-primary btn-sm" type="submit">${escapeHtml(submitLabel)}</button>
    </div>`;
}

let confirmResolver = null;

function adminConfirm({ title = 'Подтвердите действие', text = 'Это действие нельзя отменить.', label = 'Подтвердить' }) {
  return new Promise((resolve) => {
    if (!confirmDialog) return resolve(false);
    if (confirmResolver) confirmResolver(false);
    confirmResolver = resolve;
    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmText) confirmText.textContent = text;
    if (confirmOk) confirmOk.textContent = label;
    openDialog(confirmDialog);
  });
}

function settleConfirm(value) {
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(value);
  }
  if (confirmDialog?.open) closeDialog(confirmDialog);
}

confirmOk?.addEventListener('click', () => settleConfirm(true));
confirmCancel?.addEventListener('click', () => settleConfirm(false));
confirmDialog?.addEventListener('close', () => {
  if (confirmResolver) {
    const resolve = confirmResolver;
    confirmResolver = null;
    resolve(false);
  }
});

/* ---------------- Overview ---------------- */

function renderOverview() {
  const root = document.querySelector('#overview-content');
  const data = state.overview;
  if (!root || !data) return;
  const stats = data.stats || {};
  const badge = document.querySelector('#admin-pending-badge');
  if (badge) {
    badge.textContent = String(stats.pendingPurchases || 0);
    badge.hidden = !Number(stats.pendingPurchases);
  }

  const metrics = [
    {
      icon: 'users',
      label: 'Пользователи',
      value: stats.users ?? 0,
      note: `${stats.bannedUsers || 0} заблокировано`,
    },
    {
      icon: 'crown',
      label: 'Активные привилегии',
      value: stats.activePrivileges ?? 0,
      note: `${stats.privileges || 0} уровней в магазине`,
    },
    {
      icon: 'shopping-bag',
      label: 'Заявки в ожидании',
      value: stats.pendingPurchases ?? 0,
      note: `${stats.paidPurchases || 0} подтверждено всего`,
    },
    {
      icon: 'server',
      label: 'Опубликовано серверов',
      value: stats.publishedServers ?? 0,
      note: `${stats.onlineServers || 0} в сети`,
    },
  ];

  const recentPurchases = data.recentPurchases || [];
  const recentUsers = data.recentUsers || [];
  const audit = data.recentAudit || [];

  root.innerHTML = `
    <div class="admin-metrics">
      ${metrics
        .map(
          (metric) => `
        <div class="admin-metric">
          <span class="admin-metric-icon">${icon(metric.icon)}</span>
          <span class="admin-metric-label">${escapeHtml(metric.label)}</span>
          <strong class="admin-metric-value">${escapeHtml(String(metric.value))}</strong>
          <span class="admin-metric-note">${escapeHtml(metric.note)}</span>
        </div>`,
        )
        .join('')}
    </div>
    <div class="admin-overview-grid">
      <div class="admin-card">
        <div class="admin-card-head">
          <h3>Последние заявки</h3>
          <button class="admin-card-link" type="button" data-admin-view-link="purchases">Все заявки →</button>
        </div>
        <div class="admin-card-body">
          ${
            recentPurchases.length
              ? `<div class="admin-activity">${recentPurchases
                  .map(
                    (purchase) => `
                <div class="admin-activity-item">
                  <img class="avatar" src="${avatar(purchase.avatarUrl)}" alt="" data-fallback="/assets/images/avatar-fallback.jpg">
                  <div class="admin-activity-text">
                    <strong>${escapeHtml(purchase.personaName)}</strong>
                    <span>${escapeHtml(purchase.privilegeName)} · ${escapeHtml(
                      formatPrice(purchase.priceCents, purchase.currency),
                    )}</span>
                  </div>
                  <span class="admin-activity-value">${statusBadge(purchase.status)}</span>
                </div>`,
                  )
                  .join('')}</div>`
              : `<div class="admin-empty">${icon('shopping-bag')}<div>Заявок пока нет.</div></div>`
          }
        </div>
      </div>
      <div class="admin-card">
        <div class="admin-card-head">
          <h3>Новые участники</h3>
          <button class="admin-card-link" type="button" data-admin-view-link="users">Все →</button>
        </div>
        <div class="admin-card-body">
          ${
            recentUsers.length
              ? `<div class="admin-activity">${recentUsers
                  .map(
                    (user) => `
                <div class="admin-activity-item">
                  <img class="avatar" src="${avatar(user.avatarUrl)}" alt="" data-fallback="/assets/images/avatar-fallback.jpg">
                  <div class="admin-activity-text">
                    <strong>${escapeHtml(user.personaName)}</strong>
                    <span>${escapeHtml(formatDate(user.createdAt))}</span>
                  </div>
                  ${
                    user.isBanned
                      ? '<span class="badge badge-offline">Блок</span>'
                      : `<span class="status-dot ${user.lastLoginAt ? 'status-dot-online' : 'status-dot-offline'}"></span>`
                  }
                </div>`,
                  )
                  .join('')}</div>`
              : `<div class="admin-empty">${icon('users')}<div>Пользователей пока нет.</div></div>`
          }
        </div>
      </div>
    </div>
    ${
      audit.length
        ? `<div class="admin-audit">${audit
            .map(
              (row) => `
          <div class="admin-audit-row">
            ${icon('activity')}
            <span><strong>${escapeHtml(row.personaName)}</strong> · ${escapeHtml(
              row.action,
            )} ${escapeHtml(row.entity)} #${escapeHtml(row.entityId)}</span>
            <time datetime="${escapeHtml(row.createdAt)}">${escapeHtml(formatDateTime(row.createdAt))}</time>
          </div>`,
            )
            .join('')}</div>`
        : ''
    }`;
}

async function loadOverview(force = false) {
  try {
    const data = await api.get('/api/admin/overview');
    state.overview = data;
    renderOverview();
    setSaveState(`Синхронизировано в ${nowTime()}`);
  } catch (error) {
    if (handleAuthFailure(error)) return;
    panelError('#overview-content', error?.message || 'Не удалось загрузить сводку.');
    setSaveState('Ошибка синхронизации');
  }
}

/* ---------------- Servers ---------------- */

function renderServers() {
  const root = document.querySelector('#servers-panel');
  if (!root) return;
  if (!state.servers.length) {
    root.innerHTML = `<div class="admin-empty">${icon('server')}<div>Серверов пока нет. Добавьте первый игровой мир.</div></div>`;
    return;
  }
  root.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Сервер</th>
            <th>Игра</th>
            <th>Статус</th>
            <th>Игроки</th>
            <th>Публикация</th>
            <th>Демо</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.servers
            .map(
              (server) => `
            <tr>
              <td>
                <div class="row-title">
                  <span class="row-icon">${icon('server')}</span>
                  <div class="admin-row-text">
                    <strong>${escapeHtml(server.name)}</strong>
                    <span>${escapeHtml(server.address || 'Адрес не указан')}</span>
                  </div>
                </div>
              </td>
              <td>${escapeHtml(server.game)}</td>
              <td>${statusBadge(server.status)}</td>
              <td class="mono">${server.playersOnline} / ${server.maxPlayers || '—'}</td>
              <td>${publishedBadge(server.isPublished)}</td>
              <td>${demoMark(server.isDemo)}</td>
              <td>
                <div class="admin-row-actions">
                  <button class="admin-action-btn" type="button" data-edit-server="${server.id}" title="Редактировать" aria-label="Редактировать">
                    ${icon('pencil')}
                  </button>
                  <button class="admin-action-btn is-danger" type="button" data-delete-server="${server.id}" title="Удалить" aria-label="Удалить">
                    ${icon('trash-2')}
                  </button>
                </div>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

async function loadServers() {
  const root = document.querySelector('#servers-panel');
  if (root) root.innerHTML = '<div class="admin-loading"><span class="spinner spinner-dark"></span> Загружаем серверы…</div>';
  try {
    const data = await api.get('/api/admin/servers');
    state.servers = data.items || [];
    renderServers();
  } catch (error) {
    if (handleAuthFailure(error)) return;
    panelError('#servers-panel', error?.message);
  }
}

function serverEditor(server = null) {
  const isEdit = Boolean(server?.id);
  const s = server || {};
  const body = `
    <form id="admin-entity-form" class="admin-form" novalidate>
      <div class="admin-form-section">Основные данные</div>
      <label class="field">
        <span class="field-label">Название</span>
        <input class="input" name="name" value="${escapeHtml(s.name || '')}" maxlength="80" required placeholder="PROJECT | Название">
      </label>
      <label class="field">
        <span class="field-label">Игра</span>
        <input class="input" name="game" value="${escapeHtml(s.game || '')}" maxlength="80" required placeholder="Например, Minecraft: Java Edition">
      </label>
      <label class="field field-full">
        <span class="field-label">Описание</span>
        <textarea class="textarea" name="description" maxlength="800" placeholder="Что ждёт игрока на сервере">${escapeHtml(s.description || '')}</textarea>
      </label>
      <div class="admin-form-section">Подключение</div>
      <label class="field">
        <span class="field-label">IP или адрес</span>
        <input class="input" name="address" value="${escapeHtml(s.address || '')}" maxlength="120" placeholder="play.example.com:25565">
      </label>
      <label class="field">
        <span class="field-label">Ссылка подключения</span>
        <input class="input" name="connectUrl" value="${escapeHtml(s.connectUrl || '')}" maxlength="500" placeholder="steam://connect/... или https://...">
      </label>
      <label class="field">
        <span class="field-label">Статус</span>
        <select class="select" name="status">
          ${option('online', 'В сети', s.status || 'offline')}
          ${option('offline', 'Офлайн', s.status || 'offline')}
          ${option('maintenance', 'Тех. работы', s.status || 'offline')}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Регион</span>
        <input class="input" name="region" value="${escapeHtml(s.region || '')}" maxlength="32" placeholder="EU">
      </label>
      <label class="field">
        <span class="field-label">Игроков сейчас</span>
        <input class="input" type="number" name="playersOnline" value="${escapeHtml(s.playersOnline ?? 0)}" min="0" max="100000">
      </label>
      <label class="field">
        <span class="field-label">Максимум игроков</span>
        <input class="input" type="number" name="maxPlayers" value="${escapeHtml(s.maxPlayers ?? 0)}" min="0" max="100000">
        <span class="field-hint">0 означает, что лимит ещё не задан.</span>
      </label>
      <label class="field">
        <span class="field-label">Версия</span>
        <input class="input" name="version" value="${escapeHtml(s.version || '')}" maxlength="32" placeholder="1.21.x">
      </label>
      <label class="field">
        <span class="field-label">Порядок вывода</span>
        <input class="input" type="number" name="sortOrder" value="${escapeHtml(s.sortOrder ?? 0)}" min="-10000" max="10000">
      </label>
      <label class="field field-full">
        <span class="field-label">Теги</span>
        <input class="input" name="tags" value="${escapeHtml((s.tags || []).join(', '))}" placeholder="Выживание, PvP, Java">
        <span class="field-hint">Через запятую, не больше 8 тегов.</span>
      </label>
      <label class="field field-full">
        <span class="field-label">Slug</span>
        <input class="input" name="slug" value="${escapeHtml(s.slug || '')}" maxlength="72" placeholder="aurora">
        <span class="field-hint">Оставьте пустым — адрес создастся из названия.</span>
      </label>
      <div class="admin-form-checks">
        <label class="check"><input type="checkbox" name="isPublished"${checked(s.isPublished ?? true)}> Опубликовать в каталоге</label>
        <label class="check"><input type="checkbox" name="isDemo"${checked(s.isDemo)}> Демонстрационная запись</label>
      </div>
      ${editorActions(isEdit ? 'Сохранить сервер' : 'Добавить сервер')}
    </form>`;
  openAdminDialog(
    isEdit ? 'Редактировать сервер' : 'Новый сервер',
    'Статус и число игроков указываются вручную из реальных данных.',
    body,
  );
  const form = document.querySelector('#admin-entity-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    setButtonLoading(button, true);
    const elements = form.elements;
    const payload = {
      name: elements.name.value,
      game: elements.game.value,
      description: elements.description.value,
      address: elements.address.value,
      connectUrl: elements.connectUrl.value,
      status: elements.status.value,
      region: elements.region.value,
      playersOnline: Number(elements.playersOnline.value || 0),
      maxPlayers: Number(elements.maxPlayers.value || 0),
      version: elements.version.value,
      sortOrder: Number(elements.sortOrder.value || 0),
      tags: elements.tags.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      slug: elements.slug.value,
      isPublished: elements.isPublished.checked,
      isDemo: elements.isDemo.checked,
    };
    try {
      if (isEdit) await api.patch(`/api/admin/servers/${server.id}`, payload);
      else await api.post('/api/admin/servers', payload);
      closeDialog(adminDialog);
      toast(isEdit ? 'Сервер обновлён.' : 'Сервер добавлен.', { type: 'success' });
      await loadServers();
      await loadOverview(true);
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || 'Не удалось сохранить сервер.', { type: 'error' });
    }
  });
}

/* ---------------- Privileges ---------------- */

function renderPrivileges() {
  const root = document.querySelector('#privileges-panel');
  if (!root) return;
  if (!state.privileges.length) {
    root.innerHTML = `<div class="admin-empty">${icon('crown')}<div>Привилегий пока нет. Добавьте первый уровень поддержки.</div></div>`;
    return;
  }
  root.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Привилегия</th><th>Цена</th><th>Срок</th><th>Возможности</th><th>Статус</th><th>Демо</th><th></th></tr>
        </thead>
        <tbody>
          ${state.privileges
            .map(
              (item) => `
            <tr>
              <td>
                <div class="row-title">
                  <span class="row-icon">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="">` : icon('crown')}</span>
                  <div class="admin-row-text">
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>${escapeHtml(item.slug)}</span>
                  </div>
                </div>
              </td>
              <td>${escapeHtml(formatPrice(item.priceCents, item.currency))}</td>
              <td>${escapeHtml(formatDuration(item.durationDays))}</td>
              <td>${item.features.length}</td>
              <td>${item.isActive ? '<span class="badge badge-online">Активна</span>' : '<span class="badge badge-offline">Скрыта</span>'}</td>
              <td>${demoMark(item.isDemo)}</td>
              <td>
                <div class="admin-row-actions">
                  <button class="admin-action-btn" type="button" data-edit-privilege="${item.id}" aria-label="Редактировать">${icon('pencil')}</button>
                  <button class="admin-action-btn is-danger" type="button" data-delete-privilege="${item.id}" aria-label="Удалить">${icon('trash-2')}</button>
                </div>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

async function loadPrivileges() {
  const root = document.querySelector('#privileges-panel');
  if (root) root.innerHTML = '<div class="admin-loading"><span class="spinner spinner-dark"></span> Загружаем привилегии…</div>';
  try {
    const data = await api.get('/api/admin/privileges');
    state.privileges = data.items || [];
    renderPrivileges();
  } catch (error) {
    if (handleAuthFailure(error)) return;
    panelError('#privileges-panel', error?.message);
  }
}

function privilegeEditor(privilege = null) {
  const isEdit = Boolean(privilege?.id);
  const p = privilege || {};
  const price = p.priceCents !== undefined ? (Number(p.priceCents) / 100).toString() : '';
  const body = `
    <form id="admin-entity-form" class="admin-form" novalidate>
      <div class="admin-form-section">Основное</div>
      <label class="field">
        <span class="field-label">Название</span>
        <input class="input" name="name" value="${escapeHtml(p.name || '')}" maxlength="60" required>
      </label>
      <label class="field">
        <span class="field-label">Slug</span>
        <input class="input" name="slug" value="${escapeHtml(p.slug || '')}" maxlength="72" placeholder="tide">
      </label>
      <label class="field field-full">
        <span class="field-label">Описание</span>
        <textarea class="textarea" name="description" maxlength="500">${escapeHtml(p.description || '')}</textarea>
      </label>
      <div class="admin-form-section">Цена и срок</div>
      <label class="field">
        <span class="field-label">Цена</span>
        <input class="input" type="number" name="price" value="${escapeHtml(price)}" min="0" step="0.01" required>
      </label>
      <label class="field">
        <span class="field-label">Валюта</span>
        <select class="select" name="currency">
          ${['RUB', 'USD', 'EUR', 'KZT', 'UAH'].map((currency) => option(currency, currency, p.currency || 'RUB')).join('')}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Срок действия, дней</span>
        <input class="input" type="number" name="durationDays" value="${escapeHtml(p.durationDays ?? '')}" min="1" max="3650" placeholder="Пусто — бессрочно">
      </label>
      <label class="field">
        <span class="field-label">Бейдж</span>
        <input class="input" name="badge" value="${escapeHtml(p.badge || '')}" maxlength="32" placeholder="Выбор сообщества">
      </label>
      <div class="admin-form-section">Оформление</div>
      <label class="field field-full">
        <span class="field-label">Изображение</span>
        <input class="input" name="imageUrl" list="privilege-images" value="${escapeHtml(p.imageUrl || '')}" placeholder="/assets/images/privileges/wave.svg">
        <datalist id="privilege-images">${PRIVILEGE_IMAGE_OPTIONS.map((url) => `<option value="${escapeHtml(url)}"></option>`).join('')}</datalist>
        <span class="field-hint">Файл должен лежать в /assets/images/.</span>
      </label>
      <label class="field field-full">
        <span class="field-label">Возможности</span>
        <textarea class="textarea" name="features" maxlength="4000" placeholder="Каждая возможность с новой строки">${escapeHtml((p.features || []).join('\n'))}</textarea>
        <span class="field-hint">Одна строка — одна возможность в карточке и таблице сравнения.</span>
      </label>
      <label class="field">
        <span class="field-label">Порядок вывода</span>
        <input class="input" type="number" name="sortOrder" value="${escapeHtml(p.sortOrder ?? 0)}" min="-10000" max="10000">
      </label>
      <div class="admin-form-checks">
        <label class="check"><input type="checkbox" name="isActive"${checked(p.isActive ?? true)}> Показывать в магазине</label>
        <label class="check"><input type="checkbox" name="isDemo"${checked(p.isDemo)}> Демонстрационная цена</label>
      </div>
      ${editorActions(isEdit ? 'Сохранить привилегию' : 'Добавить привилегию')}
    </form>`;
  openAdminDialog(
    isEdit ? 'Редактировать привилегию' : 'Новая привилегия',
    'Цена, срок и возможности сохраняются в D1 и сразу попадают на витрину.',
    body,
  );
  const form = document.querySelector('#admin-entity-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    setButtonLoading(button, true);
    const elements = form.elements;
    const payload = {
      name: elements.name.value,
      slug: elements.slug.value,
      description: elements.description.value,
      priceCents: Math.round(Number(elements.price.value || 0) * 100),
      currency: elements.currency.value,
      durationDays: elements.durationDays.value === '' ? null : Number(elements.durationDays.value),
      badge: elements.badge.value,
      imageUrl: elements.imageUrl.value,
      features: elements.features.value.split('\n').map((line) => line.trim()).filter(Boolean),
      sortOrder: Number(elements.sortOrder.value || 0),
      isActive: elements.isActive.checked,
      isDemo: elements.isDemo.checked,
    };
    try {
      if (isEdit) await api.patch(`/api/admin/privileges/${privilege.id}`, payload);
      else await api.post('/api/admin/privileges', payload);
      closeDialog(adminDialog);
      toast(isEdit ? 'Привилегия обновлена.' : 'Привилегия добавлена.', { type: 'success' });
      await loadPrivileges();
      await loadOverview(true);
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || 'Не удалось сохранить привилегию.', { type: 'error' });
    }
  });
}

/* ---------------- News ---------------- */

function renderNews() {
  const root = document.querySelector('#news-panel');
  if (!root) return;
  if (!state.news.length) {
    root.innerHTML = `<div class="admin-empty">${icon('newspaper')}<div>Публикаций пока нет. Создайте первую новость.</div></div>`;
    return;
  }
  root.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Публикация</th><th>Дата</th><th>Статус</th><th>Демо</th><th></th></tr>
        </thead>
        <tbody>
          ${state.news
            .map(
              (item) => `
            <tr>
              <td>
                <div class="row-title">
                  <span class="row-icon">${item.coverUrl ? `<img src="${escapeHtml(item.coverUrl)}" alt="">` : icon('newspaper')}</span>
                  <div class="admin-row-text">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(item.slug)}</span>
                  </div>
                </div>
              </td>
              <td>${escapeHtml(formatDate(item.publishedAt))}</td>
              <td>${publishedBadge(item.isPublished)}</td>
              <td>${demoMark(item.isDemo)}</td>
              <td>
                <div class="admin-row-actions">
                  <a class="admin-action-btn" href="/article?slug=${encodeURIComponent(item.slug)}" target="_blank" rel="noopener" title="Открыть" aria-label="Открыть">${icon('external-link')}</a>
                  <button class="admin-action-btn" type="button" data-edit-news="${item.id}" aria-label="Редактировать">${icon('pencil')}</button>
                  <button class="admin-action-btn is-danger" type="button" data-delete-news="${item.id}" aria-label="Удалить">${icon('trash-2')}</button>
                </div>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

async function loadNews() {
  const root = document.querySelector('#news-panel');
  if (root) root.innerHTML = '<div class="admin-loading"><span class="spinner spinner-dark"></span> Загружаем новости…</div>';
  try {
    const data = await api.get('/api/admin/news');
    state.news = data.items || [];
    renderNews();
  } catch (error) {
    if (handleAuthFailure(error)) return;
    panelError('#news-panel', error?.message);
  }
}

function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function newsEditor(article = null) {
  const isEdit = Boolean(article?.id);
  const n = article || {};
  const published = toLocalInput(n.publishedAt || new Date().toISOString());
  const body = `
    <form id="admin-entity-form" class="admin-form" novalidate>
      <div class="admin-form-section">Заголовок и обложка</div>
      <label class="field field-full">
        <span class="field-label">Заголовок</span>
        <input class="input" name="title" value="${escapeHtml(n.title || '')}" maxlength="140" required>
      </label>
      <label class="field">
        <span class="field-label">Slug</span>
        <input class="input" name="slug" value="${escapeHtml(n.slug || '')}" maxlength="72" placeholder="news-slug">
      </label>
      <label class="field">
        <span class="field-label">Дата публикации</span>
        <input class="input" type="datetime-local" name="publishedAt" value="${escapeHtml(published)}">
      </label>
      <label class="field field-full">
        <span class="field-label">Краткое описание</span>
        <textarea class="textarea" name="excerpt" maxlength="320">${escapeHtml(n.excerpt || '')}</textarea>
      </label>
      <label class="field field-full">
        <span class="field-label">Обложка</span>
        <input class="input" name="coverUrl" list="news-covers" value="${escapeHtml(n.coverUrl || '')}" placeholder="/assets/images/news/welcome.svg">
        <datalist id="news-covers">${COVER_OPTIONS.map((url) => `<option value="${escapeHtml(url)}"></option>`).join('')}</datalist>
      </label>
      <div class="admin-form-section">Текст</div>
      <label class="field field-full">
        <span class="field-label">Публикация (Markdown)</span>
        <textarea class="textarea textarea-lg" name="content" maxlength="40000" required>${escapeHtml(n.content || '')}</textarea>
        <span class="field-hint">Поддерживаются заголовки, списки, цитаты, ссылки и **выделение**.</span>
      </label>
      <div class="admin-form-checks">
        <label class="check"><input type="checkbox" name="isPublished"${checked(n.isPublished ?? true)}> Опубликовать</label>
        <label class="check"><input type="checkbox" name="isDemo"${checked(n.isDemo)}> Демонстрационный материал</label>
      </div>
      ${editorActions(isEdit ? 'Сохранить публикацию' : 'Опубликовать')}
    </form>`;
  openAdminDialog(
    isEdit ? 'Редактировать публикацию' : 'Новая публикация',
    'Текст хранится как Markdown — HTML из браузера не исполняется.',
    body,
  );
  const form = document.querySelector('#admin-entity-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    setButtonLoading(button, true);
    const elements = form.elements;
    const payload = {
      title: elements.title.value,
      slug: elements.slug.value,
      excerpt: elements.excerpt.value,
      coverUrl: elements.coverUrl.value,
      content: elements.content.value,
      publishedAt: elements.publishedAt.value ? new Date(elements.publishedAt.value).toISOString() : null,
      isPublished: elements.isPublished.checked,
      isDemo: elements.isDemo.checked,
    };
    try {
      if (isEdit) await api.patch(`/api/admin/news/${article.id}`, payload);
      else await api.post('/api/admin/news', payload);
      closeDialog(adminDialog);
      toast(isEdit ? 'Публикация обновлена.' : 'Публикация создана.', { type: 'success' });
      await loadNews();
      await loadOverview(true);
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || 'Не удалось сохранить публикацию.', { type: 'error' });
    }
  });
}

/* ---------------- Rules ---------------- */

function renderRules() {
  const root = document.querySelector('#rules-panel');
  if (!root) return;
  if (!state.rules.length) {
    root.innerHTML = `<div class="admin-empty">${icon('book-open')}<div>Правил пока нет. Добавьте первый пункт.</div></div>`;
    return;
  }
  root.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Пункт</th><th>Категория</th><th>Порядок</th><th>Статус</th><th></th></tr>
        </thead>
        <tbody>
          ${state.rules
            .map(
              (rule) => `
            <tr>
              <td>
                <div class="row-title">
                  <span class="row-icon">${icon('book-open')}</span>
                  <div class="admin-row-text">
                    <strong>${escapeHtml(rule.title)}</strong>
                    <span>${escapeHtml(rule.slug)}</span>
                  </div>
                </div>
              </td>
              <td>${escapeHtml(rule.category)}</td>
              <td class="mono">${rule.categoryOrder}.${rule.sortOrder}</td>
              <td>${publishedBadge(rule.isPublished)}</td>
              <td>
                <div class="admin-row-actions">
                  <button class="admin-action-btn" type="button" data-edit-rule="${rule.id}" aria-label="Редактировать">${icon('pencil')}</button>
                  <button class="admin-action-btn is-danger" type="button" data-delete-rule="${rule.id}" aria-label="Удалить">${icon('trash-2')}</button>
                </div>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

async function loadRules() {
  const root = document.querySelector('#rules-panel');
  if (root) root.innerHTML = '<div class="admin-loading"><span class="spinner spinner-dark"></span> Загружаем правила…</div>';
  try {
    const data = await api.get('/api/admin/rules');
    state.rules = data.items || [];
    renderRules();
  } catch (error) {
    if (handleAuthFailure(error)) return;
    panelError('#rules-panel', error?.message);
  }
}

function ruleEditor(rule = null) {
  const isEdit = Boolean(rule?.id);
  const r = rule || {};
  const body = `
    <form id="admin-entity-form" class="admin-form" novalidate>
      <div class="admin-form-section">Структура</div>
      <label class="field">
        <span class="field-label">Категория</span>
        <input class="input" name="category" value="${escapeHtml(r.category || '')}" maxlength="80" required placeholder="Общие положения">
      </label>
      <label class="field">
        <span class="field-label">Порядок категории</span>
        <input class="input" type="number" name="categoryOrder" value="${escapeHtml(r.categoryOrder ?? 10)}" min="0" max="10000">
      </label>
      <label class="field field-full">
        <span class="field-label">Заголовок пункта</span>
        <input class="input" name="title" value="${escapeHtml(r.title || '')}" maxlength="140" required>
      </label>
      <label class="field">
        <span class="field-label">Slug</span>
        <input class="input" name="slug" value="${escapeHtml(r.slug || '')}" maxlength="72">
      </label>
      <label class="field">
        <span class="field-label">Порядок в категории</span>
        <input class="input" type="number" name="sortOrder" value="${escapeHtml(r.sortOrder ?? 10)}" min="0" max="10000">
      </label>
      <label class="field field-full">
        <span class="field-label">Текст правила (Markdown)</span>
        <textarea class="textarea textarea-lg" name="content" maxlength="20000" required>${escapeHtml(r.content || '')}</textarea>
      </label>
      <div class="admin-form-checks">
        <label class="check"><input type="checkbox" name="isPublished"${checked(r.isPublished ?? true)}> Опубликовать</label>
      </div>
      ${editorActions(isEdit ? 'Сохранить правило' : 'Добавить правило')}
    </form>`;
  openAdminDialog(
    isEdit ? 'Редактировать правило' : 'Новый пункт правил',
    'Markdown безопасно преобразуется в HTML при показе на сайте.',
    body,
  );
  const form = document.querySelector('#admin-entity-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    setButtonLoading(button, true);
    const elements = form.elements;
    const payload = {
      category: elements.category.value,
      categoryOrder: Number(elements.categoryOrder.value || 0),
      title: elements.title.value,
      slug: elements.slug.value,
      sortOrder: Number(elements.sortOrder.value || 0),
      content: elements.content.value,
      isPublished: elements.isPublished.checked,
    };
    try {
      if (isEdit) await api.patch(`/api/admin/rules/${rule.id}`, payload);
      else await api.post('/api/admin/rules', payload);
      closeDialog(adminDialog);
      toast(isEdit ? 'Правило обновлено.' : 'Правило добавлено.', { type: 'success' });
      await loadRules();
      await loadOverview(true);
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || 'Не удалось сохранить правило.', { type: 'error' });
    }
  });
}

/* ---------------- Users ---------------- */

function renderUsers() {
  const root = document.querySelector('#users-panel');
  if (!root) return;
  if (!state.users.length) {
    root.innerHTML = `<div class="admin-empty">${icon('users')}<div>${
      state.userQuery ? 'По запросу никого не найдено.' : 'Пользователей пока нет.'
    }</div></div>`;
    return;
  }
  root.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Пользователь</th><th>SteamID64</th><th>Регистрация</th><th>Заявки</th><th>Статус</th><th></th></tr>
        </thead>
        <tbody>
          ${state.users
            .map(
              (user) => `
            <tr>
              <td>
                <div class="row-title">
                  <img class="avatar avatar-sm" src="${avatar(user.avatarUrl)}" alt="" data-fallback="/assets/images/avatar-fallback.jpg">
                  <div class="admin-row-text">
                    <strong>${escapeHtml(user.personaName)}</strong>
                    <span>${user.isAdmin ? 'администратор' : 'игрок'}${user.isSelf ? ' · это вы' : ''}</span>
                  </div>
                </div>
              </td>
              <td><code>${escapeHtml(user.steamId)}</code></td>
              <td>${escapeHtml(formatDate(user.createdAt))}</td>
              <td>${user.purchaseCount} <span class="text-faint">· ${user.activePrivileges} активн.</span></td>
              <td>${
                user.isBanned
                  ? `<span class="badge badge-offline">Заблокирован</span>${
                      user.banReason ? `<div class="admin-row-text"><span>${escapeHtml(user.banReason)}</span></div>` : ''
                    }`
                  : '<span class="badge badge-online">Активен</span>'
              }</td>
              <td>
                <div class="admin-row-actions">
                  ${
                    user.isSelf || user.isAdmin
                      ? '<span class="text-faint" style="font-size:9px">Защищено</span>'
                      : user.isBanned
                        ? `<button class="btn btn-ghost btn-sm" type="button" data-unban-user="${user.id}">Разблокировать</button>`
                        : `<button class="admin-action-btn is-danger" type="button" data-ban-user="${user.id}" title="Заблокировать" aria-label="Заблокировать">${icon('lock')}</button>`
                  }
                </div>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

async function loadUsers() {
  const root = document.querySelector('#users-panel');
  if (root) root.innerHTML = '<div class="admin-loading"><span class="spinner spinner-dark"></span> Загружаем пользователей…</div>';
  try {
    const data = await api.get(`/api/admin/users?search=${encodeURIComponent(state.userQuery)}`);
    state.users = data.items || [];
    renderUsers();
  } catch (error) {
    if (handleAuthFailure(error)) return;
    panelError('#users-panel', error?.message);
  }
}

function banEditor(user) {
  const body = `
    <form id="admin-entity-form" class="admin-form" novalidate>
      <div class="admin-detail-list">
        <div class="admin-detail-row"><span>Игрок</span><strong>${escapeHtml(user.personaName)}</strong></div>
        <div class="admin-detail-row"><span>SteamID64</span><strong>${escapeHtml(user.steamId)}</strong></div>
      </div>
      <label class="field field-full">
        <span class="field-label">Причина блокировки</span>
        <textarea class="textarea" name="banReason" maxlength="300" required placeholder="Кратко и по существу"></textarea>
        <span class="field-hint">Причина будет видна администрации и может быть показана игроку.</span>
      </label>
      <div class="notice notice-demo">
        ${icon('lock')}
        <span>Все активные сессии пользователя будут завершены. Вход через Steam станет недоступен до разблокировки.</span>
      </div>
      ${editorActions('Заблокировать')}
    </form>`;
  openAdminDialog('Заблокировать пользователя', 'Действие проверяется сервером и записывается в журнал.', body);
  const form = document.querySelector('#admin-entity-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    setButtonLoading(button, true);
    try {
      await api.patch(`/api/admin/users/${user.id}`, {
        isBanned: true,
        banReason: form.elements.banReason.value,
      });
      closeDialog(adminDialog);
      toast('Пользователь заблокирован.', { type: 'success' });
      await loadUsers();
      await loadOverview(true);
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || 'Не удалось заблокировать пользователя.', { type: 'error' });
    }
  });
}

/* ---------------- Purchases ---------------- */

function renderPurchases() {
  const root = document.querySelector('#purchases-panel');
  if (!root) return;
  if (!state.purchases.length) {
    root.innerHTML = `<div class="admin-empty">${icon('shopping-bag')}<div>${
      state.purchaseStatus === 'all' ? 'Заявок пока нет.' : 'Заявок с таким статусом нет.'
    }</div></div>`;
    return;
  }
  root.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Заявка</th><th>Игрок</th><th>Привилегия</th><th>Сумма</th><th>Статус</th><th>Дата</th><th></th></tr>
        </thead>
        <tbody>
          ${state.purchases
            .map(
              (purchase) => `
            <tr>
              <td><code>${escapeHtml(purchase.orderNumber)}</code></td>
              <td>
                <div class="row-title">
                  <img class="avatar avatar-sm" src="${avatar(purchase.avatarUrl)}" alt="" data-fallback="/assets/images/avatar-fallback.jpg">
                  <div class="admin-row-text">
                    <strong>${escapeHtml(purchase.personaName)}</strong>
                    <span>${escapeHtml(purchase.steamId)}</span>
                  </div>
                </div>
              </td>
              <td>${escapeHtml(purchase.privilegeName)}</td>
              <td>${escapeHtml(formatPrice(purchase.priceCents, purchase.currency))}</td>
              <td>${statusBadge(purchase.status)}</td>
              <td>${escapeHtml(formatDate(purchase.createdAt))}</td>
              <td>
                <div class="admin-row-actions">
                  <button class="btn btn-soft btn-sm" type="button" data-manage-purchase="${purchase.id}">Обработать</button>
                </div>
              </td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

async function loadPurchases() {
  const root = document.querySelector('#purchases-panel');
  if (root) root.innerHTML = '<div class="admin-loading"><span class="spinner spinner-dark"></span> Загружаем заявки…</div>';
  try {
    const data = await api.get(
      `/api/admin/purchases?status=${encodeURIComponent(state.purchaseStatus)}`,
    );
    state.purchases = data.items || [];
    renderPurchases();
  } catch (error) {
    if (handleAuthFailure(error)) return;
    panelError('#purchases-panel', error?.message);
  }
}

function purchaseEditor(purchase) {
  const allowed = PURCHASE_TRANSITIONS[purchase.status] || [purchase.status];
  const body = `
    <div class="admin-detail-list">
      <div class="admin-detail-row"><span>Заявка</span><strong>${escapeHtml(purchase.orderNumber)}</strong></div>
      <div class="admin-detail-row"><span>Игрок</span><strong>${escapeHtml(purchase.personaName)}</strong></div>
      <div class="admin-detail-row"><span>SteamID64</span><strong>${escapeHtml(purchase.steamId)}</strong></div>
      <div class="admin-detail-row"><span>Привилегия</span><strong>${escapeHtml(purchase.privilegeName)}</strong></div>
      <div class="admin-detail-row"><span>Стоимость</span><strong>${escapeHtml(
        formatPrice(purchase.priceCents, purchase.currency),
      )}</strong></div>
      <div class="admin-detail-row"><span>Создана</span><strong>${escapeHtml(formatDateTime(purchase.createdAt))}</strong></div>
      ${
        purchase.customerNote
          ? `<div class="admin-detail-row"><span>Комментарий игрока</span><strong>${escapeHtml(
              purchase.customerNote,
            )}</strong></div>`
          : ''
      }
    </div>
    <form id="admin-entity-form" class="admin-form" novalidate>
      <label class="field field-full">
        <span class="field-label">Статус заявки</span>
        <select class="select" name="status">
          ${allowed.map((status) => option(status, statusInfo(status).label, purchase.status)).join('')}
        </select>
      </label>
      <label class="field field-full">
        <span class="field-label">Заметка администратора</span>
        <textarea class="textarea" name="adminNote" maxlength="500">${escapeHtml(purchase.adminNote || '')}</textarea>
      </label>
      <div class="notice notice-demo" style="grid-column:1/-1">
        ${icon('shield-check')}
        <span>Статус «Оплачено» выставляйте только после фактического получения средств. Срок действия начнётся с момента подтверждения.</span>
      </div>
      ${editorActions('Сохранить статус')}
    </form>`;
  openAdminDialog('Обработка заявки', 'Проверьте сумму и подтверждение оплаты перед изменением статуса.', body);
  const form = document.querySelector('#admin-entity-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    setButtonLoading(button, true);
    try {
      await api.patch(`/api/admin/purchases/${purchase.id}`, {
        status: form.elements.status.value,
        adminNote: form.elements.adminNote.value,
      });
      closeDialog(adminDialog);
      toast('Заявка обновлена.', { type: 'success' });
      await loadPurchases();
      await loadOverview(true);
    } catch (error) {
      setButtonLoading(button, false);
      toast(error?.message || 'Не удалось обновить заявку.', { type: 'error' });
    }
  });
}

/* ---------------- Settings ---------------- */

function renderSettings() {
  const root = document.querySelector('#settings-panel');
  if (!root) return;
  const s = state.settings || {};
  const site = getSiteConfig();
  root.innerHTML = `
    <form id="settings-form" class="admin-settings">
      <div class="admin-settings-section">
        <h3>Идентичность проекта</h3>
        <p>Название подставляется в шапку, подвал, заголовки и письма интерфейса. Временное PROJECT можно заменить здесь.</p>
        <div class="form-grid">
          <label class="field">
            <span class="field-label">Название проекта</span>
            <input class="input" name="projectName" value="${escapeHtml(s.project_name || site.projectName || 'PROJECT')}" maxlength="40" required>
          </label>
          <label class="field">
            <span class="field-label">Короткий слоган</span>
            <input class="input" name="tagline" value="${escapeHtml(s.project_tagline || site.tagline || '')}" maxlength="140">
          </label>
        </div>
      </div>

      <div class="admin-settings-section">
        <h3>Поддержка</h3>
        <p>Публичная ссылка на Discord, Telegram или другой официальный канал. Если поле пустое, ссылка не показывается.</p>
        <div class="form-grid">
          <label class="field">
            <span class="field-label">Название ссылки</span>
            <input class="input" name="supportLabel" value="${escapeHtml(s.support_label || site.supportLabel || 'Поддержка')}" maxlength="40">
          </label>
          <label class="field">
            <span class="field-label">URL поддержки</span>
            <input class="input" name="supportUrl" value="${escapeHtml(s.support_url || site.supportUrl || '')}" maxlength="500" placeholder="https://discord.gg/...">
          </label>
        </div>
      </div>

      <div class="admin-settings-section">
        <h3>Магазин</h3>
        <p>Текст видят все посетители магазина. Здесь объясняется порядок заявки и оплаты.</p>
        <div class="form-grid">
          <label class="field field-full">
            <span class="field-label">Уведомление магазина</span>
            <textarea class="textarea" name="storeNotice" maxlength="600">${escapeHtml(s.store_notice || site.storeNotice || '')}</textarea>
          </label>
          <label class="field field-full">
            <span class="field-label">Инструкция после создания заявки</span>
            <textarea class="textarea" name="paymentInstructions" maxlength="1200">${escapeHtml(
              s.payment_instructions || site.paymentInstructions || '',
            )}</textarea>
            <span class="field-hint">Не добавляйте сюда реквизиты, которые меняются без проверки. Лучше опишите порядок связи.</span>
          </label>
          <label class="check field-full">
            <input type="checkbox" name="demoNotice"${checked(String(s.demo_notice ?? 'true') === 'true')}>
            Показывать предупреждение о демонстрационном контенте
          </label>
        </div>
      </div>

      <div class="admin-settings-section">
        <h3>Серверные секреты</h3>
        <p>Ключи не хранятся в D1 и не отдаются браузеру. Они задаются в Cloudflare Secrets.</p>
        <div class="admin-detail-list" style="margin-bottom:0">
          <div class="admin-detail-row"><span>STEAM_API_KEY</span><strong>${
            site.steamLoginEnabled ? 'настроен' : 'не настроен'
          }</strong></div>
          <div class="admin-detail-row"><span>ADMIN_STEAM_IDS</span><strong>проверяется сервером</strong></div>
          <div class="admin-detail-row"><span>SESSION_SALT</span><strong>необязательно, рекомендуется</strong></div>
          <div class="admin-detail-row"><span>SITE_ORIGIN</span><strong>необязательно</strong></div>
        </div>
      </div>

      <div class="admin-settings-footer">
        <button class="btn btn-primary" type="submit">Сохранить настройки</button>
      </div>
    </form>`;
  const form = document.querySelector('#settings-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    setButtonLoading(button, true, 'Сохраняем…');
    try {
      await api.patch('/api/admin/settings', {
        projectName: form.elements.projectName.value,
        tagline: form.elements.tagline.value,
        supportLabel: form.elements.supportLabel.value,
        supportUrl: form.elements.supportUrl.value,
        storeNotice: form.elements.storeNotice.value,
        paymentInstructions: form.elements.paymentInstructions.value,
        demoNotice: form.elements.demoNotice.checked,
      });
      toast('Настройки сайта сохранены.', { type: 'success' });
      await loadSite(true);
      await loadSettings();
    } catch (error) {
      toast(error?.message || 'Не удалось сохранить настройки.', { type: 'error' });
      setButtonLoading(button, false);
    }
  });
}

async function loadSettings() {
  const root = document.querySelector('#settings-panel');
  if (root) root.innerHTML = '<div class="admin-loading"><span class="spinner spinner-dark"></span> Загружаем настройки…</div>';
  try {
    const data = await api.get('/api/admin/settings');
    state.settings = data.settings || {};
    renderSettings();
  } catch (error) {
    if (handleAuthFailure(error)) return;
    panelError('#settings-panel', error?.message);
  }
}

/* ---------------- Routing and events ---------------- */

const LOADERS = {
  overview: () => loadOverview(true),
  servers: loadServers,
  privileges: loadPrivileges,
  news: loadNews,
  rules: loadRules,
  users: loadUsers,
  purchases: loadPurchases,
  settings: loadSettings,
};

function closeSidebar() {
  sidebar?.classList.remove('is-open');
  if (overlay) overlay.hidden = true;
  document.body.classList.remove('admin-menu-open');
}

function openSidebar() {
  sidebar?.classList.add('is-open');
  if (overlay) overlay.hidden = false;
  document.body.classList.add('admin-menu-open');
}

function setView(name, { updateHash = true } = {}) {
  if (!VIEWS[name]) name = 'overview';
  state.view = name;
  for (const button of document.querySelectorAll('[data-admin-view]')) {
    button.classList.toggle('is-active', button.getAttribute('data-admin-view') === name);
  }
  for (const panel of document.querySelectorAll('[data-panel]')) {
    const active = panel.getAttribute('data-panel') === name;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  }
  if (viewTitle) viewTitle.textContent = VIEWS[name].label;
  document.title = `${VIEWS[name].label} — Админ-панель`;
  if (updateHash && window.location.hash !== `#${name}`) {
    window.history.pushState(null, '', `${window.location.pathname}#${name}`);
  }
  closeSidebar();
  const loader = LOADERS[name];
  if (loader) loader();
}

function initialView() {
  const hash = window.location.hash.replace(/^#/, '');
  return VIEWS[hash] ? hash : 'overview';
}

function showShell(user) {
  if (gate) gate.hidden = true;
  if (shell) shell.hidden = false;
  const actorName = document.querySelector('#admin-persona');
  const actorAvatar = document.querySelector('#admin-avatar');
  if (actorName) actorName.textContent = user.personaName || 'Администратор';
  if (actorAvatar) actorAvatar.src = safeAsset(user.avatarUrl);
  setSaveState('Доступ подтверждён сервером');
  const view = initialView();
  setView(view, { updateHash: false });
  if (view !== 'overview') loadOverview();
}

/* Global event delegation */
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const nav = target.closest('[data-admin-view]');
  if (nav) {
    event.preventDefault();
    setView(nav.getAttribute('data-admin-view'));
    return;
  }

  const viewLink = target.closest('[data-admin-view-link]');
  if (viewLink) {
    event.preventDefault();
    setView(viewLink.getAttribute('data-admin-view-link'));
    return;
  }

  const quick = target.closest('[data-admin-quick]');
  if (quick) {
    event.preventDefault();
    const view = quick.getAttribute('data-admin-quick');
    setView(view);
    if (view === 'servers') setTimeout(() => serverEditor(), 50);
    if (view === 'news') setTimeout(() => newsEditor(), 50);
    return;
  }

  const menuToggle = target.closest('[data-admin-menu-toggle]');
  if (menuToggle) {
    if (sidebar?.classList.contains('is-open')) closeSidebar();
    else openSidebar();
    return;
  }
});

overlay?.addEventListener('click', closeSidebar);
window.addEventListener('hashchange', () => setView(initialView(), { updateHash: false }));
window.addEventListener('popstate', () => setView(initialView(), { updateHash: false }));

document.querySelector('#admin-refresh')?.addEventListener('click', async () => {
  setSaveState('Обновляем данные…');
  await loadOverview(true);
  await (LOADERS[state.view]?.() || Promise.resolve());
  setSaveState(`Синхронизировано в ${nowTime()}`);
});

document.querySelector('#add-server')?.addEventListener('click', () => serverEditor());
document.querySelector('#add-privilege')?.addEventListener('click', () => privilegeEditor());
document.querySelector('#add-news')?.addEventListener('click', () => newsEditor());
document.querySelector('#add-rule')?.addEventListener('click', () => ruleEditor());

document.querySelector('#servers-panel')?.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const edit = target.closest('[data-edit-server]');
  if (edit) {
    const server = state.servers.find((item) => item.id === Number(edit.getAttribute('data-edit-server')));
    if (server) serverEditor(server);
    return;
  }
  const del = target.closest('[data-delete-server]');
  if (del) {
    const server = state.servers.find((item) => item.id === Number(del.getAttribute('data-delete-server')));
    if (!server) return;
    const ok = await adminConfirm({
      title: 'Удалить сервер?',
      text: `«${server.name}» исчезнет из каталога. Это действие нельзя отменить.`,
      label: 'Удалить',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/admin/servers/${server.id}`);
      toast('Сервер удалён.', { type: 'success' });
      await loadServers();
      await loadOverview(true);
    } catch (error) {
      toast(error?.message || 'Не удалось удалить сервер.', { type: 'error' });
    }
  }
});

document.querySelector('#privileges-panel')?.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const edit = target.closest('[data-edit-privilege]');
  if (edit) {
    const item = state.privileges.find((entry) => entry.id === Number(edit.getAttribute('data-edit-privilege')));
    if (item) privilegeEditor(item);
    return;
  }
  const del = target.closest('[data-delete-privilege]');
  if (del) {
    const item = state.privileges.find((entry) => entry.id === Number(del.getAttribute('data-delete-privilege')));
    if (!item) return;
    const ok = await adminConfirm({
      title: 'Удалить привилегию?',
      text: `«${item.name}» перестанет отображаться в магазине. Завершённые заявки сохранят снимок данных.`,
      label: 'Удалить',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/admin/privileges/${item.id}`);
      toast('Привилегия удалена.', { type: 'success' });
      await loadPrivileges();
      await loadOverview(true);
    } catch (error) {
      toast(error?.message || 'Не удалось удалить привилегию.', { type: 'error' });
    }
  }
});

document.querySelector('#news-panel')?.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const edit = target.closest('[data-edit-news]');
  if (edit) {
    const item = state.news.find((entry) => entry.id === Number(edit.getAttribute('data-edit-news')));
    if (item) newsEditor(item);
    return;
  }
  const del = target.closest('[data-delete-news]');
  if (del) {
    const item = state.news.find((entry) => entry.id === Number(del.getAttribute('data-delete-news')));
    if (!item) return;
    const ok = await adminConfirm({
      title: 'Удалить публикацию?',
      text: `«${item.title}» будет удалена без возможности восстановления.`,
      label: 'Удалить',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/admin/news/${item.id}`);
      toast('Публикация удалена.', { type: 'success' });
      await loadNews();
      await loadOverview(true);
    } catch (error) {
      toast(error?.message || 'Не удалось удалить публикацию.', { type: 'error' });
    }
  }
});

document.querySelector('#rules-panel')?.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const edit = target.closest('[data-edit-rule]');
  if (edit) {
    const item = state.rules.find((entry) => entry.id === Number(edit.getAttribute('data-edit-rule')));
    if (item) ruleEditor(item);
    return;
  }
  const del = target.closest('[data-delete-rule]');
  if (del) {
    const item = state.rules.find((entry) => entry.id === Number(del.getAttribute('data-delete-rule')));
    if (!item) return;
    const ok = await adminConfirm({
      title: 'Удалить правило?',
      text: `«${item.title}» исчезнет со страницы правил.`,
      label: 'Удалить',
    });
    if (!ok) return;
    try {
      await api.delete(`/api/admin/rules/${item.id}`);
      toast('Правило удалено.', { type: 'success' });
      await loadRules();
      await loadOverview(true);
    } catch (error) {
      toast(error?.message || 'Не удалось удалить правило.', { type: 'error' });
    }
  }
});

document.querySelector('#users-panel')?.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const ban = target.closest('[data-ban-user]');
  if (ban) {
    const user = state.users.find((entry) => entry.id === Number(ban.getAttribute('data-ban-user')));
    if (user) banEditor(user);
    return;
  }
  const unban = target.closest('[data-unban-user]');
  if (unban) {
    const user = state.users.find((entry) => entry.id === Number(unban.getAttribute('data-unban-user')));
    if (!user) return;
    const ok = await adminConfirm({
      title: 'Разблокировать пользователя?',
      text: `Доступ для «${user.personaName}» будет восстановлен.`,
      label: 'Разблокировать',
    });
    if (!ok) return;
    try {
      await api.patch(`/api/admin/users/${user.id}`, { isBanned: false, banReason: '' });
      toast('Пользователь разблокирован.', { type: 'success' });
      await loadUsers();
      await loadOverview(true);
    } catch (error) {
      toast(error?.message || 'Не удалось разблокировать пользователя.', { type: 'error' });
    }
  }
});

document.querySelector('#purchases-panel')?.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-manage-purchase]') : null;
  if (!target) return;
  const purchase = state.purchases.find(
    (entry) => entry.id === Number(target.getAttribute('data-manage-purchase')),
  );
  if (purchase) purchaseEditor(purchase);
});

if (userSearch) {
  userSearch.addEventListener(
    'input',
    debounce(() => {
      state.userQuery = userSearch.value.trim();
      loadUsers();
    }, 260),
  );
}

if (purchaseFilter) {
  purchaseFilter.addEventListener('change', () => {
    state.purchaseStatus = purchaseFilter.value;
    loadPurchases();
  });
}

document.addEventListener('auth:expired', () => {
  if (!shell?.hidden) {
    showGate({
      title: 'Сессия истекла',
      text: 'Войдите через Steam снова, чтобы продолжить работу в панели.',
      actions: true,
      error: true,
    });
  }
});

async function initAdmin() {
  if (state.initialized) return;
  state.initialized = true;
  if (gateLogin) gateLogin.href = steamLoginUrl('/admin.html');
  await loadSite();
  const auth = await loadAuth();
  if (!auth.authenticated) {
    showGate({
      title: 'Вход в админ-панель',
      text: 'Панель доступна только администраторам после входа через Steam. Список разрешённых SteamID64 проверяется на сервере.',
      notice: !getSiteConfig().steamLoginEnabled
        ? 'STEAM_API_KEY ещё не настроен — вход через Steam не работает.'
        : '',
      actions: true,
      error: !getSiteConfig().steamLoginEnabled,
    });
    return;
  }
  if (!auth.isAdmin) {
    showGate({
      title: 'Недостаточно прав',
      text: 'Вы вошли через Steam, но этот аккаунт не входит в список администраторов проекта.',
      notice:
        'Доступ проверяется сервером по переменной ADMIN_STEAM_IDS. Если вы только что добавили SteamID64, обновите страницу.',
      actions: true,
      error: true,
    });
    return;
  }
  showShell(auth.user);
}

initAdmin().catch((error) => {
  console.error('admin_init_failed', error);
  showGate({
    title: 'Панель временно недоступна',
    text: 'Не удалось проверить доступ. Обновите страницу позже.',
    error: true,
  });
});

document.addEventListener('site:updated', () => {
  const site = getSiteConfig();
  for (const node of document.querySelectorAll('[data-project-name]')) {
    node.textContent = site.projectName;
  }
});
