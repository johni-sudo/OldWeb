import { api } from './api.js';
import { getSiteConfig, loadSite } from './app.js';
import {
  escapeHtml,
  formatDate,
  icon,
  renderMarkdown,
  safeAsset,
} from './utils.js';

const header = document.querySelector('#article-header');
const content = document.querySelector('#article-content');
const cover = document.querySelector('#article-cover');
const aside = document.querySelector('#article-aside');
const related = document.querySelector('#related-list');
const breadcrumb = document.querySelector('#article-breadcrumb');

function showError(title, text) {
  if (breadcrumb) breadcrumb.textContent = 'Ошибка';
  if (header) {
    header.innerHTML = `
      <span class="eyebrow">Журнал проекта</span>
      <h1>${escapeHtml(title)}</h1>
      <p class="page-hero-lead" style="margin-inline:auto">${escapeHtml(text)}</p>
      <div class="error-actions" style="margin-top:26px">
        <a class="btn btn-primary" href="/news">Все новости</a>
        <a class="btn btn-glass" href="/">На главную</a>
      </div>`;
  }
  if (content) {
    content.innerHTML = '';
    content.setAttribute('aria-busy', 'false');
  }
  if (cover) cover.hidden = true;
}

function updateMeta(article) {
  const siteName = getSiteConfig().projectName || 'PROJECT';
  document.title = `${article.title} — ${siteName}`;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', article.excerpt || article.title);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', `${article.title} — ${siteName}`);
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription) ogDescription.setAttribute('content', article.excerpt || article.title);
  if (article.coverUrl) {
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) ogImage.setAttribute('content', article.coverUrl);
  }
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = `${window.location.origin}/article?slug=${encodeURIComponent(article.slug)}`;
}

function renderHeader(article) {
  if (breadcrumb) breadcrumb.textContent = article.title;
  if (!header) return;
  const copyUrl = `${window.location.origin}/article?slug=${encodeURIComponent(article.slug)}`;
  header.innerHTML = `
    <span class="eyebrow eyebrow-dot">Журнал проекта${article.isDemo ? ' · демо' : ''}</span>
    <h1>${escapeHtml(article.title)}</h1>
    <div class="article-meta">
      <span><svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#i-calendar-days"></use></svg><time datetime="${escapeHtml(
        article.publishedAt,
      )}">${escapeHtml(formatDate(article.publishedAt))}</time></span>
      <span><svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#i-clock-3"></use></svg>${
        article.readingMinutes || 1
      } мин чтения</span>
      <button class="btn-link" type="button" data-copy="${escapeHtml(copyUrl)}" style="font-size:10.5px">
        <svg class="icon" aria-hidden="true" style="width:13px;height:13px"><use href="/assets/icons.svg#i-copy"></use></svg>
        Скопировать ссылку
      </button>
    </div>
    ${article.excerpt ? `<p class="page-hero-lead" style="margin-inline:auto;text-align:center">${escapeHtml(article.excerpt)}</p>` : ''}`;
}

function renderCover(article) {
  if (!cover) return;
  if (!article.coverUrl) {
    cover.hidden = true;
    return;
  }
  cover.hidden = false;
  cover.innerHTML = `<img src="${escapeHtml(safeAsset(article.coverUrl, ''))}" alt="" width="1060" height="596">`;
}

function renderRelated(items) {
  if (!aside || !related) return;
  if (!items?.length) {
    aside.hidden = true;
    return;
  }
  aside.hidden = false;
  related.innerHTML = items
    .map(
      (item) => `
      <a class="related-item" href="/article?slug=${encodeURIComponent(item.slug)}">
        <img src="${escapeHtml(safeAsset(item.coverUrl, '/assets/images/news/welcome.svg'))}" alt="" loading="lazy">
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(formatDate(item.publishedAt))}</span>
        </span>
      </a>`,
    )
    .join('');
}

async function loadArticle() {
  const slug = new URLSearchParams(window.location.search).get('slug') || '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    showError('Публикация не найдена', 'В ссылке отсутствует корректный адрес материала.');
    return;
  }

  try {
    const data = await api.get(`/api/news/${encodeURIComponent(slug)}`);
    const article = data.item;
    loadSite().then(() => updateMeta(article));
    renderHeader(article);
    renderCover(article);
    updateMeta(article);
    if (content) {
      content.innerHTML = renderMarkdown(article.content);
      content.setAttribute('aria-busy', 'false');
    }
    renderRelated(data.related || []);
  } catch (error) {
    if (error.status === 404) {
      showError('Публикация не найдена', 'Возможно, материал был снят с публикации или ссылка устарела.');
    } else {
      showError(
        'Не удалось загрузить публикацию',
        error?.message || 'Сервер не ответил. Обновите страницу или попробуйте позже.',
      );
    }
    document.title = 'Публикация недоступна — PROJECT';
  }
}

loadArticle();
