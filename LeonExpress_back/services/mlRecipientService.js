'use strict';
const { clean, recipientFromShipment, missingContactPatch } = require('../utils/mlRecipient');

async function prepareShipment(ship) {
  let result = ship;
  let contact = recipientFromShipment(result);
  if (!contact.recipient_name || !contact.destination_address || !contact.recipient_phone) {
    try {
      const refreshed = await require('./mlLiveShipments').refreshShipmentDetails(ship.ml_shipment_external_id, ship.ml_account_id);
      if (String(refreshed.ml_shipment_external_id) !== String(ship.ml_shipment_external_id) || String(refreshed.ml_account_id) !== String(ship.ml_account_id)) throw Object.assign(new Error('Envío incompatible'), { code: 'ML_SOURCE_MISMATCH', status: 403 });
      result = refreshed;
      contact = recipientFromShipment(result);
    } catch (error) {
      if (error.code === 'ML_SOURCE_MISMATCH') throw error;
      if (!contact.recipient_name || !contact.destination_address) throw Object.assign(new Error('Mercado Libre aún no entrega nombre y dirección completos. Toma una foto de la etiqueta para revisarla.'), { status: 409, allowPhoto: true });
    }
  }
  if (!contact.recipient_name || !contact.destination_address) throw Object.assign(new Error('Mercado Libre aún no entrega nombre y dirección completos. Toma una foto de la etiqueta para revisarla.'), { status: 409, allowPhoto: true });
  return { ...result, ...contact };
}

async function applyContact(models, packageId, clientId, externalId, contact, { dryRun = false } = {}) {
  const { Package, AuditLog, sequelize } = models;
  return sequelize.transaction(async transaction => {
    const pkg = await Package.findByPk(packageId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!pkg || String(pkg.client_id) !== String(clientId) || String(pkg.external_tracking_code) !== String(externalId)) return [];
    const patch = missingContactPatch(pkg, contact);
    const fields = Object.keys(patch);
    if (!fields.length || dryRun) return fields;
    const before = Object.fromEntries(fields.map(key => [key, pkg[key]]));
    await pkg.update(patch, { transaction });
    await AuditLog.create({ log_id: require('uuid').v4(), user_id: null, action: 'ML_RECIPIENT_RECOVERED', target_table: 'packages', target_id: pkg.package_id, details: JSON.stringify({ source: 'mercadolibre', before, after: patch }) }, { transaction });
    return fields;
  });
}

let cursor = '';
let running = false;
async function reconcileRecipients({ dryRun = false, limit = 100, models, gateway, access } = {}) {
  if (running) return { skipped: true };
  running = true;
  try {
    models ||= require('../models'); gateway ||= require('./mlLiveShipments'); access ||= require('./mlAccountAccessService');
    const { Op } = require('sequelize');
    const accounts = await access.getAccounts();
    const clients = [...new Set(accounts.map(a => String(a.client_id)))];
    if (!clients.length) return { checked: 0, updated: 0, failed: 0 };
    const rows = await models.Package.findAll({ where: { package_id: { [Op.gt]: cursor }, client_id: { [Op.in]: clients }, external_tracking_code: { [Op.ne]: null }, [Op.or]: ['recipient_name', 'recipient_phone', 'destination_address'].map(key => ({ [Op.or]: [{ [key]: null }, { [key]: '' }, { [key]: { [Op.regexp]: '[xX]{3,}|[*]{3,}' } }, { [key]: { [Op.in]: ['Comprador', 'Comprador ML', 'Sin Nombre', 'No disponible', 'Direccion pendiente de ML', 'Dirección de MercadoLibre', 'Destinatario MercadoLibre'] } }] })) }, order: [['package_id', 'ASC']], limit });
    const result = { checked: rows.length, updated: 0, failed: 0 };
    for (const pkg of rows) {
      cursor = pkg.package_id;
      if (['recipient_name', 'recipient_phone', 'destination_address'].every(key => clean(pkg[key]))) continue;
      for (const account of accounts.filter(a => String(a.client_id) === String(pkg.client_id))) {
        try {
          const ship = await gateway.refreshShipmentDetails(pkg.external_tracking_code, account.ml_account_id);
          if (String(ship.ml_account_id) !== String(account.ml_account_id) || String(ship.ml_shipment_external_id) !== String(pkg.external_tracking_code)) throw new Error('Identidad de envío incompatible');
          const fields = await applyContact(models, pkg.package_id, pkg.client_id, pkg.external_tracking_code, recipientFromShipment(ship), { dryRun });
          if (fields.length) result.updated++;
          break;
        } catch (error) {
          if (![403, 404].includes(error.response?.status || error.status)) { result.failed++; break; }
        }
      }
    }
    if (rows.length < limit) cursor = '';
    return result;
  } finally { running = false; }
}
let task;
function startRecipientReconciliation() {
  if (task) return task;
  task = require('node-cron').schedule('*/5 * * * *', async () => {
    try { console.log('[ML RECIPIENT]', await reconcileRecipients()); }
    catch (error) { console.error('[ML RECIPIENT] No se pudo completar:', error.message); }
  });
  return task;
}
module.exports = { prepareShipment, applyContact, reconcileRecipients, startRecipientReconciliation };
