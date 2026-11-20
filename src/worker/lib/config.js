import { safeHttpUrl } from './http.js';

export const SETTING_DEFAULTS = Object.freeze({
  project_name: 'PROJECT',
  project_tagline: 'Игровое сообщество новой волны',
  demo_notice: 'true',
  support_url: '',
  support_label: 'Поддержка',
  store_notice:
    'Цены и состав привилегий приведены для примера. Замените их в админ-панели перед запуском.',
  payment_instructions:
    'После создания заявки администратор свяжется с вами, подтвердит состав привилегии и пришлёт актуальные реквизиты. Автоматическое списание не производится.',
});

export function normalizeSettings(rows = []) {
  const values = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (row && typeof row.key === 'string' && typeof row.value === 'string') {
      values[row.key] = row.value;
    }
  }
  return values;
}

export async function loadSettings(db) {
  try {
    const { results } = await db.prepare('SELECT key, value FROM settings').all();
    return normalizeSettings(results || []);
  } catch (error) {
    console.error('settings_load_failed', error instanceof Error ? error.message : 'unknown');
    return { ...SETTING_DEFAULTS };
  }
}

export function isDemoNoticeEnabled(settings) {
  return String(settings.demo_notice).toLowerCase() === 'true';
}

export function publicSettings(settings) {
  return {
    projectName: settings.project_name || SETTING_DEFAULTS.project_name,
    tagline: settings.project_tagline || SETTING_DEFAULTS.project_tagline,
    demoNotice: isDemoNoticeEnabled(settings),
    supportUrl: safeHttpUrl(settings.support_url),
    supportLabel: settings.support_label || SETTING_DEFAULTS.support_label,
    storeNotice: settings.store_notice || '',
    paymentInstructions: settings.payment_instructions || '',
  };
}

export function parseAdminSteamIds(value) {
  if (typeof value !== 'string') return new Set();
  return new Set(
    value
      .split(/[\s,;]+/)
      .map((id) => id.trim())
      .filter((id) => /^\d{17}$/.test(id)),
  );
}

export function adminConfigured(env) {
  return parseAdminSteamIds(env.ADMIN_STEAM_IDS).size > 0;
}

export function steamConfigured(env) {
  return Boolean(env.STEAM_API_KEY && String(env.STEAM_API_KEY).trim());
}
