import { HttpError } from './http.js';

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function bad(field, message) {
  throw new HttpError(400, 'validation_error', message, { field });
}

export function cleanString(value, { field, min = 0, max = 500, required = false, multiline = false } = {}) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') bad(field, `Поле «${field}» должно быть строкой.`);
  let text = value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim();
  if (!multiline) text = text.replace(/\n+/g, ' ');
  if (required && !text) bad(field, `Заполните поле «${field}».`);
  if (text.length < min) bad(field, `Поле «${field}» слишком короткое.`);
  if (text.length > max) bad(field, `Поле «${field}» длиннее ${max} символов.`);
  return text;
}

export function integer(value, { field, min = 0, max = Number.MAX_SAFE_INTEGER, required = false } = {}) {
  if (value === '' || value === undefined || value === null) {
    if (required) bad(field, `Заполните поле «${field}».`);
    return null;
  }
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number)) bad(field, `Поле «${field}» должно быть целым числом.`);
  if (number < min || number > max) bad(field, `Поле «${field}» вне допустимого диапазона.`);
  return number;
}

export function bool(value, { field, fallback = false } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  bad(field, `Поле «${field}» должно быть логическим значением.`);
}

export function oneOf(value, allowed, { field, fallback } = {}) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (!allowed.includes(value)) bad(field, `Недопустимое значение поля «${field}».`);
  return value;
}

export function slugify(value) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya',
  };
  return String(value || '')
    .toLowerCase()
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export function slug(value, { field = 'slug', required = false, source = '' } = {}) {
  let result = cleanString(value, { field, max: 72 }).toLowerCase();
  if (!result && source) result = slugify(source);
  if (!result) {
    if (required) bad(field, 'Укажите адрес (slug).');
    return '';
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) {
    bad(field, 'Адрес может содержать только латинские буквы, цифры и дефисы.');
  }
  return result;
}

export function stringArray(value, { field, maxItems = 20, maxLength = 180 } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) bad(field, `Поле «${field}» должно быть списком.`);
  if (value.length > maxItems) bad(field, `В поле «${field}» слишком много элементов.`);
  return value.map((item) => cleanString(item, { field, min: 1, max: maxLength })).filter(Boolean);
}

export function dateTime(value, { field, fallback = null } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') bad(field, `Некорректная дата в поле «${field}».`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) bad(field, `Некорректная дата в поле «${field}».`);
  return parsed.toISOString();
}

export function assetPath(value, { field = 'image_url' } = {}) {
  const path = cleanString(value, { field, max: 300 });
  if (!path) return '';
  if (!path.startsWith('/assets/images/') || path.includes('..') || path.includes('\\')) {
    bad(field, 'Изображение должно находиться в /assets/images/.');
  }
  return path;
}

export function connectUrl(value, { field = 'connect_url' } = {}) {
  const raw = cleanString(value, { field, max: 500 });
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    bad(field, 'Некорректная ссылка подключения.');
  }
  if (!['https:', 'http:', 'steam:', 'minecraft:'].includes(parsed.protocol)) {
    bad(field, 'Недопустимый протокол ссылки подключения.');
  }
  return raw;
}

export function idParam(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(400, 'invalid_id', 'Некорректный идентификатор.');
  }
  return id;
}

export function limitParam(value, { fallback = 20, max = 100 } = {}) {
  if (!value) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

export function offsetParam(value) {
  const number = Number(value || 0);
  if (!Number.isInteger(number) || number < 0) return 0;
  return Math.min(number, 100000);
}
