import { getPrivileges } from '../src/worker/routes/public.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatPrice(cents, currency) {
  const code = /^[A-Z]{3}$/.test(currency || '') ? currency : 'RUB';

  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(Number(cents || 0) / 100);
  } catch {
    return `${(Number(cents || 0) / 100).toFixed(2)} ${code}`;
  }
}

function formatDuration(days) {
  if (days === null || days === undefined) {
    return 'Без ограничения по сроку';
  }

  const value = Number(days);

  if (!Number.isFinite(value) || value <= 0) {
    return 'Срок уточняется';
  }

  if (value === 1) return '1 день';
  if (value >= 2 && value <= 4) return `${value} дня`;

  return `${value} дней`;
}

function renderFallback(items) {
  if (!items.length) {
    return '<p>Сейчас нет опубликованных привилегий.</p>';
  }

  const cards = items.map((item) => {
    const features = Array.isArray(item.features) && item.features.length
      ? `<ul>${item.features.map(feature =>
          `<li>${escapeHtml(feature)}</li>`
        ).join('')}</ul>`
      : '<p>Состав возможностей уточняется.</p>';

    return `
      <li>
        <article>
          <h3>${escapeHtml(item.name)}</h3>
          ${item.description
            ? `<p>${escapeHtml(item.description)}</p>`
            : ''}
          <p><strong>Стоимость:</strong>
            ${escapeHtml(formatPrice(item.priceCents, item.currency))}
          </p>
          <p><strong>Срок:</strong>
            ${escapeHtml(formatDuration(item.durationDays))}
          </p>
          <h4>Возможности</h4>
          ${features}
        </article>
      </li>
    `;
  }).join('');

  return `
    <h2>Опубликованные привилегии OldWeb</h2>
    <p>Актуальные уровни поддержки, их стоимость, срок действия и возможности.</p>
    <ul>${cards}</ul>
  `;
}

function renderStructuredData(items, origin) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Привилегии OldWeb',
    url: `${origin}/privileges`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: item.name,
        description: [
          item.description,
          ...(Array.isArray(item.features) ? item.features : [])
        ].filter(Boolean).join('. '),

        ...(item.isDemo ? {} : {
          offers: {
            '@type': 'Offer',
            price: (Number(item.priceCents || 0) / 100).toFixed(2),
            priceCurrency: /^[A-Z]{3}$/.test(item.currency || '')
              ? item.currency
              : 'RUB',
            availability: 'https://schema.org/InStock',
            url: `${origin}/privileges`,
          },
        }),
      },
    })),
  };

  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // Получаем обычную HTML-страницу.
  const asset = await context.next();

  if (!asset.ok) return asset;

  try {
    // Берём те же привилегии, что использует сайт.
    const apiResponse = await getPrivileges(
      new Request(new URL('/api/privileges', request.url)),
      env
    );

    if (!apiResponse.ok) return asset;

    const { items = [] } = await apiResponse.json();

    const html = await asset.clone().text();

    const fallback = `
      <div id="seo-privileges-fallback">
        ${renderFallback(items)}
      </div>
    `;

    const withContent = html.replace(
      '<div class="privileges-grid" id="privileges-grid" aria-busy="true">',
      `${fallback}
      <div class="privileges-grid" id="privileges-grid" aria-busy="true">`
    );

    const structuredData = `
      <script type="application/ld+json">
        ${renderStructuredData(items, new URL(request.url).origin)}
      </script>
    `;

    const finalHtml = withContent.replace(
      '</head>',
      `${structuredData}\n</head>`
    );

    const headers = new Headers(asset.headers);

    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=30, must-revalidate'
    );

    return new Response(finalHtml, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
    });

  } catch (error) {
    console.error('privileges_ssr_failed', error);
    return asset;
  }
}
