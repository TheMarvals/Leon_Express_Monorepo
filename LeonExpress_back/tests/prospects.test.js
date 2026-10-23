'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');
const valid = { company: 'Tienda Santiago', contact_name: 'Ana Pérez', email: 'ana@example.test', phone: '+56912345678', commune: 'Providencia', volume: '10 a 50', message: 'Mis paquetes', consent: true };
async function fixture(t, options = {}) {
  const rows = [], notifications = [], emails = [], audits = [];
  let recipient = options.noRecipient ? '' : 'admin-1';
  const admins = [{ user_id: 'admin-1', full_name: 'Admin', email: 'admin@example.test' }];
  const model = {
    async create(values) {
      if (options.dbFail) throw Error('database unavailable');
      if (rows.some(r => r.dedupe_key === values.dedupe_key)) { const err = Error(); err.name = 'SequelizeUniqueConstraintError'; throw err; }
      const row = { ...values, status: 'NEW', email_status: 'PENDING', async update(data) { Object.assign(this, data); } };
      rows.push(row); return row;
    },
    count: async () => rows.filter(r => r.status === 'NEW').length,
    findByPk: async id => rows.find(r => r.prospect_id === id),
    findAndCountAll: async q => { assert.equal(q.limit, 20); return { rows, count: rows.length }; },
  };
  const filename = path.resolve(__dirname, '../routes/prospects.js'), originalRequire = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, console: { error() {} }, require(id) {
    if (id === '../models') return { Prospect: model, Role: {}, User: {
      findAll: async () => options.inactiveRecipient ? [] : admins,
      findOne: async query => query.where.user_id === 'admin-1' && !options.inactiveAdmin ? admins[0] : null,
    }, SystemConfig: { findByPk: async () => recipient ? { config_value: recipient } : null,
      upsert: async data => { recipient = data.config_value; } } };
    if (id === '../middlewares/authenticateToken') return (req, res, next) => {
      if (!req.get('x-test-role')) return res.status(401).json({ error: 'No autorizado' });
      req.user = { user_id: 'admin-1', role: req.get('x-test-role') }; next();
    };
    if (id === '../utils/notificationService') return { queueNotification: async data => notifications.push(data) };
    if (id === '../utils/audit') return { logAudit: async (...data) => audits.push(data) };
    if (id === '../services/emailService') return { sendProspectNotification: async data => { emails.push(data); return { success: !options.mailFail, simulated: !!options.simulated }; } };
    return originalRequire(id);
  } }, { filename });
  const app = express(); app.use(express.json()); app.use('/prospects', module.exports);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  async function request(method = 'POST', endpoint = '', body = valid, role) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/prospects${endpoint}`, {
      method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    }); return { status: response.status, body: await response.json() };
  }
  return { rows, notifications, emails, audits, request };
}
test('public prospect form persists before notifying and never creates an account', async t => {
  const f = await fixture(t);
  assert.equal((await f.request()).status, 202);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].status, 'NEW');
  assert.equal(f.rows[0].email_status, 'SENT');
  assert.equal(f.notifications[0].link, '/prospects');
  assert.equal(f.emails[0].to, 'admin@example.test');
  assert.equal((await f.request()).status, 202);
  assert.equal(f.rows.length, 1); assert.equal(f.emails.length, 1);
});
test('validation and honeypot do not persist or notify', async t => {
  const f = await fixture(t);
  for (const bad of [{ email: 'invalid' }, { consent: false }, { volume: 'unlimited' }, { message: 'x'.repeat(2001) }]) {
    assert.equal((await f.request('POST', '', { ...valid, ...bad })).status, 400);
  }
  assert.equal((await f.request('POST', '', { ...valid, website: 'spam' })).status, 202);
  assert.equal(f.rows.length, 0); assert.equal(f.emails.length, 0);
});
test('public submission is rate limited', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 5; i++) assert.equal((await f.request()).status, 202);
  assert.equal((await f.request()).status, 429);
  assert.equal(f.rows.length, 1);
});
for (const options of [{ mailFail: true }, { simulated: true }, { noRecipient: true }, { inactiveRecipient: true }]) {
  test(`email delivery problems preserve the request and remain visible: ${JSON.stringify(options)}`, async t => {
    const f = await fixture(t, options);
    assert.equal((await f.request()).status, 202);
    assert.equal(f.rows.length, 1);
    assert.equal(f.rows[0].email_status, options.noRecipient || options.inactiveRecipient ? 'NOT_CONFIGURED' : 'FAILED');
    if (options.inactiveRecipient || options.noRecipient) assert.equal(f.emails.length, 0);
  });
}
test('database failure is not reported as a successful submission', async t => {
  const f = await fixture(t, { dbFail: true });
  assert.equal((await f.request()).status, 500); assert.equal(f.emails.length, 0);
});
test('admin list, settings and status changes require a live admin account', async t => {
  const f = await fixture(t);
  for (const [method, endpoint, data] of [['GET', '', {}], ['GET', '/settings', {}], ['PUT', '/settings', { recipient_user_id: 'admin-1' }], ['PATCH', '/missing', { status: 'CLOSED' }]]) {
    assert.equal((await f.request(method, endpoint, data)).status, 401);
    for (const role of ['CLIENT', 'DRIVER', 'WAREHOUSE_STAFF']) assert.equal((await f.request(method, endpoint, data, role)).status, 403);
  }
  const disabled = await fixture(t, { inactiveAdmin: true });
  assert.equal((await disabled.request('GET', '/settings', {}, 'ADMIN')).status, 403);
  assert.equal((await f.request('GET', '/settings', {}, 'ADMIN')).status, 200);
});
test('recipient selection only accepts an active admin with email; selected address is server resolved', async t => {
  const f = await fixture(t, { noRecipient: true });
  assert.equal((await f.request('PUT', '/settings', { recipient_user_id: 'external@example.test' }, 'ADMIN')).status, 400);
  assert.equal((await f.request('PUT', '/settings', { recipient_user_id: 'admin-1', email: 'attacker@example.test' }, 'ADMIN')).status, 200);
  assert.equal((await f.request()).status, 202);
  assert.equal(f.emails[0].to, 'admin@example.test');
  assert.equal(f.audits[0][1], 'UPDATE_PROSPECT_RECIPIENT');
});
test('admin updates are field limited and reject invalid states', async t => {
  const f = await fixture(t); await f.request();
  const id = f.rows[0].prospect_id;
  assert.equal((await f.request('PATCH', `/${id}`, { status: 'ADMIN' }, 'ADMIN')).status, 400);
  assert.equal((await f.request('PATCH', '/missing', { status: 'CLOSED' }, 'ADMIN')).status, 404);
  assert.equal((await f.request('PATCH', `/${id}`, { status: 'CONTACTED', email: 'overwritten@example.test' }, 'ADMIN')).status, 200);
  assert.equal(f.rows[0].status, 'CONTACTED'); assert.equal(f.rows[0].email, valid.email);
  const listing = await f.request('GET', '?page=-3', {}, 'ADMIN');
  assert.equal(listing.status, 200); assert.equal(listing.body.page, 1);
  assert.equal((await f.request('GET', '?status=wrong', {}, 'ADMIN')).status, 400);
});
test('prospect email escapes all public content and uses the configured application URL', () => {
  const previous = process.env.FRONTEND_URL; process.env.FRONTEND_URL = 'https://leonexpress.cl';
  try {
    const { buildProspectReceivedEmail } = require('../services/emailTemplates/prospectReceived');
    const email = buildProspectReceivedEmail({ prospect: { ...valid, company: '<script>alert(1)</script>', message: '<img src=x onerror=alert(2)>' } });
    assert.ok(!email.html.includes('<script>')); assert.ok(!email.html.includes('<img src=x'));
    assert.ok(email.html.includes('&lt;script&gt;'));
    assert.ok(email.html.includes('https://leonexpress.cl/prospects')); assert.equal(email.attachments.length, 1);
  } finally { if (previous === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = previous; }
});
