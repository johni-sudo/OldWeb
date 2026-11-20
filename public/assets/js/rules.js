import { api } from './api.js';
import {
  debounce,
  escapeHtml,
  formatDate,
  icon,
  renderMarkdown,
} from './utils.js';

const content = document.querySelector('#rules-content');
const nav = document.querySelector('#rules-nav');
const search = document.querySelector('#rules-search');
const mobileSelect = document.querySelector('#rules-mobile-select');
const noResults = document.querySelector('#rules-no-results');
const printButton = document.querySelector('#rules-print');

const state = {
  categories: [],
  query: '',
};

function categoryId(index) {
  return `rules-category-${index + 1}`;
}

function updateUpdatedAt(updatedAt) {
  const formatted = formatDate(updatedAt);
  const inline = document.querySelector('#rules-updated-inline span');
  if (inline) inline.textContent = `Обновлено ${formatted}`;
  const side = document.querySelector('#rules-updated');
  if (side) {
    side.innerHTML = `${icon('clock-3')} Обновлено ${escapeHtml(formatted)}`;
  }
}

function renderNavigation() {
  if (!nav) return;
  nav.innerHTML = state.categories
    .map(
      (category, index) => `
      <a href="#${categoryId(index)}" data-category-link="${categoryId(index)}">
        ${escapeHtml(category.name)}
        <span>${category.rules.length}</span>
      </a>`,
    )
    .join('');

  if (mobileSelect) {
    mobileSelect.innerHTML =
      '<option value="">Все категории</option>' +
      state.categories
        .map(
          (category, index) =>
            `<option value="${categoryId(index)}">${escapeHtml(category.name)} (${category.rules.length})</option>`,
        )
        .join('');
  }
}

function renderRules() {
  if (!content) return;
  content.innerHTML = state.categories
    .map((category, categoryIndex) => {
      const rules = category.rules
        .map((rule, index) => {
          const searchText = `${rule.title} ${rule.content}`.replace(/\s+/g, ' ').toLowerCase();
          return `
            <details class="rule-item" id="${escapeHtml(rule.slug)}" data-rule
              data-search="${escapeHtml(searchText)}" ${categoryIndex === 0 && index === 0 ? 'open' : ''}>
              <summary>
                <span class="rule-number">${String(index + 1).padStart(2, '0')}</span>
                <strong>${escapeHtml(rule.title)}</strong>
              </summary>
              <div class="rule-body">
                <div class="prose">${renderMarkdown(rule.content)}</div>
              </div>
            </details>`;
        })
        .join('');
      return `
        <section class="rule-category" id="${categoryId(categoryIndex)}" data-category>
          <div class="rule-category-head">
            <h2>${escapeHtml(category.name)}</h2>
            <span>${category.rules.length} ${category.rules.length === 1 ? 'пункт' : 'пункта'}</span>
          </div>
          <div class="rule-list">${rules}</div>
        </section>`;
    })
    .join('');
  content.setAttribute('aria-busy', 'false');
  refreshCounts();
}

function refreshCounts() {
  const items = [...document.querySelectorAll('[data-rule]')];
  const visible = items.filter((item) => !item.classList.contains('rule-hidden'));
  if (noResults) noResults.hidden = !state.query || visible.length > 0;
  for (const section of document.querySelectorAll('[data-category]')) {
    const categoryRules = [...section.querySelectorAll('[data-rule]')];
    section.classList.toggle(
      'rule-hidden',
      state.query.length > 0 && categoryRules.every((item) => item.classList.contains('rule-hidden')),
    );
  }
}

function applySearch(query) {
  state.query = query.trim().toLowerCase();
  const items = [...document.querySelectorAll('[data-rule]')];
  for (const item of items) {
    const matches = !state.query || (item.dataset.search || '').includes(state.query);
    item.classList.toggle('rule-hidden', !matches);
    if (state.query && matches) item.setAttribute('open', '');
  }
  refreshCounts();
}

function setupActiveNavigation() {
  if (!('IntersectionObserver' in window)) return;
  const links = new Map(
    [...document.querySelectorAll('[data-category-link]')].map((link) => [
      link.getAttribute('data-category-link'),
      link,
    ]),
  );
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of links.values()) link.classList.remove('is-active');
        links.get(entry.target.id)?.classList.add('is-active');
      }
    },
    { rootMargin: '-130px 0px -65% 0px', threshold: 0 },
  );
  for (const section of document.querySelectorAll('[data-category]')) {
    observer.observe(section);
  }
}

function handleHash() {
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  if (!hash) return;
  const target = document.getElementById(hash);
  if (!target) return;
  const details = target.closest('details');
  if (details) {
    details.open = true;
    setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }
}

async function loadRules() {
  try {
    const data = await api.get('/api/rules');
    state.categories = data.categories || [];
    updateUpdatedAt(data.meta?.updatedAt);
    const total = Number(data.meta?.total || 0);
    const counter = document.querySelector('[data-rules-count]');
    if (counter) counter.textContent = String(total);
    const categoryCounter = document.querySelector('[data-category-count]');
    if (categoryCounter) categoryCounter.textContent = String(state.categories.length);
    if (!state.categories.length) {
      if (content) {
        content.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">${icon('book-open')}</span>
            <h3>Правила ещё не опубликованы</h3>
            <p>Администратор пока не добавил ни одного пункта. Раздел обновится после публикации.</p>
          </div>`;
      }
      return;
    }
    renderNavigation();
    renderRules();
    setupActiveNavigation();
    handleHash();
  } catch (error) {
    if (content) {
      content.innerHTML = `
        <div class="empty-state error-state">
          <span class="empty-icon">${icon('triangle-alert')}</span>
          <h3>Правила временно недоступны</h3>
          <p>${escapeHtml(error?.message || 'Не удалось загрузить правила. Попробуйте обновить страницу.')}</p>
        </div>`;
      content.setAttribute('aria-busy', 'false');
    }
    const updated = document.querySelector('#rules-updated-inline span');
    if (updated) updated.textContent = 'Не удалось загрузить дату обновления';
  }
}

if (search) {
  search.addEventListener(
    'input',
    debounce(() => applySearch(search.value), 120),
  );
}

if (mobileSelect) {
  mobileSelect.addEventListener('change', () => {
    const id = mobileSelect.value;
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

printButton?.addEventListener('click', () => {
  window.print();
});

let printState = [];
window.addEventListener('beforeprint', () => {
  printState = [...document.querySelectorAll('[data-rule]')].map((item) => item.open);
  for (const item of document.querySelectorAll('[data-rule]')) item.open = true;
});
window.addEventListener('afterprint', () => {
  [...document.querySelectorAll('[data-rule]')].forEach((item, index) => {
    item.open = Boolean(printState[index]);
  });
});

window.addEventListener('hashchange', handleHash);

loadRules();
