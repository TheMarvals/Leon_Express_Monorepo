const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');

async function fixture(t, options = {}) {
  const calls = { links: [], synced: [], excluded: [] };
  const accounts = options.accounts || [
    { ml_account_id: 'other-account', client_id: 'other-client', ml_nickname: 'Otra tienda' },
    { ml_account_id: 'own-account', client_id: 'client-1', ml_nickname: 'Mi tienda' },
  ];
  const user = { role: 'CLIENT', user_id: 'client-user-1', username: 'cliente', client_id: 'client-1', ...options.user };
  const gateway = {
    generateLink: async (...args) => {
      calls.links.push(args);
      if (options.gatewayFailure) throw Error('Gateway unavailable');
      return { url: 'https://gateway.example.test/connect/test-token', token_id: 'link-1' };
    },
    forceSyncNow: async accountId => { calls.synced.push(accountId); if (options.failedAccount === accountId) throw Error('Gateway failure'); return { message: 'Sincronización iniciada' }; },
  };
  const access = {
    getAccounts: async () => { if (options.gatewayFailure) throw Error('Gateway unavailable'); return accounts; },
    excludeAccount: async id => calls.excluded.push(id),
  };
  const filename = path.resolve(__dirname, '../routes/mercadolibre.js');
  const originalRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process,
    console: { log() {}, warn() {}, error() {} },
    require(id) {
      if (id === '../middlewares/authenticateToken') return (req, res, next) => { req.user = user; next(); };
      if (id === '../services/mlGatewayClient') return gateway;
      if (id === '../services/mlAccountAccessService') return access;
      if (id === '../services/mlImportService') return {};
      return originalRequire(id);
    },
  }, { filename });
  const app = express();
  app.use(express.json());
  app.use('/mercadolibre', module.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  async function request(method, endpoint, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/mercadolibre${endpoint}`, {
      method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  return { request, calls };
}

test('creates the authorization link for the authenticated client and supplies audit information', async t => {
  const f = await fixture(t);
  const result = await f.request('POST', '/my-account/link', { client_id: 'other-client' });
  assert.equal(result.status, 200);
  assert.equal(result.body.url, 'https://gateway.example.test/connect/test-token');
  assert.equal(result.body.authUrl, result.body.url);
  assert.equal(f.calls.links[0][0], 'client-1');
  assert.ok(f.calls.links[0][1].includes('cliente'));
  assert.ok(f.calls.links[0][1].includes('client-user-1'));
});

test('link audit information supports users authenticated without a username', async t => {
  const f = await fixture(t, { user: { username: undefined } });
  assert.equal((await f.request('POST', '/my-account/link')).status, 200);
  assert.ok(!f.calls.links[0][1].includes('undefined'));
});

test('missing client associations fail before contacting the gateway', async t => {
  const f = await fixture(t, { user: { client_id: null } });
  assert.equal((await f.request('POST', '/my-account/link')).status, 400);
  assert.equal(f.calls.links.length, 0);
});

test('a gateway failure returns a clear linking error', async t => {
  const f = await fixture(t, { gatewayFailure: true });
  const result = await f.request('POST', '/my-account/link');
  assert.equal(result.status, 500);
  assert.equal(result.body.error, 'No se pudo generar el enlace de vinculación');
});

test('a client only sees their own linked account', async t => {
  const f = await fixture(t);
  const result = await f.request('GET', '/my-account');
  assert.equal(result.status, 200);
  assert.equal(result.body.account.ml_nickname, 'Mi tienda');
  assert.equal(result.body.account.ml_account_id, 'own-account');
});

test('gateway outages are distinguished from an unlinked account', async t => {
  const f = await fixture(t, { gatewayFailure: true });
  const result = await f.request('GET', '/my-account');
  assert.equal(result.body.gateway_status, 'UNAVAILABLE');
  assert.equal(result.body.account, null);
});

test('sync and unlink operate on the authenticated client account only', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('POST', '/my-account/sync', { ml_account_id: 'own-account' })).status, 200);
  assert.equal((await f.request('DELETE', '/my-account?ml_account_id=own-account')).status, 200);
  assert.deepEqual(f.calls.synced, ['own-account']);
  assert.deepEqual(f.calls.excluded, ['own-account']);
});

test('accounts belonging to other clients cannot be synced or unlinked', async t => {
  const f = await fixture(t, { accounts: [{ ml_account_id: 'other-account', client_id: 'other-client' }] });
  assert.equal((await f.request('POST', '/my-account/sync')).status, 404);
  assert.equal((await f.request('DELETE', '/my-account')).status, 404);
  assert.deepEqual(f.calls.synced, []);
  assert.deepEqual(f.calls.excluded, []);
});

test('drivers cannot generate customer authorization links', async t => {
  const f = await fixture(t, { user: { role: 'DRIVER' } });
  assert.equal((await f.request('POST', '/my-account/link')).status, 403);
  assert.equal(f.calls.links.length, 0);
});

const multipleAccounts = [
  { ml_account_id: 'own-1', client_id: 'client-1' },
  { ml_account_id: 'foreign', client_id: 'client-2' },
  { ml_account_id: 'own-2', client_id: 'client-1' },
];
test('returns every owned account without exposing other clients', async t => {
  const f = await fixture(t, { accounts: multipleAccounts });
  const result = await f.request('GET', '/my-account');
  assert.deepEqual(result.body.accounts.map(a => a.ml_account_id), ['own-1', 'own-2']);
  assert.equal(result.body.account.ml_account_id, 'own-1');
});
test('syncs all owned accounts or one selected account', async t => {
  const f = await fixture(t, { accounts: multipleAccounts });
  assert.equal((await f.request('POST', '/my-account/sync')).status, 200);
  assert.deepEqual(f.calls.synced, ['own-1', 'own-2']);
  f.calls.synced.length = 0;
  assert.equal((await f.request('POST', '/my-account/sync', { ml_account_id: 'own-2' })).status, 200);
  assert.deepEqual(f.calls.synced, ['own-2']);
});
test('foreign account identifiers cannot sync or unlink accounts', async t => {
  const f = await fixture(t, { accounts: multipleAccounts });
  assert.equal((await f.request('POST', '/my-account/sync', { ml_account_id: 'foreign' })).status, 404);
  assert.equal((await f.request('DELETE', '/my-account?ml_account_id=foreign')).status, 404);
  assert.deepEqual(f.calls.synced, []);
  assert.deepEqual(f.calls.excluded, []);
});
test('unlink requires selection for multiple accounts and only removes that account', async t => {
  const f = await fixture(t, { accounts: multipleAccounts });
  assert.equal((await f.request('DELETE', '/my-account')).status, 400);
  assert.deepEqual(f.calls.excluded, []);
  assert.equal((await f.request('DELETE', '/my-account?ml_account_id=own-2')).status, 200);
  assert.deepEqual(f.calls.excluded, ['own-2']);
});
test('partial sync failures are reported instead of claiming all accounts synced', async t => {
  const f = await fixture(t, { accounts: multipleAccounts, failedAccount: 'own-1' });
  const result = await f.request('POST', '/my-account/sync');
  assert.equal(result.status, 502);
  assert.deepEqual(result.body.failed_account_ids, ['own-1']);
  assert.deepEqual(f.calls.synced, ['own-1', 'own-2']);
});
