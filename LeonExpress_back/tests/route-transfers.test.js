'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID: uuid } = require('node:crypto');
const { Sequelize, Op } = require('sequelize');
const express = require('express');

function load(relativePath, overrides) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const originalRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, process, Buffer, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error: console.error },
    require: (id) => Object.hasOwn(overrides, id) ? overrides[id] : originalRequire(id),
    __dirname: path.dirname(filename)
  }, { filename });
  return module.exports;
}

// Runs only against an explicitly configured disposable local database.
// TEST_ROUTE_DB_PORT=... node --test tests/route-transfers.test.js
// The database name is fixed to avoid touching application data.
test('route transfers with real SQL, HTTP handlers and concurrency', { skip: !process.env.TEST_ROUTE_DB_PORT }, async (t) => {
  const sequelize = new Sequelize('route_transfer_test', 'root', 'route-test-only', {
    host: '127.0.0.1', port: Number(process.env.TEST_ROUTE_DB_PORT), dialect: 'mysql', logging: false,
    define: { underscored: true, freezeTableName: true }
  });
  t.after(() => sequelize.close());
  const models = load('models/index.js', { '../config/database': sequelize });
  // The unrelated push model declares an unbounded TEXT index unsupported by MySQL.
  models.PushSubscription._indexes = [];
  await sequelize.sync({ force: true });
  // Recreate the pre-migration route_packages schema, then execute the real migration.
  await sequelize.query('ALTER TABLE route_packages DROP COLUMN released_at, DROP COLUMN release_reason, DROP COLUMN released_by_user_id, DROP COLUMN status_at_release, DROP COLUMN transferred_to_route_id');
  const assignments = load('services/routeAssignments.js', { '../models': models });
  const authenticate = (req, res, next) => {
    req.user = { user_id: req.headers['x-user'], role: req.headers['x-role'] || 'DRIVER' };
    next();
  };
  const overrides = {
    '../models': models,
    '../middlewares/authenticateToken': authenticate,
    '../services/routeAssignments': assignments,
    '../utils/audit': { logAudit: async () => {} },
    '../utils/notificationService': { queueNotification() {}, queueNotificationForRole() {} },
    '../utils/qrDecoder': {}, '../utils/smartOcrParser': {}
  };
  const app = express();
  app.use(express.json());
  app.use('/routes', load('routes/route.js', overrides));
  app.use('/events', load('routes/delivery_events.js', overrides));
  app.use('/packages', load('routes/package.js', overrides));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = async (method, url, body, user, role = 'DRIVER') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method, headers: { 'Content-Type': 'application/json', 'x-user': user, 'x-role': role },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, data: await response.json() };
  };
  const { Role, Warehouse, User, Client, VehicleType, Vehicle, Pickup, Package, Route, RoutePackage, Delivery, PayoutItem, DriverPayout } = models;
  const driverRole = await Role.create({ role_id: uuid(), role_name: 'DRIVER' });
  async function fixture(status = 'EN_RUTA_ENTREGA') {
    const warehouse_id = uuid(), user_id = uuid(), other_id = uuid(), client_id = uuid(), pickup_id = uuid(), vehicle_id = uuid(), type_id = uuid();
    await Warehouse.create({ warehouse_id, warehouse_name: 'Test', address: 'Test' });
    for (const id of [user_id, other_id]) await User.create({ user_id: id, username: id, password_hash: 'test', role_id: driverRole.role_id, warehouse_id, full_name: 'Test' });
    await Client.create({ client_id, verification_code: 'TEST', client_name: 'Test', email: `${uuid()}@example.com` });
    await VehicleType.create({ type_id, type_name: uuid(), base_delivery_cost: 2000 });
    await Vehicle.create({ vehicle_id, type_id, user_id, license_plate: uuid().slice(0, 8) });
    await Pickup.create({ pickup_id, user_id, client_id, pickup_scheduled_date: new Date(), status: 'VERIFICADO_EN_ALMACEN' });
    const source = await Route.create({ route_id: uuid(), user_id, vehicle_id, warehouse_id, start_date: new Date(), status: 'EN_PROGRESO', loading_status: 'APPROVED', route_type: 'ENTREGA' });
    const target = await Route.create({ route_id: uuid(), user_id: other_id, vehicle_id, warehouse_id, start_date: new Date(), status: 'EN_PROGRESO', loading_status: 'APPROVED', route_type: 'ENTREGA' });
    const pkg = await Package.create({ package_id: uuid(), tracking_code: uuid(), pickup_id, client_id, status, client_price: 3000, delivery_cost: 1500, destination_address: 'Test', recipient_name: 'Test' });
    const rp = await RoutePackage.create({ route_package_id: uuid(), route_id: source.route_id, package_id: pkg.package_id });
    return { source, target, pkg, rp, user_id, other_id };
  }
  // Exercise the real preflight and upgrade with existing route history.
  const legacy = await fixture();
  await RoutePackage.create({ route_package_id: uuid(), route_id: legacy.target.route_id,
    package_id: legacy.pkg.package_id, created_at: legacy.rp.created_at });
  const { migrate } = require('../scripts/migrate-route-transfers');
  const adapter = { query: (sql) => sequelize.query(sql).then(([rows]) => [rows]) };
  await assert.rejects(migrate(adapter, true), /última fecha ambigua/);
  const [untouched] = await sequelize.query("SHOW COLUMNS FROM route_packages LIKE 'released_at'");
  assert.equal(untouched.length, 0);
  await sequelize.query('UPDATE route_packages SET created_at = :date WHERE route_package_id = :id', {
    replacements: { date: new Date(Date.now() - 86400000), id: legacy.rp.route_package_id }
  });
  assert.match(await migrate(adapter, false), /Verificación correcta/);
  assert.match(await migrate(adapter, true), /Migración aplicada/);
  await legacy.rp.reload();
  assert.equal(legacy.rp.release_reason, 'ASIGNACION_ANTERIOR');
  assert.equal(legacy.rp.transferred_to_route_id, legacy.target.route_id);
  assert.equal(legacy.rp.status_at_release, 'SIN_ESTADO_HISTORICO');
  assert.equal(await RoutePackage.count({ where: { package_id: legacy.pkg.package_id, released_at: null } }), 1);

  const transfer = (f, ids = [f.pkg.package_id], user = f.user_id, role = 'ADMIN') => request('POST', `/routes/${f.source.route_id}/transfer-packages`, {
    target_route_id: f.target.route_id, package_ids: ids, confirm_physical_handoff: true
  }, user, role);
  const deliver = (f, user = f.other_id) => request('POST', `/events/packages/${f.pkg.package_id}/deliveries`, {
    status_at_delivery: 'ENTREGADO', receiver_name: 'Test', receiver_rut: '12345678K'
  }, user);

  await t.test('transfer, close source, deliver on target and keep historical outcome', async () => {
    const f = await fixture();
    assert.equal((await transfer(f)).status, 200);
    await f.rp.reload();
    assert.equal(f.rp.release_reason, 'TRANSFERIDO');
    assert.equal(f.rp.status_at_release, 'EN_RUTA_ENTREGA');
    assert.equal((await request('PUT', `/routes/${f.source.route_id}/status`, { status: 'FINALIZADA' }, f.user_id)).status, 200);
    assert.equal((await deliver(f, f.user_id)).status, 403);
    const result = await deliver(f);
    assert.equal(result.status, 201, JSON.stringify(result));
    const delivery = await Delivery.findOne({ where: { package_id: f.pkg.package_id } });
    const active = await RoutePackage.findOne({ where: { package_id: f.pkg.package_id, released_at: null } });
    assert.equal(delivery.route_package_id, active.route_package_id);
    assert.equal(delivery.user_id, f.other_id);
    const oldRoute = await request('GET', `/routes/${f.source.route_id}`, null, f.user_id);
    assert.equal(oldRoute.data.routePackages[0].package.status, 'EN_RUTA_ENTREGA');
    assert.equal((await deliver(f)).status, 409);
  });
  await t.test('a driver can keep two active routes and close them independently', async () => {
    const f = await fixture();
    await f.target.update({ user_id: f.user_id });
    const result = await transfer(f, undefined, f.user_id, 'DRIVER');
    assert.equal(result.status, 200, JSON.stringify(result));
    const routes = await Route.findAll({ where: { user_id: f.user_id, status: 'EN_PROGRESO' } });
    assert.equal(routes.length, 2);
    const created = await request('POST', '/routes', { user_id: f.user_id, vehicle_id: f.source.vehicle_id,
      warehouse_id: f.source.warehouse_id, start_date: new Date().toISOString(), route_type: 'ENTREGA' }, f.user_id, 'ADMIN');
    assert.equal(created.status, 201, JSON.stringify(created));
    assert.equal((await request('PUT', `/routes/${f.source.route_id}/status`, { status: 'FINALIZADA' }, f.user_id)).status, 200);
    assert.equal((await f.target.reload()).status, 'EN_PROGRESO');
    assert.equal((await deliver(f, f.user_id)).status, 201);
  });
  await t.test('a pending target can receive packages and start without touching source deliveries', async () => {
    const f = await fixture();
    await f.target.update({ status: 'PENDIENTE' });
    assert.equal((await transfer(f)).status, 200);
    assert.equal((await f.pkg.reload()).status, 'ASIGNADO_A_RUTA');
    assert.equal((await request('PUT', `/routes/${f.target.route_id}/status`, { status: 'EN_PROGRESO' }, f.other_id)).status, 200);
    assert.equal((await f.pkg.reload()).status, 'EN_RUTA_ENTREGA');
  });
  await t.test('reject closed targets, missing physical confirmation and transfers of incidents', async () => {
    const f = await fixture();
    const url = `/routes/${f.source.route_id}/transfer-packages`;
    const result = await request('POST', url, { target_route_id: f.target.route_id, package_ids: [f.pkg.package_id] }, f.user_id, 'ADMIN');
    assert.equal(result.status, 400);
    await f.target.update({ status: 'FINALIZADA' });
    assert.equal((await transfer(f)).status, 409);
    await f.target.update({ status: 'EN_PROGRESO' });
    await f.pkg.update({ status: 'INCIDENCIA_ENTREGA' });
    assert.equal((await transfer(f)).status, 409);
  });
  await t.test('an unprocessed package blocks closing and unrelated drivers cannot close it', async () => {
    const f = await fixture();
    assert.equal((await request('PUT', `/routes/${f.source.route_id}/status`, { status: 'FINALIZADA' }, f.user_id)).status, 409);
    assert.equal((await request('PUT', `/routes/${f.source.route_id}/status`, { status: 'FINALIZADA' }, f.other_id)).status, 403);
    assert.equal((await transfer(f, undefined, f.user_id, 'DRIVER')).status, 403);
  });
  await t.test('failed batch leaves every package with its original owner', async () => {
    const f = await fixture();
    const other = await fixture('ENTREGADO');
    assert.equal((await transfer(f, [f.pkg.package_id, other.pkg.package_id])).status, 409);
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id, released_at: null, route_id: f.source.route_id } }), 1);
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id } }), 1);
  });
  await t.test('scan on an approved route requires confirmation and repeated scan is idempotent', async () => {
    const f = await fixture();
    const url = `/routes/${f.target.route_id}/scan-package`;
    const body = { external_tracking_code: f.pkg.tracking_code };
    const before = await request('POST', url, body, f.other_id);
    assert.equal(before.status, 409);
    assert.equal(before.data.code, 'TRANSFER_CONFIRMATION_REQUIRED');
    assert.equal((await request('POST', url, { ...body, confirm_transfer: true }, f.other_id)).status, 200);
    const again = await request('POST', url, body, f.other_id);
    assert.equal(again.data.already_in_route, true);
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id, released_at: null } }), 1);
    assert.equal((await f.pkg.reload()).status, 'EN_RUTA_ENTREGA');
  });
  await t.test('physical warehouse reception releases the old route and terminal deliveries cannot be reset', async () => {
    const f = await fixture();
    assert.equal((await request('PUT', `/packages/${f.pkg.package_id}/receive-at-warehouse`, {}, f.user_id, 'ADMIN')).status, 200);
    assert.equal((await f.rp.reload()).release_reason, 'RECIBIDO_EN_ALMACEN');
    assert.equal((await request('PUT', `/routes/${f.source.route_id}/status`, { status: 'FINALIZADA' }, f.user_id)).status, 200);
    await f.pkg.update({ status: 'ENTREGADO' });
    assert.equal((await request('PUT', `/packages/${f.pkg.package_id}/receive-at-warehouse`, {}, f.user_id, 'ADMIN')).status, 409);
  });
  await t.test('concurrent scans keep exactly one active owner', async () => {
    const f = await fixture();
    const body = { external_tracking_code: f.pkg.tracking_code, confirm_transfer: true };
    const results = await Promise.all([
      request('POST', `/routes/${f.target.route_id}/scan-package`, body, f.other_id),
      request('POST', `/routes/${f.source.route_id}/scan-package`, body, f.user_id)
    ]);
    assert.deepEqual(results.map((r) => r.status), [200, 200]);
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id, released_at: null } }), 1);
  });
  await t.test('concurrent deliveries yield a single successful record', async () => {
    const f = await fixture();
    await transfer(f);
    const results = await Promise.all([deliver(f), deliver(f)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await Delivery.count({ where: { package_id: f.pkg.package_id, status_at_delivery: 'ENTREGADO' } }), 1);
    // Direct SQL writers are guarded too.
    await assert.rejects(Delivery.create({ delivery_id: uuid(), package_id: f.pkg.package_id, user_id: f.other_id, status_at_delivery: 'ENTREGADO' }), { name: 'SequelizeUniqueConstraintError' });
  });
  await t.test('migration runner recognizes an already migrated database', async () => {
    const { migrate } = require('../scripts/migrate-route-transfers');
    const adapter = { query: (sql) => sequelize.query(sql).then(([rows]) => [rows]) };
    assert.match(await migrate(adapter, true), /ya está aplicada/);
  });
  await t.test('one base delivery payment across payout periods; additional costs remain allowed', async () => {
    const f = await fixture();
    const payout1 = await DriverPayout.create({ payout_id: uuid(), user_id: f.user_id, payout_date: '2026-10-16' });
    const payout2 = await DriverPayout.create({ payout_id: uuid(), user_id: f.other_id, payout_date: '2026-10-23' });
    await PayoutItem.create({ payout_item_id: uuid(), payout_id: payout1.payout_id, package_id: f.pkg.package_id, item_description: 'Entrega - TEST', amount: 2000 });
    await assert.rejects(PayoutItem.create({ payout_item_id: uuid(), payout_id: payout2.payout_id, package_id: f.pkg.package_id, item_description: 'Entrega - TEST', amount: 2000 }), { name: 'SequelizeUniqueConstraintError' });
    await PayoutItem.create({ payout_item_id: uuid(), payout_id: payout2.payout_id, package_id: f.pkg.package_id, item_description: 'Costo adicional', amount: 100 });
  });
});
