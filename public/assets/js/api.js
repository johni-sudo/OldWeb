export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message || 'Ошибка запроса');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const requestHeaders = {
    Accept: 'application/json',
    'X-Requested-With': 'PROJECTWeb',
    ...headers,
  };
  let payload;
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, {
      method,
      headers: requestHeaders,
      body: payload,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (error?.name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'Сервер не ответил вовремя. Попробуйте ещё раз.');
    }
    throw new ApiError(0, 'network_error', 'Нет связи с сервером. Проверьте подключение.');
  }
  clearTimeout(timer);

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const info = data?.error || {};
    if (response.status === 401) {
      document.dispatchEvent(new CustomEvent('auth:expired'));
    }
    throw new ApiError(
      response.status,
      info.code || 'request_failed',
      info.message || `Ошибка запроса (${response.status}).`,
      info.details || null,
    );
  }
  return data;
}

export const api = {
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
};

export function steamLoginUrl(returnTo = `${window.location.pathname}${window.location.search}`) {
  return `/api/auth/steam/login?return_to=${encodeURIComponent(returnTo)}`;
}
