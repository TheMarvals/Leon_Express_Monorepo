'use strict';
const { Op } = require('sequelize');
const { MlImport, Package } = require('../models');

async function excludedIds(ids) {
  if (!ids.length) return new Set();
  const [imports, packages] = await Promise.all([
    MlImport.findAll({ where: { external_id: { [Op.in]: ids } }, attributes: ['external_id'], raw: true }),
    Package.findAll({ where: { external_tracking_code: { [Op.in]: ids } }, attributes: ['external_tracking_code'], raw: true }),
  ]);
  return new Set([...imports.map(row => String(row.external_id)), ...packages.map(row => String(row.external_tracking_code))]);
}

async function claim(shipment, packageId, transaction) {
  const externalId = String(shipment.ml_shipment_external_id);
  // The unique external_id serializes imports across different pickups/processes.
  try {
    await MlImport.create({ external_id: externalId, ml_account_id: shipment.ml_account_id, package_id: packageId }, { transaction });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw Object.assign(new Error('El envío ya fue importado o está siendo importado.'), { status: 409 });
    }
    throw error;
  }
  const existing = await Package.findOne({ where: { external_tracking_code: externalId }, transaction, lock: transaction.LOCK.UPDATE });
  if (existing) throw Object.assign(new Error('El envío ya existe en León Express.'), { status: 409 });
}

module.exports = { excludedIds, claim };
