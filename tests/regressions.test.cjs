const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const root = process.env.OOMNI_TEST_ROOT || path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const clientScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const product = { id: 'p1', name: 'Sepatu', price: 150000, status: 'active' };
function dataDir(t) {
  const parent = path.resolve(__dirname, '.tmp');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'oomni-regression-'));
  t.after(() => {
    const resolved = path.resolve(dir);
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('oomni-regression-')) throw new Error('unsafe cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return dir;
}
function backend(t, options = {}) {
  const dir = options.dir || dataDir(t);
  if (!options.dir && !options.fresh) fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify({ products: [product], catalogInitialized: true }));
  let handler;
  const context = vm.createContext({
    require: name => name === 'node:http' ? { createServer: fn => { handler = fn; return { listen() {} }; } } : name.startsWith('./') ? require(path.join(root,name)) : require(name),
    __dirname: root, process: { env: { OOMNI_DATA_DIR: dir, ...options.env }, pid: process.pid },
    Buffer, URL, AbortController, setTimeout, clearTimeout, console: { log() {}, error() {} },
    fetch: options.fetch || (async () => { throw new Error('External network disabled during tests'); })
  });
  vm.runInContext(source + '\nglobalThis.api={sessions,normalizeProductSearchIntent,parseProductSearchIntent,rankProductSearch};', context);
  const token = 'a'.repeat(43); context.api.sessions.set(token, Date.now() + 60000);
  async function request(method, url, body, admin = false, extra = {}) {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { method, url, headers: { host: 'test.local', 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...(admin ? { authorization: 'Bearer ' + token } : {}), ...extra }, socket: { remoteAddress: '127.0.0.1' } });
    return new Promise((resolve, reject) => {
      let status; const headers = {};
      const res = { headersSent: false, setHeader(k, v) { headers[k] = v; }, writeHead(code, h) { status = code; Object.assign(headers, h); this.headersSent = true; }, end(body) { let data; try { data = JSON.parse(body); } catch { data = String(body || ''); } resolve({ status, data, headers }); } };
      Promise.resolve(handler(req, res)).catch(reject);
    });
  }
  return { request, dir, api: context.api };
}
const clone = value => JSON.parse(JSON.stringify(value));
function state(value) { return clone({ products: value.products || [], reports: value.reports || [], reviews: value.reviews || {}, productHistory: value.productHistory || [], storefrontCategories: value.storefrontCategories || [] }); }
function clientFunction(name) {
  const start = clientScript.search(new RegExp('      (?:async )?function ' + name + '\\('));
  assert.ok(start >= 0, 'missing function ' + name);
  const rest = clientScript.slice(start);
  const firstLine = rest.split('\n')[0];
  if (firstLine.trim().endsWith('}')) return firstLine;
  const closing = rest.indexOf('\n      }');
  if (closing >= 0) return rest.slice(0, closing + 8);
  const next = rest.slice(1).search(/\n      (?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
function client(context, names) { vm.createContext(context); for (const name of names) vm.runInContext(clientFunction(name), context); return context; }
function storage() { const values = new Map(); return { values, setItem(k, v) { values.set(k, v); }, getItem(k) { return values.get(k) || null; }, removeItem(k) { values.delete(k); } }; }
const noops = { renderProducts() {}, refreshAdmin() {}, renderAdminAnalytics() {}, renderDevelopmentOrders() {}, renderDevelopmentConsultations() {}, renderResellerSubscriptions() {}, renderCustomerServiceInquiries() {}, refreshAdminReviews() {}, refreshAdminReports() {} };

test('frontend/backend syntax, CSP hashes and static DOM identifiers', () => {
  new vm.Script(source); new vm.Script(clientScript);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const tag of ['script', 'style']) for (const match of html.matchAll(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'gi'))) assert.ok(csp.includes('sha256-' + crypto.createHash('sha256').update(match[1]).digest('base64')));
  const ids = [...html.slice(0, html.indexOf('<script>')).matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of clientScript.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) assert.ok(ids.includes(match[1]), match[1]);
});

test('stale product save preserves visitor reports and reviews', async t => {
  const { request } = backend(t); const base = state((await request('GET', '/api/admin/state', undefined, true)).data);
  assert.equal((await request('POST', '/api/reports', { message: 'Laporan baru pengunjung' })).status, 201);
  assert.equal((await request('POST', '/api/reviews', { productId: 'p1', comment: 'Ulasan baru' })).status, 201);
  const desired = clone(base); desired.products[0].name = 'Sepatu diedit';
  const saved = await request('PUT', '/api/admin/state', { ...desired, baseState: base }, true);
  assert.equal(saved.status, 200); const live = (await request('GET', '/api/admin/state', undefined, true)).data;
  assert.equal(live.reports.length, 1); assert.equal(live.reviews.p1.length, 1); assert.equal(live.products[0].name, 'Sepatu diedit');
});

test('concurrent edits conflict atomically; old clients cannot replace full state', async t => {
  const { request } = backend(t), base = state((await request('GET', '/api/admin/state', undefined, true)).data);
  const first = clone(base); first.products[0].name = 'Admin A';
  assert.equal((await request('PUT', '/api/admin/state', { ...first, baseState: base }, true)).status, 200);
  const second = clone(base); second.products[0].name = 'Admin B'; second.reports = [{ id: 'new', message: 'Should not be partly saved' }];
  assert.equal((await request('PUT', '/api/admin/state', { ...second, baseState: base }, true)).status, 409);
  assert.equal((await request('PUT', '/api/admin/state', base, true)).status, 409);
  const live = (await request('GET', '/api/admin/state', undefined, true)).data;
  assert.equal(live.products[0].name, 'Admin A'); assert.equal(live.reports.length, 0);
});

test('moderation, deletion and independent product edits merge correctly', async t => {
  const { request } = backend(t);
  await request('POST', '/api/reports', { message: 'Existing customer report' });
  let base = state((await request('GET', '/api/admin/state', undefined, true)).data);
  const desired = clone(base); desired.reports[0].status = 'resolved';
  await request('POST', '/api/reports', { message: 'Another customer report' });
  assert.equal((await request('PUT', '/api/admin/state', { ...desired, baseState: base }, true)).status, 200);
  let live = (await request('GET', '/api/admin/state', undefined, true)).data; assert.equal(live.reports.length, 2); assert.equal(live.reports.find(r => r.id === base.reports[0].id).status, 'resolved');
  base = state(live); const removed = clone(base); removed.reports = removed.reports.filter(r => r.id !== base.reports[0].id);
  assert.equal((await request('PUT', '/api/admin/state', { ...removed, baseState: base }, true)).status, 200);
  live = (await request('GET', '/api/admin/state', undefined, true)).data; assert.equal(live.reports.length, 1);
});

test('corrupt and structurally invalid stores stop startup and remain untouched', t => {
  for (const value of ['{corrupt', '{"products":null}', 'null']) {
    const dir = dataDir(t), file = path.join(dir, 'store.json'); fs.writeFileSync(file, value);
    assert.throws(() => backend(t, { dir }), /Unable to safely load store/); assert.equal(fs.readFileSync(file, 'utf8'), value);
  }
});

test('fresh store permits one authenticated catalog migration; deliberate empty catalog stays initialized', async t => {
  const { request } = backend(t, { fresh: true });
  assert.equal((await request('GET', '/api/products')).data.catalogInitialized, false);
  const base = state((await request('GET', '/api/admin/state', undefined, true)).data), desired = { ...base, products: [product] };
  assert.equal((await request('PUT', '/api/admin/state', { ...desired, baseState: base, initializeCatalog: true })).status, 401);
  assert.equal((await request('PUT', '/api/admin/state', { ...desired, baseState: base, initializeCatalog: true }, true)).status, 200);
  assert.equal((await request('PUT', '/api/admin/state', { ...desired, baseState: base, initializeCatalog: true }, true)).status, 409);
  const current = state((await request('GET', '/api/admin/state', undefined, true)).data);
  assert.equal((await request('PUT', '/api/admin/state', { ...current, products: [], baseState: current }, true)).status, 200);
  const empty = (await request('GET', '/api/products')).data; assert.equal(empty.products.length, 0); assert.equal(empty.catalogInitialized, true);
});

test('AI absent upper price remains unbounded and matching products are returned', t => {
  const { api } = backend(t), query = 'sepatu di atas 100rb', fallback = api.parseProductSearchIntent(query);
  const intent = api.normalizeProductSearchIntent({ keywords: ['sepatu'], minPrice: 100000, maxPrice: null }, fallback, query);
  assert.equal(intent.maxPrice, null); assert.equal(intent.minPrice, 100000); assert.equal(api.rankProductSearch([product], intent).length, 1);
});

test('legacy catalog backup survives public bootstrap and failed migration', async () => {
  const legacy = state({ products: [product] }), localStorage = storage();
  const ctx = client({ ...noops, products: clone(legacy.products), reports: [], reviews: {}, productHistory: [], storefrontCategories: [], legacyAdminState: legacy, LEGACY_BACKUP_KEY: 'legacy', STORAGE_KEY: 'products', localStorage, document: { getElementById() { return null; } }, fetch: async () => ({ ok: true, json: async () => ({ products: [], catalogInitialized: false }) }), backendRequest: async () => ({ ok: false, status: 409 }), readApiJson: async () => ({}) }, ['adminStateSnapshot', 'bootstrapBackend', 'migrateLegacyCatalog']);
  await ctx.bootstrapBackend(); assert.equal(JSON.parse(localStorage.getItem('legacy')).products.length, 1);
  await assert.rejects(ctx.migrateLegacyCatalog({ catalogInitialized: false }), /cadangan/i); assert.equal(JSON.parse(localStorage.getItem('legacy')).products.length, 1);
  let called = false; ctx.backendRequest = async () => { called = true; };
  await ctx.migrateLegacyCatalog({ catalogInitialized: true, products: [] }); assert.equal(called, false);
});

test('successful migration includes existing server reports and clears backup only after confirmation', async () => {
  const legacy = state({ products: [product], reports: [{ id: 'old', message: 'Legacy report' }] }), remote = { ...state({ reports: [{ id: 'new', message: 'Remote report' }] }), catalogInitialized: false }, localStorage = storage();
  let sent;
  const ctx = client({ legacyAdminState: legacy, localStorage, LEGACY_BACKUP_KEY: 'legacy', backendRequest: async (url, options) => { sent = JSON.parse(options.body); return { ok: true }; }, readApiJson: async () => ({ state: { ...sent, catalogInitialized: true } }) }, ['adminStateSnapshot', 'migrateLegacyCatalog']);
  const result = await ctx.migrateLegacyCatalog(remote); assert.equal(result.reports.length, 2); assert.equal(sent.products.length, 1); assert.equal(localStorage.getItem('legacy'), null);
});

test('polling updates reports and reviews but skips while admin changes are pending', async () => {
  const remote = { ...state({ reports: [{ id: 'r', message: 'new' }], reviews: { p1: [{ id: 'v', comment: 'new' }] } }) };
  const ctx = client({ ...noops, ...state({}), backendAdminSession: true, backendPendingSyncs: 0, backendSyncBlocked: false, lastNotificationTimestamp: 0, localStorage: storage(), STORAGE_KEY: 'p', REPORTS_STORAGE_KEY: 'r', REVIEWS_KEY: 'v', PRODUCT_HISTORY_KEY: 'h', backendRequest: async url => ({ ok: true, json: async () => url.includes('notifications') ? { notifications: [] } : remote }), showToast() {} }, ['backendStatePayload', 'adminStateSnapshot', 'applyBackendAdminState', 'pollNotifications']);
  await ctx.pollNotifications(); assert.equal(ctx.reports.length, 1); assert.equal(ctx.reviews.p1.length, 1);
  ctx.backendPendingSyncs = 1; ctx.backendRequest = () => { throw new Error('should not poll'); }; await ctx.pollNotifications();
});

test('queued admin edits keep their baselines, preserve new submissions, and freeze on conflicts', async t => {
  const { request } = backend(t), initial = (await request('GET', '/api/admin/state', undefined, true)).data;
  const ctx = client({ ...noops, ...state(initial), backendAdminSession: true, backendSyncBlocked: false, backendPendingSyncs: 0, backendSyncQueue: Promise.resolve(), backendSyncBase: state(initial), localStorage: storage(), STORAGE_KEY: 'p', REPORTS_STORAGE_KEY: 'r', REVIEWS_KEY: 'v', PRODUCT_HISTORY_KEY: 'h', UNSYNCED_BACKUP_KEY: 'unsynced', document: { getElementById() { return {}; } }, backendRequest: async (url, options) => { const response = await request(options.method, url, JSON.parse(options.body), true); return { ok: response.status === 200, status: response.status, data: response.data }; }, readApiJson: async response => response.data, showToast() {} }, ['backendStatePayload', 'adminStateSnapshot', 'applyBackendAdminState', 'syncAdminState']);
  await request('POST', '/api/reports', { message: 'Report between admin saves' });
  ctx.products[0].name = 'First edit'; ctx.syncAdminState(); ctx.products[0].price = 160000; await ctx.syncAdminState();
  assert.equal(ctx.backendPendingSyncs, 0); assert.equal(ctx.backendSyncBlocked, false); assert.equal(ctx.reports.length, 1); assert.equal(ctx.products[0].price, 160000);
  const live = state((await request('GET', '/api/admin/state', undefined, true)).data), other = clone(live); other.products[0].price = 170000;
  await request('PUT', '/api/admin/state', { ...other, baseState: live }, true);
  ctx.products[0].price = 180000; await ctx.syncAdminState(); assert.equal(ctx.backendSyncBlocked, true); assert.ok(ctx.localStorage.getItem('unsynced'));
  assert.equal((await request('GET', '/api/products')).data.products[0].price, 170000);
});

function reportFormContext(mode) {
  const messages = []; let submit;
  const ctx = { ...noops, reports: [], MAX_REPORTS: 500, REPORT_CATEGORIES: new Set(['Lainnya']), reportFeedback: {}, reportForm: { addEventListener(type, fn) { submit = fn; }, reportValidity() { return true; }, reset() {}, querySelector() { return {}; } }, document: { getElementById(id) { return { value: { reportName: 'Test', reportCategory: 'Lainnya', reportMessage: 'Laporan untuk pengujian' }[id] }; } }, localStorage: storage(), REPORTS_STORAGE_KEY: 'r', backendRequest: async () => { if (mode === 'offline') throw new Error('offline'); return { ok: mode === 'ok', status: mode === 'ok' ? 201 : 429 }; }, readApiJson: async () => ({ report: { id: 'r1', message: 'Saved' } }), showToast(...args) { messages.push(args); } };
  const a = html.indexOf("      reportForm.addEventListener('submit', async event =>"), b = html.indexOf("      accountLoginForm.addEventListener('submit'", a);
  vm.createContext(ctx); vm.runInContext(clientFunction('submissionError'),ctx); vm.runInContext(html.slice(a, b), ctx); return { ctx, messages, run: () => submit({ preventDefault() {} }) };
}
test('reports show success only after backend confirmation', async () => {
  for (const mode of ['429', 'offline', 'ok']) { const f = reportFormContext(mode); await f.run(); assert.equal(f.ctx.reports.length, mode === 'ok' ? 1 : 0); assert.equal(f.messages.some(([text]) => text === 'Laporan berhasil dikirim ke admin.'), mode === 'ok'); if(mode==='offline')assert.match(f.ctx.reportFeedback.textContent,/Periksa koneksi/);if(mode==='429')assert.match(f.ctx.reportFeedback.textContent,/Terlalu banyak/); }
});

test('reviews keep text and show failure when server rejects or network is offline', async () => {
  for (const mode of ['429', 'offline', 'ok']) {
    let submit, closed = false; const messages = [], ctx = { ...noops, reviewProduct: product, reviewText: { value: 'My review', focus() {} }, activeUser: null, reviews: {}, reviewForm: { addEventListener(type, fn) { submit = fn; }, querySelector() { return {}; } }, localStorage: storage(), REVIEWS_KEY: 'reviews', backendRequest: async () => { if (mode === 'offline') throw new Error('offline'); return { ok: mode === 'ok', status: mode === 'ok' ? 201 : 429 }; }, readApiJson: async () => ({ review: { id: 'v1', comment: 'My review' } }), closeReview() { closed = true; }, showToast(...args) { messages.push(args); } };
    const start = html.indexOf("      reviewForm.addEventListener('submit', async event =>"), end = html.indexOf('\n      });', start) + '\n      });'.length;
    vm.createContext(ctx); vm.runInContext(clientFunction('submissionError'),ctx); vm.runInContext(html.slice(start, end), ctx); await submit({ preventDefault() {} }); assert.equal(closed, mode === 'ok'); assert.equal((ctx.reviews.p1 || []).length, mode === 'ok' ? 1 : 0); assert.equal(ctx.reviewText.value, 'My review');if(mode==='offline')assert.match(messages[0][0],/Periksa koneksi/);if(mode==='429')assert.match(messages[0][0],/Terlalu banyak/);
  }
});

test('customer account register/login/logout and authorization still work', async t => {
  const { request } = backend(t, { fresh: true });
  assert.equal((await request('GET', '/api/admin/state')).status, 401);
  const reg = await request('POST', '/api/accounts/register', { username: 'audit_account', password: 'Test-only-482!' }); assert.equal(reg.status, 201);
  const cookie = reg.headers['Set-Cookie'].split(';')[0]; assert.equal((await request('GET', '/api/accounts/me', undefined, false, { cookie })).status, 200);
  assert.equal((await request('POST', '/api/accounts/login', { username: 'audit_account', password: 'Test-only-482!' })).status, 200);
  assert.equal((await request('POST', '/api/accounts/logout', {}, false, { cookie })).status, 200);
  assert.equal((await request('GET', '/api/accounts/me', undefined, false, { cookie })).status, 401);
});

test('successful customer and admin logins are private server-side audit events; failed logins are excluded',async t=>{
  const password='test-audit-only-password',salt='a'.repeat(32),hash=crypto.pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex');
  const {request}=backend(t,{fresh:true,env:{OOMNI_ADMIN_USERNAME:'audit_admin',OOMNI_ADMIN_SALT:salt,OOMNI_ADMIN_PASSWORD_HASH:hash}});
  const headers={'user-agent':'Mozilla/5.0 (Linux; Android 10; K) Chrome/140.0.0.0 Mobile Safari/537.36','x-forwarded-for':'8.8.8.8'};
  const credentials={username:'device_test',password:'Test-only-482!',loginContext:{model:'SM-S918B',timeZone:'Asia/Jakarta'}};
  assert.equal((await request('POST','/api/accounts/register',credentials,false,headers)).status,201);
  assert.equal((await request('POST','/api/accounts/login',credentials,false,headers)).status,200);
  assert.equal((await request('POST','/api/accounts/login',{...credentials,password:'wrong'},false,headers)).status,401);
  assert.equal((await request('POST','/api/admin/login',{username:'audit_admin',password,loginContext:null},false,headers)).status,200);
  assert.equal((await request('GET','/api/admin/login-activity')).status,401);
  const audit=await request('GET','/api/admin/login-activity',undefined,true);
  assert.equal(audit.status,200);assert.equal(audit.headers['Cache-Control'],'no-store');assert.equal(audit.data.activities.length,3);
  assert.equal(audit.data.activities[0].role,'admin');assert.equal(audit.data.activities[1].device.brand,'Samsung');assert.equal(audit.data.activities[1].location.status,'local');assert.equal(audit.data.activities[1].ip,'127.0.0.1');
  assert.doesNotMatch(JSON.stringify(audit.data),/Test-only-482|test-audit-only-password|sessionToken|passwordHash/);
  assert.equal((await request('GET','/api/products')).data.loginActivity,undefined);
});

test('client login context fails gracefully and login time is shown in WIB with seconds',async()=>{
  const ctx=client({navigator:{platform:'Win32',userAgentData:{platform:'Windows',mobile:false,getHighEntropyValues:async()=>{throw Error('not permitted');}}},window:{setTimeout,clearTimeout}},['collectLoginContext','formatLoginTime','formatLoginDevice','formatLoginLocation']);
  assert.equal((await ctx.collectLoginContext()).platform,'Windows');
  assert.match(ctx.formatLoginTime('2026-10-23T12:34:56Z'),/19[.:]34[.:]56/);
  assert.equal(ctx.formatLoginDevice({device:{type:'Komputer',os:'Windows',browser:'Chrome',brand:'',model:''}}).title,'Komputer Windows');
  assert.match(ctx.formatLoginDevice({}).title,/belum terekam/);assert.match(ctx.formatLoginLocation({}).title,/belum terekam/);
});

test('Gemini search requests a JSON schema and ignores non-answer parts', async t => {
  let generationConfig;
  const { request } = backend(t, { env: { GEMINI_API_KEY: 'test-only-placeholder' }, fetch: async (url, options) => {
    generationConfig = JSON.parse(options.body).generationConfig;
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ thought: true, text: 'Non-JSON summary must not be parsed.' }, { text: JSON.stringify({ keywords: ['sepatu'], minPrice: 100000, maxPrice: null, sort: 'relevance' }) }] } }] }) };
  } });
  const response = await request('POST', '/api/product-search', { query: 'sepatu di atas 100rb' });
  assert.equal(response.status, 200); assert.equal(response.data.aiPowered, true); assert.deepEqual(response.data.productIds, ['p1']);
  assert.equal(response.data.intent.minPrice, 100000); assert.equal(response.data.intent.maxPrice, null);
  assert.equal(generationConfig.responseJsonSchema.type, 'object'); assert.equal(generationConfig.thinkingConfig.includeThoughts, false);
  assert.ok(generationConfig.maxOutputTokens >= 1024);
});

test('invalid Gemini JSON and upstream errors retain the local search fallback', async t => {
  for (const invalidResponse of [true, false]) {
    const { request } = backend(t, { env: { GEMINI_API_KEY: 'test-only-placeholder' }, fetch: async () => ({ ok: invalidResponse, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Here is the unfinished answer' }] } }] }) }) });
    const response = await request('POST', '/api/product-search', { query: 'sepatu di atas 100rb' });
    assert.equal(response.status, 200); assert.equal(response.data.aiConfigured, true); assert.equal(response.data.aiPowered, false);
    assert.equal(response.data.intent.minPrice, 100000); assert.equal(response.data.intent.maxPrice, null); assert.deepEqual(response.data.productIds, ['p1']);
  }
});

test('chatbot stores and returns only the final Gemini answer', async t => {
  const { request } = backend(t, { env: { GEMINI_API_KEY: 'test-only-placeholder' }, fetch: async () => ({ ok: true, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ thought: true, text: 'Internal summary' }, { text: 'Ukuran gambar maksimal 2,5 MB.' }] } }] }) }) });
  const response = await request('POST', '/api/customer-service', { question: 'Berapa batas ukuran gambar brand?' });
  assert.equal(response.status, 200); assert.equal(response.data.ok, true); assert.equal(response.data.answer, 'Ukuran gambar maksimal 2,5 MB.');
  const saved = (await request('GET', '/api/admin/state', undefined, true)).data.customerServiceMessages[0]; assert.equal(saved.answer, response.data.answer);
});

test('every admin feature has a distinct route that supports direct loading', async t => {
  const { request } = backend(t);
  const pages = JSON.parse(clientScript.match(/const ADMIN_PAGES = (\{[^\n]+\});/)[1]);
  assert.equal(Object.keys(pages).length, 14);
  for (const name of Object.keys(pages)) {
    const response = await request('GET', '/admin/' + name);
    assert.equal(response.status, 200, name);
    assert.ok(response.data.includes('id="adminView-' + name + '"'), name);
  }
  assert.equal((await request('GET', '/admin/not-a-page')).status, 404);
  assert.equal((await request('GET', '/api/admin/state')).status, 401);
});

test('admin route recognition accepts feature links and rejects unknown pages', () => {
  const pages = JSON.parse(clientScript.match(/const ADMIN_PAGES = (\{[^\n]+\});/)[1]);
  const ctx = client({ window: { location: { pathname: '/admin/overview' } }, validAdminPages: new Set(Object.keys(pages)) }, ['getAdminPageFromPath']);
  for (const name of Object.keys(pages)) { ctx.window.location.pathname = '/admin/' + name; assert.equal(ctx.getAdminPageFromPath(), name); }
  ctx.window.location.pathname = '/admin/'; assert.equal(ctx.getAdminPageFromPath(), 'overview');
  ctx.window.location.pathname = '/admin/not-a-page'; assert.equal(ctx.getAdminPageFromPath(), null);
  ctx.window.location.pathname = '/'; assert.equal(ctx.getAdminPageFromPath(), null);
});

test('admin navigation has real links, dedicated panels and separate product editing', () => {
  const admin = html.slice(html.indexOf('  <section class="dashboard-overlay" id="adminDashboard"'), html.indexOf('  <datalist id="productSuggestions">'));
  const pages = JSON.parse(clientScript.match(/const ADMIN_PAGES = (\{[^\n]+\});/)[1]);
  for (const key of Object.keys(pages)) { assert.ok(admin.includes('href="/admin/' + key + '"'), key); assert.equal([...admin.matchAll(new RegExp('id="adminView-' + key + '"', 'g'))].length, 1, key); }
  const productList = admin.slice(admin.indexOf('id="adminView-products"'), admin.indexOf('id="adminView-product-editor"'));
  assert.ok(productList.includes('id="adminProductList"')); assert.equal(productList.includes('id="productForm"'), false);
  assert.ok(admin.includes('aria-controls="adminSidebar"')); assert.ok(admin.includes('id="adminCommandInput"'));
});

test('protected visitor markup outside the redesigned home and choice decorations remains unchanged', () => {
  const visitor = html.slice(html.indexOf('<body'), html.indexOf('  <section class="dashboard-overlay" id="adminDashboard"'))
    .replace('id="brandLogo" href="/admin/overview" aria-label="Buka login admin ommnimarket"', 'id="brandLogo" href="#top" aria-label="ommnimarket, kembali ke beranda"')
    .replace(/<div class="store-hero-eyebrow"[\s\S]*?<\/div>\n          /, '')
    .replace('<span>Selamat</span> <span class="store-title-gold">Berbelanja</span>', 'Selamat Berbelanja')
    .replace(/          <div class="store-hero-track"[^>]*>[\s\S]*?<\/div>\n/, '')
    .replace(/        <img class="store-hero-art"[^>]+>\n/, '')
    .replace(/      <img class="store-support-art"[^>]+>\n/, '')
    .replace(/  <section class="portal-screen" id="portalScreen"[\s\S]*?(?=  <section class="portal-screen portal-detail-screen" id="portalDetailScreen")/, '')
    .replace(/<!-- services:hero-start -->[\s\S]*?<!-- services:hero-end -->/, '<span class="section-kicker">OMMNIMARKET</span><h1 id="portalDetailTitle"></h1>')
    .replace(/<!-- services:(header|tools|footer)-start -->[\s\S]*?<!-- services:\1-end -->/g, '')
    .replace(/<div class="portal-social-menus portal-webdev-menus"[\s\S]*?<\/div>/, '');
  assert.equal(crypto.createHash('sha256').update(visitor).digest('hex'), '44a6d1db405aa4f4b3d1beb81c14241acfa27189c1abbfa06b274a064a601f19');
});

test('one logo click or keyboard activation opens admin login and modifier clicks keep native navigation', () => {
  assert.match(html, /id="brandLogo" href="\/admin\/overview" aria-label="Buka login admin ommnimarket"/);
  let opened = 0, prevented = 0;
  const ctx = client({ openLogin() { opened += 1; } }, ['openAdminFromLogo']);
  const event = {button:0,defaultPrevented:false,preventDefault() { prevented += 1; }};
  ctx.openAdminFromLogo(event); assert.equal(opened,1); assert.equal(prevented,1);
  ctx.openAdminFromLogo({...event,detail:0}); assert.equal(opened,2); assert.equal(prevented,2);
  for (const flags of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]) ctx.openAdminFromLogo({...event,...flags});
  assert.equal(opened,2); assert.equal(prevented,2);
});

test('product edit deep links restore the selected product and reject missing IDs', () => {
  const pages = JSON.parse(clientScript.match(/const ADMIN_PAGES = (\{[^\n]+\});/)[1]);
  const nodes = new Map(), views = Object.keys(pages).map(name => ({ id: 'adminView-' + name, hidden: false }));
  let restored, redirected;
  const ctx = { ADMIN_PAGES: pages, validAdminPages: new Set(Object.keys(pages)), URLSearchParams,
    window: { location: { pathname: '/admin/product-editor', search: '?product=p1' } }, editingProductId: null, products: [product],
    document: { getElementById(id) { if (!nodes.has(id)) nodes.set(id, { textContent: '', hidden: false }); return nodes.get(id); }, querySelectorAll(selector) { return selector.includes('adminView-') ? views : []; } },
    adminDashboard: { classList: { contains: () => true } }, getAdminPageFromPath: () => 'product-editor',
    populateProductEditor(item) { restored = item; ctx.editingProductId = item.id; },
    navigateToAdminPage(name) { redirected = name; }, showToast() {}, closeAdminCommand() {}, setAdminMenu() {}, updateAdminNavigation() {}, refreshAiConfigStatus() {}, renderAdminOverview() {}, refreshAdminOverviewConnection() {}
  };
  client(ctx, ['showAdminView']); ctx.showAdminView('product-editor');
  assert.equal(restored.id, 'p1'); assert.equal(nodes.get('adminPageTitle').textContent, 'Edit produk');
  assert.deepEqual(views.filter(view => !view.hidden).map(view => view.id), ['adminView-product-editor']);
  ctx.window.location.search = '?product=missing'; ctx.showAdminView('product-editor'); assert.equal(redirected, 'products');
});


test('cinematic artwork is served without exposing other repository or private files', async t => {
  const {request}=backend(t);
  const asset=await request('GET','/assets/intro/cinematic-galaxy.webp');
  assert.equal(asset.status,200);assert.equal(asset.headers['Content-Type'],'image/webp');assert.ok(asset.data.length>1000);
  for(const url of ['/assets/intro/missing.webp','/assets/intro/../../server.js','/.data/store.json','/server.js']) assert.equal((await request('GET',url)).status,404,url);
});
