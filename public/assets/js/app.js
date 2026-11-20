import { api, steamLoginUrl } from './api.js';
import {
  closeDialog,
  copyText,
  escapeHtml,
  getPagePath,
  icon,
  openDialog,
  safeAsset,
  toast,
} from './utils.js';

const DEFAULT_SITE = {
  projectName: 'PROJECT',
  tagline: 'Игровое сообщество новой волны',
  demoNotice: false,
  supportUrl: '',
  supportLabel: 'Поддержка',
  storeNotice: '',
  paymentInstructions: '',
  steamLoginEnabled: false,
  stats: {
    servers: 0,
    onlineServers: 0,
    playersOnline: 0,
    members: 0,
    news: 0,
  },
};

const authState = {
  loaded: false,
  authenticated: false,
  user: null,
  isAdmin: false,
};

let siteState = { ...DEFAULT_SITE };
let sitePromise = null;
let authPromise = null;
let currentUserRenderName = '';
let initialized = false;
let revealObserver = null;
let authExpiredNotified = false;

const NAV_ITEMS = [
  { href: '/', label: 'Главная', path: '/' },
  { href: '/servers', label: 'Серверы', path: '/servers' },
  { href: '/privileges', label: 'Привилегии', path: '/privileges' },
  { href: '/news', label: 'Новости', path: '/news' },
  { href: '/rules', label: 'Правила', path: '/rules' },
];

function dispatch(name) {
  document.dispatchEvent(new CustomEvent(name));
}

export function getSiteConfig() {
  return siteState;
}

export function getAuthState() {
  return authState;
}

function applyPreferences(user) {
  document.body.classList.toggle('compact-ui', Boolean(user?.compactUi));
  document.body.classList.toggle('reduce-motion', Boolean(user?.reduceMotion));
}

function applySiteConfig() {
  const name = siteState.projectName || 'PROJECT';
  for (const node of document.querySelectorAll('[data-project-name]')) {
    node.textContent = name;
  }
  if (name !== currentUserRenderName) {
    document.title = document.title.replace(/\bPROJECT\b/g, name);
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute('content', description.getAttribute('content').replace(/\bPROJECT\b/g, name));
    }
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', ogTitle.getAttribute('content').replace(/\bPROJECT\b/g, name));
    currentUserRenderName = name;
  }
  renderDemoStrip();
}

function renderDemoStrip() {
  let strip = document.querySelector('.demo-strip');
  if (!siteState.demoNotice) {
    strip?.remove();
    return;
  }
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'demo-strip';
    strip.setAttribute('role', 'status');
    const header = document.querySelector('site-header');
    document.body.insertBefore(strip, header || document.body.firstChild);
  }
  const adminLink = authState.isAdmin
    ? ' <a href="/admin" style="color:inherit;text-decoration:underline;text-underline-offset:2px">Настроить</a>'
    : '';
  strip.innerHTML = `${icon('triangle-alert')} <span><strong>Демо-контент.</strong> Серверы, цены и публикации приведены для примера.${adminLink}</span>`;
}

export function loadSite(force = false) {
  if (!sitePromise || force) {
    sitePromise = api
      .get('/api/site')
      .then((data) => {
        siteState = {
          ...DEFAULT_SITE,
          ...(data.project || {}),
          stats: { ...DEFAULT_SITE.stats, ...(data.stats || {}) },
        };
        applySiteConfig();
        dispatch('site:updated');
        return siteState;
      })
      .catch((error) => {
        console.warn('site_config_unavailable', error?.message || error);
        siteState = { ...DEFAULT_SITE };
        applySiteConfig();
        dispatch('site:updated');
        return siteState;
      });
  }
  return sitePromise;
}

export function loadAuth(force = false) {
  if (!authPromise || force) {
    authPromise = api
      .get('/api/auth/me')
      .then((data) => {
        authState.loaded = true;
        authState.authenticated = Boolean(data?.authenticated);
        authState.user = data?.user || null;
        authState.isAdmin = Boolean(data?.isAdmin);
        authExpiredNotified = false;
        applyPreferences(authState.user);
        renderDemoStrip();
        dispatch('auth:ready');
        dispatch('auth:changed');
        return authState;
      })
      .catch((error) => {
        console.warn('auth_state_unavailable', error?.message || error);
        authState.loaded = true;
        authState.authenticated = false;
        authState.user = null;
        authState.isAdmin = false;
        applyPreferences(null);
        dispatch('auth:ready');
        dispatch('auth:changed');
        return authState;
      });
  }
  return authPromise;
}

export function setAuthState(next) {
  Object.assign(authState, next, { loaded: true });
  applyPreferences(authState.user);
  renderDemoStrip();
  dispatch('auth:changed');
}

function navMarkup(mobile = false) {
  const current = getPagePath();
  return NAV_ITEMS.map((item) => {
    const active =
      item.path === '/' ? current === '/' : current === item.path || current.startsWith(`${item.path}/`);
    return `<a class="nav-link${active ? ' is-active' : ''}" href="${item.href}"${
      active ? ' aria-current="page"' : ''
    }>${escapeHtml(item.label)}</a>`;
  }).join('');
}

function steamLoginHref() {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  return steamLoginUrl(returnTo);
}

function authActionsMarkup({ compact = false } = {}) {
  if (!authState.loaded) {
    return `<span class="auth-skeleton skeleton" aria-hidden="true"></span>`;
  }

  if (!authState.authenticated) {
    const disabled = !siteState.steamLoginEnabled;
    return `<a class="btn btn-steam${compact ? ' btn-block' : ''}" href="${steamLoginHref()}" data-steam-login${
      disabled ? ' data-steam-disabled="true" title="Вход временно недоступен: не настроен Steam API"' : ''
    }>${icon('steam-brand')} Войти через Steam</a>`;
  }

  const user = authState.user || {};
  const avatar = safeAsset(user.avatarUrl);
  const role = authState.isAdmin ? 'Администратор' : 'Игрок';

  if (compact) {
    return `
      <div class="mobile-nav-user">
        <img class="avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" data-fallback="/assets/images/avatar-fallback.jpg">
        <div class="mobile-nav-user-text">
          <strong>${escapeHtml(user.personaName || 'Игрок')}</strong>
          <span>${escapeHtml(role)}</span>
        </div>
        <a class="btn btn-soft btn-sm" href="/account">Кабинет</a>
      </div>
      ${authState.isAdmin ? `<a class="btn btn-ghost btn-block" href="/admin">${icon('layout-dashboard')} Админ-панель</a>` : ''}
      <button class="btn btn-ghost btn-block" type="button" data-logout>${icon('log-out')} Выйти</button>`;
  }

  return `
    <div class="user-menu">
      <button class="user-trigger" type="button" data-user-trigger aria-expanded="false" aria-haspopup="true" aria-label="Меню профиля">
        <img class="avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" data-fallback="/assets/images/avatar-fallback.jpg">
        <span class="user-trigger-text">
          <span class="user-trigger-name">${escapeHtml(user.personaName || 'Игрок')}</span>
          <span class="user-trigger-role">${escapeHtml(role)}</span>
        </span>
        ${icon('chevron-down', 'chevron')}
      </button>
      <div class="user-dropdown" data-user-dropdown hidden>
        <div class="dropdown-head">
          <img class="avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" data-fallback="/assets/images/avatar-fallback.jpg">
          <div class="dropdown-head-text">
            <strong>${escapeHtml(user.personaName || 'Игрок')}</strong>
            <span>SteamID64 · ${escapeHtml(user.steamId || '')}</span>
          </div>
        </div>
        <a class="dropdown-link" href="/account">${icon('user')} Личный кабинет</a>
        ${authState.isAdmin ? `<a class="dropdown-link" href="/admin">${icon('layout-dashboard')} Админ-панель</a>` : ''}
        <a class="dropdown-link" href="${escapeHtml(user.profileUrl || '#')}" target="_blank" rel="noopener noreferrer">${icon('external-link')} Профиль Steam</a>
        <div class="dropdown-sep"></div>
        <button class="dropdown-link dropdown-link-danger" type="button" data-logout>${icon('log-out')} Выйти</button>
      </div>
    </div>`;
}

function headerMarkup() {
  return `
  <div class="site-header" data-header>
    <div class="header-inner">
      <a class="brand" href="/" aria-label="${escapeHtml(siteState.projectName)} — на главную">
        <span class="brand-mark"><img src="/assets/images/logo-mark.png" alt="" width="43" height="43"></span>
        <span class="brand-text">
          <span class="brand-name" data-project-name>${escapeHtml(siteState.projectName)}</span>
          <span class="brand-sub">Game community</span>
        </span>
      </a>
      <nav class="main-nav" aria-label="Основная навигация">${navMarkup()}</nav>
      <div class="header-actions">
        <div class="auth-slot auth-desktop">${authActionsMarkup()}</div>
        <button class="icon-btn mobile-toggle" type="button" data-menu-toggle aria-expanded="false" aria-controls="mobile-nav" aria-label="Открыть меню">${icon('menu')}</button>
      </div>
    </div>
  </div>
  <div class="mobile-nav" id="mobile-nav" data-mobile-nav>
    <nav class="mobile-nav-links" aria-label="Мобильная навигация">${navMarkup(true)}</nav>
    <div class="mobile-nav-actions">
      ${authActionsMarkup({ compact: true })}
      <p class="account-side-note" style="margin-top:8px">Безопасный вход через Steam OpenID. Пароль Steam не передаётся проекту.</p>
    </div>
  </div>`;
}

function footerMarkup() {
  const year = new Date().getFullYear();
  const support = siteState.supportUrl
    ? `<a href="${escapeHtml(siteState.supportUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(siteState.supportLabel || 'Поддержка')}</a>`
    : '';
  return `
  <footer class="site-footer">
    <svg class="footer-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-30 62C220 8 386 58 595 71C823 85 1016 44 1470 3V0H-30Z" fill="rgba(255,255,255,.08)"/>
      <path d="M-30 76C242 30 492 74 722 82C964 91 1192 48 1470 22V0H-30Z" fill="rgba(174,232,225,.08)"/>
    </svg>
    <div class="container">
      <div class="footer-main">
        <div class="footer-brand">
          <a class="brand" href="/">
            <span class="brand-mark"><img src="/assets/images/logo-mark.png" alt="" width="43" height="43"></span>
            <span class="brand-text">
              <span class="brand-name" data-project-name>${escapeHtml(siteState.projectName)}</span>
              <span class="brand-sub">Game community</span>
            </span>
          </a>
          <p class="footer-description">${escapeHtml(siteState.tagline || DEFAULT_SITE.tagline)}. Серверы, привилегии и сообщество в одном пространстве.</p>
          <span class="footer-steam">${icon('steam-brand')} Вход через официальный Steam OpenID</span>
        </div>
        <div class="footer-col">
          <h3>Навигация</h3>
          <div class="footer-links">
            <a href="/">Главная</a>
            <a href="/servers">Серверы</a>
            <a href="/privileges">Привилегии</a>
            <a href="/news">Новости</a>
            <a href="/rules">Правила</a>
          </div>
        </div>
        <div class="footer-col">
          <h3>Аккаунт</h3>
          <div class="footer-links">
            <a href="/account">Личный кабинет</a>
            ${
              authState.authenticated
                ? '<a href="/account#purchases">История покупок</a>'
                : `<a href="${steamLoginHref()}" data-steam-login>Войти через Steam</a>`
            }
            ${authState.isAdmin ? '<a href="/admin">Админ-панель</a>' : ''}
            ${support}
          </div>
        </div>
        <div class="footer-col">
          <h3>Документы</h3>
          <div class="footer-links">
            <a href="/privacy">Конфиденциальность</a>
            <a href="/terms">Пользовательское соглашение</a>
            <a href="/rules#punish-2">Апелляции</a>
          </div>
          <p class="footer-legal">Steam и логотип Steam являются товарными знаками Valve Corporation. Проект не связан с Valve.</p>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${year} <span data-project-name>${escapeHtml(siteState.projectName)}</span>. Все права защищены.</span>
        <span class="footer-meta">
          <span>Cloudflare Workers · D1</span>
          <a href="/privacy">Cookies</a>
          <a href="/rules">Правила</a>
        </span>
      </div>
    </div>
  </footer>`;
}

class SiteHeader extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.render();
    this._onChange = () => {
      this.render();
      renderDemoStrip();
    };
    document.addEventListener('auth:changed', this._onChange);
    document.addEventListener('site:updated', this._onChange);
    loadAuth();
    loadSite();
  }

  disconnectedCallback() {
    document.removeEventListener('auth:changed', this._onChange);
    document.removeEventListener('site:updated', this._onChange);
  }

  render() {
    this.innerHTML = headerMarkup();
    renderDemoStrip();
    applyPreferences(authState.user);
  }
}

class SiteFooter extends HTMLElement {
  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;
    this.innerHTML = footerMarkup();
    this._onChange = () => {
      this.innerHTML = footerMarkup();
    };
    document.addEventListener('auth:changed', this._onChange);
    document.addEventListener('site:updated', this._onChange);
    loadAuth();
    loadSite();
  }

  disconnectedCallback() {
    document.removeEventListener('auth:changed', this._onChange);
    document.removeEventListener('site:updated', this._onChange);
  }
}

function refreshSiteChrome() {
  document.querySelector('site-header')?.render?.();
  const footer = document.querySelector('site-footer');
  if (footer) footer.innerHTML = footerMarkup();
}

function closeMobileMenu({ restoreFocus = false } = {}) {
  const nav = document.querySelector('[data-mobile-nav]');
  const toggle = document.querySelector('[data-menu-toggle]');
  if (!nav || !nav.classList.contains('is-open')) return;
  nav.classList.remove('is-open');
  document.body.classList.remove('menu-open');
  toggle?.setAttribute('aria-expanded', 'false');
  if (toggle) {
    toggle.innerHTML = icon('menu');
    toggle.setAttribute('aria-label', 'Открыть меню');
  }
  if (restoreFocus) toggle?.focus();
}

function openMobileMenu() {
  const nav = document.querySelector('[data-mobile-nav]');
  const toggle = document.querySelector('[data-menu-toggle]');
  if (!nav) return;
  nav.classList.add('is-open');
  document.body.classList.add('menu-open');
  toggle?.setAttribute('aria-expanded', 'true');
  if (toggle) {
    toggle.innerHTML = icon('x');
    toggle.setAttribute('aria-label', 'Закрыть меню');
  }
  nav.querySelector('a, button')?.focus();
}

function closeUserMenu() {
  const trigger = document.querySelector('[data-user-trigger]');
  const dropdown = document.querySelector('[data-user-dropdown]');
  if (!trigger || !dropdown) return;
  trigger.setAttribute('aria-expanded', 'false');
  dropdown.hidden = true;
}

function toggleUserMenu() {
  const trigger = document.querySelector('[data-user-trigger]');
  const dropdown = document.querySelector('[data-user-dropdown]');
  if (!trigger || !dropdown) return;
  const willOpen = dropdown.hidden;
  dropdown.hidden = !willOpen;
  trigger.setAttribute('aria-expanded', String(willOpen));
}

async function performLogout() {
  const buttons = [...document.querySelectorAll('[data-logout]')];
  for (const button of buttons) button.disabled = true;
  try {
    await api.post('/api/auth/logout');
    authState.loaded = true;
    authState.authenticated = false;
    authState.user = null;
    authState.isAdmin = false;
    applyPreferences(null);
    toast('Вы вышли из аккаунта.', { type: 'success' });
    setTimeout(() => window.location.assign('/'), 350);
  } catch (error) {
    for (const button of buttons) button.disabled = false;
    toast(error?.message || 'Не удалось выйти из аккаунта.', { type: 'error' });
  }
}

function setupGlobalClicks() {
  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const copyTarget = target.closest('[data-copy]');
    if (copyTarget) {
      event.preventDefault();
      const value = copyTarget.getAttribute('data-copy') || '';
      if (!value) {
        toast('Адрес пока не настроен.', { type: 'error' });
        return;
      }
      const ok = await copyText(value);
      toast(ok ? 'Адрес скопирован в буфер обмена.' : 'Не удалось скопировать адрес.', {
        type: ok ? 'success' : 'error',
      });
      return;
    }

    const connect = target.closest('[data-connect]');
    if (connect) {
      event.preventDefault();
      const address = connect.getAttribute('data-connect') || '';
      const connectUrl = connect.getAttribute('data-connect-url') || '';
      const name = connect.getAttribute('data-server-name') || 'сервера';
      if (!address) {
        toast('Для этого сервера ещё не указан адрес подключения.', { type: 'error' });
        return;
      }
      const copied = await copyText(address);
      if (connectUrl) {
        toast(`Адрес ${name} скопирован. Запускаем подключение…`, { type: 'success' });
        window.location.href = connectUrl;
      } else {
        toast(
          copied
            ? `Адрес ${name} скопирован. Откройте игру и подключитесь по этому адресу.`
            : `Адрес ${name}: ${address}`,
          { type: copied ? 'success' : 'info', duration: 6500 },
        );
      }
      return;
    }

    const steam = target.closest('[data-steam-login]');
    if (steam) {
      if (!siteState.steamLoginEnabled) {
        event.preventDefault();
        toast('Вход через Steam пока не настроен администратором. Добавьте STEAM_API_KEY на сервере.', {
          type: 'error',
          duration: 7000,
        });
      }
      return;
    }

    const logout = target.closest('[data-logout]');
    if (logout) {
      event.preventDefault();
      closeUserMenu();
      await performLogout();
      return;
    }

    const userTrigger = target.closest('[data-user-trigger]');
    if (userTrigger) {
      event.stopPropagation();
      toggleUserMenu();
      return;
    }

    const menuToggle = target.closest('[data-menu-toggle]');
    if (menuToggle) {
      const nav = document.querySelector('[data-mobile-nav]');
      if (nav?.classList.contains('is-open')) closeMobileMenu({ restoreFocus: true });
      else openMobileMenu();
      return;
    }

    if (target.closest('[data-mobile-nav] a')) {
      closeMobileMenu();
    }

    if (!target.closest('[data-user-dropdown]') && !target.closest('[data-user-trigger]')) {
      closeUserMenu();
    }

    const closeButton = target.closest('[data-dialog-close]');
    if (closeButton) {
      const dialog = closeButton.closest('dialog');
      if (dialog) closeDialog(dialog);
      return;
    }

    if (target instanceof HTMLDialogElement && target.open) {
      closeDialog(target);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeUserMenu();
    closeMobileMenu({ restoreFocus: true });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 880) closeMobileMenu();
  });

  window.addEventListener(
    'scroll',
    () => {
      document.querySelector('.site-header')?.classList.toggle('is-scrolled', window.scrollY > 18);
    },
    { passive: true },
  );
}

function setupImages() {
  document.addEventListener(
    'error',
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      const fallback = image.dataset.fallback;
      if (!fallback || image.src.endsWith(fallback)) return;
      image.src = fallback;
      image.removeAttribute('data-fallback');
    },
    true,
  );
}

function setupAuthEvents() {
  document.addEventListener('auth:expired', () => {
    if (!authState.authenticated) return;
    authState.authenticated = false;
    authState.user = null;
    authState.isAdmin = false;
    authState.loaded = true;
    applyPreferences(null);
    dispatch('auth:changed');
    if (!authExpiredNotified) {
      authExpiredNotified = true;
      toast('Сессия истекла. Войдите через Steam снова.', { type: 'error' });
    }
  });
}

export function refreshReveals(root = document) {
  if (!revealObserver) return;
  const nodes = root.querySelectorAll?.('.reveal:not([data-reveal-bound])') || [];
  for (const node of nodes) {
    node.dataset.revealBound = 'true';
    revealObserver.observe(node);
  }
}

function setupReveal() {
  if (typeof IntersectionObserver !== 'function' || document.body.classList.contains('reduce-motion')) {
    for (const node of document.querySelectorAll('.reveal')) node.classList.add('is-visible');
    return;
  }
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
  );
  refreshReveals();
  document.documentElement.classList.add('motion-ready');
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.reveal')) {
          node.dataset.revealBound = 'true';
          revealObserver.observe(node);
        }
        refreshReveals(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function setupDialogs() {
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  }
}

function init() {
  if (initialized) return;
  initialized = true;

  if (!customElements.get('site-header')) customElements.define('site-header', SiteHeader);
  if (!customElements.get('site-footer')) customElements.define('site-footer', SiteFooter);

  setupGlobalClicks();
  setupImages();
  setupAuthEvents();
  setupDialogs();
  setupReveal();
  loadSite();
  loadAuth();
  document.body.classList.add('page-ready');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupDialogs();
      refreshReveals();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

export { steamLoginHref, refreshSiteChrome };
