import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerApi, buildCustomerPayload, normalizeCustomer } from '../src/services/customerApi.mjs';
import { validateConfig } from '../src/config/userApiConfig.mjs';

const result = (StatusCode = 200, StatusMessage = 'انجام شد') => ({ StatusCode, StatusMessage });
const model = (overrides = {}) => ({
  RowID: '9223372036854775807', RowName: 'مشتری آزمایشی', ShopName: 'فروشگاه & تست', Address: 'تهران + خیابان = ۱',
  ContractDate: '2026-10-15T12:30:45.1234567', EndDate: null, ActiveToken: 'activation&+token', LastTry: '2026-10-15T10:00:00Z',
  UniqueCode: '00112233-4455-6677-8899-aabbccddeeff', ID: '9007199254740993', UserID: '0',
  UserName: 'customer', Password: ' pass&+= فارسی ', MobileNumber: '09120000000', ...overrides,
});
const wrapped = (coustomerModels, StatusCode = 200) => ({ coustomerModels, ResaultClass: result(StatusCode) });
const form = body => Object.fromEntries(new URLSearchParams(body));
function harness(data, { config = validateConfig({ apiUrl: '/api' }), status = 200, token = 'session-token' } = {}) {
  const calls = [], expired = [];
  const client = createCustomerApi({ getConfig: async () => config, getToken: () => token, onUnauthorized: () => expired.push(true), fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return new Response(typeof data === 'string' ? data : JSON.stringify(data), { status });
  } });
  return { client, calls, expired };
}

test('GetCoustomer sends no body or query and reads coustomerModels', async () => {
  const { client, calls } = harness(wrapped([model()]));
  const [customer] = await client.getCustomers();
  assert.equal(calls[0].url, '/api/GetCoustomer');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers['Content-Type'], undefined);
  assert.equal(calls[0].init.headers.Token, 'session-token');
  assert.equal(customer.RowName, 'مشتری آزمایشی');
  assert.equal(customer.Password, undefined);
  assert.equal(customer.ActiveToken, undefined);
});

test('GetCoustomer allows POST without fabricated fields', async () => {
  const config = validateConfig({ apiUrl: '/api', endpoints: { GetCoustomer: { method: 'POST' } } });
  const { client, calls } = harness(wrapped([]), { config });
  assert.deepEqual(await client.getCustomers(), []);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, undefined);
});

test('Detail sends only RowID and chooses the matching row with all fields preserved', async () => {
  const expected = model();
  const { client, calls } = harness(wrapped([model({ RowID: '2' }), expected]));
  assert.deepEqual(await client.getCustomerByID(expected.RowID), expected);
  assert.equal(calls[0].url, '/api/GetCoustomerByID');
  assert.deepEqual(form(calls[0].init.body), { RowID: expected.RowID });
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  await assert.rejects(harness(wrapped([model()])).client.getCustomerByID('1'), /پیدا نشد/);
});

test('Optional GET detail encodes only RowID in query', async () => {
  const config = validateConfig({ apiUrl: '/api', endpoints: { GetCoustomerByID: { method: 'GET' } } });
  const { client, calls } = harness(wrapped([model()]), { config });
  await client.getCustomerByID(model().RowID);
  assert.equal(calls[0].url, '/api/GetCoustomerByID?RowID=9223372036854775807');
  assert.equal(calls[0].init.body, undefined);
});

test('Insert/Update send all fourteen fields using qs with exact secrets, dates and 64-bit IDs', async () => {
  for (const update of [false, true]) {
    const { client, calls } = harness(result());
    const data = model();
    const message = await (update ? client.updateCustomer(data) : client.insertCustomer(data));
    assert.equal(message, 'انجام شد');
    assert.equal(calls[0].url, `/api/${update ? 'UpdateCoustomer' : 'InsertCoustomer'}`);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
    assert.deepEqual(form(calls[0].init.body), { ...data, RowID: update ? data.RowID : '0', EndDate: '' });
    assert.equal(Object.keys(form(calls[0].init.body)).length, 14);
    assert.equal(calls[0].init.headers.Token, 'session-token');
  }
});

test('Empty nullable and string fields are sent; zero IDs are not removed', async () => {
  const { client, calls } = harness(result());
  await client.insertCustomer({ ID: 0, UserID: 0 });
  assert.deepEqual(form(calls[0].init.body), {
    RowID: '0', RowName: '', ShopName: '', Address: '', ContractDate: '', EndDate: '', ActiveToken: '', LastTry: '',
    UniqueCode: '', ID: '0', UserID: '0', UserName: '', Password: '', MobileNumber: '',
  });
});

test('A customer update requires RowID; invalid IDs, dates and GUIDs fail before sending', async () => {
  for (const invalid of [{}, { RowID: 0 }, { RowID: '9223372036854775808' }, { RowID: 9007199254740992 }, model({ ID: '9223372036854775808' }), model({ UserID: '1.5' }), model({ UniqueCode: 'invalid' }), model({ EndDate: '2026-02-30' }), model({ ContractDate: 'bad' })]) {
    const { client, calls } = harness(result());
    await assert.rejects(client.updateCustomer(invalid));
    assert.equal(calls.length, 0);
  }
  assert.equal(buildCustomerPayload({ ID: '-9223372036854775808' }).ID, '-9223372036854775808');
});

test('Unquoted .NET long values never pass through lossy Number parsing', async () => {
  const raw = '{"coustomerModels":[{"RowID":9223372036854775807,"ID":9007199254740993,"UserID":9223372036854775806}],"ResaultClass":{"StatusCode":200}}';
  const customer = await harness(raw).client.getCustomerByID('9223372036854775807');
  assert.equal(customer.ID, '9007199254740993');
  assert.equal(customer.UserID, '9223372036854775806');
});

test('Pascal/camel case, nullable dates and legacy .NET dates are supported', async () => {
  const { client } = harness({ CoustomerModels: [{ rowID: '7', rowName: 'نام', userID: '8', id: '0', contractDate: '/Date(0)/' }], resaultClass: { statusCode: 200 } });
  const customer = await client.getCustomerByID('7');
  assert.equal(customer.RowName, 'نام');
  assert.equal(customer.UserID, '8');
  assert.equal(customer.ID, '0');
  assert.equal(customer.ContractDate, '1970-01-01T00:00:00.000Z');
  assert.equal(customer.EndDate, null);
  assert.equal(normalizeCustomer({ rowId: 1, userId: 2 }).UserID, '2');
});

test('Server error codes and malformed lists cannot appear as successful operations', async () => {
  await assert.rejects(harness(result(409, 'مشتری تکراری است')).client.insertCustomer({}), /تکراری/);
  for (const data of [wrapped({}), { coustomerModels: [] }, wrapped([], 500), '<html>not json</html>']) {
    await assert.rejects(harness(data).client.getCustomers());
  }
});

test('Session handling is shared with users; 401 expires, 403 retains and anonymous calls never send', async () => {
  const denied = harness(result(403, 'دسترسی ندارید'), { status: 403 });
  await assert.rejects(denied.client.getCustomers(), /دسترسی/);
  assert.equal(denied.expired.length, 0);
  const expired = harness('Unauthorized', { status: 401 });
  await assert.rejects(expired.client.getCustomers());
  assert.equal(expired.expired.length, 1);
  const anonymous = harness(wrapped([]), { token: null });
  await assert.rejects(anonymous.client.getCustomers());
  assert.equal(anonymous.calls.length, 0);
});

test('Mutation methods can be overridden without moving secrets into query strings', async () => {
  for (const method of ['PUT', 'PATCH']) {
    const config = validateConfig({ apiUrl: '/api', endpoints: { UpdateCoustomer: { method, path: 'Account/UpdateCoustomer' } } });
    const { client, calls } = harness(result(), { config });
    await client.updateCustomer(model());
    assert.equal(calls[0].init.method, method);
    assert.equal(calls[0].url, '/api/Account/UpdateCoustomer');
  }
  assert.throws(() => validateConfig({ apiUrl: '/api', endpoints: { InsertCoustomer: { method: 'GET' } } }));
});


test('Successful null customer list is empty; failure status and missing list still report errors', async () => {
  for (const data of [
    { coustomerModels: null, ResaultClass: { StatusCode: 200, StatusMessage: 'ورود موفق' } },
    { CoustomerModels: null, resaultClass: { statusCode: 200 } },
  ]) {
    assert.deepEqual(await harness(data).client.getCustomers(), []);
    await assert.rejects(harness(data).client.getCustomerByID('1'), /مشتری موردنظر پیدا نشد/);
  }
  await assert.rejects(harness(wrapped(null, 500)).client.getCustomers());
  await assert.rejects(harness({ ResaultClass: result() }).client.getCustomers(), /لیست مشتریان/);
});
