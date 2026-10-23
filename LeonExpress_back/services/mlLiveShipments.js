'use strict';

const { fetchShipmentDetails, contactPayload } = require('./mlShipmentDetails');
const { importable } = require('../utils/mlImportPolicy');

// Short-lived, process-local snapshots only. Never persist a second shipment store.
// The database stores import decisions; Mercado Libre remains the source of data.
function createService({ request, excludedIds, now = Date.now, ttl = 60000, concurrency = 4 }) {
  const snapshots = new Map();
  let active = 0;
  const waiting = [];
  async function limited(callback) {
    if (active >= concurrency) await new Promise(resolve => waiting.push(resolve));
    else active++;
    try { return await callback(); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  }
  const call = (...args) => limited(() => request(...args));

  async function detail(account, id, orderId) {
    if (!/^\d{1,20}$/.test(String(id))) throw Object.assign(new Error('Código de envío inválido'), { status: 400 });
    const raw = await fetchShipmentDetails(account, id, orderId, call);
    // The seller must be explicit, including responses obtained through a trusted token.
    if (String(raw.sender_id) !== String(account.ml_user_id)) {
      throw Object.assign(new Error('El envío pertenece a otra cuenta'), { status: 403 });
    }
    return {
      ml_shipment_id: `${account.ml_account_id}:${id}`, ml_account_id: account.ml_account_id,
      ml_shipment_external_id: String(id), ml_order_id: raw.order_id ? String(raw.order_id) : null,
      status_ml: raw.status, logistic_type: raw.logistic_type, type: raw.type || 'forward',
      ...contactPayload(raw), created_at: raw.date_created, updated_at: raw.last_updated || raw.date_created,
      account: { ml_account_id: account.ml_account_id, ml_nickname: account.ml_nickname, client_id: account.client_id },
    };
  }

  async function build(account, snapshot) {
    const seen = new Set();
    let offset = 0;
    while (true) {
      const data = await call(account, 'get', '/orders/search', { params: {
        seller: account.ml_user_id, 'order.status': 'paid',
        'shipping.status': 'pending,handling,ready_to_ship,shipped,to_be_agreed,not_verified',
        sort: 'date_desc', limit: 50, offset,
      } });
      if (!Array.isArray(data.results) || !Number.isFinite(Number(data.paging?.total))) throw new Error('Respuesta incompleta de Mercado Libre');
      const orders = data.results;
      const ids = orders.flatMap(order => order.shipping?.id ? [String(order.shipping.id)] : []);
      const excluded = await excludedIds(ids);
      const candidates = orders.filter(order => {
        const id = String(order.shipping?.id || '');
        if (!id || seen.has(id) || excluded.has(id)) return false;
        seen.add(id); return true;
      });
      // Chunks bound both queued work and memory when several accounts refresh together.
      for (let i = 0; i < candidates.length; i += concurrency) {
        const page = await Promise.all(candidates.slice(i, i + concurrency).map(async order => {
          if (String(order.seller?.id) !== String(account.ml_user_id)) throw new Error('Orden de otra cuenta');
          try { return await detail(account, order.shipping.id, order.id); }
          catch (error) { if (error.response?.status === 404) return null; throw error; }
        }));
        snapshot.rows.push(...page.filter(ship => ship && importable(ship)));
      }
      offset += orders.length;
      snapshot.scanned = offset;
      if (offset >= Number(data.paging.total)) break;
      if (!orders.length) throw new Error('Mercado Libre devolvió una página vacía antes de terminar');
      if (offset >= 10000) throw new Error('La consulta supera el límite de Mercado Libre. Busca el código de envío directamente.');
    }
  }

  function start(account, force = false) {
    const id = String(account.ml_account_id);
    const previous = snapshots.get(id);
    if (previous?.loading || (!force && previous && now() - previous.finished < ttl)) return previous;
    const snapshot = { rows: [], previousRows: previous?.rows || [], loading: true, finished: 0, error: null, scanned: 0 };
    snapshots.set(id, snapshot);
    snapshot.promise = build(account, snapshot)
      .catch(() => { snapshot.error = 'No se pudo completar la consulta de Mercado Libre. Reintenta la actualización.'; })
      .finally(() => {
        snapshot.loading = false; snapshot.finished = now(); snapshot.previousRows = [];
        const expiry = setTimeout(() => { if (snapshots.get(id) === snapshot) snapshots.delete(id); }, ttl * 2);
        expiry.unref?.();
      });
    return snapshot;
  }

  async function list(accounts, params = {}) {
    const search = String(params.search || '').trim();
    let rows, refreshing = false, errors = [];
    if (/^\d+$/.test(search)) {
      rows = [];
      for (const account of accounts) {
        try { const ship = await detail(account, search); if (importable(ship)) rows.push(ship); }
        catch (error) { if (![403, 404].includes(error.response?.status || error.status)) throw error; }
      }
    } else {
      // Drop snapshots of accounts no longer accessible, and never retain idle data indefinitely.
      for (const [id, snapshot] of snapshots) if (!snapshot.loading && now() - snapshot.finished > ttl * 2) snapshots.delete(id);
      const states = accounts.map(account => start(account));
      rows = states.flatMap(state => state.loading && state.previousRows.length ? state.previousRows : state.rows);
      refreshing = states.some(state => state.loading);
      errors = states.flatMap((state, i) => state.error ? [{ ml_account_id: accounts[i].ml_account_id, message: state.error }] : []);
    }
    const excluded = await excludedIds(rows.map(ship => ship.ml_shipment_external_id));
    rows = rows.filter(ship => !excluded.has(ship.ml_shipment_external_id));
    if (search && !/^\d+$/.test(search)) rows = rows.filter(ship => String(ship.buyer_name || '').toLowerCase().includes(search.toLowerCase()));
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || a.ml_shipment_id.localeCompare(b.ml_shipment_id));
    const offset = Math.max(0, Math.floor(Number(params.offset) || 0));
    const limit = Math.max(1, Math.min(200, Math.floor(Number(params.limit) || 50)));
    return { total: rows.length, shipments: rows.slice(offset, offset + limit), refreshing, complete: !refreshing && !errors.length, errors };
  }

  function invalidate(accountId) {
    const snapshot = snapshots.get(String(accountId));
    if (snapshot && !snapshot.loading) snapshots.delete(String(accountId));
  }
  return { list, detail, start, invalidate };
}

let instance;
function service() {
  instance ||= createService({ request: require('./mlLiveClient').request, excludedIds: require('./mlImportLedger').excludedIds });
  return instance;
}
async function refreshShipmentDetails(id, accountId) {
  const account = await require('./mlAccountAccessService').assertAccessible(accountId);
  return service().detail(account, id);
}
module.exports = {
  createService,
  getPendingShipments: (accounts, params) => service().list(accounts, params),
  refreshShipmentDetails,
  detail: (account, id, orderId) => service().detail(account, id, orderId),
  refresh: account => { service().start(account, true); return { message: 'Consulta directa a Mercado Libre iniciada.' }; },
  invalidate: accountId => service().invalidate(accountId),
};
