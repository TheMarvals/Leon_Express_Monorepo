const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');

async function fixture(t, options = {}) {
  const client = { client_id: 'existing-client', client_name: 'Tienda existente', email: 'tienda@example.test', is_active: true, ...options.client };
  const role = { role_id: 'client-role', role_name: 'CLIENT' };
  const calls = { users: [], emails: [], codes: [] };
  const models = {
    User: {
      findOne: async () => options.linked ? { user_id: 'existing-user', is_active: true, role, client, client_id: client.client_id } : null,
      create: async data => { calls.users.push(data); return { ...data }; },
    },
    Role: { findOne: async () => role },
    Client: { findOne: async () => client },
    ClientOtp: { update: async () => {}, create: async data => calls.codes.push(data) },
    // No Client or ClientPricing creation/update methods: existing commercial data must remain intact.
    ClientPricing: {},
  };
  const filename = path.resolve(__dirname, '../routes/auth.js');
  const originalRequire = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process: { env: { JWT_SECRET: 'test-secret', NODE_ENV: 'test' } },
    console: { log() {}, error() {} },
    require(id) {
      if (id === '../models') return models;
      if (id === '../middlewares/authenticateToken') return (req, res, next) => next();
      if (id === '../utils/audit') return {};
      if (id === '../services/emailService') return { sendOtpEmail: async data => calls.emails.push(data) };
      if (id === 'express-rate-limit') return () => (req, res, next) => next();
      return originalRequire(id);
    },
  }, { filename });
  const app = express(); app.use(express.json()); app.use(module.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/otp/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: client.email }),
  });
  return { status: response.status, body: await response.json(), calls, client };
}

test('first portal access provisions a user for the existing client without recreating client or pricing', async t => {
  const { status, body, calls, client } = await fixture(t);
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(calls.users.length, 1);
  assert.equal(calls.users[0].client_id, client.client_id);
  assert.equal(calls.users[0].role_id, 'client-role');
  assert.equal(calls.emails.length, 1);
  assert.equal(calls.emails[0].to, client.email);
  assert.equal(calls.codes.length, 1);
});
test('returning portal clients keep their existing user association', async t => {
  const { status, calls } = await fixture(t, { linked: true });
  assert.equal(status, 200);
  assert.equal(calls.users.length, 0);
  assert.equal(calls.emails.length, 1);
});
test('inactive existing clients cannot provision portal access', async t => {
  const { status, calls } = await fixture(t, { client: { is_active: false } });
  assert.equal(status, 403);
  assert.equal(calls.users.length, 0);
  assert.equal(calls.emails.length, 0);
  assert.equal(calls.codes.length, 0);
});
