
import { applyTokenHeader } from './authHeaders.mjs';

export class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export const field = (object, name) =>
  object?.[name] ?? object?.[name[0].toLowerCase() + name.slice(1)];

const resultOf = data => field(data, 'ResaultClass') ?? data;
export const messageOf = data => field(resultOf(data), 'StatusMessage');

// .NET long identifiers must not pass through JavaScript's lossy Number conversion.
export function parseApiJson(text) {
  const safeJson = text.replace(
    /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    token => {
      if (token[0] === '"' || !/^-?\d+$/.test(token)) return token;
      return Number.isSafeInteger(Number(token))
        ? token
        : JSON.stringify(token);
    }
  );

  return JSON.parse(safeJson);
}

export function createApiRequest({
  getConfig,
  getToken = () => null,
  onUnauthorized = () => {},
  fetchImpl = (...args) => fetch(...args),
  serializePayload = payload => JSON.stringify(payload),
  contentTypeOnEmptyRequest = false,
}) {
  async function request(operation, payload, options = {}) {
    const config = await getConfig();
    const endpoint = config.endpoints[operation];

    if (!endpoint) {
      throw new ApiError(`تنظیمات API برای ${operation} پیدا نشد.`);
    }

    const authenticated = operation !== 'Login';
    const token = authenticated ? getToken() : null;

    if (authenticated && !token) {
      onUnauthorized();
      throw new ApiError('لطفاً دوباره وارد حساب خود شوید.', 401);
    }

    const headers = applyTokenHeader(
      { Accept: 'application/json' },
      token
    );

    // Some Web API actions bind a complex model even for a bodyless list GET.
    // Declare the formatter explicitly for those services as well.
    if (contentTypeOnEmptyRequest) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
    }

    let url =
      `${config.baseUrl.replace(/\/+$/, '')}/` +
      `${endpoint.path.replace(/^\/+/, '')}`;

    const init = {
      method: endpoint.method,
      headers,
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    };

    if (payload !== undefined && payload !== null) {
      const serializedPayload = serializePayload(payload);

      if (endpoint.method.toUpperCase() === 'GET') {
        url += `${url.includes('?') ? '&' : '?'}${serializedPayload}`;
      } else {
        // The body is URL-encoded form data, so declare its media type.
        headers['Content-Type'] =
          'application/x-www-form-urlencoded;charset=UTF-8';

        init.body = serializedPayload;
      }
    }

    const controller = new AbortController();
    const abort = () => controller.abort();

    if (options.signal?.aborted) abort();

    options.signal?.addEventListener('abort', abort, { once: true });

    const timer = setTimeout(abort, config.timeoutMs);
    init.signal = controller.signal;

    let response;

    try {
      response = await fetchImpl(url, init);

      const raw = await response.text();
      let data;

      try {
        data = parseApiJson(raw);
      } catch {
        data = null;
      }

      if (response.status === 401 && authenticated) {
        onUnauthorized();
      }

      if (!response.ok) {
        throw new ApiError(
          messageOf(data) ||
            (response.status === 403
              ? 'اجازه انجام این عملیات را ندارید.'
              : response.status === 401
                ? 'نام کاربری یا رمز عبور نامعتبر است یا نشست منقضی شده است.'
                : `خطای ارتباط با سرور (${response.status}).`),
          response.status
        );
      }

      if (!data || typeof data !== 'object') {
        throw new ApiError('پاسخ سرور JSON معتبر نیست.');
      }

      const result = resultOf(data);
      const statusCode = field(result, 'StatusCode');

      if (!Number.isInteger(statusCode)) {
        throw new ApiError(
          'StatusCode در پاسخ سرور وجود ندارد یا معتبر نیست.'
        );
      }

      if (!config.successStatusCodes.includes(statusCode)) {
        if (
          authenticated &&
          config.sessionExpiredStatusCodes.includes(statusCode)
        ) {
          onUnauthorized();
        }

        throw new ApiError(
          messageOf(data) || `عملیات انجام نشد (کد ${statusCode}).`,
          statusCode
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (controller.signal.aborted) {
        if (options.signal?.aborted) {
          const cancelled = new Error('لغو شد');
          cancelled.name = 'AbortError';
          throw cancelled;
        }

        throw new ApiError(
          'زمان پاسخ‌گویی سرور تمام شد. دوباره تلاش کنید.'
        );
      }

      throw new ApiError(
        'ارتباط با سرور برقرار نشد. آدرس API، شبکه و تنظیمات CORS را بررسی کنید.'
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  return request;
}
