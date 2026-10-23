'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const { Sequelize } = require('sequelize');
const express = require('express');
function load(file, overrides) {
  const filename = path.resolve(__dirname, '..', file), original = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, console, process, Buffer,
    require: id => Object.hasOwn(overrides, id) ? overrides[id] : original(id) }, { filename });
  return module.exports;
}
test('prospects use the shipped migration and real SQL without creating portal identities', { skip: !process.env.TEST_ROUTE_DB_PORT }, async t => {
  const options = { host: '127.0.0.1', port: Number(process.env.TEST_ROUTE_DB_PORT), dialect: 'mysql', logging: false };
  const root = new Sequelize('route_transfer_test', 'root', 'route-test-only', options);
  await root.query('CREATE DATABASE prospects_flow_test');
  const sequelize = new Sequelize('prospects_flow_test', 'root', 'route-test-only', options);
  t.after(async () => { await sequelize.close(); await root.query('DROP DATABASE prospects_flow_test'); await root.close(); });
  const models = load('models/index.js', { '../config/database': sequelize });
  models.PushSubscription._indexes = [];
  await sequelize.sync({ force: true });
  await models.Prospect.drop();
  const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/20261022_prospects.sql'), 'utf8');
  await sequelize.query(sql); await sequelize.query(sql);
  const role = await models.Role.create({ role_id: randomUUID(), role_name: 'ADMIN' });
  const admin = await models.User.create({ user_id: randomUUID(), username: 'admin-test', full_name: 'Admin Test', password_hash: 'test', role_id: role.role_id, email: 'admin@example.test' });
  const sent = [];
  const router = load('routes/prospects.js', { '../models': models,
    '../middlewares/authenticateToken': (req, res, next) => { req.user = { user_id: admin.user_id, role: 'ADMIN' }; next(); },
    '../utils/audit': { logAudit: async () => {} },
    '../utils/notificationService': { queueNotification: async () => {} },
    '../services/emailService': { sendProspectNotification: async data => { sent.push(data); return { success: true }; } },
  });
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  async function request(method, endpoint, body) {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  }
  const payload = { company: 'Tienda SQL', contact_name: 'Ana Test', email: 'ANA@example.test', phone: '+56912345678', commune: 'Santiago', volume: '10 a 50', consent: true };
  const settings = await request('GET', '/settings');
  assert.equal(settings.status, 200); assert.equal(settings.data.admins[0].email, admin.email);
  assert.equal((await request('PUT', '/settings', { recipient_user_id: admin.user_id })).status, 200);
  assert.equal((await request('PUT', '/settings', { recipient_user_id: admin.user_id })).status, 200);
  const responses = await Promise.all([request('POST', '/', payload), request('POST', '/', payload)]);
  assert.deepEqual(responses.map(r => r.status), [202, 202]);
  assert.equal(await models.Prospect.count(), 1); assert.equal(sent.length, 1);
  assert.equal(await models.Client.count(), 0); assert.equal(await models.User.count(), 1);
  const prospect = await models.Prospect.findOne();
  assert.equal(prospect.email, 'ana@example.test'); assert.equal(prospect.email_status, 'SENT');
  assert.equal((await request('GET', '/?search=SQL&status=NEW')).data.total, 1);
  assert.equal((await request('PATCH', `/${prospect.prospect_id}`, { status: 'CONTACTED' })).status, 200);
  assert.equal((await request('GET', '/?status=NEW')).data.total, 0);
  assert.equal((await request('GET', '/settings')).data.pending, 0);
  await admin.update({ is_active: false });
  assert.equal((await request('GET', '/settings')).status, 403);
  assert.equal((await request('POST', '/', { ...payload, email: 'other@example.test' })).status, 202);
  const other = await models.Prospect.findOne({ where: { email: 'other@example.test' } });
  assert.equal(other.email_status, 'NOT_CONFIGURED'); assert.equal(sent.length, 1);
});
