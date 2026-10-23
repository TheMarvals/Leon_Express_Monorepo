'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createClientPackageService, validateClientPackageInput } = require('../services/clientPackageService');
const actor = { role: 'CLIENT', user_id: 'user-a', client_id: 'client-a' };
const input = { recipient_name: 'Ana Pérez', recipient_phone: '+56912345678', destination_address: 'Calle 123, Santiago (Obs: Recepción)', is_cod: true, cod_amount: 15000 };
function fixture(overrides = {}) {
  let data = { package_id: 'pkg-a', client_id: 'client-a', status: 'PENDIENTE_RECOLECCION', tracking_code: 'LEMANUAL', client_price: 2800, delivery_cost: 1700, ...overrides };
  const audits = [];
  const model = () => data ? { ...data, toJSON: () => ({ ...data }), update: async values => { data = { ...data, ...values }; }, destroy: async () => { data = null; } } : null;
  const models = {
    sequelize: { transaction: async (opts, cb) => {
      assert.equal(opts.isolationLevel, 'READ COMMITTED');
      const before = data && { ...data };
      try { return await cb({ LOCK: { UPDATE: 'UPDATE' } }); } catch (error) { data = before; throw error; }
    } },
    User: { findByPk: async () => ({ is_active: !overrides.inactive, client_id: overrides.reassigned ? 'client-b' : 'client-a', archived_at: overrides.archived }) },
    Client: { findByPk: async () => ({ is_active: !overrides.clientInactive }) },
    Package: { findOne: async query => { assert.equal(query.lock, 'UPDATE'); return data?.client_id === query.where.client_id && data?.package_id === query.where.package_id ? model() : null; } },
    AuditLog: { create: async audit => { if (overrides.auditFails) throw new Error('audit unavailable'); audits.push(audit); } },
  };
  for (const name of ['Delivery', 'RoutePackage', 'InvoiceItem', 'PayoutItem', 'Return', 'Cancellation', 'OcrProcessingQueue', 'PackageCost']) {
    models[name] = { count: async () => name === overrides.history ? 1 : 0 };
  }
  return { service: createClientPackageService(models), data: () => data, audits };
}
test('client can edit own pending manual shipment without changing tracking or prices, then delete with audit', async () => {
  const f = fixture();
  await f.service.update(actor, 'pkg-a', input);
  assert.equal(f.data().recipient_name, 'Ana Pérez'); assert.equal(f.data().client_price, 2800); assert.equal(f.data().tracking_code, 'LEMANUAL');
  assert.equal(f.audits[0].action, 'CLIENT_UPDATE_PACKAGE');
  await f.service.remove(actor, 'pkg-a'); assert.equal(f.data(), null);
  assert.equal(f.audits[1].action, 'CLIENT_DELETE_PACKAGE'); assert.equal(JSON.parse(f.audits[1].details).before.recipient_name, 'Ana Pérez');
});
test('all scanned states, integration records and historical references prevent changes', async () => {
  const blocked = [
    ...['RECOLECTADO_EN_ORIGEN','RECIBIDO_EN_ALMACEN','ASIGNADO_A_RUTA','EN_RUTA_ENTREGA','ENTREGADO','INCIDENCIA_ENTREGA','REPROGRAMADO','DEVUELTO_ALMACEN','EN_RUTA_DEVOLUCION','DEVUELTO_A_CLIENTE','CANCELADO'].map(status => ({ status })),
    { external_tracking_code: '48233839764' }, { sales_codes: 'external' }, { scanned_at_origin_datetime: new Date() },
    ...['Delivery','RoutePackage','InvoiceItem','PayoutItem','Return','Cancellation','OcrProcessingQueue','PackageCost'].map(history => ({ history })),
  ];
  for (const state of blocked) for (const method of ['update','remove']) {
    const f = fixture(state);
    await assert.rejects(f.service[method](actor, 'pkg-a', input), error => error.status === 409);
    assert.ok(f.data()); assert.equal(f.audits.length, 0);
  }
});
test('foreign clients, inactive sessions and internal roles cannot use client operations', async () => {
  for (const method of ['update','remove']) {
    await assert.rejects(fixture().service[method]({ ...actor, client_id: 'client-b' }, 'pkg-a', input), error => error.status === 403);
    await assert.rejects(fixture({ client_id: 'client-b' }).service[method](actor, 'pkg-a', input), error => error.status === 404);
    await assert.rejects(fixture().service[method]({ ...actor, role: 'DRIVER' }, 'pkg-a', input), error => error.status === 403);
    for (const options of [{ inactive: true }, { clientInactive: true }, { archived: new Date() }, { reassigned: true }]) {
      await assert.rejects(fixture(options).service[method](actor, 'pkg-a', input), error => error.status === 403);
    }
  }
});
test('failed audit rolls back edit and deletion', async () => {
  for (const method of ['update','remove']) {
    const f = fixture({ auditFails: true });
    await assert.rejects(f.service[method](actor, 'pkg-a', input), /audit unavailable/);
    assert.equal(f.data().tracking_code, 'LEMANUAL'); assert.equal(f.data().recipient_name, undefined);
  }
});
test('strict field validation protects pricing, ownership, state and the 120 character note limit', () => {
  for (const extra of [{ client_id: 'b' }, { status: 'ENTREGADO' }, { client_price: 1 }, { tracking_code: 'changed' }, { recipient_name: '' }, { cod_amount: -1 }, { cod_amount: Infinity }, { is_cod: 'false' }, { destination_address: `Calle (Obs: ${'a'.repeat(121)})` }]) {
    assert.throws(() => validateClientPackageInput({ ...input, ...extra }), error => error.status === 400);
  }
  assert.equal(validateClientPackageInput({ ...input, is_cod: false }).cod_amount, 0);
});
