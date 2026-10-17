import { TOKEN_AUTH } from '../services/authHeaders.mjs';

export const API_OPERATIONS = ['Login', 'GetUser', 'InsertUser', 'Updateuser', 'GetUserByID', 'GetCoustomer', 'GetCoustomerByID', 'InsertCoustomer', 'UpdateCoustomer', 'GetAllContract', 'GetContract', 'InsertContract', 'UpdateContract'];

// Transport defaults, not a claim about an unverified server contract.
// Deployments normally set only apiUrl; baseUrl remains a supported alias.
export const CONFIG_REFRESH_INTERVAL_MS = 30000;

const DEFAULT_CONFIG = {
  configRefreshIntervalMs: CONFIG_REFRESH_INTERVAL_MS,
  auth: TOKEN_AUTH,
  successStatusCodes: [200],
  sessionExpiredStatusCodes: [],
  updatePasswordMode: 'required',
  useTypes: [],
  timeoutMs: 20000,
  endpoints: {
    Login: { path: 'Login', method: 'POST' },
    GetUser: { path: 'GetUser', method: 'GET' },
    InsertUser: { path: 'InsertUser', method: 'POST' },
    Updateuser: { path: 'Updateuser', method: 'POST' },
    GetUserByID: { path: 'GetUserByID', method: 'POST' },
    GetCoustomer: { path: 'GetCoustomer', method: 'GET' },
    GetCoustomerByID: { path: 'GetCoustomerByID', method: 'POST' },
    InsertCoustomer: { path: 'InsertCoustomer', method: 'POST' },
    UpdateCoustomer: { path: 'UpdateCoustomer', method: 'POST' },
    GetAllContract: { path: 'GetAllContract', method: 'GET' },
    GetContract: { path: 'GetContract', method: 'POST' },
    InsertContract: { path: 'InsertContract', method: 'POST' },
    UpdateContract: { path: 'UpdateContract', method: 'POST' },
  },
};

const valueOrDefault = (value, fallback) => value == null || value === '' ? fallback : value;

export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('فایل تنظیمات اتصال باید یک شیء JSON باشد.');
  // apiUrl matches the original project's config; baseUrl supports earlier builds.
  const baseUrl = [input.apiUrl, input.baseUrl]
    .find(value => typeof value === 'string' && value.trim())?.trim() || '';
  if (!baseUrl) throw new Error('آدرس API را در apiUrl (یا baseUrl) فایل public/user-api.config.json وارد کنید.');
  try {
    const url = new URL(baseUrl, 'https://frontend.invalid');
    const absoluteOrRootRelative = /^https?:\/\//i.test(baseUrl) || /^\/(?!\/)/.test(baseUrl);
    if (!absoluteOrRootRelative || /[\s\\?#]/.test(baseUrl) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch { throw new Error('آدرس apiUrl/baseUrl معتبر نیست؛ آدرس کامل API یا مسیری مانند /api وارد کنید.'); }

  const config = {
    baseUrl,
    configRefreshIntervalMs: valueOrDefault(input.configRefreshIntervalMs, DEFAULT_CONFIG.configRefreshIntervalMs),
    // Migrate legacy auth overrides to the fixed raw Token contract.
    auth: { ...DEFAULT_CONFIG.auth },
    successStatusCodes: input.successStatusCodes == null || (Array.isArray(input.successStatusCodes) && input.successStatusCodes.length === 0)
      ? [...DEFAULT_CONFIG.successStatusCodes] : input.successStatusCodes,
    sessionExpiredStatusCodes: input.sessionExpiredStatusCodes ?? [...DEFAULT_CONFIG.sessionExpiredStatusCodes],
    updatePasswordMode: valueOrDefault(input.updatePasswordMode, DEFAULT_CONFIG.updatePasswordMode),
    useTypes: input.useTypes ?? [...DEFAULT_CONFIG.useTypes],
    timeoutMs: valueOrDefault(input.timeoutMs, DEFAULT_CONFIG.timeoutMs),
    endpoints: Object.fromEntries(API_OPERATIONS.map(name => {
      const endpoint = input.endpoints?.[name];
      const method = valueOrDefault(endpoint?.method, DEFAULT_CONFIG.endpoints[name].method);
      return [name, {
        path: valueOrDefault(endpoint?.path, DEFAULT_CONFIG.endpoints[name].path),
        method: typeof method === 'string' ? method.toUpperCase() : method,
      }];
    })),
  };

  const invalid = [];
  if (!Array.isArray(config.successStatusCodes) || !config.successStatusCodes.every(Number.isInteger)) invalid.push('successStatusCodes');
  if (!Array.isArray(config.sessionExpiredStatusCodes) || !config.sessionExpiredStatusCodes.every(Number.isInteger) ||
      (Array.isArray(config.successStatusCodes) && config.sessionExpiredStatusCodes.some(code => config.successStatusCodes.includes(code)))) invalid.push('sessionExpiredStatusCodes');
  for (const name of API_OPERATIONS) {
    const ep = config.endpoints[name];
    const allowed = ['GetUser', 'GetUserByID', 'GetCoustomer', 'GetCoustomerByID', 'GetAllContract', 'GetContract'].includes(name) ? ['GET', 'POST'] : ['Updateuser', 'UpdateCoustomer', 'UpdateContract'].includes(name) ? ['POST', 'PUT', 'PATCH'] : ['POST'];
    if (typeof ep.path !== 'string' || !ep.path.trim() || /[:?#\\]|(^|\/)\.\.(\/|$)/.test(ep.path)) invalid.push(`${name}.path`);
    if (!allowed.includes(ep.method)) invalid.push(`${name}.method`);
  }
  if (!['required', 'empty'].includes(config.updatePasswordMode)) invalid.push('updatePasswordMode');
  if (!Number.isInteger(config.configRefreshIntervalMs) || config.configRefreshIntervalMs < 1000 || config.configRefreshIntervalMs > 3600000) invalid.push('configRefreshIntervalMs');
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 120000) invalid.push('timeoutMs');
  if (!Array.isArray(config.useTypes) || !config.useTypes.every(item => item && Number.isInteger(item.value) && item.value >= -2147483648 && item.value <= 2147483647 && typeof item.label === 'string')) invalid.push('useTypes');
  if (invalid.length) throw new Error(`تنظیمات اختیاری نامعتبر است: ${invalid.join('، ')}`);
  return config;
}

// A cached address is reused for at most the configured interval. Concurrent
// callers share a refresh, and a failed refresh retains the last valid config.
export function createConfigLoader(url, fetchImpl = (...args) => fetch(...args), { now = Date.now, timeoutMs = 10000 } = {}) {
  let pending;
  let cached;
  let nextCheckAt = 0;
  const getRefreshInterval = () => cached?.configRefreshIntervalMs ?? CONFIG_REFRESH_INTERVAL_MS;
  const load = ({ force = false } = {}) => {
    if (pending) return pending;
    if (cached && !force && now() < nextCheckAt) return Promise.resolve(cached);
    pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        if (!response.ok) throw new Error('فایل تنظیمات اتصال بارگذاری نشد.');
        let input;
        try { input = await response.json(); }
        catch { throw new Error('فایل user-api.config.json باید JSON معتبر باشد؛ بدون بک‌اسلش اضافه یا کد HTML.'); }
        cached = validateConfig(input);
        nextCheckAt = now() + getRefreshInterval();
        return cached;
      } catch (error) {
        if (!cached) throw error;
        nextCheckAt = now() + getRefreshInterval();
        return cached;
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => { pending = undefined; });
    return pending;
  };
  load.refresh = () => load({ force: true });
  load.getRefreshInterval = getRefreshInterval;
  return load;
}

// Mounted once by AuthProvider, including on the login page. Return cleanup for
// React StrictMode/unmount. Focus/visibility refreshes cover suspended tabs.
export function startConfigRefresh(load, {
  windowImpl = window, documentImpl = document,
  setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout,
} = {}) {
  let stopped = false;
  let timer;
  let running = false;
  const refresh = async () => {
    if (stopped || running) return;
    running = true;
    clearTimeoutImpl(timer);
    try { await load.refresh(); }
    catch { /* The next foreground API call exposes initial-load errors. */ }
    finally {
      running = false;
      if (!stopped) timer = setTimeoutImpl(refresh, load.getRefreshInterval());
    }
  };
  const onVisible = () => { if (documentImpl.visibilityState !== 'hidden') refresh(); };
  windowImpl.addEventListener('focus', onVisible);
  documentImpl.addEventListener('visibilitychange', onVisible);
  refresh();
  return () => {
    stopped = true;
    clearTimeoutImpl(timer);
    windowImpl.removeEventListener('focus', onVisible);
    documentImpl.removeEventListener('visibilitychange', onVisible);
  };
}
