import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfigLoader, startConfigRefresh, validateConfig } from '../src/config/userApiConfig.mjs';
import { createUserApi } from '../src/services/userApi.mjs';
import { createContractApi } from '../src/services/contractApi.mjs';
import { createCustomerApi } from '../src/services/customerApi.mjs';
const response = value => new Response(JSON.stringify(value));

test('Configuration is cached for 30 seconds, refreshed without cache, and shared between callers', async () => {
  let time = 0, count = 0;
  const load = createConfigLoader('/user-api.config.json', async (url, init) => {
    assert.equal(url, '/user-api.config.json');
    assert.equal(init.cache, 'no-store');
    return response({ apiUrl: ++count === 1 ? '/old' : '/new' });
  }, { now: () => time });
  assert.equal((await load()).baseUrl, '/old');
  time = 29999;
  assert.equal((await load()).baseUrl, '/old');
  assert.equal(count, 1);
  time = 30000;
  const configs = await Promise.all([load(), load(), load()]);
  assert.equal(count, 2);
  assert.ok(configs.every(config => config.baseUrl === '/new'));
});

test('All API clients use the refreshed address on their next call', async () => {
  let address = '/old';
  const load = createConfigLoader('/config', async () => response({ apiUrl: address }));
  const urls = [];
  const options = { getConfig: load, getToken: () => 'token', fetchImpl: async url => {
    urls.push(url);
    return response({ LoginModel: [], coustomerModels: [], contractModels: [], ResaultClass: { StatusCode: 200 } });
  } };
  const users = createUserApi(options), customers = createCustomerApi(options), contracts = createContractApi(options);
  await users.getUsers(); await customers.getCustomers(); await contracts.getContracts();
  address = '/new'; await load.refresh();
  await users.getUsers(); await customers.getCustomers(); await contracts.getContracts();
  assert.deepEqual(urls, ['/old/GetUser', '/old/GetCoustomer', '/old/GetContract', '/new/GetUser', '/new/GetCoustomer', '/new/GetContract']);
});

test('Failed refresh preserves last valid config and next refresh can recover', async () => {
  let value = { apiUrl: '/old' }, count = 0;
  const load = createConfigLoader('/config', async () => {
    count++;
    if (value instanceof Error) throw value;
    return typeof value === 'string' ? new Response(value) : response(value);
  });
  await load();
  for (const invalid of [new Error('offline'), '<html>bad</html>', { apiUrl: '' }, { apiUrl: '/bad', configRefreshIntervalMs: 0 }]) {
    value = invalid;
    assert.equal((await load.refresh()).baseUrl, '/old');
    const before = count;
    await load();
    assert.equal(count, before);
  }
  value = { apiUrl: '/new', configRefreshIntervalMs: 60000 };
  assert.equal((await load.refresh()).baseUrl, '/new');
  assert.equal(load.getRefreshInterval(), 60000);
});

test('A stalled config fetch times out and can be retried', async () => {
  let working = false;
  const load = createConfigLoader('/config', async (_, { signal }) => working ? response({ apiUrl: '/api' }) : new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
  }), { timeoutMs: 5 });
  await assert.rejects(load(), /timeout/);
  working = true;
  assert.equal((await load()).baseUrl, '/api');
});

const flush = () => new Promise(resolve => setImmediate(resolve));
function pollingHarness(load) {
  const windowImpl = new EventTarget(), documentImpl = new EventTarget();
  documentImpl.visibilityState = 'visible';
  const timers = new Map(); let nextID = 0;
  const stop = startConfigRefresh(load, { windowImpl, documentImpl, setTimeoutImpl: (fn, delay) => { timers.set(++nextID, { fn, delay }); return nextID; }, clearTimeoutImpl: id => timers.delete(id) });
  return { windowImpl, documentImpl, timers, stop };
}

test('Background timer fetches while idle, focus/visibility refresh, cleanup removes all work', async () => {
  let count = 0;
  const load = createConfigLoader('/config', async () => { count++; return response({ apiUrl: '/api', configRefreshIntervalMs: 1000 }); });
  const poll = pollingHarness(load);
  await flush();
  assert.equal(count, 1);
  assert.equal(poll.timers.size, 1);
  const timer = [...poll.timers.values()][0];
  assert.equal(timer.delay, 1000);
  await timer.fn();
  assert.equal(count, 2);
  poll.windowImpl.dispatchEvent(new Event('focus'));
  await flush(); assert.equal(count, 3);
  poll.documentImpl.visibilityState = 'hidden';
  poll.documentImpl.dispatchEvent(new Event('visibilitychange'));
  await flush(); assert.equal(count, 3);
  poll.documentImpl.visibilityState = 'visible';
  poll.documentImpl.dispatchEvent(new Event('visibilitychange'));
  await flush(); assert.equal(count, 4);
  poll.stop();
  assert.equal(poll.timers.size, 0);
  poll.windowImpl.dispatchEvent(new Event('focus'));
  await flush(); assert.equal(count, 4);
});

test('Stopping while refreshing prevents orphan timers and focus does not overlap requests', async () => {
  let release, count = 0;
  const load = createConfigLoader('/config', () => { count++; return new Promise(resolve => { release = resolve; }); });
  const poll = pollingHarness(load);
  poll.windowImpl.dispatchEvent(new Event('focus'));
  assert.equal(count, 1);
  poll.stop();
  release(response({ apiUrl: '/api' }));
  await flush();
  assert.equal(poll.timers.size, 0);
});

test('Polling retries an initial failure and uses an updated interval', async () => {
  let count = 0;
  const load = createConfigLoader('/config', async () => {
    if (++count === 1) throw new Error('offline');
    return response({ apiUrl: '/api', configRefreshIntervalMs: 60000 });
  });
  const poll = pollingHarness(load);
  await flush();
  assert.equal([...poll.timers.values()][0].delay, 30000);
  await [...poll.timers.values()][0].fn();
  assert.equal([...poll.timers.values()][0].delay, 60000);
  poll.stop();
});

test('Unsafe or invalid refresh intervals are rejected', () => {
  for (const interval of [0, -1, 999, '30000', 3600001, 1.5]) assert.throws(() => validateConfig({ apiUrl: '/api', configRefreshIntervalMs: interval }), /configRefreshIntervalMs/);
  assert.equal(validateConfig({ apiUrl: '/api' }).configRefreshIntervalMs, 30000);
});
