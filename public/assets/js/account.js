import { api, steamLoginUrl } from './api.js';
import {
  getAuthState,
  getSiteConfig,
  loadAuth,
  loadSite,
  setAuthState,
} from './app.js';
import {
  escapeHtml,
  formatDate,
  formatDateTime,
  formatPrice,
  icon,
  safeAsset,
  setButtonLoading,
  statusInfo,
  toast,
} from './utils.js';

const gate = document.querySelector('#auth-gate');
const gateTitle = document.querySelector('#auth-gate-title');
const gateText = document.querySelector('#auth-gate-text');
const gateActions = document.querySelector('#auth-gate-actions');
const gateNotice = document.querySelector('#auth-gate-notice');
const gateLogin = document.querySelector('#auth-gate-login');
const content = document.querySelector('#account-content');

const state = {
  purchases: [],
  active: [],
  sessions: [],
  loading: false,
};

const AUTH_ERRORS = {
  not_configured:
    'Вход через Steam ещё не настроен на сервере. Администратору нужно добавить STEAM_API_KEY в переменные Cloudflare.',
  state_mismatch: 'Сессия входа истекла или не совпала. Попробуйте войти ещё раз.',
  invalid_response: 'Steam вернул некорректный ответ. Попробуйте войти ещё раз.',
  banned: 'Этот аккаунт заблокирован. Причина указана в уведомлении администрации.',
  profile_unavailable: 'Не удалось получить профиль Steam. Попробуйте позже.',
  rate_limited: 'Слишком много попыток входа. Подождите несколько минут и попробуйте снова.',
  internal: 'Не удалось завершить вход. Попробуйте ещё раз или обратитесь в поддержку.',
};

function showGate({ title, text, notice = '', actions = true, error = false }) {
  if (gate) gate.hidden = false;
  if (content) content.hidden = true;
  if (gateTitle) gateTitle.textContent = title;
  if (gateText) gateText.textContent = text;
  if (gateActions) gateActions.hidden = !actions;
  if (gateNotice) {
    gateNotice.innerHTML = notice
      ? `<div class="notice ${error ? 'error-state' : 'notice-demo'}" style="margin-top:20px;text-align:left">${icon(
          error ? 'triangle-alert' : 'lock',
        )}<span>${notice}</span></div>`
      : '';
  }
}

function showAccount() {
  if (gate) gate.hidden = true;
  if (content) content.hidden = false;
}

function profileMarkup(user) {
  if (!user) return;
  const name = user.personaName || 'Игрок';
  const avatar = safeAsset(user.avatarUrl);
  const nameNode = document.querySelector('#profile-name');
  const avatarNode = document.querySelector('#profile-avatar');
  const steamIdNode = document.querySelector('#profile-steamid');
  const roleNode = document.querySelector('#profile-role');
  const createdNode = document.querySelector('#profile-created');
  const lastLoginNode = document.querySelector('#profile-last-login');
  const steamLink = document.querySelector('#profile-steam-link');
  const copyButton = document.querySelector('#copy-steamid');

  if (nameNode) nameNode.textContent = name;
  if (avatarNode) avatarNode.src = avatar;
  if (steamIdNode) steamIdNode.textContent = user.steamId || '—';
  if (roleNode) {
    roleNode.textContent = getAuthState().isAdmin ? 'Администратор' : 'Steam OpenID';
    roleNode.className = `badge ${getAuthState().isAdmin ? 'badge-new' : 'badge-online'}`;
  }
  if (createdNode) createdNode.textContent = formatDate(user.createdAt);
  if (lastLoginNode) lastLoginNode.textContent = formatDate(user.lastLoginAt);
  if (steamLink && user.profileUrl) steamLink.href = user.profileUrl;
  if (copyButton) {
    if (user.steamId) copyButton.setAttribute('data-copy', user.steamId);
    else copyButton.hidden = true;
  }
}

function emptyBlock(iconName, title, text, action = '') {
  return `<div class="account-empty">${icon(iconName)}<strong style="display:block;color:var(--deep);margin-bottom:5px">${escapeHtml(
    title,
  )}</strong><span>${escapeHtml(text)}</span>${action ? `<div style="margin-top:13px">${action}</div>` : ''}</div>`;
}

function renderActive() {
  const root = document.querySelector('#active-privileges-list');
  if (!root) return;
  const countLabel = document.querySelector('#active-count-label');
  if (!state.active.length) {
    root.innerHTML = emptyBlock(
      'crown',
      'Активных привилегий нет',
      'Выберите подходящий уровень поддержки в магазине. После подтверждения оплаты он появится здесь.',
      '<a class="btn btn-soft btn-sm" href="/privileges">Открыть магазин</a>',
    );
    if (countLabel) countLabel.textContent = '0';
    return;
  }
  if (countLabel) countLabel.textContent = `${state.active.length}`;
  root.innerHTML = state.active
    .map(
      (purchase) => `
      <div class="active-privilege">
        <img src="${escapeHtml(safeAsset(purchase.privilege?.imageUrl, '/assets/images/privileges/wave.svg'))}" alt="" loading="lazy">
        <div class="active-privilege-text">
          <strong>${escapeHtml(purchase.privilegeName)}</strong>
          <span>${purchase.expiresAt ? `Активна до ${escapeHtml(formatDate(purchase.expiresAt))}` : 'Бессрочная привилегия'}</span>
          <span>Заявка ${escapeHtml(purchase.orderNumber)}</span>
        </div>
      </div>`,
    )
    .join('');
}

function orderStatusLabel(purchase) {
  if (purchase.status === 'paid' && !purchase.isActive) {
    return { label: 'Истекла', className: 'badge-offline', dot: 'status-dot-offline' };
  }
  return statusInfo(purchase.status);
}

function renderPurchases() {
  const root = document.querySelector('#purchases-list');
  if (!root) return;
  const countLabel = document.querySelector('#purchases-count-label');
  if (countLabel) countLabel.textContent = `${state.purchases.length}`;
  document.querySelector('#profile-stat-purchases').textContent = String(state.purchases.length);
  document.querySelector('#profile-stat-pending').textContent = String(
    state.purchases.filter((item) => item.status === 'pending').length,
  );
  document.querySelector('#profile-stat-active').textContent = String(state.active.length);

  if (!state.purchases.length) {
    root.innerHTML = emptyBlock(
      'shopping-bag',
      'Заявок пока нет',
      'История покупок появится здесь после первой заявки в магазине.',
      '<a class="btn btn-soft btn-sm" href="/privileges">Перейти в магазин</a>',
    );
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Заявка</th>
            <th>Привилегия</th>
            <th>Дата</th>
            <th>Стоимость</th>
            <th>Статус</th>
            <th>Срок</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.purchases
            .map((purchase) => {
              const status = orderStatusLabel(purchase);
              const canCancel = purchase.status === 'pending';
              return `
                <tr>
                  <td><code>${escapeHtml(purchase.orderNumber)}</code></td>
                  <td><strong>${escapeHtml(purchase.privilegeName)}</strong></td>
                  <td>${escapeHtml(formatDate(purchase.createdAt))}</td>
                  <td>${escapeHtml(formatPrice(purchase.priceCents, purchase.currency))}</td>
                  <td>
                    <div class="purchase-row-status">
                      <span class="badge ${status.className}"><span class="status-dot ${status.dot}"></span>${escapeHtml(
                        status.label,
                      )}</span>
                      ${purchase.adminNote ? `<small>${escapeHtml(purchase.adminNote)}</small>` : ''}
                    </div>
                  </td>
                  <td>${
                    purchase.expiresAt
                      ? escapeHtml(formatDate(purchase.expiresAt))
                      : purchase.durationDays === null
                        ? 'Бессрочно'
                        : 'После оплаты'
                  }</td>
                  <td>
                    <div class="purchase-row-actions">
                      ${
                        canCancel
                          ? `<button class="btn btn-ghost btn-sm" type="button" data-cancel-order="${purchase.id}">Отменить</button>`
                          : ''
                      }
                    </div>
                  </td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function browserLabel(userAgent) {
  const ua = userAgent || '';
  let browser = 'Браузер';
  if (/Edg\//.test(ua)) browser = 'Microsoft Edge';
  else if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) browser = 'Google Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Mozilla Firefox';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  let os = '';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Mac OS/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return os ? `${browser} · ${os}` : browser;
}

function renderSessions() {
  const root = document.querySelector('#session-list');
  if (!root) return;
  if (!state.sessions.length) {
    root.innerHTML = emptyBlock('lock', 'Сессия не найдена', 'Обновите страницу или войдите заново.');
    return;
  }
  root.innerHTML = state.sessions
    .map(
      (session) => `
      <div class="session-item">
        <span class="session-icon">${icon('activity')}</span>
        <div class="session-text">
          <strong>${escapeHtml(browserLabel(session.userAgent))}</strong>
          <span>Вход: ${escapeHtml(formatDateTime(session.createdAt))} · активность ${escapeHtml(
            formatDate(session.lastSeenAt),
          )}</span>
        </div>
        ${session.current ? '<span class="session-current">Сейчас</span>' : ''}
      </div>`,
    )
    .join('');
}

function renderSupport() {
  const site = getSiteConfig();
  const link = document.querySelector('#account-support-link');
  const text = document.querySelector('#account-help-text');
  if (!link) return;
  link.hidden = false;
  if (site.supportUrl) {
    link.href = site.supportUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = site.supportLabel || 'Связаться с администрацией';
    if (text) {
      text.textContent =
        'Вопросы по заявкам, привилегиям и блокировкам решаются через официальный канал поддержки проекта.';
    }
  } else {
    link.href = '/rules#punish-2';
    link.removeAttribute('target');
    link.textContent = 'Правила и апелляции';
    if (text) {
      text.textContent =
        'Официальный канал поддержки ещё не настроен. Базовый порядок апелляции описан в правилах проекта.';
    }
  }
}

function fillSettings(user) {
  const form = document.querySelector('#account-settings-form');
  if (!form) return;
  form.elements.compactUi.checked = Boolean(user.compactUi);
  form.elements.reduceMotion.checked = Boolean(user.reduceMotion);
}

async function loadPurchases() {
  try {
    const data = await api.get('/api/account/purchases');
    state.purchases = data.items || [];
    const active = state.purchases.filter((item) => item.isActive);
    const unique = new Map();
    for (const item of active) {
      const key = item.privilegeId || item.orderNumber;
      if (!unique.has(key)) unique.set(key, item);
    }
    state.active = [...unique.values()];
    renderActive();
    renderPurchases();
  } catch (error) {
    if (error.status === 401) {
      showGate({
        title: 'Сессия истекла',
        text: 'Войдите через Steam снова, чтобы открыть кабинет.',
        error: true,
      });
      return;
    }
    const root = document.querySelector('#purchases-list');
    if (root) {
      root.innerHTML = emptyBlock(
        'triangle-alert',
        'Не удалось загрузить заявки',
        error?.message || 'Обновите страницу немного позже.',
      );
    }
  }
}

async function loadSessions() {
  try {
    const data = await api.get('/api/account/sessions');
    state.sessions = data.items || [];
    renderSessions();
  } catch (error) {
    const root = document.querySelector('#session-list');
    if (root) {
      root.innerHTML = emptyBlock(
        'triangle-alert',
        'Не удалось загрузить сессии',
        error?.message || 'Повторите попытку позже.',
      );
    }
  }
}

async function openAuthenticatedAccount(user) {
  if (user.isBanned) {
    showGate({
      title: 'Аккаунт заблокирован',
      text: 'Доступ к личному кабинету ограничен. Если вы считаете это ошибкой, воспользуйтесь порядком апелляции в правилах.',
      notice: user.banReason
        ? `Причина: ${escapeHtml(user.banReason)}`
        : 'Причина указана в уведомлении администрации.',
      actions: false,
      error: true,
    });
    return;
  }
  showAccount();
  profileMarkup(user);
  fillSettings(user);
  renderSupport();
  await Promise.all([loadPurchases(), loadSessions()]);
}

function showAuthError(code) {
  const message = AUTH_ERRORS[code] || 'Не удалось выполнить вход через Steam. Попробуйте ещё раз.';
  showGate({
    title: code === 'banned' ? 'Аккаунт заблокирован' : 'Не удалось войти',
    text: 'Steam-авторизация не завершилась. Попробуйте войти ещё раз.',
    notice: escapeHtml(message),
    actions: code !== 'banned',
    error: true,
  });
}

async function initAccount() {
  const params = new URLSearchParams(window.location.search);
  const authError = params.get('auth_error');
  const loginSuccess = params.get('login') === 'success';

  if (gateLogin) gateLogin.href = steamLoginUrl('/account.html');
  await loadSite();
  const auth = await loadAuth();

  if (authError) {
    showAuthError(authError);
    params.delete('auth_error');
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
    return;
  }

  if (!auth.authenticated) {
    showGate({
      title: 'Войдите через Steam',
      text: 'Личный кабинет, активные привилегии и история заявок доступны после безопасного входа через официальный Steam OpenID.',
      notice: !getSiteConfig().steamLoginEnabled
        ? 'Вход временно недоступен: на сервере не задан STEAM_API_KEY.'
        : '',
      actions: true,
      error: !getSiteConfig().steamLoginEnabled,
    });
    return;
  }

  if (loginSuccess) {
    toast('Вход через Steam выполнен. Добро пожаловать!', { type: 'success' });
    params.delete('login');
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
  }

  await openAuthenticatedAccount(auth.user);
}

document.querySelector('#purchases-list')?.addEventListener('click', async (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-cancel-order]') : null;
  if (!target) return;
  const id = target.getAttribute('data-cancel-order');
  if (!window.confirm('Отменить заявку? Действие нельзя отменить.')) return;
  target.disabled = true;
  try {
    await api.post(`/api/purchases/${encodeURIComponent(id)}/cancel`);
    toast('Заявка отменена.', { type: 'success' });
    await loadPurchases();
  } catch (error) {
    target.disabled = false;
    toast(error?.message || 'Не удалось отменить заявку.', { type: 'error' });
  }
});

document.querySelector('#account-settings-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('#settings-save');
  setButtonLoading(button, true, 'Сохраняем…');
  try {
    const data = await api.patch('/api/account/settings', {
      compactUi: form.elements.compactUi.checked,
      reduceMotion: form.elements.reduceMotion.checked,
    });
    setAuthState({
      authenticated: true,
      user: data.user,
      isAdmin: getAuthState().isAdmin,
    });
    toast('Настройки сохранены.', { type: 'success' });
  } catch (error) {
    toast(error?.message || 'Не удалось сохранить настройки.', { type: 'error' });
  } finally {
    setButtonLoading(button, false);
  }
});

document.querySelector('#revoke-sessions')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!window.confirm('Завершить все другие сессии? На этом устройстве вы останетесь в аккаунте.')) {
    return;
  }
  setButtonLoading(button, true, 'Завершаем…');
  try {
    const data = await api.post('/api/account/sessions/revoke-others');
    toast(
      data.revoked ? `Завершено сессий: ${data.revoked}.` : 'Других активных сессий не было.',
      { type: 'success' },
    );
    await loadSessions();
  } catch (error) {
    toast(error?.message || 'Не удалось завершить сессии.', { type: 'error' });
  } finally {
    setButtonLoading(button, false);
  }
});

document.addEventListener('site:updated', renderSupport);

initAccount().catch((error) => {
  console.error('account_init_failed', error);
  showGate({
    title: 'Кабинет временно недоступен',
    text: 'Не удалось проверить авторизацию. Обновите страницу или попробуйте позже.',
    error: true,
  });
});
