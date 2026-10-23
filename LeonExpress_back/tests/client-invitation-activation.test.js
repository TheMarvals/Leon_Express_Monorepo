const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');
const { Op } = require('sequelize');

async function fixture(t, options = {}) {
  const token = 'a'.repeat(64);
  const db = {
    invitations: [{ token, email: 'tienda@example.test', client_name: 'Tienda', base_price: 2800, has_free_pickups: true, is_used: false, expires_at: new Date(Date.now() + 3600000) }],
    clients: options.newClient ? [] : [{ client_id: 'existing-client', client_name: 'Tienda', email: 'tienda@example.test', verification_code: '112233', has_free_pickups: false, phone: 'old-phone', address: 'old-address' }],
    prices: options.newClient || options.noPricing ? [] : [{ pricing_id: 'existing-price', client_id: 'existing-client', base_price: 3500, valid_from: '2020-01-01', valid_to: options.expiredPricing ? '2020-12-31' : options.boundedPricing ? '2999-01-01' : null }],
    users: options.newClient || options.noUser ? [] : [{ user_id: 'existing-user', client_id: options.foreignClient ? 'other-client' : 'existing-client', role_id: options.internalUser ? 'admin-role' : 'client-role', email: 'tienda@example.test', username: 'tienda', full_name: 'Tienda' }],
  };
  const calls = { createdPrices: 0, createdClients: 0, commits: 0, rollbacks: 0, locks: [] };
  function matches(row, where) {
    return Reflect.ownKeys(where).every(key => {
      if (key === Op.or) return where[key].some(condition => matches(row, condition));
      const expected = where[key];
      if (!expected || typeof expected !== 'object' || expected instanceof Date) return row[key] === expected;
      if (Op.gt in expected) return new Date(row[key]) > expected[Op.gt];
      if (Op.gte in expected) return row[key] !== null && row[key] >= expected[Op.gte];
      throw Error('Unexpected predicate');
    });
  }
  function view(row) { return row ? { ...row, async update(data, query) { assert.ok(query.transaction); Object.assign(row, data); Object.assign(this, data); } } : null; }
  function model(kind) {
    return {
      async findOne(query) { if (query.lock) calls.locks.push(kind); return view(db[kind].find(row => matches(row, query.where))); },
      async create(data, query) {
        assert.ok(query.transaction);
        if (kind === 'prices') {
          calls.createdPrices++;
          if (db.prices.some(row => row.client_id === data.client_id && (!row.valid_to || row.valid_to >= data.valid_from))) throw Error('El período de validez se solapa con otro período de precio existente para el mismo cliente.');
        }
        if (kind === 'clients') calls.createdClients++;
        if (kind === 'users' && options.failUserCreate) throw Error('Injected database failure');
        db[kind].push({ ...data }); return view(db[kind].at(-1));
      },
    };
  }
  const models = {
    ClientInvitation: model('invitations'), Client: model('clients'), ClientPricing: model('prices'), User: model('users'),
    Role: { findOne: async () => ({ role_id: 'client-role', role_name: 'CLIENT' }) },
    sequelize: { async transaction() {
      const snapshot = structuredClone(db);
      return { LOCK: { UPDATE: 'UPDATE' }, finished: false,
        async commit() { this.finished = 'commit'; calls.commits++; },
        async rollback() { assert.equal(this.finished, false); Object.assign(db, snapshot); this.finished = 'rollback'; calls.rollbacks++; },
      };
    } },
  };
  const filename = path.resolve(__dirname, '../routes/auth.js'), originalRequire = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process: { env: { JWT_SECRET: 'test-secret', NODE_ENV: 'test' } }, console: { error() {}, log() {} },
    require(id) {
      if (id === '../models') return models;
      if (id === '../middlewares/authenticateToken') return (req, res, next) => next();
      if (id === '../utils/audit') return { logAudit: async () => {} };
      if (id === '../services/emailService') return {};
      if (id === 'express-rate-limit') return () => (req, res, next) => next();
      if (id === 'bcryptjs') return { hash: async () => 'test-hash' };
      return originalRequire(id);
    },
  }, { filename });
  const app = express(); app.use(express.json()); app.use(module.exports);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  async function request(method, endpoint, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, {
      method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  return { db, calls, read: () => request('GET', `/invitation/${token}`),
    accept: () => request('POST', '/invitation/accept', { token, phone: '+56912345678', commune: 'Puente Alto', address: 'Pedernal 3793' }) };
}

test('activation preserves an existing price instead of triggering the production overlap error', async t => {
  const f = await fixture(t);
  const result = await f.accept();
  assert.equal(result.status, 201);
  assert.equal(result.body.user.client_id, 'existing-client');
  assert.equal(result.body.user.user_id, 'existing-user');
  assert.ok(result.body.token);
  assert.equal(f.calls.createdPrices, 0);
  assert.equal(f.calls.createdClients, 0);
  assert.equal(f.db.prices.length, 1);
  assert.equal(f.db.prices[0].base_price, 3500);
  assert.equal(f.db.clients[0].has_free_pickups, false);
  assert.equal(f.db.clients[0].address, 'Pedernal 3793, Puente Alto');
  assert.equal(f.db.invitations[0].is_used, true);
  assert.equal(f.calls.commits, 1);
  assert.ok(f.calls.locks.includes('invitations'));
  assert.ok(f.calls.locks.includes('clients'));
});
test('the activation summary displays the retained client conditions', async t => {
  const f = await fixture(t);
  const result = await f.read();
  assert.equal(result.status, 200);
  assert.equal(result.body.invitation.base_price, 3500);
  assert.equal(result.body.invitation.has_free_pickups, false);
});
test('new customers receive exactly one client, user and initial price', async t => {
  const f = await fixture(t, { newClient: true });
  assert.equal((await f.read()).body.invitation.base_price, 2800);
  const result = await f.accept();
  assert.equal(result.status, 201);
  assert.equal(f.db.clients.length, 1);
  assert.equal(f.db.users.length, 1);
  assert.equal(f.db.prices.length, 1);
  assert.equal(f.db.prices[0].base_price, 2800);
  assert.equal(f.db.prices[0].client_id, result.body.user.client_id);
  assert.equal(f.db.clients[0].has_free_pickups, true);
});
for (const option of ['noPricing', 'expiredPricing', 'boundedPricing']) {
  test(`activation handles ${option} without replacing pricing history`, async t => {
    const f = await fixture(t, { [option]: true });
    assert.equal((await f.accept()).status, 201);
    assert.equal(f.calls.createdPrices, option === 'boundedPricing' ? 0 : 1);
    if (option === 'expiredPricing') assert.equal(f.db.prices[0].valid_to, '2020-12-31');
  });
}
test('a used invitation cannot duplicate the activation', async t => {
  const f = await fixture(t, { newClient: true });
  assert.equal((await f.accept()).status, 201);
  assert.equal((await f.accept()).status, 404);
  assert.equal(f.db.prices.length, 1);
  assert.equal(f.db.users.length, 1);
});
for (const option of ['internalUser', 'foreignClient']) {
  test(`activation never reassigns a conflicting ${option} account`, async t => {
    const f = await fixture(t, { [option]: true });
    assert.equal((await f.accept()).status, 409);
    assert.equal(f.db.invitations[0].is_used, false);
    assert.equal(f.db.clients[0].address, 'old-address');
    assert.equal(f.calls.commits, 0);
  });
}
test('a failed activation rolls back all changes and leaves the invitation available for retry', async t => {
  const f = await fixture(t, { newClient: true, failUserCreate: true });
  const result = await f.accept();
  assert.equal(result.status, 500);
  assert.equal(f.db.invitations[0].is_used, false);
  assert.equal(f.db.clients.length, 0);
  assert.equal(f.db.prices.length, 0);
  assert.equal(f.calls.rollbacks, 1);
  assert.equal(result.body.details, undefined);
});
