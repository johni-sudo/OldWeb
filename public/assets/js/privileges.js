import { api, steamLoginUrl } from './api.js';
import {
  getAuthState,
  getSiteConfig,
  loadAuth,
  loadSite,
  refreshReveals,
} from './app.js';
import { emptyState, privilegeCard } from './cards.js';
import {
  closeDialog,
  escapeHtml,
  formatDuration,
  formatPrice,
  icon,
  openDialog,
  setButtonLoading,
  toast,
} from './utils.js';

const state = {
  items: [],
  byId: new Map(),
  loaded: false,
  dialogPrivilegeId: null,
};

const grid = document.querySelector('#privileges-grid');
const comparison = document.querySelector('#comparison-table');
const dialog = document.querySelector('#purchase-dialog');
const dialogBody = document.querySelector('#purchase-body');
const dialogTitle = document.querySelector('#purchase-title');
const resultLine = document.querySelector('#privileges-result');
const storeNotice = document.querySelector('#store-notice');

function lineBreaks(value) {
  return escapeHtml(value || '').replace(/\n/g, '<br>');
}

function renderNotice() {
  if (!storeNotice) return;
  const site = getSiteConfig();
  const text = site.storeNotice || 'Цены и состав привилегий настраиваются администратором.';
  storeNotice.innerHTML = `${icon('triangle-alert')}<span>${escapeHtml(text)}${
    site.demoNotice ? ' <strong>Демо-цены не являются публичной офертой.</strong>' : ''
  }</span>`;
}

function renderPrivileges() {
  if (!grid) return;
  if (!state.items.length) {
    grid.innerHTML = emptyState({
      iconName: 'sparkles',
      title: 'Привилегии пока не опубликованы',
      text: 'Администратор ещё не добавил активные уровни поддержки. Раздел обновится автоматически после публикации.',
      action: '<a class="btn btn-glass btn-sm" href="/">На главную</a>',
    });
    if (resultLine) resultLine.textContent = 'Нет активных привилегий';
    return;
  }
  grid.innerHTML = state.items
    .map(
      (item, index) =>
        `<div class="reveal" style="--delay:${index * 60}ms">${privilegeCard(item, {
          featured: index === 1,
        })}</div>`,
    )
    .join('');
  if (resultLine) {
    resultLine.innerHTML = `Доступно <strong>${state.items.length}</strong> ${state.items.length === 1 ? 'привилегия' : 'уровня'} поддержки`;
  }
  refreshReveals(grid);
}

function renderComparison() {
  if (!comparison) return;
  if (!state.items.length) {
    comparison.closest('.comparison-wrap')?.setAttribute('hidden', '');
    return;
  }
  const features = [];
  const seen = new Set();
  for (const item of state.items) {
    for (const feature of item.features || []) {
      if (!seen.has(feature)) {
        seen.add(feature);
        features.push(feature);
      }
    }
  }

  const head = `<thead><tr><th scope="col">Возможности</th>${state.items
    .map(
      (item, index) =>
        `<th scope="col" class="${index === 1 ? 'cmp-highlight' : ''}"><span class="cmp-plan">${escapeHtml(
          item.name,
        )}</span><span class="cmp-price">${escapeHtml(
          formatPrice(item.priceCents, item.currency),
        )} · ${escapeHtml(formatDuration(item.durationDays))}</span></th>`,
    )
    .join('')}</tr></thead>`;

  const body = `<tbody>${features
    .map(
      (feature) =>
        `<tr><th scope="row">${escapeHtml(feature)}</th>${state.items
          .map(
            (item, index) =>
              `<td class="${index === 1 ? 'cmp-highlight' : ''}">${
                (item.features || []).includes(feature)
                  ? `<span class="cmp-yes">${icon('check')}</span>`
                  : '<span class="cmp-no">—</span>'
              }</td>`,
          )
          .join('')}</tr>`,
    )
    .join('')}</tbody>`;

  comparison.innerHTML = head + body;
}

function productMarkup(item) {
  return `
    <div class="purchase-product">
      ${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="">` : ''}
      <div class="purchase-product-text">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(formatDuration(item.durationDays))} · ${escapeHtml(
          formatPrice(item.priceCents, item.currency),
        )}</span>
      </div>
    </div>`;
}

function loginMarkup(item) {
  return `
    ${productMarkup(item)}
    <div class="notice" style="margin-top:18px">
      ${icon('lock')}
      <span>Чтобы создать заявку, войдите через Steam. Мы не запрашиваем пароль и не получаем доступ к вашему аккаунту Valve.</span>
    </div>
    <div class="dialog-foot" style="padding-inline:0;padding-bottom:0">
      <a class="btn btn-steam" href="${steamLoginUrl(`/privileges?buy=${item.id}`)}" data-steam-login>
        ${icon('steam-brand')} Войти через Steam
      </a>
    </div>`;
}

function purchaseFormMarkup(item) {
  const site = getSiteConfig();
  return `
    ${productMarkup(item)}
    <div class="purchase-summary">
      <div class="purchase-summary-row"><span>Срок действия</span><strong>${escapeHtml(
        formatDuration(item.durationDays),
      )}</strong></div>
      <div class="purchase-summary-row"><span>Стоимость</span><strong>${escapeHtml(
        formatPrice(item.priceCents, item.currency),
      )}</strong></div>
      <div class="purchase-summary-row total"><span>К оплате после подтверждения</span><strong>${escapeHtml(
        formatPrice(item.priceCents, item.currency),
      )}</strong></div>
    </div>
    <form id="purchase-form" novalidate>
      <label class="field">
        <span class="field-label">Комментарий для администрации <span class="text-faint">(необязательно)</span></span>
        <textarea class="textarea" name="customerNote" maxlength="300" placeholder="Например, ваш ник в игре или удобный способ связи"></textarea>
        <span class="field-hint">Не указывайте пароли, коды подтверждения и платёжные данные.</span>
      </label>
      <div class="notice" style="margin-top:16px">
        ${icon('shield-check')}
        <span>${escapeHtml(
          site.paymentInstructions ||
            'После создания заявки администратор свяжется с вами и пришлёт реквизиты. Автоматическое списание не производится.',
        )}</span>
      </div>
      <div class="dialog-foot" style="padding-inline:0;padding-bottom:0;justify-content:space-between">
        <span class="field-hint">Создавая заявку, вы принимаете <a class="btn-link" href="/terms">условия</a>.</span>
        <button class="btn btn-primary" type="submit" id="purchase-submit">
          ${icon('send')} Создать заявку
        </button>
      </div>
    </form>`;
}

function successMarkup(order, item) {
  const site = getSiteConfig();
  return `
    <div class="purchase-success">
      <span class="success-icon">${icon('circle-check', 'icon icon-lg')}</span>
      <h3>Заявка создана</h3>
      <p>Деньги не списаны. Администратор проверит заявку и свяжется с вами для подтверждения оплаты.</p>
      <span class="order-code">${escapeHtml(order.orderNumber || '')}</span>
      <p>${lineBreaks(
        site.paymentInstructions ||
          'Инструкции по оплате появятся здесь после настройки магазина администратором.',
      )}</p>
      <div class="dialog-foot" style="padding:18px 0 0;justify-content:center">
        <a class="btn btn-primary" href="/account#purchases">Перейти в кабинет</a>
        <button class="btn btn-ghost" type="button" data-dialog-close>Закрыть</button>
      </div>
    </div>
    <p class="field-hint" style="text-align:center;margin-top:14px">Привилегия: ${escapeHtml(
      item?.name || order.privilegeName || '',
    )}</p>`;
}

function openPurchase(id) {
  const item = state.byId.get(Number(id));
  if (!item || !dialog || !dialogBody) return;
  state.dialogPrivilegeId = item.id;
  if (dialogTitle) dialogTitle.textContent = `Привилегия «${item.name}»`;
  const auth = getAuthState();
  if (!auth.loaded) {
    dialogBody.innerHTML =
      '<div class="loading-row"><span class="spinner spinner-dark" aria-hidden="true"></span> Проверяем вход…</div>';
    openDialog(dialog);
    loadAuth().then(() => openPurchase(item.id));
    return;
  }
  if (!auth.authenticated) {
    dialogBody.innerHTML = loginMarkup(item);
  } else {
    dialogBody.innerHTML = purchaseFormMarkup(item);
    document.querySelector('#purchase-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitPurchase(item, event.currentTarget);
    });
  }
  openDialog(dialog);
}

async function submitPurchase(item, form) {
  const submit = form.querySelector('#purchase-submit');
  const note = form.querySelector('[name="customerNote"]')?.value || '';
  setButtonLoading(submit, true, 'Создаём заявку…');
  try {
    const data = await api.post('/api/purchases', {
      privilegeId: item.id,
      customerNote: note,
    });
    if (dialogBody) dialogBody.innerHTML = successMarkup(data.item, item);
    const url = new URL(window.location.href);
    url.searchParams.delete('buy');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    toast('Заявка создана. Оплата пока не списывалась.', { type: 'success' });
  } catch (error) {
    if (error.status === 401) {
      if (dialogBody) dialogBody.innerHTML = loginMarkup(item);
      toast('Сессия истекла. Войдите через Steam снова.', { type: 'error' });
      return;
    }
    if (error.status === 409 && error.details?.orderNumber) {
      dialogBody.innerHTML = `
        ${productMarkup(item)}
        <div class="notice" style="margin-top:18px">
          ${icon('clock-3')}
          <span>По этой привилегии уже есть заявка <strong>${escapeHtml(
            error.details.orderNumber,
          )}</strong>. Откройте кабинет, чтобы проверить её статус.</span>
        </div>
        <div class="dialog-foot" style="padding-inline:0;padding-bottom:0">
          <a class="btn btn-primary" href="/account#purchases">Перейти в кабинет</a>
          <button class="btn btn-ghost" type="button" data-dialog-close>Закрыть</button>
        </div>`;
      toast('Заявка на эту привилегию уже создана.', { type: 'error' });
      return;
    }
    setButtonLoading(submit, false);
    toast(error.message || 'Не удалось создать заявку.', { type: 'error', duration: 6000 });
  }
}

async function loadPrivileges() {
  renderNotice();
  await loadSite();
  renderNotice();
  const auth = loadAuth();
  try {
    const data = await api.get('/api/privileges');
    state.items = data.items || [];
    state.byId = new Map(state.items.map((item) => [Number(item.id), item]));
    state.loaded = true;
    if (grid) grid.setAttribute('aria-busy', 'false');
    const counter = document.querySelector('[data-privilege-count]');
    if (counter) counter.textContent = String(state.items.length);
    renderPrivileges();
    renderComparison();
  } catch (error) {
    if (grid) {
      grid.setAttribute('aria-busy', 'false');
      grid.innerHTML = emptyState({
        iconName: 'triangle-alert',
        title: 'Магазин временно недоступен',
        text: error?.message || 'Не удалось загрузить привилегии. Попробуйте обновить страницу позже.',
      });
    }
    if (resultLine) resultLine.textContent = 'Ошибка загрузки';
    return;
  }
  await auth;
  const buyId = new URLSearchParams(window.location.search).get('buy');
  if (buyId) openPurchase(buyId);
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const buy = target.closest('[data-buy]');
  if (!buy) return;
  event.preventDefault();
  openPurchase(buy.getAttribute('data-buy'));
});

dialog?.addEventListener('close', () => {
  state.dialogPrivilegeId = null;
});

loadPrivileges().catch((error) => {
  console.error('privileges_init_failed', error);
  if (grid) {
    grid.innerHTML = emptyState({
      iconName: 'triangle-alert',
      title: 'Не удалось открыть магазин',
      text: 'Обновите страницу или попробуйте позже.',
    });
  }
});

document.addEventListener('site:updated', renderNotice);
