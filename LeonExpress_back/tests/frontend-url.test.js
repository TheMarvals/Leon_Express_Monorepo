const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');

function urlResolver(env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../utils/frontendUrl.js'), 'utf8'), {
    module, exports: module.exports, process: { env }, URL,
  });
  return module.exports;
}

const request = headers => ({ get: name => headers[name] });

test('the configured public domain takes priority over the local browser origin', () => {
  const { getFrontendUrl } = urlResolver({ FRONTEND_URL: 'https://leonexpress.cl/' });
  assert.equal(getFrontendUrl(request({ origin: 'http://localhost:5173' })), 'https://leonexpress.cl');
});

test('the frontend origin survives the Vite proxy using a different backend host and protocol', () => {
  const { getFrontendUrl } = urlResolver();
  assert.equal(getFrontendUrl(request({ origin: 'http://localhost:5173', host: 'localhost:4100' })), 'http://localhost:5173');
});

test('GET requests without Origin use the referring frontend address', () => {
  const { getFrontendUrl } = urlResolver({ NODE_ENV: 'production' });
  assert.equal(getFrontendUrl(request({ referer: 'https://leonexpress.cl/clients' })), 'https://leonexpress.cl');
});

test('configured frontend subpaths retain their path without duplicate slashes', () => {
  const { getFrontendUrl } = urlResolver({ FRONTEND_URL: 'https://leonexpress.cl/portal-app///' });
  assert.equal(getFrontendUrl(), 'https://leonexpress.cl/portal-app');
});

test('invalid configured URLs fail instead of emitting broken links', () => {
  const { getFrontendUrl } = urlResolver({ FRONTEND_URL: 'javascript:alert(1)' });
  assert.throws(() => getFrontendUrl(), /URL HTTP o HTTPS válida/);
});

test('background mail in production requires an explicit URL instead of an invented subdomain', () => {
  const { getFrontendUrl } = urlResolver({ NODE_ENV: 'production' });
  assert.throws(() => getFrontendUrl(), /Configura FRONTEND_URL/);
});

test('invitation creation, email and listing all use the configured domain with the same token', async t => {
  const filename = path.resolve(__dirname, '../routes/client.js');
  const originalRequire = createRequire(filename);
  const module = { exports: {} }, invitations = [], emails = [];
  const models = {
    Client: { findOne: async () => null }, ClientPricing: {}, sequelize: {},
    ClientInvitation: {
      create: async data => { const row = { ...data, toJSON() { return { ...data }; } }; invitations.push(row); return row; },
      findAll: async () => invitations,
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process,
    console: { log() {}, warn() {}, error() {} },
    require(id) {
      if (id === '../models') return models;
      if (id === '../utils/audit') return { logAudit: async () => {} };
      if (id === '../middlewares/authenticateToken') return (req, res, next) => { req.user = { user_id: 'admin-1', role: 'ADMIN' }; next(); };
      if (id === '../utils/frontendUrl') return urlResolver({ FRONTEND_URL: 'https://leonexpress.cl/' });
      if (id === '../services/emailService') return { sendClientInvitationEmail: async payload => { emails.push(payload); } };
      return originalRequire(id);
    },
  }, { filename });
  const app = express(); app.use(express.json()); app.use('/clients', module.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}/clients/invitations`;
  const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ client_name: 'Cliente de prueba', email: 'cliente@example.test', base_price: 3500, has_free_pickups: true }) });
  assert.equal(response.status, 201);
  const created = (await response.json()).invitation;
  const url = new URL(created.invite_url);
  assert.equal(url.origin, 'https://leonexpress.cl');
  assert.equal(url.pathname, '/portal/registro');
  assert.equal(url.searchParams.get('token'), invitations[0].token);
  assert.equal(emails[0].inviteUrl, created.invite_url);
  const listingResponse = await fetch(base);
  assert.equal(listingResponse.status, 200);
  const listed = await listingResponse.json();
  assert.equal(listed.invitations[0].invite_url, created.invite_url);
});
