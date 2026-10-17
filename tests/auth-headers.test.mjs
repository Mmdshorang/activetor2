import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import axios from 'axios';
import { applyTokenHeader, getTokenHeader } from '../src/services/authHeaders.mjs';
import { createTokenAxiosClient, isAuthEndpoint } from '../src/services/axiosClient.mjs';
import { activationApi } from '../src/services/activationApi.mjs';
import { createConfigLoader, validateConfig } from '../src/config/userApiConfig.mjs';
import { createUserApi } from '../src/services/userApi.mjs';
import { createContractApi } from '../src/services/contractApi.mjs';
import { createCustomerApi } from '../src/services/customerApi.mjs';

const SESSION_TOKEN = 'session-only-in-token-header';
function assertHeaders(headers, expected = SESSION_TOKEN) {
  const entries = typeof headers.toJSON === 'function' ? Object.entries(headers.toJSON()) : Object.entries(headers);
  assert.equal(entries.some(([key]) => key.toLowerCase() === 'authorization'), false);
  const tokens = entries.filter(([key]) => key.toLowerCase() === 'token');
  assert.equal(tokens.length, expected ? 1 : 0);
  if (expected) assert.equal(tokens[0][1], expected);
}

async function captureServer(t) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ url: request.url, method: request.method, headers: request.headers, body });
    response.writeHead(Number(new URL(request.url, 'http://localhost').searchParams.get('status')) || 200, { 'Content-Type': 'application/json' });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ ok: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { baseURL: `http://127.0.0.1:${server.address().port}`, requests };
}

// HTTP server assertions inspect the actual received wire headers, after Axios
// defaults, interceptors, transforms, Basic auth handling and its HTTP adapter.
test('Axios sends only raw Token for every method, stripping global/instance/request credentials', async t => {
  const { baseURL, requests } = await captureServer(t);
  const oldHeaders = axios.defaults.headers, oldAuth = axios.defaults.auth;
  const originalGroups = Object.fromEntries(Object.entries(oldHeaders).map(([key, value]) => [key, value && typeof value === 'object' ? { ...value } : value]));
  t.after(() => { axios.defaults.headers = originalGroups; if (oldAuth === undefined) delete axios.defaults.auth; else axios.defaults.auth = oldAuth; });
  axios.defaults.headers.common.Authorization = 'Bearer stale-global';
  axios.defaults.headers.common.Token = 'stale-global-token';
  axios.defaults.headers.post.authorization = 'Bearer stale-method';
  axios.defaults.auth = { username: 'old', password: 'old' };
  let currentToken = SESSION_TOKEN;
  const client = createTokenAxiosClient({ baseURL, getToken: () => currentToken });
  assertHeaders(client.defaults.headers.common, null);
  assertHeaders(client.defaults.headers.post, null);
  assert.equal(client.defaults.auth, undefined);
  client.defaults.headers.common.aUtHoRiZaTiOn = 'Bearer stale-instance';
  client.defaults.headers.common.token = 'stale-instance-token';
  client.defaults.auth = { username: 'old-instance', password: 'old' };
  client.interceptors.request.use(config => {
    config.headers.Authorization = 'Bearer interceptor';
    return config;
  });
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    await client.request({ url: '/data', method, proxy: false, headers: { AUTHORIZATION: 'Bearer request', TOKEN: 'stale-request-token', 'X-Keep': 'unchanged' }, auth: { username: 'basic', password: 'secret' }, ...(['POST', 'PUT', 'PATCH'].includes(method) ? { data: { field: 'مقدار' } } : {}) });
    const sent = requests.at(-1);
    assertHeaders(sent.headers);
    assert.equal(sent.headers['x-keep'], 'unchanged');
    assert.equal(sent.url.includes(SESSION_TOKEN), false);
    assert.equal(sent.body.includes(SESSION_TOKEN), false);
    if (['POST', 'PUT', 'PATCH'].includes(method)) assert.deepEqual(JSON.parse(sent.body), { field: 'مقدار' });
  }
  currentToken = 'new-session-token';
  await client.get('/data', { proxy: false });
  assertHeaders(requests.at(-1).headers, currentToken);
  currentToken = null;
  await client.get('/data', { proxy: false });
  assertHeaders(requests.at(-1).headers, null);
});

test('Late transforms cannot re-add Authorization or Basic auth; form encoding is unchanged', async t => {
  const { baseURL, requests } = await captureServer(t);
  const client = createTokenAxiosClient({ baseURL, getToken: () => SESSION_TOKEN });
  await client.post('/data', 'value=%D9%86%D8%A7%D9%85&empty=', {
    proxy: false,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    xsrfHeaderName: 'Authorization', withXSRFToken: true,
    transformRequest: function (data, headers) {
      headers.set('authorization', 'Bearer from-transform');
      headers.set('Token', 'stale-transform-token');
      this.auth = { username: 'basic', password: 'secret' };
      return data;
    },
  });
  assertHeaders(requests[0].headers);
  assert.equal(requests[0].body, 'value=%D9%86%D8%A7%D9%85&empty=');
  assert.match(requests[0].headers['content-type'], /application\/x-www-form-urlencoded/);
});

test('Axios login stays anonymous and external activation client does not inherit session credentials', async t => {
  const { baseURL, requests } = await captureServer(t);
  const client = createTokenAxiosClient({ baseURL, getToken: () => SESSION_TOKEN });
  for (const url of ['/auth/login', '/auth/otp', '/Login', '/api/Account/Login', `${baseURL}/auth/login`]) {
    await client.post(url, 'UserName=demo&Password=demo', { proxy: false, headers: { Authorization: 'Bearer stale', Token: SESSION_TOKEN }, auth: { username: 'old', password: 'old' } });
    assertHeaders(requests.at(-1).headers, null);
  }
  activationApi.defaults.headers.common.Authorization = 'Bearer stale';
  activationApi.defaults.headers.common.Token = SESSION_TOKEN;
  await activationApi.post(`${baseURL}/activecode`, 'key1=123&key2=456', { proxy: false });
  assertHeaders(requests.at(-1).headers, null);
  assert.equal(requests.at(-1).body, 'key1=123&key2=456');
  delete activationApi.defaults.headers.common.Authorization;
  delete activationApi.defaults.headers.common.Token;
});

test('Axios legacy 401/403 still expire a Token-authenticated session while login/500/network errors do not', async t => {
  const { baseURL } = await captureServer(t);
  let expired = 0;
  const client = createTokenAxiosClient({ baseURL, getToken: () => SESSION_TOKEN, onUnauthorized: () => expired++, getPathname: () => '/' });
  for (const status of [401, 403]) await assert.rejects(client.get(`/data?status=${status}`, { proxy: false }), error => error.response.status === status && getTokenHeader(error.config.headers) === SESSION_TOKEN);
  assert.equal(expired, 2);
  for (const status of [401, 403, 500]) await assert.rejects(client.post(`/auth/login?status=${status}`, {}, { proxy: false }));
  await assert.rejects(client.get('/data?status=500', { proxy: false }));
  assert.equal(expired, 2);
  await assert.rejects(client.get('/data', { adapter: async () => { throw new Error('Network failed'); } }), /Network failed/);
  assert.equal(expired, 2);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(client.get('/data', { proxy: false, signal: controller.signal }), error => error.code === 'ERR_CANCELED');
  assert.equal(expired, 2);
});

test('Axios protected-page failure redirects once using Token detection', async () => {
  let expired = 0, redirects = 0;
  let redirected;
  const didRedirect = new Promise(resolve => { redirected = resolve; });
  const client = createTokenAxiosClient({ getToken: () => SESSION_TOKEN, onUnauthorized: () => expired++, getPathname: () => '/customers', redirectToLogin: () => { redirects++; redirected(); } });
  const adapter = async config => { const error = new Error('Unauthorized'); error.config = config; error.response = { status: 401 }; throw error; };
  // First request intentionally remains pending while the browser navigates,
  // matching the pre-existing behavior. The next failure is rejected normally.
  void client.get('/data', { adapter });
  await didRedirect;
  await assert.rejects(client.get('/data', { adapter }));
  assert.equal(expired, 2);
  assert.equal(redirects, 1);
});

test('Config refresh cannot restore Authorization, a custom auth header or a Bearer prefix', async () => {
  for (const auth of [undefined, { headerName: 'Authorization', scheme: 'Bearer' }, { headerName: 'authorization', scheme: '' }, { headerName: 'X-Token', scheme: 'Bearer' }, { headerName: 'bad\r\nHeader', scheme: 'invalid\r\n' }]) {
    const config = validateConfig({ apiUrl: '/api', auth });
    assert.deepEqual(config.auth, { headerName: 'Token', scheme: '' });
  }
  let input = { apiUrl: '/first' };
  const load = createConfigLoader('/config', async () => new Response(JSON.stringify(input)));
  await load();
  input = { apiUrl: '/second', auth: { headerName: 'Authorization', scheme: 'Bearer' } };
  const config = await load.refresh();
  assert.equal(config.baseUrl, '/second');
  assert.deepEqual(config.auth, { headerName: 'Token', scheme: '' });
});

test('All thirteen fetch operations enforce Token even when getConfig supplies legacy auth directly', async () => {
  const config = validateConfig({ apiUrl: '/api' });
  config.auth = { headerName: 'Authorization', scheme: 'Bearer' };
  const user = { RowID: '1', RowName: 'نام', UserName: 'demo', Password: 'pass', Mobile: '', UseType: null, IsActive: true, Token: 'login-result-token' };
  const calls = [];
  const options = {
    getConfig: async () => config, getToken: () => SESSION_TOKEN,
    fetchImpl: async (url, init) => {
      const operation = url.split('/').pop(); calls.push(operation);
      assertHeaders(init.headers, operation === 'Login' ? null : SESSION_TOKEN);
      assert.equal(url.includes(SESSION_TOKEN), false);
      assert.equal(String(init.body || '').includes(SESSION_TOKEN), false);
      return new Response(JSON.stringify({ LoginModel: operation === 'Login' ? user : [user], coustomerModels: [{ RowID: '1' }], contractModels: [{ RowID: '1' }], ResaultClass: { StatusCode: 200 } }));
    },
  };
  const users = createUserApi(options), customers = createCustomerApi(options);
  assert.equal((await users.login('demo', 'pass')).token, 'login-result-token');
  await users.getUsers(); await users.getUserByID('1'); await users.insertUser(user); await users.updateUser(user);
  await customers.getCustomers(); await customers.getCustomerByID('1'); await customers.insertCustomer({}); await customers.updateCustomer({ RowID: '1' });
  const contracts = createContractApi(options);
  await contracts.getContracts(); await contracts.getContractByID('1'); await contracts.insertContract({}); await contracts.updateContract({ RowID: '1' });
  assert.equal(calls.length, 13);
});

test('Header sanitation handles mixed case and Headers/AxiosHeaders without removing other headers', () => {
  for (const input of [{ authorization: 'stale', AUTHORIZATION: 'stale2', TOKEN: 'old', 'Content-Type': 'application/json' }, new Headers({ Authorization: 'stale', Token: 'old', 'Content-Type': 'application/json' }), new axios.AxiosHeaders({ AUTHORIZATION: 'stale', token: 'old', 'Content-Type': 'application/json' })]) {
    applyTokenHeader(input, SESSION_TOKEN);
    assert.equal(getTokenHeader(input), SESSION_TOKEN);
    if (input instanceof Headers) assert.equal(input.has('Authorization'), false);
    else assertHeaders(input);
    assert.equal(typeof input.get === 'function' ? input.get('Content-Type') : input['Content-Type'], 'application/json');
    applyTokenHeader(input, null);
    assert.equal(Boolean(getTokenHeader(input)), false);
  }
  assert.equal(isAuthEndpoint('/auth/login'), true);
  assert.equal(isAuthEndpoint('https://example.invalid/api/Login'), true);
  assert.equal(isAuthEndpoint('/customers?next=/auth/login'), false);
});
