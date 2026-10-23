const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRequire } = require('node:module');
const express = require('express');
const { Op } = require('sequelize');

function load(file, overrides) {
  const filename = path.resolve(__dirname, '..', file);
  const originalRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, Promise, process, Buffer, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    require: (id) => Object.hasOwn(overrides, id) ? overrides[id] : originalRequire(id),
    __dirname: path.dirname(filename)
  }, { filename });
  return module.exports;
}

async function scanner(t, options = {}) {
  const packages = [];
  const items = [];
  let nextId = 0;
  let lock = Promise.resolve();
  let locked = false;
  let gatewayCalls = 0;
  const matches = (record, where) => Reflect.ownKeys(where).every((key) => {
    if (key === Op.or) return where[key].some((condition) => matches(record, condition));
    const value = where[key];
    if (value && typeof value === 'object') {
      if (Op.ne in value) return record[key] !== value[Op.ne];
      if (Op.in in value) return value[Op.in].includes(record[key]);
    }
    return record[key] === value;
  });
  const row = (data) => Object.assign(data, {
    async update(values, opts) {
      assert.ok(locked && opts.transaction, 'writes must hold the pickup row lock');
      Object.assign(this, values);
      return this;
    }
  });
  const pickup = { pickup_id: 'pickup-1', client_id: 'client-1' };
  const models = {
    Pickup: { findByPk: async (id, opts = {}) => {
      if (opts.lock) {
        assert.equal(opts.lock, 'UPDATE');
        assert.ok(opts.transaction);
        let release;
        const previous = lock;
        lock = new Promise((resolve) => { release = resolve; });
        await previous;
        locked = true;
        opts.transaction.release = () => { locked = false; release(); };
      }
      return id === pickup.pickup_id ? pickup : null;
    } },
    Package: {
      findOne: async ({ where }) => packages.find((pkg) => matches(pkg, where)) || null,
      findAll: async ({ where }) => packages.filter((pkg) => matches(pkg, where)),
      findByPk: async (id) => packages.find((pkg) => pkg.package_id === id) || null,
      count: async ({ where }) => packages.filter((pkg) => matches(pkg, where)).length,
      create: async (data, opts) => {
        assert.ok(locked && opts.transaction, 'package insert must hold the pickup row lock');
        const pkg = row(data);
        packages.push(pkg);
        return pkg;
      }
    },
    ClientPricing: { findOne: async () => ({ base_price: 2000 }) },
    OcrProcessingQueue: { findByPk: async (id) => items.find((item) => item.id === id) || null },
    sequelize: { transaction: async (callback) => {
      const hooks = [];
      const transaction = { LOCK: { UPDATE: 'UPDATE' }, afterCommit: (hook) => hooks.push(hook) };
      let result;
      try { result = await callback(transaction); }
      finally { transaction.release?.(); }
      for (const hook of hooks) await hook();
      return result;
    } }
  };
  const live = {
    detail: async (account, search) => {
      gatewayCalls++;
      if (options.missingShipment) throw Object.assign(new Error('No disponible'), { status: 404 });
      if (options.shipmentAccountId && String(options.shipmentAccountId) !== String(account.ml_account_id)) throw Object.assign(new Error('Otra cuenta'), { status: 403 });
      return { ml_shipment_external_id: search, ml_shipment_id: 'shipment-1', ml_account_id: account.ml_account_id,
        status_ml: 'ready_to_ship', logistic_type: 'self_service', buyer_name: 'Destinatario', buyer_phone: '+56912345678', buyer_address: JSON.stringify({ address_line: 'Calle 123' }) };
    },
  };
  const overrides = {
    '../models': models,
    '../middlewares/authenticateToken': (req, res, next) => { req.user = { role: 'ADMIN', user_id: 'admin-1' }; next(); },
    '../services/mlLiveShipments': live,
    '../services/mlImportLedger': { claim: async () => {} },
    '../services/mlAccountAccessService': { getAccounts: async () => options.otherClient ? [] : [{ client_id: pickup.client_id, ml_account_id: options.accountId ?? 'account-1' }] },
    '../utils/uuidUtils': { generateUniqueTrackingCode: async () => `LE${++nextId}` },
    '../utils/ocrLearningEngine': { recordCorrections: async () => ({ recorded: 0 }) }
  };
  const pickupLock = load('utils/pickupPackageLock.js', overrides);
  overrides['../utils/pickupPackageLock'] = pickupLock;
  overrides['./pickupPackageLock'] = pickupLock;
  const app = express();
  app.use(express.json());
  app.use('/ml-confirm', load('routes/ml_confirm.js', overrides));
  app.use('/ocr-review', load('routes/ocr_review.js', overrides));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = async (url, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  const scan = (code) => post('/ml-confirm/packages/confirm-ml', { pickup_id: pickup.pickup_id, ml_code: code });
  const approve = (id, code) => post(`/ocr-review/${id}/approve`, { corrected_data: {
    external_tracking_code: code, recipient_name: 'Destinatario', destination_address: 'Dirección de prueba'
  } });
  const addPhoto = (id, code) => items.push(row({ id, pickup_id: pickup.pickup_id, status: 'needs_review',
    package_id: null, extracted_data: { external_tracking_code: code } }));
  const ocr = load('utils/ocrProcessingQueue.js', { ...overrides,
    './smartOcrParser': {}, './qrDecoder': {}, sharp: {}, axios: {}, 'form-data': {}, fs: { promises: { mkdir: async () => {}, writeFile: async () => {} } } });
  ocr.generateUniqueTrackingCode = async () => `LE${++nextId}`;
  return { packages, seedPackage: (data) => packages.push(row(data)), items, post, scan, approve, addPhoto, ocr, gatewayCalls: () => gatewayCalls };
}

for (const [code, scans] of [['48233839764', 4], ['48233999392', 2], ['48233079796', 2],
  ['48233062609', 2], ['48233864459', 2]]) {
  test(`${scans} simultaneous scans of ${code} produce one package`, async (t) => {
    const fixture = await scanner(t);
    const results = await Promise.all(Array.from({ length: scans }, () => fixture.scan(code)));
    assert.ok(results.every((result) => result.status === 200));
    assert.equal(fixture.packages.length, 1);
    assert.equal(new Set(results.map((result) => result.body.package.id)).size, 1);
    assert.equal(results.filter((result) => result.body.already_confirmed).length, scans - 1);
    assert.equal(fixture.gatewayCalls(), 1);
  });
}

test('manual packages can be confirmed by internal tracking or external barcode', async (t) => {
  const fixture = await scanner(t);
  fixture.packages.push({ package_id: 'manual-1', client_id: 'client-1', pickup_id: 'pickup-1', tracking_code: 'LE-MANUAL',
    external_tracking_code: 'MANUAL-123', status: 'RECOLECTADO_EN_ORIGEN' });
  for (const code of ['LE-MANUAL', 'MANUAL-123']) {
    const result = await fixture.scan(code);
    assert.equal(result.status, 200);
    assert.equal(result.body.package.id, 'manual-1');
  }
  assert.equal(fixture.gatewayCalls(), 0);
});

test('unknown manual codes offer a photo without calling ML', async (t) => {
  const fixture = await scanner(t);
  const result = await fixture.scan('MANUAL-UNKNOWN');
  assert.equal(result.status, 404);
  assert.equal(result.body.allow_photo, true);
  assert.equal(fixture.gatewayCalls(), 0);
});

test('unsynchronized ML codes offer a photo', async (t) => {
  const fixture = await scanner(t, { missingShipment: true });
  const result = await fixture.scan('48233839764');
  assert.equal(result.status, 404);
  assert.equal(result.body.allow_photo, true);
});

test('a code belonging to another client is rejected', async (t) => {
  const fixture = await scanner(t, { otherClient: true });
  const result = await fixture.scan('48233839764');
  assert.equal(result.status, 403);
  assert.equal(result.body.allow_photo, false);
  assert.equal(fixture.packages.length, 0);
});

test('local confirmation does not depend on a gateway import acknowledgement', async (t) => {
  const fixture = await scanner(t, { gatewayFailure: true });
  assert.equal((await fixture.scan('48233839764')).status, 200);
  assert.equal((await fixture.scan('48233839764')).status, 200);
  assert.equal(fixture.packages.length, 1);
});

test('separate photos approved concurrently cannot duplicate the same shipment', async (t) => {
  const fixture = await scanner(t);
  fixture.addPhoto('photo-1', '48233839764');
  fixture.addPhoto('photo-2', '48233839764');
  const results = await Promise.all([fixture.approve('photo-1', '48233839764'), fixture.approve('photo-2', '48233839764')]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(fixture.packages.length, 1);
  assert.equal(fixture.items.filter((item) => item.is_duplicate).length, 1);
});

test('retries of the same approved photo return its original package', async (t) => {
  const fixture = await scanner(t);
  fixture.addPhoto('photo-1', '48233839764');
  const results = await Promise.all([fixture.approve('photo-1', '48233839764'), fixture.approve('photo-1', '48233839764')]);
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(new Set(results.map((r) => r.body.package_id)).size, 1);
  assert.equal(fixture.packages.length, 1);
});

test('a photo approval after a QR confirmation requires duplicate review', async (t) => {
  const fixture = await scanner(t);
  await fixture.scan('48233839764');
  fixture.addPhoto('photo-1', '48233839764');
  const result = await fixture.approve('photo-1', '48233839764');
  assert.equal(result.status, 409);
  assert.equal(result.body.requires_duplicate_confirmation, true);
  assert.equal(fixture.packages.length, 1);
});

test('automatic OCR uses the same collection lock as QR confirmation', async (t) => {
  const fixture = await scanner(t);
  await fixture.scan('48233839764');
  const result = await fixture.ocr.createPackage('pickup-1', {
    external_tracking_code: '48233839764', recipient_name: 'Destinatario', destination_address: 'Dirección de prueba'
  });
  assert.equal(result.needs_confirmation, true);
  assert.equal(fixture.packages.length, 1);
});

test('formatting differences in numeric codes do not create extra packages', async (t) => {
  const fixture = await scanner(t);
  await fixture.scan('48233839764');
  await fixture.scan(' 48233-839764 ');
  assert.equal(fixture.packages.length, 1);
});


test('simultaneous photo-upload retries return the same actual batch and queue images once', async (t) => {
  const { ocr } = await scanner(t);
  ocr.saveImage = async () => {};
  ocr.processQueue = () => {};
  const first = { batch_id: 'batch-1', pickup_id: 'pickup-1', images: ['photo-1'], idempotency_key: 'same-content' };
  const results = await Promise.all([ocr.addBatch(first), ocr.addBatch({ ...first, batch_id: 'retry-batch' })]);
  assert.equal(results[0].batch_id, 'batch-1');
  assert.equal(results[1].batch_id, 'batch-1');
  assert.equal(ocr.queue.length, 1);
});

test('a failed image upload remains retryable without publishing a partial batch', async (t) => {
  const { ocr } = await scanner(t);
  let saves = 0;
  ocr.saveImage = async () => { if (++saves === 2) throw new Error('disk write interrupted'); };
  ocr.processQueue = () => {};
  const batch = { batch_id: 'batch-1', pickup_id: 'pickup-1', images: ['photo-1', 'photo-2'], idempotency_key: 'same-content' };
  await assert.rejects(ocr.addBatch(batch), /disk write interrupted/);
  assert.equal(ocr.queue.length, 0);
  const result = await ocr.addBatch(batch);
  assert.equal(result.batch_id, 'batch-1');
  assert.equal(ocr.queue.length, 2);
});


test('ML account IDs represented as numbers and strings refer to the same owner', async (t) => {
  const fixture = await scanner(t, { accountId: 123, shipmentAccountId: '123' });
  const result = await fixture.scan('48233839764');
  assert.equal(result.status, 200);
  assert.equal(fixture.packages.length, 1);
  assert.equal(fixture.packages[0].pickup_id, 'pickup-1');
  assert.equal(fixture.packages[0].client_id, 'client-1');
  assert.equal(fixture.packages[0].status, 'RECOLECTADO_EN_ORIGEN');
});

test('scanning a pending manual package assigns the existing record to the collection', async (t) => {
  const fixture = await scanner(t);
  fixture.seedPackage({ package_id: 'manual-1', tracking_code: 'LEMANUAL123', client_id: 'client-1',
    pickup_id: null, status: 'PENDIENTE_RECOLECCION', recipient_name: 'Destinatario' });
  assert.equal((await fixture.scan('LEMANUAL123')).status, 200);
  const repeated = await fixture.scan('LEMANUAL123');
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.already_confirmed, true);
  assert.equal(fixture.packages.length, 1);
  assert.equal(fixture.packages[0].package_id, 'manual-1');
  assert.equal(fixture.packages[0].pickup_id, 'pickup-1');
  assert.equal(fixture.packages[0].status, 'RECOLECTADO_EN_ORIGEN');
  assert.equal(fixture.gatewayCalls(), 0);
});
