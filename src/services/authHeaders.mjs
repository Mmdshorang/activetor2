// One authentication contract for every application-owned HTTP client.
// Legacy runtime config must never re-enable Authorization/Bearer.
export const TOKEN_HEADER = 'Token';
export const TOKEN_AUTH = Object.freeze({ headerName: TOKEN_HEADER, scheme: '' });

export function applyTokenHeader(headers, token) {
  // Plain objects and AxiosHeaders can contain mixed-case duplicate keys.
  for (const name of Object.keys(headers)) {
    if (['authorization', 'token'].includes(name.toLowerCase())) delete headers[name];
  }
  // Also support native Headers, whose entries are not enumerable properties.
  if (typeof headers.delete === 'function') {
    headers.delete('Authorization');
    headers.delete(TOKEN_HEADER);
  }
  if (token) {
    if (typeof headers.set === 'function') headers.set(TOKEN_HEADER, token, true);
    else headers[TOKEN_HEADER] = token;
  }
  return headers;
}

export function getTokenHeader(headers) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(TOKEN_HEADER);
  const key = Object.keys(headers).find(name => name.toLowerCase() === 'token');
  return key ? headers[key] : null;
}
