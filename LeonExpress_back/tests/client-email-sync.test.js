const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');
const { Op } = require('sequelize');

async function fixture(t, options = {}) {
  const db = {
    clients: [{ client_id: 'client-1', email: 'old@example.test', client_name: 'Tienda', is_active: true, verification_code: '112233', has_free_pickups: true }],
    users: options.unprovisioned ? [] : [{ user_id: 'user-1', client_id: 'client-1', role_id: 'client-role', username: 'old@example.test', email: 'old@example.test', full_name: 'Tienda', is_active: true, password_hash: 'untouched' }],
    codes: ['old@example.test', 'new@example.test'].map((email, i) => ({ otp_id: `otp-${i}`, email, is_used: false, expires_at: new Date(Date.now() + 60000), attempts: 0, code_hash: 'hash:123456' })),
  };
  if (options.otherClient) db.clients.push({ client_id: 'foreign', email: 'new@example.test' });
  if (options.otherUser) db.users.push({ user_id: 'foreign', email: 'new@example.test' });
  const calls = { emails: [], created: [], commits: 0, rollbacks: 0, invalidations: 0 };
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, expected]) => {
      if (!expected || typeof expected !== 'object' || expected instanceof Date) return row[key] === expected;
      return Reflect.ownKeys(expected).every(op => {
        if (op === Op.ne) return row[key] !== expected[op];
        if (op === Op.notIn) return !expected[op].includes(row[key]);
        if (op === Op.in) return expected[op].includes(row[key]);
        if (op === Op.gt) return new Date(row[key]) > expected[op];
        if (op === Op.lt) return row[key] < expected[op];
        throw Error('Unexpected predicate');
      });
    });
  }
  const role = { role_id: 'client-role', role_name: 'CLIENT' };
  function view(row, kind) {
    if (!row) return null;
    const result = { ...row,
      async update(data) {
        if (kind === 'users' && options.failUpdate) throw Error('Injected failure');
        Object.assign(row, data); Object.assign(result, data);
      },
      async increment(key) { row[key]++; },
      async save() {
        if (options.failSave) throw Error('Injected failure');
        for (const [key, value] of Object.entries(result)) if (typeof value !== 'function' && !['role', 'client'].includes(key)) row[key] = value;
      },
    };
    if (kind === 'users') {
      result.role = role;
      result.client = view(db.clients.find(client => client.client_id === row.client_id), 'clients');
    }
    return result;
  }
  function model(kind, pk) {
    return {
      findByPk: async id => view(db[kind].find(row => row[pk] === id), kind),
      findOne: async query => view(db[kind].find(row => matches(row, query.where)), kind),
      findAll: async query => db[kind].filter(row => matches(row, query.where)).map(row => view(row, kind)),
      async update(data, query) {
        if (kind === 'codes') calls.invalidations++;
        const rows = db[kind].filter(row => matches(row, query.where)); rows.forEach(row => Object.assign(row, data)); return [rows.length];
      },
      async create(data) {
        if (kind === 'clients') throw Error('Must not recreate client');
        db[kind].push({ ...data }); if (kind === 'users') calls.created.push(data);
        return view(db[kind].at(-1), kind);
      },
    };
  }
  const models = {
    Client: model('clients', 'client_id'), User: model('users', 'user_id'), ClientOtp: model('codes', 'otp_id'),
    Role: { findByPk: async () => role, findOne: async () => role },
    Warehouse: { findByPk: async () => null }, AuditLog: { create: async () => {} },
    sequelize: { async transaction(callback) {
      const snapshot = structuredClone(db);
      const transaction = { LOCK: { UPDATE: 'UPDATE' },
        async commit() { calls.commits++; },
        async rollback() { Object.assign(db, snapshot); calls.rollbacks++; },
      };
      if (!callback) return transaction;
      try { const result = await callback(transaction); await transaction.commit(); return result; }
      catch (error) { await transaction.rollback(); throw error; }
    } },
  };
  let emailService;
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative), originalRequire = createRequire(filename), module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module, exports: module.exports, process: { env: { JWT_SECRET: 'test-secret', NODE_ENV: 'test' } }, console: { log() {}, error() {} },
      require(id) {
        if (id === '../models') return models;
        if (id === '../services/clientEmailService') return emailService;
        if (id === '../middlewares/authenticateToken') return (req, res, next) => { req.user = { role: 'ADMIN', user_id: 'admin-1' }; next(); };
        if (id === '../utils/audit') return { logAudit: async () => {} };
        if (id === '../services/emailService') return { sendOtpEmail: async payload => calls.emails.push(payload) };
        if (id === 'express-rate-limit') return () => (req, res, next) => next();
        if (id === 'bcryptjs') return { hash: async value => `hash:${value}`, compare: async (value, hash) => hash === `hash:${value}` };
        return originalRequire(id);
      },
    }, { filename });
    return module.exports;
  }
  emailService = load('services/clientEmailService.js');
  const app = express(); app.use(express.json());
  for (const [mount, file] of [['clients', 'client'], ['users', 'user'], ['auth', 'auth']]) app.use(`/${mount}`, load(`routes/${file}.js`));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  async function request(method, endpoint, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  const edit = (source, email) => source === 'client'
    ? request('PUT', '/clients/client-1', { email })
    : request('PUT', '/users/user-1', { username: 'old@example.test', full_name: 'Tienda', email, role_id: 'client-role', warehouse_id: null });
  const otp = (action, email, code) => request('POST', `/auth/otp/${action}`, { email, code });
  return { db, calls, request, edit, otp };
}

for (const source of ['client', 'user']) {
  test(`${source} editor synchronizes the email preserving identities and commercial data`, async t => {
    const f = await fixture(t);
    assert.equal((await f.edit(source, 'NEW@example.test')).status, 200);
    assert.equal(f.db.clients[0].email, 'new@example.test');
    assert.equal(f.db.users[0].email, 'new@example.test');
    assert.equal(f.db.users[0].user_id, 'user-1');
    assert.equal(f.db.users[0].client_id, 'client-1');
    assert.equal(f.db.users[0].username, 'old@example.test');
    assert.equal(f.db.users[0].password_hash, 'untouched');
    assert.equal(f.db.clients[0].has_free_pickups, true);
    assert.ok(f.db.codes.every(code => code.is_used));
    assert.equal(f.calls.created.length, 0);
    assert.equal(f.calls.commits, 1);
  });
  for (const conflict of ['otherClient', 'otherUser']) {
    test(`${source} editor rejects a ${conflict} email without partial writes`, async t => {
      const f = await fixture(t, { [conflict]: true });
      assert.equal((await f.edit(source, 'new@example.test')).status, 409);
      assert.equal(f.db.clients[0].email, 'old@example.test');
      assert.equal(f.db.users[0].email, 'old@example.test');
      assert.equal(f.calls.rollbacks, 1);
    });
  }
}
for (const [option, source] of [['failUpdate', 'client'], ['failSave', 'user']]) {
  test(`a ${source} write failure rolls back both emails and OTP invalidation`, async t => {
    const f = await fixture(t, { [option]: true });
    assert.equal((await f.edit(source, 'new@example.test')).status, 500);
    assert.equal(f.db.clients[0].email, 'old@example.test');
    assert.equal(f.db.users[0].email, 'old@example.test');
    assert.ok(f.db.codes.every(code => !code.is_used));
    assert.equal(f.calls.rollbacks, 1);
  });
}
test('changing email before first access provisions only the existing client', async t => {
  const f = await fixture(t, { unprovisioned: true });
  assert.equal((await f.edit('client', 'new@example.test')).status, 200);
  assert.equal(f.db.users.length, 0);
  assert.equal((await f.otp('request', 'new@example.test')).status, 200);
  assert.equal(f.db.users.length, 1);
  assert.equal(f.db.users[0].client_id, 'client-1');
});
test('old email and pending codes stop working; a fresh OTP logs into the same user only once', async t => {
  const f = await fixture(t);
  assert.equal((await f.edit('client', 'new@example.test')).status, 200);
  assert.equal((await f.otp('request', 'old@example.test')).status, 404);
  assert.equal((await f.otp('verify', 'old@example.test', '123456')).status, 400);
  assert.equal((await f.otp('verify', 'new@example.test', '123456')).status, 400);
  assert.equal((await f.otp('request', 'new@example.test')).status, 200);
  const code = f.calls.emails[0].code;
  const login = await f.otp('verify', 'new@example.test', code);
  assert.equal(login.status, 200);
  assert.equal(login.body.user.user_id, 'user-1');
  assert.equal(login.body.user.client_id, 'client-1');
  assert.equal(f.calls.created.length, 0);
  assert.equal((await f.otp('verify', 'new@example.test', code)).status, 400);
});
test('permanent PINs never authenticate, even with an outstanding OTP', async t => {
  const f = await fixture(t);
  f.db.codes.forEach(code => { code.is_used = true; });
  assert.equal((await f.otp('verify', 'old@example.test', '112233')).status, 400);
  assert.equal((await f.otp('request', 'old@example.test')).status, 200);
  assert.equal((await f.otp('verify', 'old@example.test', '112233')).status, 400);
});
test('expired codes and exhausted attempts are rejected', async t => {
  const f = await fixture(t);
  f.db.codes[0].expires_at = new Date(Date.now() - 1000);
  assert.equal((await f.otp('verify', 'old@example.test', '123456')).status, 400);
  f.db.codes[0].expires_at = new Date(Date.now() + 60000); f.db.codes[0].attempts = 5;
  assert.equal((await f.otp('verify', 'old@example.test', '123456')).status, 429);
});
test('legacy email drift cannot duplicate users or authenticate with the obsolete email', async t => {
  const f = await fixture(t);
  f.db.clients[0].email = 'new@example.test';
  assert.equal((await f.otp('request', 'old@example.test')).status, 403);
  assert.equal((await f.otp('request', 'new@example.test')).status, 409);
  assert.equal(f.calls.created.length, 0);
  assert.equal(f.calls.emails.length, 0);
});
test('unchanged email preserves OTPs; clearing a portal email is rejected', async t => {
  const f = await fixture(t);
  assert.equal((await f.edit('client', 'old@example.test')).status, 200);
  assert.equal(f.calls.invalidations, 0);
  assert.equal((await f.edit('client', null)).status, 400);
});

test('simultaneous submissions can consume a valid OTP only once', async t => {
  const f = await fixture(t);
  const results = await Promise.all([
    f.otp('verify', 'old@example.test', '123456'),
    f.otp('verify', 'old@example.test', '123456'),
  ]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
});
test('changing a dotted email preserves the exact mailbox for OTP access', async t => {
  const f = await fixture(t);
  assert.equal((await f.edit('client', 'tienda.nueva@gmail.com')).status, 200);
  assert.equal((await f.otp('request', 'tienda.nueva@gmail.com')).status, 200);
  assert.equal(f.calls.emails[0].to, 'tienda.nueva@gmail.com');
  assert.equal((await f.otp('verify', 'tienda.nueva@gmail.com', f.calls.emails[0].code)).status, 200);
});
