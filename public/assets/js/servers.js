import { api } from './api.js';
import { refreshReveals } from './app.js';
import { emptyState, serverCard } from './cards.js';
import { debounce, escapeHtml } from './utils.js';

const state = {
  items: [],
  filtered: [],
  query: '',
  status: 'all',
  game: '',
  loaded: false,
};

const grid = document.querySelector('#servers-grid');
const result = document.querySelector('#servers-result');
const search = document.querySelector('#server-search');
const gameSelect = document.querySelector('#server-game');
const filters = document.querySelector('#status-filters');

function setStats({ total = 0, online = 0, players = 0 }) {
  for (const node of document.querySelectorAll('[data-server-stat="total"]')) {
    node.textContent = String(total);
  }
  for (const node of document.querySelectorAll('[data-server-stat="online"]')) {
    node.textContent = String(online);
  }
  for (const node of document.querySelectorAll('[data-server-stat="players"]')) {
    node.textContent = String(players);
  }
}

function syncUrl() {
  const url = new URL(window.location.href);
  if (state.query) url.searchParams.set('q', state.query);
  else url.searchParams.delete('q');
  if (state.status !== 'all') url.searchParams.set('status', state.status);
  else url.searchParams.delete('status');
  if (state.game) url.searchParams.set('game', state.game);
  else url.searchParams.delete('game');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function applyFilters() {
  const query = state.query.trim().toLowerCase();
  state.filtered = state.items.filter((server) => {
    if (state.status !== 'all' && server.status !== state.status) return false;
    if (state.game && server.game !== state.game) return false;
    if (!query) return true;
    const haystack = [server.name, server.game, server.description, ...(server.tags || [])]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

function updateResultLine() {
  if (!result) return;
  if (!state.loaded) {
    result.textContent = 'Загружаем каталог…';
    return;
  }
  if (!state.items.length) {
    result.textContent = 'В каталоге пока нет опубликованных серверов.';
    return;
  }
  const count = state.filtered.length;
  const suffix =
    state.query || state.status !== 'all' || state.game
      ? ` из ${state.items.length}`
      : '';
  result.innerHTML = `Найдено <strong>${count}</strong>${suffix}`;
}

function renderGrid() {
  if (!grid) return;
  if (!state.loaded) return;
  if (!state.items.length) {
    grid.innerHTML = emptyState({
      iconName: 'server',
      title: 'Серверы ещё не добавлены',
      text: 'Администратор пока не опубликовал ни одного сервера. Как только это произойдёт, карточки появятся здесь.',
      action: '<a class="btn btn-glass btn-sm" href="/">Вернуться на главную</a>',
    });
    result.textContent = 'Каталог пуст';
    return;
  }
  if (!state.filtered.length) {
    grid.innerHTML = emptyState({
      iconName: 'search',
      title: 'Ничего не найдено',
      text: 'Попробуйте изменить поисковый запрос или сбросить фильтры.',
      action: '<button class="btn btn-soft btn-sm" type="button" data-reset-filters>Сбросить фильтры</button>',
    });
    return;
  }
  grid.innerHTML = state.filtered
    .map((server, index) => `<div class="reveal" style="--delay:${index * 45}ms">${serverCard(server, index)}</div>`)
    .join('');
  refreshReveals(grid);
}

function render() {
  applyFilters();
  updateResultLine();
  renderGrid();
}

function setActiveStatus(value) {
  state.status = value;
  for (const button of filters?.querySelectorAll('[data-status-filter]') || []) {
    button.classList.toggle('is-active', button.getAttribute('data-status-filter') === value);
  }
}

function populateGames() {
  if (!gameSelect) return;
  const games = [...new Set(state.items.map((item) => item.game).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  );
  gameSelect.innerHTML =
    '<option value="">Все игры</option>' +
    games.map((game) => `<option value="${escapeHtml(game)}">${escapeHtml(game)}</option>`).join('');
  if (state.game && games.includes(state.game)) gameSelect.value = state.game;
  else if (state.game) {
    state.game = '';
    gameSelect.value = '';
  }
}

async function loadServers() {
  try {
    const data = await api.get('/api/servers');
    state.items = data.items || [];
    state.loaded = true;
    setStats({
      total: state.items.length,
      online: state.items.filter((item) => item.status === 'online').length,
      players: state.items
        .filter((item) => item.status === 'online')
        .reduce((sum, item) => sum + Number(item.playersOnline || 0), 0),
    });
    populateGames();
    if (grid) grid.setAttribute('aria-busy', 'false');
    render();
  } catch (error) {
    state.loaded = true;
    if (grid) {
      grid.setAttribute('aria-busy', 'false');
      grid.innerHTML = emptyState({
        iconName: 'triangle-alert',
        title: 'Каталог временно недоступен',
        text: error?.message || 'Не удалось получить список серверов. Обновите страницу немного позже.',
      });
    }
    if (result) result.textContent = 'Ошибка загрузки';
    setStats({});
  }
}

function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.query = params.get('q') || '';
  state.status = ['online', 'offline', 'maintenance'].includes(params.get('status'))
    ? params.get('status')
    : 'all';
  state.game = params.get('game') || '';
  if (search) search.value = state.query;
  setActiveStatus(state.status);
}

if (search) {
  search.addEventListener(
    'input',
    debounce(() => {
      state.query = search.value;
      syncUrl();
      render();
    }, 140),
  );
}

if (gameSelect) {
  gameSelect.addEventListener('change', () => {
    state.game = gameSelect.value;
    syncUrl();
    render();
  });
}

filters?.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-status-filter]') : null;
  if (!target) return;
  setActiveStatus(target.getAttribute('data-status-filter') || 'all');
  syncUrl();
  render();
});

grid?.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-reset-filters]') : null;
  if (!target) return;
  state.query = '';
  state.status = 'all';
  state.game = '';
  if (search) search.value = '';
  if (gameSelect) gameSelect.value = '';
  setActiveStatus('all');
  syncUrl();
  render();
});

initFromUrl();
loadServers();
