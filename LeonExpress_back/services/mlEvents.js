'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const { v4: uuid } = require('uuid');
const models = require('../models');
const access = require('./mlAccountAccessService');
const live = require('./mlLiveShipments');
const { recipientFromShipment, missingContactPatch } = require('../utils/mlRecipient');

function authorized(value) {
  const secret = process.env.INTERNAL_WEBHOOK_TOKEN;
  if (!secret || typeof value !== 'string') return false;
  const a = Buffer.from(secret), b = Buffer.from(value);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function applyShipment(account, shipment) {
  const { Package, Cancellation, AuditLog, RoutePackage, Route, sequelize } = models;
  const contact = recipientFromShipment(shipment);
  await sequelize.transaction(async transaction => {
    const pkg = await Package.findOne({ where: { external_tracking_code: String(shipment.ml_shipment_external_id), client_id: account.client_id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!pkg) return;
    const patch = missingContactPatch(pkg, contact);
    const final = ['ENTREGADO', 'DEVUELTO_A_CLIENTE', 'DEVUELTO_ALMACEN', 'CANCELADO'];
    const cancelled = shipment.status_ml === 'cancelled' && !final.includes(pkg.status);
    if (cancelled) patch.status = 'CANCELADO';
    if (!Object.keys(patch).length) return;
    const before = Object.fromEntries(Object.keys(patch).map(key => [key, pkg[key]]));
    await pkg.update(patch, { transaction });
    await AuditLog.create({ log_id: uuid(), user_id: null, action: 'ML_LIVE_UPDATE', target_table: 'packages', target_id: pkg.package_id, details: JSON.stringify({ source: 'mercadolibre', before, after: patch }) }, { transaction });
    if (cancelled) {
      await Cancellation.create({ cancellation_id: uuid(), package_id: pkg.package_id, reason: 'SOLICITUD_CLIENTE', notes: 'Cancelación verificada directamente en Mercado Libre', refund_amount: 0 }, { transaction });
      const assignment = await RoutePackage.findOne({ where: { package_id: pkg.package_id, released_at: null }, include: [{ model: Route, as: 'route' }], order: [['created_at', 'DESC']], transaction });
      if (assignment?.route?.user_id) transaction.afterCommit(async () => {
        try {
          await require('../utils/notificationService').queueNotification({ userId: assignment.route.user_id, title: 'Paquete cancelado por Mercado Libre', message: `El comprador canceló el paquete ${shipment.ml_shipment_external_id}. No lo entregues.`, shouldSendPush: true });
        } catch (error) { console.error('[ML Events] No se pudo notificar la cancelación:', error.message); }
      });
    }
  });
}

async function processEvent({ topic, resource, ml_account_id, ml_user_id }) {
  if (!['shipments', 'orders_v2'].includes(topic) || !/^\/(shipments|orders)\/\d{1,20}$/.test(resource || '')) throw Object.assign(new Error('Evento inválido'), { status: 400 });
  if ((topic === 'shipments') !== resource.startsWith('/shipments/')) throw Object.assign(new Error('Recurso incompatible'), { status: 400 });
  const account = (await access.getAccounts()).find(a => String(a.ml_account_id) === String(ml_account_id) && String(a.ml_user_id) === String(ml_user_id));
  if (!account) return { ignored: true };
  live.invalidate(account.ml_account_id);
  let id = resource.split('/').pop();
  if (topic === 'orders_v2') {
    const order = await require('./mlLiveClient').request(account, 'get', resource);
    if (String(order.seller?.id) !== String(account.ml_user_id)) throw Object.assign(new Error('Orden de otra cuenta'), { status: 403 });
    id = order.shipping?.id;
    if (!id) return { ignored: true };
  }
  const exists = await models.Package.findOne({ where: { external_tracking_code: String(id), client_id: account.client_id }, attributes: ['package_id'] });
  if (!exists) return { ignored: true };
  await applyShipment(account, await live.detail(account, id));
  return { processed: true };
}

let cursor = '', running = false, task;
async function reconcile() {
  if (running) return;
  running = true;
  try {
    const accounts = await access.getAccounts();
    if (!accounts.length) return;
    const rows = await models.Package.findAll({ where: {
      package_id: { [Op.gt]: cursor }, client_id: { [Op.in]: accounts.map(a => a.client_id) },
      external_tracking_code: { [Op.regexp]: '^[0-9]+$' },
      status: { [Op.notIn]: ['ENTREGADO', 'DEVUELTO_A_CLIENTE', 'DEVUELTO_ALMACEN', 'CANCELADO'] },
    }, attributes: ['package_id', 'client_id', 'external_tracking_code'], order: [['package_id', 'ASC']], limit: 100 });
    for (const pkg of rows) {
      cursor = pkg.package_id;
      for (const account of accounts.filter(a => String(a.client_id) === String(pkg.client_id))) {
        try { await applyShipment(account, await live.detail(account, pkg.external_tracking_code)); break; }
        catch (error) { if (![403, 404].includes(error.response?.status || error.status)) throw error; }
      }
    }
    if (rows.length < 100) cursor = '';
  } finally { running = false; }
}
function start() {
  task ||= require('node-cron').schedule('*/5 * * * *', () => reconcile().catch(error => console.error('[ML Events] Reconciliación pendiente:', error.message)));
  return task;
}
module.exports = { authorized, processEvent, applyShipment, reconcile, start };
