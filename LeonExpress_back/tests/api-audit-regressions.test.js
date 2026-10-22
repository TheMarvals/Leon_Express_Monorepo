const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const express = require('express');

const driverId = '11111111-1111-4111-8111-111111111111';
const vehicleId = '22222222-2222-4222-8222-222222222222';
const warehouseId = '33333333-3333-4333-8333-333333333333';
async function fixture(t, file, options = {}) {
  const calls = { updated: [], maintenance: 0, owners: [] };
  const tx = { LOCK: { UPDATE: 'UPDATE' }, commit: async () => {}, rollback: async () => {} };
  const route = {
    route_id: 'route-1', status: options.status || 'PENDIENTE', user_id: driverId,
    vehicle_id: vehicleId, warehouse_id: warehouseId, route_type: 'ENTREGA',
    update: async data => { calls.updated.push(data); Object.assign(route, data); },
  };
  const models = {
    Route: { findByPk: async () => options.missing ? null : route },
    User: { findOne: async () => ({ role: { role_name: 'DRIVER' } }) },
    Vehicle: { findByPk: async () => ({ user_id: options.wrongVehicle ? 'other-driver' : driverId }) },
    Warehouse: { findByPk: async () => ({}) },
    RoutePackage: { count: async () => options.hasPackages ? 1 : 0 },
    DriverPayout: { findAll: async query => { calls.owners.push(query.where.user_id); return []; } },
    Cost: { findAll: async () => [{ cost_id: 'cost-1', cost_name: 'Peaje' }] },
    Client: { findAndCountAll: async options => { calls.clientsWhere = options.where; return { count: 0, rows: [] }; } },
    Package: { findByPk: async () => ({ client_id: 'other-client' }), findOne: async () => ({ client_id: 'other-client' }) },
    Delivery: { findAll: async () => [] },
    sequelize: { transaction: async () => tx },
  };
  const filename = path.resolve(__dirname, '../routes', file + '.js');
  const originalRequire = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, process,
    console: { log() {}, error() {} },
    require(id) {
      if (id === '../models') return models;
      if (id === '../config/database') return {
        QueryTypes: { SELECT: 'SELECT' },
        query: async (sql, options) => { calls.owners.push(options.replacements.userId); return []; },
      };
      if (id === '../middlewares/authenticateToken') return (req, res, next) => {
        if (options.anonymous) return res.status(401).json({ error: 'Token no proporcionado' });
        req.user = { user_id: driverId, role: options.role || 'ADMIN', client_id: 'client-1' }; next();
      };
      if (id === '../utils/audit') return { logAudit: async () => {} };
      if (id === '../services/emailService') return {};
      if (id === '../utils/uuidUtils') return {};
      if (id === '../utils/notificationService') return {};
      if (id === '../utils/qrDecoder' || id === '../utils/smartOcrParser' || id === '../services/routeAssignments') return {};
      if (id === '../utils/ocrProcessingQueue') return { getStats: () => ({ total_batches: 0 }) };
      if (id === '../migrations/fix_missing_period') return async () => { calls.maintenance++; };
      return originalRequire(id);
    },
  }, { filename });
  const app = express(); app.use(express.json()); app.use(module.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (method, endpoint, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, {
      method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { status: response.status, body: response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
  };
  return { request, calls };
}
const payload = { user_id: driverId, vehicle_id: vehicleId, warehouse_id: warehouseId,
  start_date: '2026-10-23T12:00:00Z', route_type: 'ENTREGA', status: 'PENDIENTE', route_name: 'Ruta Centro' };

test('the route editor updates pending route planning through the existing frontend URL', async t => {
  const f = await fixture(t, 'route');
  assert.equal((await f.request('PUT', '/route-1', payload)).status, 200);
  assert.equal(f.calls.updated[0].route_name, 'Ruta Centro');
  assert.equal(f.calls.updated[0].status, undefined);
});
for (const [options, body, expected] of [
  [{ role: 'DRIVER' }, payload, 403], [{ missing: true }, payload, 404],
  [{ status: 'EN_PROGRESO' }, payload, 409], [{}, { ...payload, status: 'FINALIZADA' }, 400],
  [{ wrongVehicle: true }, payload, 400],
  [{ hasPackages: true }, { ...payload, route_type: 'DEVOLUCION' }, 409],
]) {
  test(`invalid route edits fail without writing: ${JSON.stringify(options)} / ${expected}`, async t => {
    const f = await fixture(t, 'route', options);
    assert.equal((await f.request('PUT', '/route-1', body)).status, expected);
    assert.equal(f.calls.updated.length, 0);
  });
}
for (const [file, endpoint] of [['debug', '/subscriptions'], ['smartBatch', '/stats'], ['revenues', '/'], ['driver_summary', '/']]) {
  test(`${file} rejects unauthenticated access before executing the handler`, async t => {
    const f = await fixture(t, file, { anonymous: true });
    assert.equal((await f.request('GET', endpoint)).status, 401);
  });
}
test('debug maintenance requires an explicit administrator POST; GET never invokes maintenance', async t => {
  const f = await fixture(t, 'debug');
  assert.equal((await f.request('GET', '/fix-period')).status, 404);
  assert.equal(f.calls.maintenance, 0);
  assert.equal((await f.request('POST', '/fix-period')).status, 200);
  assert.equal(f.calls.maintenance, 1);
});
test('drivers cannot invoke debug maintenance', async t => {
  const f = await fixture(t, 'debug', { role: 'DRIVER' });
  assert.equal((await f.request('POST', '/fix-period')).status, 403);
  assert.equal(f.calls.maintenance, 0);
});
test('driver revenues always use the authenticated driver even when another ID is supplied', async t => {
  const f = await fixture(t, 'revenues', { role: 'DRIVER' });
  assert.equal((await f.request('GET', '/?userId=other-driver')).status, 200);
  assert.deepEqual(f.calls.owners, [driverId]);
});
test('warehouse staff can load the costs used by package verification', async t => {
  const f = await fixture(t, 'cost', { role: 'WAREHOUSE_STAFF' });
  const result = await f.request('GET', '/');
  assert.equal(result.status, 200);
  assert.equal(result.body[0].cost_name, 'Peaje');
});
test('clients cannot load internal OCR batch statistics', async t => {
  const f = await fixture(t, 'smartBatch', { role: 'CLIENT' });
  assert.equal((await f.request('GET', '/stats')).status, 403);
});

test('driver statistics ignore another driver ID supplied in the query', async t => {
  const f = await fixture(t, 'driver_summary', { role: 'DRIVER' });
  assert.equal((await f.request('GET', '/?userId=other-driver')).status, 200);
  assert.ok(f.calls.owners.length > 1);
  assert.ok(f.calls.owners.every(id => id === driverId));
});

test('user creation rejects unauthenticated callers before validators or database writes', async t => {
  const f = await fixture(t, 'user', { anonymous: true });
  assert.equal((await f.request('POST', '/', {})).status, 401);
});
test('warehouse staff cannot create administrator or other users', async t => {
  const f = await fixture(t, 'user', { role: 'WAREHOUSE_STAFF' });
  assert.equal((await f.request('POST', '/', {})).status, 403);
});
for (const file of ['user', 'vehicle', 'route', 'delivery_events', 'audit_log']) {
  test(`clients cannot list internal ${file} data`, async t => {
    const f = await fixture(t, file, { role: 'CLIENT' });
    assert.equal((await f.request('GET', '/')).status, 403);
  });
}
test('client searches remain scoped to the authenticated client', async t => {
  const f = await fixture(t, 'client', { role: 'CLIENT' });
  assert.equal((await f.request('GET', '/?search=other-client')).status, 200);
  assert.equal(f.calls.clientsWhere.client_id, 'client-1');
  assert.equal(f.calls.clientsWhere.is_active, true);
});
for (const endpoint of ['/other-client', '/other-client/pricing', '/other-client/history']) {
  test(`clients cannot read another client through ${endpoint}`, async t => {
    const f = await fixture(t, 'client', { role: 'CLIENT' });
    assert.equal((await f.request('GET', endpoint)).status, 403);
  });
}
for (const endpoint of ['/foreign-package', '/foreign-package/deliveries', '/by-code/foreign-code']) {
  test(`foreign packages are blocked through ${endpoint}`, async t => {
    const f = await fixture(t, 'package', { role: 'CLIENT' });
    assert.equal((await f.request('GET', endpoint)).status, 403);
  });
}
for (const [file, method, endpoint] of [['package', 'PUT', '/foreign-package'], ['pickup', 'PATCH', '/foreign-pickup/status']]) {
  test(`client tokens cannot invoke internal ${file} updates`, async t => {
    const f = await fixture(t, file, { role: 'CLIENT' });
    assert.equal((await f.request(method, endpoint, {})).status, 403);
  });
}

test('inactive clients stay out of the default list after soft deletion', async t => {
  const f = await fixture(t, 'client');
  assert.equal((await f.request('GET', '/')).status, 200);
  assert.equal(f.calls.clientsWhere.is_active, true);
});
for (const [file, role] of [['driver-payouts', 'CLIENT'], ['invoice', 'CUSTOMER_SERVICE'], ['audit_log', 'DRIVER']]) {
  test(`${role} cannot list restricted financial or audit data through ${file}`, async t => {
    const f = await fixture(t, file, { role });
    assert.equal((await f.request('GET', '/')).status, 403);
  });
}
