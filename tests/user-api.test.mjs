import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserApi, parseApiJson, normalizeUser, normalizeRowID, buildUserPayload, serializePayload } from '../src/services/userApi.mjs';
import { validateConfig, createConfigLoader } from '../src/config/userApiConfig.mjs';

// These transport conventions are fixtures, NOT claims about the real server.
const fixtureConfig = () => ({
  baseUrl: 'https://example.invalid/api/Account/', auth: { headerName: 'Token', scheme: '' },
  successStatusCodes: [200], sessionExpiredStatusCodes: [401], timeoutMs: 20000,
  updatePasswordMode: 'required', useTypes: [],
  endpoints: Object.fromEntries(['Login','GetUser','InsertUser','Updateuser','GetUserByID'].map(name => [name,{path:name,method:name === 'GetUser' ? 'GET' : 'POST'}])),
});
const model = (overrides = {}) => ({ RowID: 7, RowName: 'کاربر نمونه', UserName: 'sample', Password: 'secret-from-server', UseType: null, Mobile: '09120000000', Token: 'session-token', IsActive: true, ...overrides });
const result = (code = 200, message = 'انجام شد') => ({StatusCode:code,StatusMessage:message});
const wrapped = (data, code = 200, message) => ({ LoginModel:data, ResaultClass:result(code,message) });
function harness(data, { config = fixtureConfig(), status = 200, fetchImpl } = {}) {
  const calls = []; const invalidated = [];
  const client = createUserApi({ getConfig: async () => config, getToken: () => 'existing-token', onUnauthorized: (...args) => invalidated.push(args), fetchImpl: fetchImpl || (async (url, init) => {calls.push({url,init});return new Response(typeof data === 'string' ? data : JSON.stringify(data), { status });}) });
  return { client,calls,invalidated };
}

// Decode independently of qs so the tests check what a form-reading server sees.
const readForm = body => Object.fromEntries(new URLSearchParams(body));
const emptyModelForm = (overrides = {}) => ({
  RowID: '0', RowName: '', UserName: '', Password: '', UseType: '',
  Mobile: '', Token: '', IsActive: 'false', ...overrides,
});

test('Login sends all eight form fields, no stored auth, and strips server secrets', async () => {
  const {client,calls} = harness(wrapped(model()));
  const session = await client.login(' sample ', ' pass ');
  assert.deepEqual(readForm(calls[0].init.body), emptyModelForm({UserName:'sample',Password:' pass '}));
  assert.equal(calls[0].init.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  assert.equal(calls[0].init.headers.Authorization,undefined);
  assert.equal(calls[0].url,'https://example.invalid/api/Account/Login');
  assert.equal(session.token,'session-token');
  assert.equal(session.user.Password,undefined); assert.equal(session.user.Token,undefined);
  assert.equal(session.user.role,undefined); assert.equal(session.user.UseType,null);
});
test('Login rejects application failure even under HTTP 200', async () => {
  await assert.rejects(harness(wrapped(model(),500,'اطلاعات ورود اشتباه است')).client.login('a','b'),/اطلاعات ورود اشتباه است/);
});
test('Login rejects missing token and inactive accounts', async () => {
  await assert.rejects(harness(wrapped(model({Token:''}))).client.login('a','b'),/توکن/);
  await assert.rejects(harness(wrapped(model({IsActive:false}))).client.login('a','b'),/غیرفعال/);
});
test('GetUser has no input and attaches configured token header', async () => {
  const config=fixtureConfig();config.auth={headerName:'Token',scheme:''};
  const {client,calls}=harness(wrapped([model()]),{config});
  const users=await client.getUsers();
  assert.equal(calls[0].init.method,'GET');assert.equal(calls[0].init.body,undefined);
  assert.equal(calls[0].init.headers['Content-Type'],undefined);
  assert.equal(calls[0].init.headers.Token,'existing-token');assert.equal(users[0].RowID,'7');
});
test('GetUser can be configured as POST without a fabricated payload', async () => {
  const config=fixtureConfig();config.endpoints.GetUser.method='POST';
  const {client,calls}=harness(wrapped([]),{config});assert.deepEqual(await client.getUsers(),[]);
  assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.body,undefined);
});
test('GetUserByID sends the complete form with RowID and selects the requested row', async () => {
  const {client,calls}=harness(wrapped([model({RowID:9}),model()]));
  assert.equal((await client.getUserByID('7')).RowID,'7');
  assert.deepEqual(readForm(calls[0].init.body),emptyModelForm({RowID:'7'}));
});
test('GetUserByID supports configured GET query transport', async () => {
  const config=fixtureConfig();config.endpoints.GetUserByID.method='GET';
  const {client,calls}=harness(wrapped([model()]),{config});await client.getUserByID(7);
  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname,'https://example.invalid/api/Account/GetUserByID');
  assert.deepEqual(Object.fromEntries(url.searchParams),emptyModelForm({RowID:'7'}));
  assert.equal(calls[0].init.body,undefined);
  assert.equal(calls[0].init.headers['Content-Type'],undefined);
});
test('Unknown user is reported instead of editing a different record', async () => {
  await assert.rejects(harness(wrapped([model({RowID:10})])).client.getUserByID(7),/پیدا نشد/);
});
test('InsertUser uses the exact model, nullable UseType and no role/permissions', async () => {
  const {client,calls}=harness(result());await client.insertUser(model({UseType:''}));
  const payload=readForm(calls[0].init.body);
  assert.deepEqual(Object.keys(payload).sort(),['RowID','RowName','UserName','Password','UseType','Mobile','Token','IsActive'].sort());
  assert.deepEqual(payload, {
    RowID:'0', RowName:'کاربر نمونه', UserName:'sample', Password:'secret-from-server',
    UseType:'', Mobile:'09120000000', Token:'session-token', IsActive:'true',
  });
  assert.equal(calls[0].init.headers.Token,'existing-token');
  assert.ok(calls[0].url.endsWith('/InsertUser'));
});
test('Updateuser preserves RowID, nullable type and explicit inactive state', async () => {
  const {client,calls}=harness(result());await client.updateUser(model({IsActive:false,UseType:0}));
  const payload=readForm(calls[0].init.body);
  assert.deepEqual(payload, {
    RowID:'7', RowName:'کاربر نمونه', UserName:'sample', Password:'secret-from-server',
    UseType:'0', Mobile:'09120000000', Token:'session-token', IsActive:'false',
  });
  assert.ok(calls[0].url.endsWith('/Updateuser'));
});
test('Form encoding round-trips Persian text and reserved characters without adding fields', async () => {
  const userName = 'علی + &=?#%';
  const password = ' رمز + & = % ? # / \\ 🗝️ ';
  const {client,calls}=harness(wrapped(model()));
  await client.login(userName,password);
  assert.deepEqual(readForm(calls[0].init.body),emptyModelForm({UserName:userName,Password:password}));
  assert.ok(calls[0].init.body.includes('%2B'));
  assert.ok(calls[0].init.body.includes('%26'));
  assert.equal(calls[0].init.body.split('&').length,8);
  assert.equal(calls[0].init.body.includes(password),false);
});
test('Empty model fields stay in inserted forms without copying the session token into the user', async () => {
  const {client,calls}=harness(result());
  await client.insertUser({UserName:'new',Password:'pass',IsActive:true});
  assert.deepEqual(readForm(calls[0].init.body),emptyModelForm({UserName:'new',Password:'pass',IsActive:'true'}));
  assert.equal(calls[0].init.headers.Token,'existing-token');
});
test('Configured PUT and PATCH updates use the same complete form transport', async () => {
  for(const method of ['PUT','PATCH']) {
    const config=fixtureConfig();config.endpoints.Updateuser.method=method;
    const {client,calls}=harness(result(),{config});await client.updateUser(model({RowID:'9223372036854775807'}));
    assert.equal(calls[0].init.method,method);
    assert.equal(calls[0].init.headers['Content-Type'],'application/x-www-form-urlencoded;charset=UTF-8');
    assert.equal(readForm(calls[0].init.body).RowID,'9223372036854775807');
    assert.equal(Object.keys(readForm(calls[0].init.body)).length,8);
  }
});
test('Mutation does not report success when result code fails', async () => {
  await assert.rejects(harness(result(409,'نام کاربری تکراری است')).client.insertUser(model()),/تکراری/);
});
test('Blank edit passwords are blocked unless backend semantics are explicitly configured', async () => {
  const sample=model({Password:''});
  await assert.rejects(harness(result()).client.updateUser(sample),/رمز عبور/);
  const config=fixtureConfig();config.updatePasswordMode='empty';
  const {client,calls}=harness(result(),{config});await client.updateUser(sample);
  const payload=readForm(calls[0].init.body);
  assert.equal(Object.keys(payload).length,8);
  assert.equal(payload.Password,'');
  assert.throws(()=>validateConfig({apiUrl:'/api',updatePasswordMode:'omit'}),/updatePasswordMode/);
});
test('64-bit IDs survive JSON responses and are sent as exact decimal form values', async () => {
  const raw='{"LoginModel":[{"RowID":9223372036854775807,"RowName":"x","UserName":"x","UseType":null,"Mobile":"","IsActive":true}],"ResaultClass":{"StatusCode":200}}';
  const {client,calls}=harness(raw);
  const user=await client.getUserByID('9223372036854775807');
  assert.equal(user.RowID,'9223372036854775807');
  assert.deepEqual(readForm(calls[0].init.body),emptyModelForm({RowID:'9223372036854775807'}));
  assert.equal(parseApiJson('{"text":"9223372036854775807","n":9223372036854775807}').text,'9223372036854775807');
  assert.deepEqual(readForm(serializePayload({RowID:'9007199254740993',RowName:'RowID'})),emptyModelForm({RowID:'9007199254740993',RowName:'RowID'}));
});
test('Invalid, out-of-range and already-rounded RowID values are rejected', () => {
  for (const id of [0,-1,'1.2','1e3','9223372036854775808',Number('9007199254740993'),'abc']) assert.throws(()=>normalizeRowID(id));
});
test('camelCase response fields are accepted', async () => {
  const raw={loginModel:[{rowID:1,rowName:'x',userName:'y',useType:0,mobile:'',isActive:true}],resaultClass:{statusCode:200,statusMessage:'ok'}};
  assert.equal((await harness(raw).client.getUsers())[0].UseType,0);
});
test('Missing result envelope/status, invalid lists, or invalid users are errors', async () => {
  for(const raw of [{LoginModel:[]},wrapped(null),wrapped({}),wrapped([model({IsActive:'false'})]),wrapped([model({UseType:'admin'})])]) {
    await assert.rejects(harness(raw).client.getUsers());
  }
});
test('HTML response is not mistaken for API success', async () => {
  await assert.rejects(harness('<html>index</html>').client.getUsers(),/JSON/);
});
test('401 expires a protected session even when response body is HTML', async () => {
  const {client,invalidated}=harness('<html>Unauthorized</html>',{status:401});
  await assert.rejects(client.getUsers());assert.equal(invalidated.length,1);
});
test('403 retains session and returns the permission message', async () => {
  const {client,invalidated}=harness(result(403,'دسترسی ندارید'),{status:403});
  await assert.rejects(client.getUsers(),/دسترسی ندارید/);assert.equal(invalidated.length,0);
});
test('Configured application expiry expires session under HTTP 200', async () => {
  const {client,invalidated}=harness(wrapped([],401,'نشست منقضی شد'));
  await assert.rejects(client.getUsers(),/منقضی/);assert.equal(invalidated.length,1);
});
test('Failed login does not invoke protected-session invalidation', async () => {
  const {client,invalidated}=harness(result(401),{status:401});
  await assert.rejects(client.login('a','b'));assert.equal(invalidated.length,0);
});
test('Protected calls require a session and never send an anonymous request', async () => {
  let fetched=false,expired=false;
  const client=createUserApi({getConfig:async()=>fixtureConfig(),onUnauthorized:()=>{expired=true},fetchImpl:async()=>{fetched=true}});
  await assert.rejects(client.getUsers());assert.equal(fetched,false);assert.equal(expired,true);
});
test('Network errors and timeout are actionable errors; cancellation stays cancellation', async () => {
  await assert.rejects(harness(null,{fetchImpl:async()=>{throw new TypeError('failed')}}).client.getUsers(),/ارتباط/);
  const config=fixtureConfig();config.timeoutMs=10;
  const fetchImpl=async(_,init)=>new Promise((_,reject)=>{
    const abort=()=>reject(new DOMException('Aborted','AbortError'));
    if(init.signal.aborted) abort();else init.signal.addEventListener('abort',abort,{once:true});
  });
  await assert.rejects(harness(null,{config,fetchImpl}).client.getUsers(),/زمان/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(harness(null,{fetchImpl}).client.getUsers({signal:controller.signal}),{name:'AbortError'});
});
test('UseType int range, empty username and empty insert password validated before requests', () => {
  for(const data of [model({UseType:1.1}),model({UseType:2147483648}),model({UserName:' '}),model({Password:''})]) assert.throws(()=>buildUserPayload(data));
  assert.equal(normalizeUser(model()).Password,undefined);
});
test('Only a missing API address blocks a minimal config', () => {
  assert.throws(()=>validateConfig({}),/آدرس API.*baseUrl/);
  assert.equal(validateConfig(fixtureConfig()).successStatusCodes[0],200);
});
test('Endpoint validation blocks GET credentials, absolute paths and ambiguous codes', () => {
  for(const modify of [c=>c.endpoints.Login.method='GET',c=>c.endpoints.GetUser.path='https://evil.invalid',c=>c.sessionExpiredStatusCodes=[200]]) {
    const config=fixtureConfig();modify(config);assert.throws(()=>validateConfig(config));
  }
});
test('Config loading failure is retryable and successful config is shared', async () => {
  let count=0;
  const load=createConfigLoader('/config',async()=>{count++;return new Response(JSON.stringify(fixtureConfig()),{status:count===1?404:200});});
  await assert.rejects(load());await Promise.all([load(),load()]);assert.equal(count,2);
});


test('A single baseUrl fills all transport defaults without mutating input', () => {
  const input = {baseUrl:'https://example.invalid/api/Account'};
  const config = validateConfig(input);
  assert.deepEqual(input,{baseUrl:'https://example.invalid/api/Account'});
  assert.deepEqual(config.auth,{headerName:'Token',scheme:''});
  assert.deepEqual(config.successStatusCodes,[200]);
  assert.equal(config.timeoutMs,20000);
  assert.equal(config.endpoints.GetUser.method,'GET');
  for(const name of ['Login','InsertUser','Updateuser','GetUserByID']) {
    assert.equal(config.endpoints[name].path,name);
    assert.equal(config.endpoints[name].method,'POST');
  }
});

test('Previously shipped blank optional fields fall back after setting baseUrl', () => {
  const config = validateConfig({
    baseUrl:'http://localhost:8091',auth:{headerName:'',scheme:''},successStatusCodes:[],
    endpoints:Object.fromEntries(['Login','GetUser','InsertUser','Updateuser','GetUserByID'].map(name=>[name,{path:name,method:''}]))
  });
  assert.equal(config.auth.scheme,'');
  assert.equal(config.endpoints.Login.method,'POST');
  assert.deepEqual(config.successStatusCodes,[200]);
});

test('Optional partial overrides preserve defaults and raw Token authentication', () => {
  const config = validateConfig({baseUrl:'/api',auth:{headerName:'Token',scheme:''},endpoints:{GetUser:{method:'post'}},successStatusCodes:[0]});
  assert.deepEqual(config.auth,{headerName:'Token',scheme:''});
  assert.equal(config.endpoints.GetUser.method,'POST');
  assert.equal(config.endpoints.GetUser.path,'GetUser');
  assert.equal(config.endpoints.Login.method,'POST');
  assert.deepEqual(config.successStatusCodes,[0]);
});

test('All five operations route through the one supplied base URL', async () => {
  const config = validateConfig({baseUrl:'  https://example.invalid/api/Account/  '});
  const calls = [];
  const client = createUserApi({
    getConfig:async()=>config,getToken:()=> 'token',fetchImpl:async(url,init)=>{
      calls.push({url,init});
      const name = url.split('/').at(-1);
      const data = name==='Login' ? wrapped(model()) : ['GetUser','GetUserByID'].includes(name) ? wrapped([model()]) : result();
      return new Response(JSON.stringify(data),{status:200});
    }
  });
  await client.login('sample','password');
  await client.getUsers();
  await client.insertUser(model());
  await client.updateUser(model());
  await client.getUserByID(7);
  assert.deepEqual(calls.map(call=>call.url),['Login','GetUser','InsertUser','Updateuser','GetUserByID'].map(name=>'https://example.invalid/api/Account/'+name));
  assert.deepEqual(calls.map(call=>call.init.method),['POST','GET','POST','POST','POST']);
  assert.equal(calls[0].init.headers.Authorization,undefined);
  for(const call of calls.slice(1)) assert.equal(call.init.headers.Token,'token');
});

test('Malformed address and optional overrides report errors rather than crashing', () => {
  for(const baseUrl of ['localhost:8091','//host/path','https://host/path?token=x','https://host/#fragment','https://host/a b','https://host:bad','https://user:password@host']) assert.throws(()=>validateConfig({baseUrl}),/baseUrl/);
  for(const input of [{successStatusCodes:'200'},{sessionExpiredStatusCodes:'401'},{useTypes:[null]}]) assert.throws(()=>validateConfig({baseUrl:'/api',...input}),/تنظیمات اختیاری/);
});

test('Malformed JSON has a useful error and does not poison configuration retries', async () => {
  let count=0;
  const load=createConfigLoader('/user-api.config.json',async()=>new Response(++count===1?'not-json':JSON.stringify({baseUrl:'/api'})));
  await assert.rejects(load(),/JSON معتبر/);
  assert.equal((await load()).baseUrl,'/api');
});


test('The user-provided apiUrl is accepted with defaults', () => {
  const input = {apiUrl:'https://192.168.1.16:2002'};
  const config = validateConfig(input);
  assert.equal(config.baseUrl,'https://192.168.1.16:2002');
  assert.deepEqual(config.auth,{headerName:'Token',scheme:''});
  assert.equal(config.endpoints.Login.method,'POST');
});

test('apiUrl takes precedence and blank aliases do not mask a valid address', () => {
  assert.equal(validateConfig({apiUrl:'  ',baseUrl:'https://example.invalid/api'}).baseUrl,'https://example.invalid/api');
  assert.equal(validateConfig({apiUrl:'  https://example.invalid/new  ',baseUrl:'https://example.invalid/old'}).baseUrl,'https://example.invalid/new');
});

test('The packaged config loads and sends login to its configured API address', async () => {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(new URL('../public/user-api.config.json',import.meta.url),'utf8');
  const requests = [];
  const load = createConfigLoader('/user-api.config.json',async (url,init) => {
    requests.push({url,init});
    return new Response(raw,{status:200});
  });
  const client = createUserApi({getConfig:load,fetchImpl:async(url,init)=>{
    requests.push({url,init});
    return new Response(JSON.stringify(wrapped(model())),{status:200});
  }});
  const session = await client.login('sample','test-password');
  assert.equal(requests[0].url,'/user-api.config.json');
  assert.equal(requests[0].init.cache,'no-store');
  assert.equal(requests[1].url,`${JSON.parse(raw).apiUrl.replace(/\/+$/, '')}/Login`);
  assert.equal(requests[1].init.method,'POST');
  assert.equal(session.token,'session-token');
});
