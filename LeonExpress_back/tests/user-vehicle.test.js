const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');

const routeFile = path.resolve(__dirname, '../routes/user.js');
const routeRequire = createRequire(routeFile);
const express = routeRequire('express');

// Exercise the real HTTP route and validators without connecting to the application database.
async function request(t, options = {}, vehicle = { type_id: 'type-1', license_plate: ' abcd12 ' }) {
  const state = { users: [], vehicles: [], rolledBack: false };
  let transactionToken;
  const models = {
    Role: { findByPk: async () => ({ role_name: options.role || 'DRIVER' }) },
    Warehouse: { findByPk: async () => ({ warehouse_name: 'Central' }) },
    VehicleType: { findByPk: async () => options.missingType ? null : ({ type_id: 'type-1' }) },
    User: {
      findOne: async () => null,
      create: async (data, { transaction }) => {
        assert.equal(transaction, transactionToken);
        state.users.push(data);
        return data;
      }
    },
    Vehicle: {
      findOne: async () => options.duplicate ? { vehicle_id: 'existing' } : null,
      create: async (data, { transaction }) => {
        assert.equal(transaction, transactionToken);
        if (options.failure) throw Object.assign(new Error('Vehicle insert failed'), { name: options.failure });
        state.vehicles.push(data);
        return data;
      }
    },
    sequelize: {
      transaction: async (callback) => {
        transactionToken = {};
        try { return await callback(transactionToken); }
        catch (error) {
          state.users = [];
          state.vehicles = [];
          state.rolledBack = true;
          throw error;
        }
      }
    }
  };
  const moduleObject = { exports: {} };
  vm.runInNewContext(fs.readFileSync(routeFile, 'utf8'), {
    module: moduleObject,
    require: (id) => id === '../models' ? models : routeRequire(id),
    console: { ...console, error() {} },
    process
  }, { filename: routeFile });
  const app = express();
  app.use(express.json());
  app.use('/users', moduleObject.exports);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'conductor', password: 'secret123', full_name: 'Conductor Prueba',
      role_id: 'driver-role', warehouse_id: 'warehouse-1', ...(options.omitVehicle ? {} : { vehicle }) })
  });
  return { status: response.status, body: await response.json(), state };
}

test('creates the driver and vehicle with the same owner in one transaction', async (t) => {
  const { status, body, state } = await request(t);
  assert.equal(status, 201);
  assert.equal(state.users.length, 1);
  assert.equal(state.vehicles.length, 1);
  assert.equal(state.vehicles[0].user_id, body.user.user_id);
  assert.equal(body.user.vehicles[0].license_plate, 'ABCD12');
});

test('rejects a duplicate plate before creating the user', async (t) => {
  const { status, state } = await request(t, { duplicate: true });
  assert.equal(status, 409);
  assert.equal(state.users.length, 0);
});

test('rejects an unknown vehicle type', async (t) => {
  const { status, state } = await request(t, { missingType: true });
  assert.equal(status, 400);
  assert.equal(state.users.length, 0);
});

for (const vehicle of [null, [], {}, { type_id: 'type-1', license_plate: ' ' },
  { type_id: 'type-1', license_plate: 'A'.repeat(21) }]) {
  test(`rejects incomplete or invalid vehicle data: ${JSON.stringify(vehicle)}`, async (t) => {
    const { status, state } = await request(t, {}, vehicle);
    assert.equal(status, 400);
    assert.equal(state.users.length, 0);
  });
}

test('rejects vehicle registration for other roles', async (t) => {
  const { status, state } = await request(t, { role: 'ADMIN' });
  assert.equal(status, 400);
  assert.equal(state.users.length, 0);
});

for (const failure of ['SequelizeUniqueConstraintError', 'Error']) {
  test(`rolls back driver creation when vehicle persistence fails: ${failure}`, async (t) => {
    const { status, state } = await request(t, { failure });
    assert.equal(status, failure === 'SequelizeUniqueConstraintError' ? 409 : 500);
    assert.equal(state.rolledBack, true);
    assert.equal(state.users.length, 0);
    assert.equal(state.vehicles.length, 0);
  });
}

test('preserves user creation without vehicle data', async (t) => {
  const { status, state } = await request(t, { role: 'ADMIN', omitVehicle: true });
  assert.equal(status, 201);
  assert.equal(state.users.length, 1);
  assert.equal(state.vehicles.length, 0);
});
