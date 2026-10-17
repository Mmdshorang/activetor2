import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createContractApi, buildContractPayload, normalizeContract } from '../src/services/contractApi.mjs';
import { validateConfig } from '../src/config/userApiConfig.mjs';

const result = (StatusCode = 200, StatusMessage = 'انجام شد') => ({ StatusCode, StatusMessage });
const model = (overrides = {}) => ({ RowID: '9223372036854775807', Mdate: '2026-10-15T12:30:45.1234567', Fdate: '1405/07/23', EndDate: null, Id: '9007199254740993', IsActive: false, FEndDate: '', ...overrides });
const wrapped = (contractModels, StatusCode = 200) => ({ contractModels, ResaultClass: result(StatusCode) });
const form = body => Object.fromEntries(new URLSearchParams(body));
function harness(data, { config = validateConfig({ apiUrl: '/api' }), status = 200, token = 'session-token' } = {}) {
  const calls = [], expired = [];
  const client = createContractApi({ getConfig: async () => config, getToken: () => token, onUnauthorized: () => expired.push(true), fetchImpl: async (url, init) => {
    assert.equal(Object.keys(init.headers).some(key => key.toLowerCase() === 'authorization'), false);
    assert.equal(init.headers.Token, token);
    calls.push({ url, init });
    return new Response(typeof data === 'string' ? data : JSON.stringify(data), { status });
  } });
  return { client, calls, expired };
}

test('GetContract has no body but declares form Content-Type for ContractModel binding', async () => {
  const { client, calls } = harness(wrapped([model()]));
  assert.deepEqual(await client.getContracts(), [model()]);
  assert.equal(calls[0].url, '/api/GetContract');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
});

test('GetContractByID sends only RowID and selects the matching contract', async () => {
  const { client, calls } = harness(wrapped([model({ RowID: '5' }), model()]));
  assert.deepEqual(await client.getContractByID(model().RowID), model());
  assert.equal(calls[0].url, '/api/GetContractByID');
  assert.deepEqual(form(calls[0].init.body), { RowID: model().RowID });
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  await assert.rejects(harness(wrapped([model()])).client.getContractByID('2'), /قرارداد موردنظر پیدا نشد/);
});

test('Insert/Update send all seven remaining model fields including false, zero and nullable values', async () => {
  for (const update of [false, true]) {
    const { client, calls } = harness(result());
    const message = await (update ? client.updateContract(model()) : client.insertContract(model()));
    assert.equal(message, 'انجام شد');
    assert.equal(calls[0].url, `/api/${update ? 'UpdateContract' : 'InsertContract'}`);
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(form(calls[0].init.body), { ...model(), RowID: update ? model().RowID : '0', EndDate: '', IsActive: 'false' });
    assert.equal(Object.keys(form(calls[0].init.body)).length, 7);
    assert.equal(form(calls[0].init.body).ID, undefined);
    assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  }
});

test('Unset nullable bool/long/date fields remain empty; true/false/null stay distinct', async () => {
  const { client, calls } = harness(result());
  await client.insertContract({});
  assert.deepEqual(form(calls[0].init.body), { RowID: '0', Mdate: '', Fdate: '', EndDate: '', Id: '', IsActive: '', FEndDate: '' });
  for (const IsActive of [true, false, null]) assert.equal(buildContractPayload({ IsActive }).IsActive, IsActive);
  assert.equal(buildContractPayload({ Id: 0, FactorCount: '0' }).Id, '0');
  assert.equal(Object.hasOwn(buildContractPayload({ FactorCount: 25 }), 'FactorCount'), false);
});

test('Invalid update ID, long overflow, bool values and invalid dates fail before a request', async () => {
  for (const input of [{}, { RowID: 0 }, model({ RowID: 9007199254740992 }), model({ RowID: '9223372036854775808' }), model({ Id: '9223372036854775808' }), model({ IsActive: 'false' }), model({ Mdate: '2026-02-30' }), model({ EndDate: 'bad' })]) {
    const { client, calls } = harness(result());
    await assert.rejects(client.updateContract(input));
    assert.equal(calls.length, 0);
  }
});

test('Long identifiers are lossless in responses and Id remains independent of RowID', async () => {
  const raw = '{"contractModels":[{"RowID":9223372036854775807,"Id":9007199254740993,"IsActive":null,"FactorCount":null}],"ResaultClass":{"StatusCode":200}}';
  const contract = await harness(raw).client.getContractByID('9223372036854775807');
  assert.equal(contract.RowID, '9223372036854775807');
  assert.equal(contract.Id, '9007199254740993');
  assert.equal(contract.IsActive, null);
  assert.equal(Object.hasOwn(contract, 'FactorCount'), false);
});

test('Response casing, legacy .NET dates and existing Fdate/FEndDate strings are preserved', async () => {
  const raw = { ContractModels: [{ rowId: '1', mdate: '/Date(0)/', fdate: 'تاریخ + &', endDate: null, id: '0', factorCount: 0, isActive: false, fEndDate: 'پایان =' }], resaultClass: { statusCode: 200 } };
  const { client } = harness(raw);
  const contract = await client.getContractByID('1');
  assert.equal(contract.Mdate, '1970-01-01T00:00:00.000Z');
  assert.equal(contract.Id, '0');
  assert.equal(contract.Fdate, 'تاریخ + &');
  const insert = harness(result()); await insert.client.insertContract(contract);
  assert.equal(form(insert.calls[0].init.body).FEndDate, 'پایان =');
  assert.throws(() => normalizeContract([]));
});

test('Successful null contracts list is empty, but application failures and malformed lists are errors', async () => {
  for (const value of [wrapped(null), { ContractModels: null, ResaultClass: result() }]) {
    assert.deepEqual(await harness(value).client.getContracts(), []);
    await assert.rejects(harness(value).client.getContractByID('1'), /پیدا نشد/);
  }
  for (const data of [{ ResaultClass: result() }, wrapped({}), wrapped(null, 500), { contractModels: [] }, '<html>bad</html>']) await assert.rejects(harness(data).client.getContracts());
  await assert.rejects(harness(result(409, 'قرارداد تکراری')).client.insertContract({}), /تکراری/);
});

test('Contract methods support configured transports without fabricated list inputs', async () => {
  let config = validateConfig({ apiUrl: '/api', endpoints: { GetContract: { method: 'POST' }, GetContractByID: { method: 'GET' } } });
  const list = harness(wrapped([model()]), { config });
  await list.client.getContracts();
  assert.equal(list.calls[0].init.method, 'POST'); assert.equal(list.calls[0].init.body, undefined);
  assert.equal(list.calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  await list.client.getContractByID(model().RowID);
  assert.equal(list.calls[1].url, '/api/GetContractByID?RowID=9223372036854775807'); assert.equal(list.calls[1].init.body, undefined);
  for (const method of ['PUT', 'PATCH']) {
    config = validateConfig({ apiUrl: '/api', endpoints: { UpdateContract: { method } } });
    const update = harness(result(), { config }); await update.client.updateContract(model());
    assert.equal(update.calls[0].init.method, method);
    assert.equal(Object.keys(form(update.calls[0].init.body)).length, 7);
  }
  assert.throws(() => validateConfig({ apiUrl: '/api', endpoints: { InsertContract: { method: 'GET' } } }));
});

test('Contracts share 401 expiry, retained 403 sessions and anonymous-call protection', async () => {
  const denied = harness(result(403), { status: 403 }); await assert.rejects(denied.client.getContracts()); assert.equal(denied.expired.length, 0);
  const expired = harness('Unauthorized', { status: 401 }); await assert.rejects(expired.client.getContracts()); assert.equal(expired.expired.length, 1);
  const anonymous = harness(wrapped([]), { token: null }); await assert.rejects(anonymous.client.getContracts()); assert.equal(anonymous.calls.length, 0);
});


test('GetContract sends Content-Type over real HTTP to avoid the missing-media-type 415', async t => {
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const supported = request.headers['content-type'] === 'application/x-www-form-urlencoded;charset=UTF-8';
    response.writeHead(supported ? 200 : 415, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(supported ? wrapped([]) : { Message: 'No Content-Type header' }));
    if (supported) {
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.token, 'test-token');
      assert.equal(body, '');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const apiUrl = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${apiUrl}/GetContract`)).status, 415);
  const client = createContractApi({ getConfig: async () => validateConfig({ apiUrl }), getToken: () => 'test-token' });
  assert.deepEqual(await client.getContracts(), []);
});

test('Nearby long contract IDs do not select the wrong record through Number rounding', async () => {
  const requested = model({ RowID: '9223372036854775806' });
  const { client } = harness(wrapped([model(), requested]));
  assert.equal((await client.getContractByID(requested.RowID)).RowID, requested.RowID);
});
