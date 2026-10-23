'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../services/mlLiveShipments');
const account = { ml_account_id: 'a', ml_user_id: 'seller', client_id: 'client' };
const ship = id => ({ id, sender_id: 'seller', status: 'ready_to_ship', logistic_type: 'self_service', date_created: '2026-10-23T10:00:00Z', order_id: `9${id}`, receiver_address: { receiver_name: 'Cliente', receiver_phone: '123', address_line: 'Calle 1', city: { name: 'Santiago' } } });

test('queries active paid orders directly, deduplicates packs and excludes local imports across pages', async () => {
  const requests = []; const excluded = new Set(['2']);
  const orders = Array.from({ length: 61 }, (_, i) => ({ id: `9${i + 1}`, shipping: { id: i + 1 }, seller: { id: 'seller' } }));
  orders.push({ ...orders[0] });
  const service = createService({ excludedIds: async () => excluded, request: async (a, method, path, options) => {
    requests.push({ path, options });
    if (path === '/orders/search') { const { offset, limit } = options.params; return { results: orders.slice(offset, offset + limit), paging: { total: orders.length } }; }
    if (/^\/shipments\/\d+$/.test(path)) return ship(path.split('/').pop());
    return [];
  } });
  const initial = await service.list([account]); assert.equal(initial.refreshing, true);
  await service.start(account).promise;
  const first = await service.list([account], { limit: 50 });
  const second = await service.list([account], { limit: 50, offset: 50 });
  assert.equal(first.total, 60); assert.equal(first.shipments.length, 50); assert.equal(second.shipments.length, 10);
  assert.equal(new Set([...first.shipments, ...second.shipments].map(s => s.ml_shipment_id)).size, 60);
  assert(first.complete); assert.equal(requests[0].options.params['order.status'], 'paid');
  assert.equal(requests.filter(r => r.path === '/orders/search').length, 2);
  excluded.add(first.shipments[0].ml_shipment_external_id);
  assert.equal((await service.list([account])).total, 59, 'local import is hidden immediately even with a snapshot');
});

test('unknown seller, return shipments, closed states and unsupported communes never become importable', async () => {
  const overrides = { 1: { status: 'cancelled' }, 2: { type: 'return' }, 3: { receiver_address: { city: { name: 'Valdivia' } } }, 4: { logistic_type: 'fulfillment' } };
  const service = createService({ excludedIds: async () => new Set(), request: async (a, m, path) => {
    if (path === '/orders/search') return { results: [1, 2, 3, 4].map(id => ({ id: `9${id}`, seller: { id: 'seller' }, shipping: { id } })), paging: { total: 4 } };
    if (path.startsWith('/shipments/')) { const id = path.split('/')[2]; return { ...ship(id), ...overrides[id] }; }
    return [];
  } });
  await service.start(account).promise; assert.equal((await service.list([account])).total, 0);
  await assert.rejects(service.detail({ ...account, ml_user_id: 'another' }, 5), /otra cuenta/);
});

test('exact-code lookup bypasses pagination and always rereads ML; partial failures are explicit', async () => {
  let reads = 0;
  const service = createService({ excludedIds: async () => new Set(), request: async (a, m, path) => {
    if (path === '/orders/search') throw new Error('timeout');
    if (path === '/shipments/123') { reads++; return ship(123); } return [];
  } });
  assert.equal((await service.list([account], { search: '123' })).total, 1);
  assert.equal((await service.list([account], { search: '123' })).total, 1); assert.equal(reads, 2);
  await service.start(account).promise; const failed = await service.list([account]);
  assert.equal(failed.complete, false); assert.equal(failed.errors.length, 1); assert.equal(failed.refreshing, false);
});

test('a failed page does not silently report complete results, and simultaneous readers share a refresh', async () => {
  let searches = 0;
  const service = createService({ excludedIds: async () => new Set(), request: async (a, m, path) => { searches++; throw Error('offline'); } });
  const a = service.start(account), b = service.start(account);
  assert.equal(a, b); await a.promise; assert.equal(searches, 1);
  assert.equal((await service.list([account])).complete, false);
});
