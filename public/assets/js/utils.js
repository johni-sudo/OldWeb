const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export function icon(name, className = 'icon') {
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="/assets/icons.svg#i-${name}"></use></svg>`;
}

export function pluralRu(number, one, few, many) {
  const n = Math.abs(Number(number) || 0) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

export function formatPrice(cents, currency = 'RUB') {
  const value = Number(cents || 0) / 100;
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString('ru-RU')} ${currency}`;
  }
}

export function formatDuration(days) {
  if (days === null || days === undefined || Number(days) === 0) return 'Навсегда';
  const n = Number(days);
  return `${n} ${pluralRu(n, 'день', 'дня', 'дней')}`;
}

export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...options,
    }).format(date);
  } catch {
    return date.toLocaleDateString('ru-RU');
  }
}

export function formatDateTime(value) {
  return formatDate(value, { hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ['year', 31536000000],
    ['month', 2592000000],
    ['week', 604800000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ];
  try {
    const formatter = new Intl.RelativeTimeFormat('ru-RU', { numeric: 'auto' });
    for (const [unit, ms] of units) {
      if (abs >= ms) return formatter.format(Math.round(diff / ms), unit);
    }
    return 'только что';
  } catch {
    return formatDate(value);
  }
}

export function statusInfo(status) {
  const map = {
    online: { label: 'В сети', className: 'badge-online', dot: 'status-dot-online' },
    offline: { label: 'Офлайн', className: 'badge-offline', dot: 'status-dot-offline' },
    maintenance: { label: 'Тех. работы', className: 'badge-maintenance', dot: 'status-dot-maintenance' },
    pending: { label: 'Ожидает', className: 'badge-maintenance', dot: 'status-dot-maintenance' },
    paid: { label: 'Оплачено', className: 'badge-online', dot: 'status-dot-online' },
    cancelled: { label: 'Отменена', className: 'badge-offline', dot: 'status-dot-offline' },
    refunded: { label: 'Возврат', className: 'badge-offline', dot: 'status-dot-offline' },
  };
  return map[status] || { label: status || 'Неизвестно', className: 'badge-offline', dot: 'status-dot-offline' };
}

export function initials(value) {
  const parts = String(value || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'P';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function debounce(fn, delay = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function truncate(value, length = 120) {
  const text = String(value || '');
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}

export function safeAsset(value, fallback = '/assets/images/avatar-fallback.jpg') {
  const path = String(value || '');
  if (!path) return fallback;
  if (path.startsWith('/assets/')) return path;
  if (/^https:\/\/([a-z0-9-]+\.)*steamstatic\.com\//i.test(path)) return path;
  if (/^https:\/\/steamcdn-a\.akamaihd\.net\//i.test(path)) return path;
  return fallback;
}

export async function copyText(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function ensureToastStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'false');
    document.body.appendChild(stack);
  }
  return stack;
}

export function toast(message, { type = 'info', duration = 4200 } = {}) {
  const stack = ensureToastStack();
  const node = document.createElement('div');
  node.className = `toast${type === 'error' ? ' toast-error' : ''}`;
  node.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const iconName = type === 'error' ? 'circle-x' : type === 'success' ? 'circle-check' : 'sparkles';
  node.innerHTML = `${icon(iconName)}<span>${escapeHtml(message)}</span>`;
  stack.appendChild(node);
  while (stack.children.length > 4) stack.firstElementChild?.remove();
  const close = () => {
    if (node.classList.contains('is-leaving')) return;
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 260);
  };
  node.addEventListener('click', close);
  if (duration > 0) setTimeout(close, duration);
  return node;
}

export function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  const focusable = dialog.querySelector(
    'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])',
  );
  if (focusable) setTimeout(() => focusable.focus(), 50);
}

export function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}

export function setButtonLoading(button, loading, label = 'Подождите…') {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

export function formDataObject(form) {
  const values = {};
  for (const element of form.elements) {
    if (!element.name || element.disabled) continue;
    if (element.type === 'checkbox') {
      values[element.name] = element.checked;
    } else if (element.type === 'number') {
      values[element.name] = element.value === '' ? '' : Number(element.value);
    } else {
      values[element.name] = element.value;
    }
  }
  return values;
}

export function inlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\)/g,
    (match, label, href) => {
      const external = /^https?:\/\//.test(href);
      return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    },
  );
  return text;
}

export function renderMarkdown(source) {
  const text = String(source || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return '';
  const lines = text.split('\n');
  const output = [];
  let index = 0;

  const isBlockStart = (line) =>
    /^#{1,4}\s/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^---+$/.test(line);

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      output.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^---+$/.test(line)) {
      output.push('<hr>');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      output.push(`<blockquote><p>${inlineMarkdown(quote.join(' '))}</p></blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ''));
        index += 1;
      }
      output.push(`<ul>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      output.push(`<ol>${items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ol>`);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
  }

  return output.join('');
}

export function queryParam(name, fallback = '') {
  return new URLSearchParams(window.location.search).get(name) || fallback;
}

export function getPagePath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path.endsWith('.html')) return path.replace(/\.html$/, '') || '/';
  return path;
}
