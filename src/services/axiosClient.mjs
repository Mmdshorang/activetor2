import axios from 'axios';
import { applyTokenHeader, getTokenHeader } from './authHeaders.mjs';

export function isAuthEndpoint(url = '') {
  try {
    const pathname = new URL(String(url), 'http://frontend.invalid').pathname;
    return /\/auth(?:\/|$)/i.test(pathname) || /\/Login\/?$/i.test(pathname);
  } catch { return false; }
}

// Used by the legacy API and the independent activation-code service.
// The latter has no getToken/onUnauthorized: it stays anonymous as before.
export function createTokenAxiosClient({
  baseURL,
  getToken = () => null,
  onUnauthorized,
  getPathname = () => '/',
  redirectToLogin = () => {},
} = {}) {
  const client = axios.create({ baseURL });
  delete client.defaults.auth;
  applyTokenHeader(client.defaults.headers, null);
  for (const group of Object.values(client.defaults.headers)) {
    if (group && typeof group === 'object') applyTokenHeader(group, null);
  }

  const enforceHeaders = config => {
    // Axios can generate Basic Authorization from `auth` after interceptors.
    delete config.auth;
    // Prevent a stale XSRF setting from overwriting the authentication header.
    if (['authorization', 'token'].includes(String(config.xsrfHeaderName).toLowerCase())) {
      config.withXSRFToken = false;
      config.xsrfHeaderName = null;
    }
    config.headers = axios.AxiosHeaders.from(config.headers);
    applyTokenHeader(config.headers, isAuthEndpoint(config.url) ? null : getToken());
  };

  client.interceptors.request.use(config => {
    enforceHeaders(config);
    const transforms = config.transformRequest == null ? [] : [].concat(config.transformRequest);
    // Transforms run after request interceptors. Enforce once more immediately
    // before dispatch, preserving JSON, qs forms and FormData serialization.
    config.transformRequest = [...transforms, function (data, headers) {
      this.headers = headers;
      enforceHeaders(this);
      return data;
    }];
    return config;
  }, error => Promise.reject(error));

  if (onUnauthorized) {
    let isRedirectingToLogin = false;
    client.interceptors.response.use(response => response, error => {
      const status = error?.response?.status;
      const isAuthRequest = isAuthEndpoint(error?.config?.url);
      const requestHadToken = Boolean(getTokenHeader(error?.config?.headers));
      const isInsideApp = getPathname() !== '/';
      // Preserve the existing legacy API's 401/403 and redirect behavior.
      if ([401, 403].includes(status) && !isAuthRequest && (requestHadToken || isInsideApp)) {
        onUnauthorized();
        if (isInsideApp && !isRedirectingToLogin) {
          isRedirectingToLogin = true;
          redirectToLogin();
          return new Promise(() => {});
        }
      }
      return Promise.reject(error);
    });
  }
  return client;
}
