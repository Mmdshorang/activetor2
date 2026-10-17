import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createContractApi, buildContractPayload, normalizeContract } from '../src/services/contractApi.mjs';
import { validateConfig } from '../src/config/userApiConfig.mjs';

const result = (StatusCode = 200, StatusMessage = 'انجام شد') => ({ StatusCode, StatusMessage });
const model = (overrides = {}) => ({
  RowID: '9223372036854775807', Mdate: '2026-10-15T12:30:45.1234567', Fdate: '1405/07/23',
  EndDate: null, Id: '9007199254740993', IsActive: false, FEndDate: '', Name: '', ShopName: '', MobileNumber: '', ...overrides,
});
const wrapped = (contractModels, StatusCode = 200) => ({ contractModels, ResaultClass: result(StatusCode) });
const form = body => Object.fromEntries(new URLSearchParams(body));
function harness(data, { config = validateConfig({ apiUrl: '/api' }), status = 200, token = 'session-token' } = {}) {
  const calls = [], expired = [];
  const client = createContractApi({
    getConfig: async () => config, getToken: () => token, onUnauthorized: () => expired.push(true),
    fetchImpl: async (url, init) => {
      assert.equal(Object.keys(init.headers).some(key => key.toLowerCase() === 'authorization'), false);
      assert.equal(init.headers.Token, token);
      calls.push({ url, init });
      return new Response(typeof data === 'string' ? data : JSON.stringify(data), { status });
    },
  });
  return { client, calls, expired };
}

test('GetAllContract loads every contract without a fabricated body', async () => {
  const { client, calls } = harness(wrapped([model()]));
  assert.deepEqual(await client.getContracts(), [model()]);
  assert.equal(calls[0].url, '/api/GetAllContract');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
});

test('GetContract sends only the selected customer RowID', async () => {
  const customerRowID = '9007199254740993';
  const { client, calls } = harness(wrapped([model()]));
  assert.deepEqual(await client.getContractsByCustomer(customerRowID), [model()]);
  assert.equal(calls[0].url, '/api/GetContract');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(form(calls[0].init.body), { RowID: customerRowID });
  assert.equal(Object.keys(form(calls[0].init.body)).length, 1);
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
});

test('Insert/Update send seven fields and never send removed or response-only fields', async () => {
  for (const update of [false, true]) {
    const { client, calls } = harness(result());
    await (update ? client.updateContract(model({ FactorCount: 9, Name: 'نام', ShopName: 'فروشگاه', MobileNumber: '0912' })) : client.insertContract(model({ FactorCount: 9 })));
    assert.deepEqual(form(calls[0].init.body), {
      RowID: update ? model().RowID : '0', Mdate: model().Mdate, Fdate: model().Fdate,
      EndDate: '', Id: model().Id, IsActive: 'false', FEndDate: '',
    });
    assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  }
});

test('Nullable values and invalid non-ID fields are handled before transport', async () => {
  const empty = harness(result());
  await empty.client.insertContract({});
  assert.deepEqual(form(empty.calls[0].init.body), { RowID: '0', Mdate: '', Fdate: '', EndDate: '', Id: '', IsActive: '', FEndDate: '' });
  for (const input of [{}, model({ RowID: 'not-an-integer' }), model({ Id: '9223372036854775808' }), model({ IsActive: 'false' }), model({ Mdate: '2026-02-30' })]) {
    const sample = harness(result());
    await assert.rejects(sample.client.updateContract(input));
    assert.equal(sample.calls.length, 0);
  }
  assert.equal(Object.hasOwn(buildContractPayload({ FactorCount: 25 }), 'FactorCount'), false);
});

test('Backend contract RowID is accepted without frontend range checks', async () => {
  for (const RowID of ['0', '-1', '9223372036854775808', '999999999999999999999999999999']) {
    const sample = harness(wrapped([model({ RowID })]));
    assert.equal((await sample.client.getContracts())[0].RowID, RowID);

    const update = harness(result());
    await update.client.updateContract(model({ RowID }));
    assert.equal(form(update.calls[0].init.body).RowID, RowID);
  }
});

test('Response fields Name, ShopName and MobileNumber are retained only for display', async () => {
  const raw = { contractModels: [{ ...model(), Name: 'مشتری نمونه', ShopName: 'فروشگاه نمونه', MobileNumber: '09120000000', FactorCount: 3 }], ResaultClass: result() };
  const contract = (await harness(raw).client.getContracts())[0];
  assert.equal(contract.Name, 'مشتری نمونه');
  assert.equal(contract.ShopName, 'فروشگاه نمونه');
  assert.equal(contract.MobileNumber, '09120000000');
  assert.equal(Object.hasOwn(contract, 'FactorCount'), false);
  const update = harness(result());
  await update.client.updateContract(contract);
  assert.equal(form(update.calls[0].init.body).Name, undefined);
});

test('Long identifiers, response casing and .NET dates remain lossless', async () => {
  const raw = '{"ContractModels":[{"rowID":9223372036854775807,"id":9007199254740993,"mdate":"/Date(0)/","isActive":null,"name":"نمونه"}],"resaultClass":{"statusCode":200}}';
  const contract = (await harness(raw).client.getContracts())[0];
  assert.equal(contract.RowID, '9223372036854775807');
  assert.equal(contract.Id, '9007199254740993');
  assert.equal(contract.Mdate, '1970-01-01T00:00:00.000Z');
  assert.equal(contract.Name, 'نمونه');
  assert.throws(() => normalizeContract([]));
});

test('Null lists are empty while malformed and failed responses are errors', async () => {
  assert.deepEqual(await harness(wrapped(null)).client.getContracts(), []);
  assert.deepEqual(await harness(wrapped(null)).client.getContractsByCustomer('1'), []);
  for (const data of [{ ResaultClass: result() }, wrapped({}), wrapped(null, 500), { contractModels: [] }, '<html>bad</html>']) {
    await assert.rejects(harness(data).client.getContracts());
  }
  await assert.rejects(harness(result(409, 'قرارداد تکراری')).client.insertContract({}), /تکراری/);
});

test('Configured GET customer lookup puts only RowID in the query', async () => {
  const config = validateConfig({ apiUrl: '/api', endpoints: { GetContract: { method: 'GET' }, GetAllContract: { method: 'POST' } } });
  const sample = harness(wrapped([]), { config });
  await sample.client.getContracts();
  assert.equal(sample.calls[0].init.method, 'POST');
  assert.equal(sample.calls[0].init.body, undefined);
  await sample.client.getContractsByCustomer('9223372036854775807');
  assert.equal(sample.calls[1].url, '/api/GetContract?RowID=9223372036854775807');
  assert.equal(sample.calls[1].init.body, undefined);
});

test('GetContract wire request has form Content-Type and exactly one RowID', async t => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ request, body });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(wrapped([])));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const apiUrl = `http://127.0.0.1:${server.address().port}`;
  const client = createContractApi({ getConfig: async () => validateConfig({ apiUrl }), getToken: () => 'test-token' });
  await client.getContractsByCustomer('42');
  assert.equal(requests[0].request.method, 'POST');
  assert.equal(requests[0].request.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  assert.equal(requests[0].request.headers.token, 'test-token');
  assert.equal(requests[0].body, 'RowID=42');
});

test('Contracts share session expiry and anonymous-call protection', async () => {
  const expired = harness('Unauthorized', { status: 401 });
  await assert.rejects(expired.client.getContracts());
  assert.equal(expired.expired.length, 1);
  const anonymous = harness(wrapped([]), { token: null });
  await assert.rejects(anonymous.client.getContractsByCustomer('1'));
  assert.equal(anonymous.calls.length, 0);
});
