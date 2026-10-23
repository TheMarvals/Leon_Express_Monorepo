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
  // The production schema also has a legacy unique index absent from the model.
  await sequelize.query('ALTER TABLE route_packages ADD UNIQUE INDEX uniq_route_package (route_id, package_id)');
  const assignments = load('services/routeAssignments.js', { '../models': models });
  const authenticate = (req, res, next) => {
    req.user = { user_id: req.headers['x-user'], role: req.headers['x-role'] || 'DRIVER' };
    next();
  };
  const auditEntries = [];
  const overrides = {
    '../models': models,
    '../middlewares/authenticateToken': authenticate,
    '../services/routeAssignments': assignments,
    '../services/clientEmailService': load('services/clientEmailService.js', { '../models': models }),
    '../utils/audit': { logAudit: async (actorId, action, details) => auditEntries.push({ actorId, action, details }) },
    '../utils/notificationService': { queueNotification() {}, queueNotificationForRole() {} },
    '../utils/qrDecoder': {}, '../utils/smartOcrParser': {}
  };
  const app = express();
  app.use(express.json());
  app.use('/routes', load('routes/route.js', overrides));
  app.use('/users', load('routes/user.js', overrides));
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
  const deliver = (f, user = f.other_id, extra = {}) => request('POST', `/events/packages/${f.pkg.package_id}/deliveries`, {
    status_at_delivery: 'ENTREGADO', receiver_name: 'Test', receiver_rut: '12345678K', ...extra
  }, user);

  async function closeWithCustody(status = 'INCIDENCIA_ENTREGA') {
    const f = await fixture(status);
    const closed = await request('PUT', `/routes/${f.source.route_id}/status`, { status: 'FINALIZADA' }, f.user_id);
    assert.equal(closed.status, 200, JSON.stringify(closed));
    assert.equal((await f.pkg.reload()).pending_return_user_id, f.user_id);
    return f;
  }
  await t.test('closed routes allow another attempt only by the driver retaining custody', async () => {
    for (const status of ['INCIDENCIA_ENTREGA', 'REPROGRAMADO']) {
      const f = await closeWithCustody(status);
      const closedAt = (await f.source.reload()).end_date.getTime();
      assert.equal((await deliver(f, f.other_id)).status, 403);
      const retry = await deliver(f, f.user_id, { status_at_delivery: 'NO_HAY_NADIE' });
      assert.equal(retry.status, 201, JSON.stringify(retry));
      assert.equal((await f.pkg.reload()).pending_return_user_id, f.user_id);
      const result = await deliver(f, f.user_id);
      assert.equal(result.status, 201, JSON.stringify(result));
      await f.pkg.reload();
      assert.equal(f.pkg.status, 'ENTREGADO');
      assert.equal(f.pkg.pending_return_user_id, null);
      const delivery = await Delivery.findOne({ where: { package_id: f.pkg.package_id, status_at_delivery: 'ENTREGADO' } });
      assert.equal(delivery.route_package_id, f.rp.route_package_id);
      assert.equal((await f.source.reload()).status, 'FINALIZADA');
      assert.equal(f.source.end_date.getTime(), closedAt);
      assert.equal((await deliver(f, f.user_id)).status, 409);
    }
  });
  await t.test('closed routes require explicit custody, including when another driver holds the package', async () => {
    const f = await closeWithCustody();
    for (const custodian of [null, f.other_id]) {
      await f.pkg.update({ pending_return_user_id: custodian });
      assert.equal((await deliver(f, f.user_id)).status, 403);
    }
    assert.equal(await Delivery.count({ where: { package_id: f.pkg.package_id } }), 0);
  });
  await t.test('warehouse return and reassignment revoke delivery permission on a closed route', async () => {
    const f = await closeWithCustody();
    assert.equal((await request('PUT', `/packages/${f.pkg.package_id}/receive-at-warehouse`, {}, f.user_id, 'ADMIN')).status, 200);
    assert.equal((await f.pkg.reload()).pending_return_user_id, null);
    assert.equal((await deliver(f, f.user_id)).status, 409);
    const assigned = await request('POST', `/routes/${f.target.route_id}/scan-package`, {
      external_tracking_code: f.pkg.tracking_code
    }, f.other_id);
    assert.equal(assigned.status, 200, JSON.stringify(assigned));
    assert.equal((await deliver(f, f.user_id)).status, 403);
    assert.equal((await deliver(f)).status, 201);
  });
  await t.test('simultaneous attempts after route closure record only one successful delivery', async () => {
    const f = await closeWithCustody();
    const results = await Promise.all([deliver(f, f.user_id), deliver(f, f.user_id)]);
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    assert.equal(await Delivery.count({ where: { package_id: f.pkg.package_id, status_at_delivery: 'ENTREGADO' } }), 1);
  });

  await t.test('transfer, close source, deliver on target and keep historical outcome', async () => {
    const f = await fixture();
    assert.equal((await transfer(f)).status, 200);
    await f.rp.reload();
    assert.equal(f.rp.release_reason, 'TRANSFERIDO');
    assert.equal(f.rp.status_at_release, 'EN_RUTA_ENTREGA');
    assert.equal(f.rp.released_by_user_id, f.user_id);
    assert.equal(f.rp.transferred_to_route_id, f.target.route_id);
    const audit = auditEntries.find(entry => entry.action === 'TRANSFER_ROUTE_PACKAGES' && entry.details.source_route_id === f.source.route_id);
    assert.equal(audit.actorId, f.user_id);
    assert.equal(audit.details.target_route_id, f.target.route_id);
    assert.deepEqual(Array.from(audit.details.package_ids), [f.pkg.package_id]);
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
  await t.test('drivers see only their own destinations; only admins reassign between drivers', async () => {
    const f = await fixture();
    const url = `/routes/${f.source.route_id}/transfer-destinations`;
    assert.deepEqual((await request('GET', url, null, f.user_id)).data.routes, []);
    assert.equal((await transfer(f, undefined, f.user_id, 'DRIVER')).status, 403);
    const result = await request('GET', url, null, f.user_id, 'ADMIN');
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.deepEqual(result.data.routes.map(item => item.route_id), [f.target.route_id]);
    const otherWarehouse = await fixture();
    const refreshed = await request('GET', url, null, f.user_id, 'ADMIN');
    assert.equal(refreshed.data.routes.some(item => item.route_id === otherWarehouse.target.route_id), false);
    await f.target.update({ status: 'FINALIZADA' });
    assert.equal((await request('GET', url, null, f.user_id, 'ADMIN')).data.routes.length, 0);
    await f.target.update({ status: 'EN_PROGRESO' });
    assert.equal((await transfer(f)).status, 200);
    assert.equal((await deliver(f, f.user_id)).status, 403);
    assert.equal((await deliver(f)).status, 201);
  });
  await t.test('handoffs keep manually agreed delivery fees and customer COD amounts', async () => {
    const f = await fixture();
    await f.pkg.update({ is_delivery_cost_manual: true, delivery_cost: 2750, is_cod: true, cod_amount: 12000 });
    assert.equal((await transfer(f)).status, 200);
    await f.pkg.reload();
    assert.equal(Number(f.pkg.delivery_cost), 2750);
    assert.equal(Number(f.pkg.client_price), 3000);
    assert.equal(Number(f.pkg.cod_amount), 12000);
  });
  await t.test('a driver can keep two active routes and close them independently', async () => {
    const f = await fixture();
    await f.target.update({ user_id: f.user_id });
    const result = await transfer(f);
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
    assert.equal((await transfer(f, undefined, f.other_id, 'DRIVER')).status, 403);
  });
  await t.test('failed batch leaves every package with its original owner', async () => {
    const f = await fixture();
    const other = await fixture('ENTREGADO');
    assert.equal((await transfer(f, [f.pkg.package_id, other.pkg.package_id])).status, 409);
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id, released_at: null, route_id: f.source.route_id } }), 1);
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id } }), 1);
  });
  await t.test('driver scan cannot transfer; after admin reassignment repeated scanning is idempotent', async () => {
    const f = await fixture();
    const url = `/routes/${f.target.route_id}/scan-package`;
    const body = { external_tracking_code: f.pkg.tracking_code };
    const before = await request('POST', url, body, f.other_id);
    assert.equal(before.status, 403);
    assert.equal((await request('POST', url, { ...body, confirm_transfer: true }, f.other_id)).status, 403);
    assert.equal((await transfer(f)).status, 200);
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
    await f.target.update({ user_id: f.user_id });
    const body = { external_tracking_code: f.pkg.tracking_code, confirm_transfer: true };
    const results = await Promise.all([
      request('POST', `/routes/${f.target.route_id}/scan-package`, body, f.user_id),
      request('POST', `/routes/${f.source.route_id}/scan-package`, body, f.user_id)
    ]);
    assert.deepEqual(results.map((r) => r.status), [200, 200]);
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id, released_at: null } }), 1);
  });
  await t.test('a package can return to a route it previously visited without losing history', async () => {
    const f = await fixture();
    await f.target.update({ user_id: f.user_id });
    assert.equal((await transfer(f)).status, 200);
    const result = await request('POST', `/routes/${f.target.route_id}/transfer-packages`, {
      target_route_id: f.source.route_id, package_ids: [f.pkg.package_id], confirm_physical_handoff: true
    }, f.user_id, 'ADMIN');
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id } }), 3);
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id, released_at: null } }), 1);
    assert.equal((await f.rp.reload()).release_reason, 'TRANSFERIDO');
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
  await t.test('admin and assigned driver add verified warehouse packages after departure without incidents', async () => {
    for (const viaScan of [false, true]) {
      const f = await fixture('RECIBIDO_EN_ALMACEN');
      await f.rp.update({ released_at: new Date(), release_reason: 'RECIBIDO_EN_ALMACEN' });
      const result = viaScan
        ? await request('POST', `/routes/${f.target.route_id}/scan-package`, { external_tracking_code: f.pkg.tracking_code }, f.other_id)
        : await request('POST', `/routes/${f.target.route_id}/packages`, { package_ids: [f.pkg.package_id] }, f.user_id, 'ADMIN');
      assert.equal(result.status, 200, JSON.stringify(result));
      assert.equal((await f.pkg.reload()).status, 'EN_RUTA_ENTREGA');
      assert.equal(await Delivery.count({ where: { package_id: f.pkg.package_id } }), 0);
      assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id, released_at: null, route_id: f.target.route_id } }), 1);
    }
  });
  await t.test('closed and cancelled routes reject every add and transfer path', async () => {
    for (const status of ['FINALIZADA', 'CANCELADA']) {
      const f = await fixture('RECIBIDO_EN_ALMACEN');
      await f.rp.update({ released_at: new Date(), release_reason: 'RECIBIDO_EN_ALMACEN' });
      await f.target.update({ status });
      assert.equal((await request('POST', `/routes/${f.target.route_id}/packages`, { package_ids: [f.pkg.package_id] }, f.user_id, 'ADMIN')).status, 409);
      assert.equal((await request('POST', `/routes/${f.target.route_id}/scan-package`, { external_tracking_code: f.pkg.tracking_code }, f.other_id)).status, 409);
      assert.equal((await transfer(f)).status, 409);
      assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id, released_at: null } }), 0);
    }
  });
  await t.test('scanning cannot bypass a closed origin route even with physical confirmation', async () => {
    const f = await fixture();
    await f.target.update({ user_id: f.user_id });
    await f.source.update({ status: 'FINALIZADA' });
    const result = await request('POST', `/routes/${f.target.route_id}/scan-package`, {
      external_tracking_code: f.pkg.tracking_code, confirm_transfer: true,
    }, f.user_id, 'ADMIN');
    assert.equal(result.status, 409);
    assert.equal(await RoutePackage.count({ where: { package_id: f.pkg.package_id, released_at: null, route_id: f.source.route_id } }), 1);
  });
  await t.test('drivers migrate only between their own routes, with confirmation for scanning', async () => {
    const f = await fixture();
    await f.target.update({ user_id: f.user_id });
    const url = `/routes/${f.target.route_id}/scan-package`;
    const body = { external_tracking_code: f.pkg.tracking_code };
    const before = await request('POST', url, body, f.user_id);
    assert.equal(before.status, 409);
    assert.equal(before.data.code, 'TRANSFER_CONFIRMATION_REQUIRED');
    assert.equal((await request('POST', url, { ...body, confirm_transfer: true }, f.user_id)).status, 200);
    assert.equal(await Delivery.count({ where: { package_id: f.pkg.package_id } }), 0);
    const other = await fixture();
    assert.equal((await transfer(other, undefined, other.user_id, 'DRIVER')).status, 403);
    assert.equal((await request('POST', `/routes/${other.target.route_id}/scan-package`, {
      external_tracking_code: other.pkg.tracking_code, confirm_transfer: true,
    }, other.other_id)).status, 403);
    await other.target.update({ user_id: other.user_id });
    const destinations = await request('GET', `/routes/${other.source.route_id}/transfer-destinations`, null, other.user_id);
    assert.deepEqual(destinations.data.routes.map(item => item.route_id).sort(), [other.target.route_id]);
    assert.equal((await transfer(other, undefined, other.user_id, 'DRIVER')).status, 200);
  });
  const plan = (f, date) => ({
    user_id: f.user_id, vehicle_id: f.source.vehicle_id, warehouse_id: f.source.warehouse_id,
    start_date: date.toISOString(), route_type: 'ENTREGA',
  });
  await t.test('a new day is blocked by either pending or started routes until all earlier routes close', async () => {
    for (const priorStatus of ['PENDIENTE', 'EN_PROGRESO']) {
      const f = await fixture();
      await f.source.update({ status: priorStatus });
      await f.target.update({ user_id: f.user_id });
      const date = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const create = () => request('POST', '/routes', plan(f, date), f.user_id, 'ADMIN');
      assert.equal((await create()).status, 409);
      await f.source.update({ status: 'FINALIZADA' });
      assert.equal((await create()).status, 409);
      await f.target.update({ status: 'FINALIZADA' });
      assert.equal((await create()).status, 201);
    }
  });
  await t.test('moving a planned route to another driver or day cannot bypass the daily rule', async () => {
    const f = await fixture();
    await f.target.update({ status: 'PENDIENTE' });
    const date = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const edit = () => request('PUT', `/routes/${f.target.route_id}`, plan(f, date), f.user_id, 'ADMIN');
    assert.equal((await edit()).status, 409);
    assert.equal((await f.target.reload()).user_id, f.other_id);
    await f.source.update({ status: 'FINALIZADA' });
    assert.equal((await edit()).status, 200);
  });
  await t.test('a preexisting next-day route cannot start while an older route is open', async () => {
    const f = await fixture();
    await f.target.update({ user_id: f.user_id, status: 'PENDIENTE', start_date: new Date(Date.now() + 48 * 60 * 60 * 1000) });
    await f.rp.update({ released_at: new Date(), release_reason: 'TRANSFERIDO' });
    await RoutePackage.create({ route_package_id: uuid(), route_id: f.target.route_id, package_id: f.pkg.package_id });
    const start = () => request('PUT', `/routes/${f.target.route_id}/status`, { status: 'EN_PROGRESO' }, f.user_id);
    assert.equal((await start()).status, 409);
    await f.source.update({ status: 'FINALIZADA' });
    assert.equal((await start()).status, 200);
  });
  await t.test('simultaneous assignments for different days cannot leave two days open', async () => {
    const f = await fixture();
    await f.source.update({ status: 'FINALIZADA' });
    const results = await Promise.all([0, 48].map(hours => request('POST', '/routes',
      plan(f, new Date(Date.now() + hours * 60 * 60 * 1000)), f.user_id, 'ADMIN')));
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  });
  await t.test('changing a new route to yesterday cannot bypass the day restriction', async () => {
    const f = await fixture();
    const result = await request('POST', '/routes', plan(f, new Date(Date.now() - 48 * 60 * 60 * 1000)), f.user_id, 'ADMIN');
    assert.equal(result.status, 409);
  });
  await t.test('the daily boundary follows Chile rather than UTC midnight', async () => {
    const f = await fixture();
    await f.source.update({ start_date: new Date('2099-01-22T23:30:00Z') });
    assert.equal((await request('POST', '/routes', plan(f, new Date('2099-01-23T02:45:00Z')), f.user_id, 'ADMIN')).status, 201);
    assert.equal((await request('POST', '/routes', plan(f, new Date('2099-01-23T03:30:00Z')), f.user_id, 'ADMIN')).status, 409);
  });
  await t.test('inactive-user retention deletes only unreferenced accounts and preserves every associated record', async () => {
    const retention = load('services/userRetention.js', { '../models': models, 'node-cron': {} });
    const f = await fixture();
    const now = new Date(), old = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
    const createInactive = extra => User.create({ user_id: uuid(), username: uuid(), full_name: 'Inactivo',
      password_hash: 'test', role_id: driverRole.role_id, is_active: false, deactivated_at: old, ...extra });
    const empty = await createInactive();
    const actor = await createInactive();
    const linked = await createInactive({ client_id: f.pkg.client_id });
    const recent = await createInactive({ deactivated_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000) });
    const { AuditLog } = models;
    const audit = await AuditLog.create({ log_id: uuid(), user_id: actor.user_id, action: 'HISTORICAL_ACTION' });
    await User.update({ is_active: false, deactivated_at: old }, { where: { user_id: f.user_id } });
    const preview = await retention.runUserRetention({ now, dryRun: true, batchSize: 2 });
    assert.ok(preview.deleted >= 1);
    assert.ok(await User.findByPk(empty.user_id));
    assert.equal((await actor.reload()).archived_at, null);
    const result = await retention.runUserRetention({ now, batchSize: 2 });
    assert.ok(result.deleted >= 1);
    assert.equal(await User.findByPk(empty.user_id), null);
    for (const id of [actor.user_id, linked.user_id, f.user_id]) {
      const user = await User.findByPk(id);
      assert.ok(user.archived_at);
      assert.equal(user.is_active, false);
    }
    assert.equal((await recent.reload()).archived_at, null);
    assert.equal((await f.source.reload()).user_id, f.user_id);
    assert.equal((await f.pkg.reload()).client_id, f.pkg.client_id);
    assert.equal((await audit.reload()).user_id, actor.user_id);
    assert.ok(await AuditLog.findOne({ where: { target_id: empty.user_id, action: 'PURGE_INACTIVE_USER' } }));
    assert.equal((await retention.runUserRetention({ now })).deleted, 0);
    await actor.update({ is_active: true });
    assert.equal(actor.archived_at, null);
    assert.equal(actor.deactivated_at, null);
    await actor.update({ is_active: false });
    assert.ok(new Date(actor.deactivated_at) > old);
  });
  await t.test('retention protects legacy actor references without foreign keys', async () => {
    const retention = load('services/userRetention.js', { '../models': models, 'node-cron': {} });
    const f = await fixture();
    const old = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
    const user = await User.create({ user_id: uuid(), username: uuid(), full_name: 'Historial', password_hash: 'test',
      role_id: driverRole.role_id, is_active: false, deactivated_at: old });
    await f.rp.update({ released_by_user_id: user.user_id });
    await retention.runUserRetention();
    assert.ok((await user.reload()).archived_at);
    assert.equal((await f.rp.reload()).released_by_user_id, user.user_id);
    const current = await request('GET', `/users?search=${user.username}`, null, f.user_id, 'ADMIN');
    assert.equal(current.data.users.length, 0);
    const archived = await request('GET', `/users?archived=true&search=${user.username}`, null, f.user_id, 'ADMIN');
    assert.equal(archived.status, 200);
    assert.equal(archived.data.users.length, 1);
    assert.ok(archived.data.users[0].archived_at);
    assert.equal((await request('GET', '/users?archived=true', null, f.user_id, 'WAREHOUSE_STAFF')).status, 403);
    assert.equal((await request('PATCH', `/users/${user.user_id}/activate`, {}, f.user_id, 'ADMIN')).status, 200);
    await user.reload();
    assert.equal(user.is_active, true);
    assert.equal(user.archived_at, null);
    assert.equal(user.deactivated_at, null);
    assert.equal((await f.rp.reload()).released_by_user_id, user.user_id);

  });
  await t.test('reactivating a candidate before the cleanup lock prevents deletion', async () => {
    const retention = load('services/userRetention.js', { '../models': models, 'node-cron': {} });
    const user = await User.create({ user_id: uuid(), username: uuid(), full_name: 'Reactivado', password_hash: 'test',
      role_id: driverRole.role_id, is_active: false, deactivated_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) });
    const transaction = await sequelize.transaction();
    const locked = await User.findByPk(user.user_id, { transaction, lock: transaction.LOCK.UPDATE });
    const cleanup = retention.runUserRetention();
    await new Promise(resolve => setTimeout(resolve, 50));
    await locked.update({ is_active: true }, { transaction });
    await transaction.commit();
    await cleanup;
    assert.equal((await user.reload()).is_active, true);
    assert.equal(user.deactivated_at, null);
  });
  await t.test('three-month cutoff uses calendar months and clamps month-end days', async () => {
    const retention = load('services/userRetention.js', { '../models': models, 'node-cron': {} });
    assert.equal(retention.inactivityCutoff(new Date('2026-05-31T12:30:00Z')).toISOString(), '2026-02-28T12:30:00.000Z');
    assert.equal(retention.inactivityCutoff(new Date('2024-05-31T12:30:00Z')).toISOString(), '2024-02-29T12:30:00.000Z');
  });
  await t.test('the retention migration upgrades legacy users repeatedly without moving their timestamps', async () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/20261022_user_retention.sql'), 'utf8');
    const connection = await sequelize.connectionManager.getConnection();
    const query = statement => new Promise((resolve, reject) => connection.query(statement, (error, rows) => error ? reject(error) : resolve(rows)));
    try {
      await query('CREATE DATABASE user_retention_migration_test');
      await query('USE user_retention_migration_test');
      await query('CREATE TABLE users (user_id VARCHAR(36) PRIMARY KEY, is_active BOOLEAN, created_at DATETIME, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');
      await query("INSERT INTO users VALUES ('legacy', 0, '2025-01-01 12:00:00', '2026-01-15 12:00:00')");
      for (let pass = 0; pass < 2; pass++) {
        for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(part => part.trim()).filter(Boolean)) await query(statement);
      }
      const [row] = await query("SELECT DATE_FORMAT(deactivated_at,'%Y-%m-%d %H:%i:%s') AS deactivated, DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') AS updated, archived_at FROM users");
      assert.equal(row.deactivated, '2026-01-15 12:00:00');
      assert.equal(row.updated, '2026-01-15 12:00:00');
      assert.equal(row.archived_at, null);
      assert.equal((await query("SHOW INDEX FROM users WHERE Key_name='idx_users_retention'")).length, 3);
    } finally {
      await query('USE route_transfer_test');
      await query('DROP DATABASE IF EXISTS user_retention_migration_test');
      await sequelize.connectionManager.releaseConnection(connection);
    }
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
  await t.test('transferred delivery earnings and COD belong only to the destination driver, including retries', async () => {
    // Sequelize.sync omits the timestamp defaults and triggers installed by init.sql in production.
    for (const table of ['billing_periods', 'driver_payouts', 'payout_items']) {
      await sequelize.query(`ALTER TABLE ${table} MODIFY created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
    }
    await sequelize.query('ALTER TABLE driver_payouts MODIFY updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    const initSql = fs.readFileSync(path.resolve(__dirname, '../initdb/init.sql'), 'utf8');
    for (const name of ['trg_after_payout_item_insert', 'trg_after_payout_item_update', 'trg_after_payout_item_delete']) {
      const sql = initSql.match(new RegExp(`CREATE TRIGGER ${name}\\b[\\s\\S]*?END\\$\\$`));
      assert.ok(sql, `Missing production trigger ${name}`);
      await sequelize.query(sql[0].replace(/\$\$$/, ''));
    }
    const f = await fixture();
    await f.pkg.update({ is_cod: true, cod_amount: 10000 });
    assert.equal((await transfer(f)).status, 200);
    await f.pkg.reload();
    assert.equal(Number(f.pkg.delivery_cost), 2000);
    assert.equal(Number(f.pkg.cod_amount), 10000);
    assert.equal(Number(f.pkg.client_price), 3000);
    assert.equal((await deliver(f, f.other_id, { collected_amount: 10000, payment_type: 'EFECTIVO' })).status, 201);
    const delivery = await Delivery.findOne({ where: { package_id: f.pkg.package_id } });
    const active = await RoutePackage.findOne({ where: { package_id: f.pkg.package_id, released_at: null } });
    assert.equal(active.route_id, f.target.route_id);
    assert.equal(delivery.route_package_id, active.route_package_id);
    assert.equal(delivery.user_id, f.other_id);
    const date = new Date(delivery.attempted_at).toISOString().slice(0, 10);
    const billing = load('services/billingAutomation.js', { '../models': models });
    await billing.generateDriverPayouts(date, date);
    await billing.generateDriverPayouts(date, date);
    const items = await PayoutItem.findAll({ where: { package_id: f.pkg.package_id }, include: ['driverPayout'] });
    assert.equal(items.length, 2);
    assert.ok(items.every(item => item.driverPayout.user_id === f.other_id));
    assert.equal(Number(items.find(item => item.item_description.startsWith('Entrega - ')).amount), 2000);
    assert.equal(Number(items.find(item => item.item_description.startsWith('Retención COD - ')).amount), -10000);
  });

});
