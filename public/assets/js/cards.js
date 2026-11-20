import {
  escapeHtml,
  formatDate,
  formatDuration,
  formatPrice,
  icon,
  safeAsset,
  statusInfo,
} from './utils.js';

const SERVER_ART = `
<svg class="server-art-lines" viewBox="0 0 400 146" preserveAspectRatio="none" aria-hidden="true">
  <path d="M-20 112C58 76 124 108 196 124C268 140 330 126 420 82" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/>
  <path d="M-20 128C62 94 132 126 204 142C276 158 338 144 420 104" fill="none" stroke="rgba(27,59,90,.12)" stroke-width="1"/>
  <path d="M270 22h120M300 34h90M324 46h66" stroke="rgba(255,255,255,.5)" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;

export function serverCard(server, index = 0) {
  const status = statusInfo(server.status);
  const hasAddress = Boolean(server.address);
  const max = Number(server.maxPlayers || 0);
  const players = Number(server.playersOnline || 0);
  const percent = max > 0 ? Math.min(100, Math.round((players / max) * 100)) : 0;
  const gameLetter = escapeHtml(String(server.game || server.name || 'P').trim().slice(0, 1).toUpperCase());
  const tags = (server.tags || []).slice(0, 3);

  return `
  <article class="server-card card-hover tone-${index % 4}" data-server-id="${escapeHtml(server.id)}">
    <div class="server-card-art">
      <span class="server-art-letter" aria-hidden="true">${gameLetter}</span>
      ${SERVER_ART}
      <div class="server-art-top">
        <div class="server-art-badges">
          <span class="badge ${status.className}"><span class="status-dot ${status.dot}"></span>${escapeHtml(status.label)}</span>
          ${server.isDemo ? '<span class="badge badge-demo">Демо</span>' : ''}
        </div>
        <span class="server-game-icon">${icon('gamepad-2')}${escapeHtml(server.game || 'Игра')}</span>
      </div>
    </div>
    <div class="server-card-body">
      <div class="server-title-row">
        <div>
          <span class="server-game">${escapeHtml(server.game || 'Игровой сервер')}</span>
          <h3>${escapeHtml(server.name)}</h3>
        </div>
      </div>
      <p class="server-card-description">${escapeHtml(server.description || 'Описание сервера появится после настройки.')}</p>
      <div class="server-address">
        ${icon('globe-2')}
        <code>${escapeHtml(hasAddress ? server.address : 'Адрес пока не указан')}</code>
        ${
          hasAddress
            ? `<button class="copy-btn" type="button" data-copy="${escapeHtml(server.address)}" aria-label="Скопировать адрес" title="Скопировать адрес">${icon('copy')}</button>`
            : ''
        }
      </div>
      ${
        tags.length
          ? `<div class="server-tags">${tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join('')}</div>`
          : ''
      }
      <div class="server-card-meta">
        <div>
          <div class="server-players">
            <strong>${players}</strong>
            <span class="slash">/</span>
            <span>${max > 0 ? max : '—'} игроков</span>
          </div>
          <div class="server-progress"><div class="progress"><span style="--value:${percent}%"></span></div></div>
        </div>
        <span class="badge ${server.isDemo ? 'badge-demo' : 'badge-offline'}">${server.isDemo ? 'демо-данные' : escapeHtml(server.region || 'онлайн')}</span>
      </div>
      <div class="server-card-footer">
        <button class="btn btn-primary btn-sm" type="button"
          data-connect="${escapeHtml(server.address || '')}"
          data-connect-url="${escapeHtml(server.connectUrl || '')}"
          data-server-name="${escapeHtml(server.name)}"
          ${hasAddress ? '' : 'disabled'}>
          ${hasAddress ? `${icon('log-in')} Подключиться` : 'Скоро'}
        </button>
        <button class="icon-btn" type="button" data-copy="${escapeHtml(server.address || '')}"
          aria-label="Скопировать IP ${escapeHtml(server.name)}" title="Скопировать IP"
          ${hasAddress ? '' : 'disabled'}>
          ${icon('copy')}
        </button>
      </div>
      ${server.status === 'offline' ? '<p class="server-offline-note">Статус и онлайн обновляются администрацией.</p>' : ''}
    </div>
  </article>`;
}

export function privilegeCard(privilege, { featured = false } = {}) {
  const duration = formatDuration(privilege.durationDays);
  const image = privilege.imageUrl ? safeAsset(privilege.imageUrl, '') : '';
  const features = (privilege.features || []).slice(0, 5);

  return `
  <article class="privilege-card card-hover${featured ? ' is-featured' : ''}" data-privilege-id="${escapeHtml(privilege.id)}">
    <div class="privilege-cover">
      ${image ? `<img src="${escapeHtml(image)}" alt="" decoding="async">` : ''}
      <div class="privilege-cover-top">
        ${privilege.badge ? `<span class="premium-badge">${icon('sparkles')}${escapeHtml(privilege.badge)}</span>` : '<span></span>'}
        <span class="privilege-duration">${icon('clock-3')}${escapeHtml(duration)}</span>
      </div>
      <div class="privilege-price-float"><strong>${escapeHtml(formatPrice(privilege.priceCents, privilege.currency))}</strong></div>
    </div>
    <div class="privilege-body">
      <h3>${escapeHtml(privilege.name)}</h3>
      <p class="privilege-description">${escapeHtml(privilege.description || 'Описание привилегии.')}</p>
      ${
        features.length
          ? `<ul class="privilege-features">${features
              .map(
                (feature) =>
                  `<li class="privilege-feature">${icon('check')}<span>${escapeHtml(feature)}</span></li>`,
              )
              .join('')}</ul>`
          : ''
      }
      <div class="privilege-footer">
        <div class="privilege-footer-price">
          <strong>${escapeHtml(formatPrice(privilege.priceCents, privilege.currency))}</strong>
          <span>${escapeHtml(duration)}</span>
        </div>
        <button class="btn btn-primary btn-sm" type="button"
          data-buy="${escapeHtml(privilege.id)}"
          data-buy-name="${escapeHtml(privilege.name)}"
          data-buy-price="${escapeHtml(privilege.priceCents)}"
          data-buy-currency="${escapeHtml(privilege.currency)}"
          data-buy-duration="${privilege.durationDays ?? ''}"
          data-buy-image="${escapeHtml(image)}">
          ${icon('shopping-bag')} Купить
        </button>
      </div>
      ${privilege.isDemo ? '<p class="privilege-demo">Демонстрационная цена и состав.</p>' : ''}
    </div>
  </article>`;
}

export function newsCard(article, { variant = 'default' } = {}) {
  const cover = article.coverUrl ? safeAsset(article.coverUrl, '') : '';
  const variantClass =
    variant === 'horizontal'
      ? ' news-card-horizontal'
      : variant === 'small'
        ? ' news-card-small'
        : '';
  const headingTag = variant === 'horizontal' ? 'h2' : 'h3';

  return `
  <article class="news-card${variantClass}">
    <a class="news-card-cover" href="/article?slug=${encodeURIComponent(article.slug)}" aria-label="${escapeHtml(article.title)}">
      ${cover ? `<img src="${escapeHtml(cover)}" alt="" decoding="async">` : ''}
    </a>
    <div class="news-card-content">
      <div class="news-meta">
        <time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(formatDate(article.publishedAt))}</time>
        <span class="dot"></span>
        <span>${article.readingMinutes || 1} мин</span>
        ${article.isDemo ? '<span class="dot"></span><span>демо</span>' : ''}
      </div>
      <${headingTag}><a href="/article?slug=${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></${headingTag}>
      <p class="news-card-excerpt">${escapeHtml(article.excerpt || '')}</p>
      <div class="news-card-foot">
        <span class="news-tag">${article.isDemo ? 'Пример публикации' : 'Новости проекта'}</span>
        <a class="link-arrow" href="/article?slug=${encodeURIComponent(article.slug)}">Читать ${icon('arrow-up-right')}</a>
      </div>
    </div>
  </article>`;
}

export function newsSkeleton() {
  return '<div class="news-card skeleton-card skeleton" aria-hidden="true"></div>';
}

export function privilegeSkeleton() {
  return '<div class="privilege-card skeleton-card skeleton" aria-hidden="true"></div>';
}

export function serverSkeleton() {
  return '<div class="server-card skeleton-card skeleton" aria-hidden="true"></div>';
}

export function emptyState({ iconName = 'sparkles', title = 'Пока пусто', text = '', action = '' }) {
  return `
  <div class="empty-state">
    <span class="empty-icon">${icon(iconName)}</span>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(text)}</p>
    ${action}
  </div>`;
}

export function statusPill(status) {
  const info = statusInfo(status);
  return `<span class="badge ${info.className}"><span class="status-dot ${info.dot}"></span>${escapeHtml(info.label)}</span>`;
}
