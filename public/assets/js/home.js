import { api, steamLoginUrl } from './api.js';
import { getAuthState, getSiteConfig, loadAuth, loadSite, refreshReveals } from './app.js';
import { emptyState, newsCard, privilegeCard, serverCard } from './cards.js';

function setStat(name, value) {
  for (const node of document.querySelectorAll(`[data-stat="${name}"]`)) {
    node.textContent = new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
  }
}

function wrapReveal(markup, index) {
  return `<div class="reveal" style="--delay:${index * 60}ms">${markup}</div>`;
}

function renderServers(items) {
  const root = document.querySelector('#home-servers');
  if (!root) return;
  if (!items.length) {
    root.innerHTML = emptyState({
      iconName: 'server',
      title: 'Серверы ещё не опубликованы',
      text: 'Как только администратор добавит первый сервер, он появится здесь и в полном каталоге.',
      action: '<a class="btn btn-soft btn-sm" href="/servers">Открыть каталог</a>',
    });
    return;
  }
  root.innerHTML = items.slice(0, 3).map((item, index) => wrapReveal(serverCard(item, index), index)).join('');
  refreshReveals(root);
}

function renderPrivileges(items) {
  const root = document.querySelector('#home-privileges');
  if (!root) return;
  if (!items.length) {
    root.innerHTML = emptyState({
      iconName: 'sparkles',
      title: 'Привилегии скоро появятся',
      text: 'Администратор ещё не опубликовал уровни поддержки. Загляните позже.',
    });
    return;
  }
  root.innerHTML = items
    .slice(0, 3)
    .map((item, index) => wrapReveal(privilegeCard(item, { featured: index === 1 }), index))
    .join('');
  refreshReveals(root);
}

function renderNews(items) {
  const root = document.querySelector('#home-news');
  if (!root) return;
  if (!items.length) {
    root.innerHTML = emptyState({
      iconName: 'newspaper',
      title: 'Публикаций пока нет',
      text: 'Первая новость появится здесь сразу после публикации в панели администратора.',
    });
    return;
  }
  const [first, ...rest] = items;
  const side = rest
    .slice(0, 2)
    .map((item, index) => wrapReveal(newsCard(item, { variant: 'small' }), index))
    .join('');
  root.innerHTML = `${wrapReveal(newsCard(first, { variant: 'horizontal' }), 0)}${
    side ? `<div class="preview-news-side">${side}</div>` : ''
  }`;
  refreshReveals(root);
}

function renderError(rootSelector, retryLabel = 'Обновите страницу, чтобы попробовать снова.') {
  const root = document.querySelector(rootSelector);
  if (!root) return;
  root.innerHTML = emptyState({
    iconName: 'triangle-alert',
    title: 'Не удалось загрузить данные',
    text: `Сервер не ответил. ${retryLabel}`,
  });
}

function updateCta() {
  const button = document.querySelector('[data-join-button]');
  if (!button) return;
  if (getAuthState().authenticated) {
    button.setAttribute('href', '/account');
    button.removeAttribute('data-steam-login');
    button.innerHTML = `<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#i-user"></use></svg> Открыть кабинет`;
  } else {
    button.setAttribute('href', steamLoginUrl('/account.html'));
    button.setAttribute('data-steam-login', '');
    button.innerHTML = `<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#i-steam-brand"></use></svg> Войти через Steam`;
  }
}

function updateNetworkDot() {
  const dot = document.querySelector('[data-network-dot]');
  if (!dot) return;
  const online = Number(getSiteConfig().stats.onlineServers || 0);
  dot.className = `status-dot ${online > 0 ? 'status-dot-online' : 'status-dot-offline'}`;
}

async function loadHome() {
  const sitePromise = loadSite().then((site) => {
    setStat('servers', site.stats.servers);
    setStat('playersOnline', site.stats.playersOnline);
    setStat('members', site.stats.members);
    updateNetworkDot();
  });

  loadAuth().then(updateCta);

  const [servers, privileges, news] = await Promise.allSettled([
    api.get('/api/servers'),
    api.get('/api/privileges'),
    api.get('/api/news?limit=3'),
  ]);

  if (servers.status === 'fulfilled') renderServers(servers.value.items || []);
  else renderError('#home-servers');

  if (privileges.status === 'fulfilled') renderPrivileges(privileges.value.items || []);
  else renderError('#home-privileges');

  if (news.status === 'fulfilled') renderNews(news.value.items || []);
  else renderError('#home-news');

  await sitePromise;
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest('[data-buy]');
  if (!button) return;
  event.preventDefault();
  window.location.assign(`/privileges?buy=${encodeURIComponent(button.getAttribute('data-buy') || '')}`);
});

loadHome().catch((error) => {
  console.error('home_init_failed', error);
  renderError('#home-servers');
  renderError('#home-privileges');
  renderError('#home-news');
});

document.addEventListener('site:updated', () => {
  const site = getSiteConfig();
  setStat('servers', site.stats.servers);
  setStat('playersOnline', site.stats.playersOnline);
  setStat('members', site.stats.members);
  updateNetworkDot();
});
