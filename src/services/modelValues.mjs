import { ApiError } from './apiTransport.mjs';

const LONG_MIN = BigInt('-9223372036854775808');
const LONG_MAX = BigInt('9223372036854775807');

export function longValue(value, name, { nullable = false, positive = false } = {}) {
  if (nullable && (value == null || value === '')) return null;
  const text = String(value ?? '').trim();
  if ((typeof value === 'number' && !Number.isSafeInteger(value)) || !/^-?\d+$/.test(text)) {
    throw new ApiError(`${name} باید عدد صحیح معتبر باشد.`);
  }
  const number = BigInt(text);
  if (number < LONG_MIN || number > LONG_MAX || (positive && number <= BigInt(0))) {
    throw new ApiError(`${name} خارج از محدوده مجاز است.`);
  }
  return number.toString();
}

export const dateValue = (value, name) => {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  // Accept the two common .NET JSON date formats. Keep ISO timestamps intact
  // when a record is edited so its timezone/seconds are not silently changed.
  const legacy = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(text);
  if (legacy) {
    const date = new Date(Number(legacy[1]));
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
  if (iso) {
    const day = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    if (Number(iso[1]) >= 1 && Number.isFinite(Date.parse(text)) &&
        day.getUTCFullYear() === Number(iso[1]) && day.getUTCMonth() + 1 === Number(iso[2]) && day.getUTCDate() === Number(iso[3])) return text;
  }
  throw new ApiError(`تاریخ ${name} معتبر نیست.`);
};

// A successful null list is empty; missing fields or wrong types remain errors.
export function nullableList(data, pascalName, message) {
  const camelName = pascalName[0].toLowerCase() + pascalName.slice(1);
  const own = name => Object.prototype.hasOwnProperty.call(data, name);
  const key = own(pascalName) ? pascalName : own(camelName) ? camelName : null;
  if (!key) throw new ApiError(message);
  const list = data[key];
  if (list === null) return [];
  if (!Array.isArray(list)) throw new ApiError(message);
  return list;
}
