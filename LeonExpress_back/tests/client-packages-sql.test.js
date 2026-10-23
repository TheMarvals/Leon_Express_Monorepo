'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID: uuid } = require('node:crypto');
const { Sequelize } = require('sequelize');
const express = require('express');
const { createClientPackageService } = require('../services/clientPackageService');
function load(file, overrides) {
  const filename = path.resolve(__dirname, '..', file), original = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, process, Buffer, __dirname: path.dirname(filename), console: { log() {}, warn() {}, error: console.error }, require: id => id in overrides ? overrides[id] : original(id) }, { filename });
  return module.exports;
}
// Explicit disposable local MySQL only. Never loads application database credentials.
test('client changes and real scanner serialize, with transactional audit and ownership enforced', { skip: !process.env.TEST_CLIENT_PACKAGES_DB_PORT }, async t => {
  const sequelize = new Sequelize('client_packages_test', 'root', 'client-package-test-only', { host: '127.0.0.1', port: Number(process.env.TEST_CLIENT_PACKAGES_DB_PORT), dialect: 'mysql', logging: false });
  t.after(() => sequelize.close());
  const models = load('models/index.js', { '../config/database': sequelize });
  models.PushSubscription._indexes = [];
  await sequelize.sync({ force: true });
  const role_id = uuid(), client_id = uuid(), user_id = uuid(), pickup_id = uuid();
  await models.Role.create({ role_id, role_name: 'CLIENT' });
  await models.Client.create({ client_id, client_name: 'SQL Test', verification_code: 'SQL', email: 'sql@example.test' });
  await models.User.create({ user_id, role_id, client_id, username: 'sql-test', password_hash: 'test', full_name: 'SQL test', is_active: true });
  await models.Pickup.create({ pickup_id, client_id, pickup_scheduled_date: new Date() });
  const actor = { role: 'CLIENT', client_id, user_id };
  const overrides = { '../models': models, '../middlewares/authenticateToken': (req, res, next) => { req.user = req.get('x-scan') ? { ...actor, role: 'ADMIN' } : actor; next(); } };
  overrides['../utils/pickupPackageLock'] = load('utils/pickupPackageLock.js', overrides);
  const app = express(); app.use(express.json());
  app.use('/client-packages', load('routes/clientPackages.js', overrides));
  app.use('/scan', load('routes/ml_confirm.js', overrides));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (method, url, body, scan = false) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method, headers: { 'Content-Type': 'application/json', ...(scan ? { 'x-scan': 'yes' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const create = () => models.Package.create({ package_id: uuid(), tracking_code: `LE${uuid().slice(0, 8)}`, client_id, status: 'PENDIENTE_RECOLECCION', scanned_at_origin_datetime: null, recipient_name: 'Original', destination_address: 'Calle 123, Santiago', client_price: 2800, delivery_cost: 1700 });
  const input = { recipient_name: 'Corregido', recipient_phone: '', destination_address: 'Nueva calle, Santiago (Obs: Recepción)', is_cod: false, cod_amount: 0 };
  const service = createClientPackageService(models);
  const pkg = await create();
  assert.equal((await request('PUT', `/client-packages/${pkg.package_id}`, input)).status, 200);
  await pkg.reload(); assert.equal(pkg.recipient_name, 'Corregido'); assert.equal(Number(pkg.client_price), 2800);
  assert.equal((await request('DELETE', `/client-packages/${pkg.package_id}`)).status, 200);
  assert.equal(await models.Package.findByPk(pkg.package_id), null);
  assert.equal(await models.AuditLog.count({ where: { target_id: pkg.package_id } }), 2);

  const audited = await create();
  models.AuditLog.addHook('beforeCreate', 'failAudit', () => { throw Error('Test audit failure'); });
  await assert.rejects(service.remove(actor, audited.package_id), /Test audit failure/);
  models.AuditLog.removeHook('beforeCreate', 'failAudit');
  assert.ok(await models.Package.findByPk(audited.package_id));

  for (const scanFirst of [true, false]) {
    const race = await create();
    let release, entered;
    const paused = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    let held = false;
    models.Package.addHook('afterFind', 'pauseWinner', async (row, options) => {
      const scanQuery = !!options.where?.package_id && !options.where?.client_id;
      if (!held && row?.package_id === race.package_id && options.lock && scanQuery === scanFirst) {
        held = true; entered(); await gate;
      }
    });
    const scan = () => request('POST', '/scan/packages/confirm-ml', { pickup_id, ml_code: race.tracking_code }, true);
    const remove = () => request('DELETE', `/client-packages/${race.package_id}`);
    const first = scanFirst ? scan() : remove();
    await paused;
    const second = scanFirst ? remove() : scan();
    release();
    const [winner, loser] = await Promise.all([first, second]);
    models.Package.removeHook('afterFind', 'pauseWinner');
    assert.equal(winner.status, 200, JSON.stringify(winner));
    assert.equal(loser.status, scanFirst ? 409 : 404, JSON.stringify(loser));
    const stored = await models.Package.findByPk(race.package_id);
    if (scanFirst) { assert.equal(stored.status, 'RECOLECTADO_EN_ORIGEN'); await assert.rejects(service.update(actor, race.package_id, input), e => e.status === 409); }
    else assert.equal(stored, null);
  }
});
