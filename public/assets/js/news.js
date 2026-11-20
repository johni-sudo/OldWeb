import { api } from './api.js';
import { refreshReveals } from './app.js';
import { emptyState, newsCard } from './cards.js';
import { setButtonLoading, toast } from './utils.js';

const featured = document.querySelector('#news-featured');
const grid = document.querySelector('#news-grid');
const loadMore = document.querySelector('#news-load-more');
const countLabel = document.querySelector('#news-count-label');

const state = {
  offset: 0,
  total: 0,
  loaded: 0,
  loading: false,
};

function wrapper(markup, index = 0) {
  return `<div class="reveal" style="--delay:${index * 45}ms">${markup}</div>`;
}

function updateCount() {
  if (countLabel) {
    countLabel.textContent = state.total
      ? `${state.total} ${state.total === 1 ? 'публикация' : state.total < 5 ? 'публикации' : 'публикаций'}`
      : 'Нет публикаций';
  }
  const counter = document.querySelector('[data-news-count]');
  if (counter) counter.textContent = String(state.total);
  if (loadMore) {
    loadMore.hidden = state.loaded >= state.total || !state.total;
  }
}

function showEmpty() {
  if (featured) featured.innerHTML = '';
  if (grid) {
    grid.innerHTML = emptyState({
      iconName: 'newspaper',
      title: 'Публикаций пока нет',
      text: 'Первая новость появится сразу после публикации в административной панели.',
      action: '<a class="btn btn-glass btn-sm" href="/">Вернуться на главную</a>',
    });
    grid.setAttribute('aria-busy', 'false');
  }
  updateCount();
}

async function loadFirstPage() {
  try {
    const data = await api.get('/api/news?limit=7&offset=0');
    const items = data.items || [];
    state.total = Number(data.meta?.total || 0);
    state.loaded = items.length;
    state.offset = items.length;

    if (!items.length) {
      showEmpty();
      return;
    }

    if (featured) {
      featured.innerHTML = wrapper(newsCard(items[0], { variant: 'horizontal' }));
    }
    const rest = items.slice(1);
    if (grid) {
      grid.innerHTML = rest.length
        ? rest.map((item, index) => wrapper(newsCard(item), index)).join('')
        : emptyState({
            iconName: 'newspaper',
            title: 'Пока одна публикация',
            text: 'Следующие материалы появятся здесь после публикации.',
          });
      grid.setAttribute('aria-busy', 'false');
    }
    updateCount();
    refreshReveals(document);
  } catch (error) {
    if (featured) featured.innerHTML = '';
    if (grid) {
      grid.innerHTML = emptyState({
        iconName: 'triangle-alert',
        title: 'Новости временно недоступны',
        text: error?.message || 'Не удалось загрузить публикации. Попробуйте обновить страницу.',
      });
      grid.setAttribute('aria-busy', 'false');
    }
    if (countLabel) countLabel.textContent = 'Ошибка загрузки';
  }
}

async function loadMoreItems() {
  if (state.loading || state.loaded >= state.total) return;
  state.loading = true;
  if (loadMore) setButtonLoading(loadMore, true, 'Загружаем…');
  try {
    const data = await api.get(
      `/api/news?limit=6&offset=${encodeURIComponent(state.offset)}`,
    );
    const items = data.items || [];
    state.loaded += items.length;
    state.offset += items.length;
    if (grid) {
      const html = items
        .map((item, index) => wrapper(newsCard(item), index))
        .join('');
      grid.insertAdjacentHTML('beforeend', html);
      refreshReveals(grid);
    }
    updateCount();
    if (!items.length && loadMore) loadMore.hidden = true;
  } catch (error) {
    toast(error?.message || 'Не удалось загрузить ещё материалы.', { type: 'error' });
  } finally {
    state.loading = false;
    if (loadMore) setButtonLoading(loadMore, false);
  }
}

loadMore?.addEventListener('click', loadMoreItems);

loadFirstPage();
