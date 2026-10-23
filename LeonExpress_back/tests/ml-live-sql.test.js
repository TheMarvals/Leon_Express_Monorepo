'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { Sequelize } = require('sequelize');
const { randomUUID: uuid } = require('node:crypto');

function load(file, overrides) {
  const filename = path.resolve(__dirname, '..', file), original = createRequire(filename), module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, process, console, Buffer, setTimeout, __dirname: path.dirname(filename), require: id => Object.hasOwn(overrides, id) ? overrides[id] : original(id) });
  return module.exports;
}

test('ML imports and cancellations use atomic local decisions with real SQL', { skip: !process.env.TEST_ML_DB_PORT }, async t => {
  const sequelize = new Sequelize('ml_live_test', 'root', 'ml-test-only', { host: '127.0.0.1', port: Number(process.env.TEST_ML_DB_PORT), dialect: 'mysql', logging: false });
  t.after(() => sequelize.close());
  const models = load('models/index.js', { '../config/database': sequelize });
  models.PushSubscription._indexes = [];
  await sequelize.sync({ force: true });
  const client = await models.Client.create({ client_id: uuid(), verification_code: 'TEST', client_name: 'Test', email: 'test@example.test' });
  const pickups = await Promise.all([1, 2].map(() => models.Pickup.create({ pickup_id: uuid(), client_id: client.client_id, pickup_scheduled_date: new Date(), status: 'SOLICITADA' })));
  const account = { ml_account_id: uuid(), ml_user_id: 'seller', client_id: client.client_id };
  const ship = id => ({ ml_shipment_id: `${account.ml_account_id}:${id}`, ml_account_id: account.ml_account_id, ml_shipment_external_id: id, status_ml: 'ready_to_ship', logistic_type: 'self_service', buyer_city: 'Santiago', buyer_name: 'Cliente', buyer_phone: '123', buyer_address: '{"address_line":"Calle 1"}' });
  const access = { getAccounts: async () => [account] };
  const ledger = load('services/mlImportLedger.js', { '../models': models });
  const overrides = { '../models': models, './mlAccountAccessService': access, './mlLiveShipments': { detail: async (a, id) => ship(id) }, './mlImportLedger': ledger, '../utils/uuidUtils': { generateUniqueTrackingCode: async () => `LE${uuid().slice(0, 8)}` }, fs: { mkdirSync() {} }, qrcode: { toFile: async () => {} } };
  const importer = load('services/mlImportService.js', overrides);
  await t.test('same shipment imported concurrently into different pickups creates one package and one decision', async () => {
    const results = await Promise.allSettled(pickups.map(p => importer.importShipments([`${account.ml_account_id}:123`], p.pickup_id, 'admin')));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
    assert.equal(await models.Package.count({ where: { external_tracking_code: '123' } }), 1);
    const decision = await models.MlImport.findByPk('123'); assert(decision.package_id);
  });
  await t.test('failed package creation rolls back the import mark and permits retry', async () => {
    const broken = load('services/mlImportService.js', { ...overrides, '../models': { ...models, Package: { create: async () => { throw Error('package failed'); } } } });
    await assert.rejects(broken.importShipments([`${account.ml_account_id}:456`], pickups[0].pickup_id, 'admin'), /package failed/);
    assert.equal(await models.MlImport.findByPk('456'), null);
    await importer.importShipments([`${account.ml_account_id}:456`], pickups[0].pickup_id, 'admin');
    assert.equal(await models.Package.count({ where: { external_tracking_code: '456' } }), 1);
  });
  await t.test('foreign accounts, closed pickups and cancelled ML shipments cannot import', async () => {
    await assert.rejects(importer.importShipments([`${uuid()}:789`], pickups[0].pickup_id, 'admin'), e => e.status === 403);
    await pickups[1].update({ status: 'CANCELADO' });
    await assert.rejects(importer.importShipments([`${account.ml_account_id}:789`], pickups[1].pickup_id, 'admin'), e => e.status === 409);
    const cancelled = load('services/mlImportService.js', { ...overrides, './mlLiveShipments': { detail: async (a, id) => ({ ...ship(id), status_ml: 'cancelled' }) } });
    await assert.rejects(cancelled.importShipments([`${account.ml_account_id}:789`], pickups[0].pickup_id, 'admin'), e => e.status === 409);
    assert.equal(await models.MlImport.findByPk('789'), null);
  });
  await t.test('legacy marks migrate idempotently without changing package history', async () => {
    const migrate = load('scripts/migrate-ml-imports.js', { '../models': models }).migrate;
    const data = [{ external_id: '900', ml_account_id: account.ml_account_id, disposition: 'imported', legacy_shipment_id: uuid(), imported_at: new Date() }];
    assert.equal((await migrate(data)).added, 1); assert.equal((await migrate(data)).added, 0);
    assert((await ledger.excludedIds(['900'])).has('900'));
    assert.equal(await models.Package.count(), 2);
  });
  const events = load('services/mlEvents.js', { '../models': models, './mlAccountAccessService': access, './mlLiveShipments': { invalidate() {}, detail: async () => ({ ...ship('456'), status_ml: 'cancelled' }) } });
  await t.test('duplicate live cancellation creates one cancellation; delivered packages stay delivered', async () => {
    const payload = { ...ship('456'), status_ml: 'cancelled' };
    await Promise.all([events.applyShipment(account, payload), events.applyShipment(account, payload)]);
    assert.equal(await models.Cancellation.count(), 1);
    assert.equal((await models.Package.findOne({ where: { external_tracking_code: '456' } })).status, 'CANCELADO');
    const delivered = await models.Package.findOne({ where: { external_tracking_code: '123' } }); await delivered.update({ status: 'ENTREGADO' });
    await events.applyShipment(account, { ...ship('123'), status_ml: 'cancelled' });
    await delivered.reload(); assert.equal(delivered.status, 'ENTREGADO'); assert.equal(await models.Cancellation.count(), 1);
  });
  await t.test('event account isolation and webhook secret fail closed', async () => {
    assert.equal((await events.processEvent({ topic: 'shipments', resource: '/shipments/456', ml_account_id: account.ml_account_id, ml_user_id: 'other' })).ignored, true);
    delete process.env.INTERNAL_WEBHOOK_TOKEN; assert.equal(events.authorized('leonexpress-internal-webhook'), false);
    process.env.INTERNAL_WEBHOOK_TOKEN = 'secret-only-for-tests'; assert.equal(events.authorized('bad'), false); assert.equal(events.authorized('secret-only-for-tests'), true);
  });
  await t.test('bulk selection resolves exact shipments with bounded network concurrency', async () => {
    let active = 0, maximum = 0;
    const batchImporter = load('services/mlImportService.js', { ...overrides, './mlLiveShipments': { detail: async (a, id) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 5)); active--; return ship(id);
    } } });
    const ids = Array.from({ length: 9 }, (_, i) => `${account.ml_account_id}:${1000 + i}`);
    assert.equal((await batchImporter.importShipments(ids, pickups[0].pickup_id, 'admin')).packages_created, 9);
    assert.equal(maximum, 4);
    assert.equal(await models.Package.count(), 11);
    assert.equal(await models.MlImport.count(), 12);
  });
});
