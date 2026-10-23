'use strict';

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { Pickup, Package, Client, ClientPricing, OcrProcessingQueue, sequelize } = require('../models');
const { generateUniqueTrackingCode } = require('../utils/uuidUtils');
const mlAccountAccess = require('./mlAccountAccessService');
const mlLive = require('./mlLiveShipments');
const ledger = require('./mlImportLedger');
const { importable } = require('../utils/mlImportPolicy');

/**
 * Importa envíos específicos y los inserta como paquetes (Packages) dentro de
 * una recolección (Pickup) ya existente.
 * 
 * @param {Array<string>} shipmentIds Identidades estables cuenta:envío de Mercado Libre
 * @param {string} targetPickupId UUID del Pickup existente al que se van a agregar
 * @param {string} adminUserId UUID del administrador orquestando
 */
async function importShipments(shipmentIds, targetPickupId, adminUserId) {
  if (!Array.isArray(shipmentIds) || !shipmentIds.length || shipmentIds.length > 200) {
    throw Object.assign(new Error('Selecciona entre 1 y 200 envíos.'), { status: 400 });
  }
  const initialPickup = await Pickup.findByPk(targetPickupId);
  if (!initialPickup) throw Object.assign(new Error('Recolección no encontrada.'), { status: 404 });
  const accounts = await mlAccountAccess.getAccounts();
  const accountById = new Map(accounts.map(account => [String(account.ml_account_id), account]));
  // Resolve the exact selection, independently of pagination. Always reread ML before importing.
  const selection = [];
  for (const key of [...new Set(shipmentIds)]) {
    const parts = typeof key === 'string' ? key.split(':') : [];
    const account = accountById.get(parts[0]);
    if (parts.length !== 2 || !/^\d{1,20}$/.test(parts[1])) {
      throw Object.assign(new Error('Actualiza la lista de envíos antes de importar.'), { status: 400 });
    }
    if (!account || String(account.client_id) !== String(initialPickup.client_id)) {
      throw Object.assign(new Error('El envío no pertenece al cliente de la recolección.'), { status: 403 });
    }
    selection.push({ account, id: parts[1] });
  }
  const targetShipments = [];
  // Bound network concurrency without holding SQL locks throughout a large selection.
  for (let i = 0; i < selection.length; i += 4) {
    const batch = await Promise.all(selection.slice(i, i + 4).map(async ({ account, id }) => {
      const ship = await mlLive.detail(account, id);
      if (!importable(ship)) throw Object.assign(new Error('El envío ya no está disponible para recolectar.'), { status: 409 });
      return require('./mlRecipientService').prepareShipment(ship);
    }));
    targetShipments.push(...batch);
  }
  const t = await sequelize.transaction();
  
  try {
    // 1. Validar el Pickup de destino
    const targetPickup = await Pickup.findOne({ where: { pickup_id: targetPickupId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!targetPickup) {
      throw new Error(`El Pickup de destino no existe: ${targetPickupId}`);
    }
    if (!['SOLICITADA', 'ASIGNADO_A_RECOLECTOR', 'EN_PROCESO_RECOLECCION'].includes(targetPickup.status)) {
      throw Object.assign(new Error('La recolección ya está cerrada.'), { status: 409 });
    }

    // El cliente de LE asociado al Pickup
    const clientId = targetPickup.client_id;
    const invalidShipment = targetShipments.find(ship =>
      String(accountById.get(String(ship.ml_account_id))?.client_id) !== String(clientId),
    );
    if (invalidShipment) {
      throw new Error('Uno o más envíos no pertenecen a la cuenta de Mercado Libre del cliente seleccionado');
    }
    
    // Obtener el precio base definido para este cliente
    const pricing = await ClientPricing.findOne({ 
      where: { client_id: clientId, valid_to: null }, 
      transaction: t 
    });
    const clientPrice = pricing ? parseFloat(pricing.base_price) : 0.00;

    const packageRefs = [];

    // 3. Generar los Paquetes bajo ese Pickup
    for (const ship of targetShipments.sort((a, b) => a.ml_shipment_external_id.localeCompare(b.ml_shipment_external_id))) {
      const trackingCode = await generateUniqueTrackingCode();
      const packageId = uuidv4();
      await ledger.claim(ship, packageId, t);

      const newPackage = await Package.create({
        package_id: packageId,
        tracking_code: trackingCode,
        external_tracking_code: String(ship.ml_shipment_external_id),
        pickup_id: targetPickupId,
        client_id: clientId,
        status: 'PENDIENTE_RECOLECCION',  // Estado inicial = pendiente de escáner
        destination_address: ship.destination_address,
        recipient_name: ship.recipient_name,
        recipient_phone: ship.recipient_phone,
        client_price: clientPrice,
        delivery_cost: 0.00,
        is_cod: false,
      }, { transaction: t });

      // Generar imagen QR con el codigo ML como etiqueta del paquete
      try {
        const mlCode = String(ship.ml_shipment_external_id);
        const labelsDir = path.join(__dirname, '..', 'uploads', 'pickups', targetPickupId, 'labels');
        fs.mkdirSync(labelsDir, { recursive: true });

        const qrFilename = `ml_${mlCode}_${newPackage.package_id}.png`;
        const qrPath = path.join(labelsDir, qrFilename);

        // MercadoLibre usa un JSON en sus QRs: {"id":"46888288061",...}
        const qrContent = JSON.stringify({ id: mlCode, source: 'leon-express-import' });

        // Generar QR como PNG
        await QRCode.toFile(qrPath, qrContent, {
          type: 'png',
          width: 400,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        });

        // Crear registro en OcrProcessingQueue para que el frontend lo encuentre
        const relativePath = `/uploads/pickups/${targetPickupId}/labels/${qrFilename}`;
        await OcrProcessingQueue.create({
          id: uuidv4(),
          pickup_id: targetPickupId,
          batch_id: targetPickupId,
          image_path: relativePath,
          filename: qrFilename,
          status: 'auto_approved',
          ocr_provider: 'ml-import',
          parser_used: 'mercadolibre-qr',
          overall_confidence: 100.00,
          auto_approved: true,
          package_id: newPackage.package_id,
          processed_at: new Date(),
        }, { transaction: t });

        console.log(`[ML Import] QR generado para ML ${mlCode} -> ${qrFilename}`);
      } catch (qrErr) {
        console.warn(`[ML Import] No se pudo generar QR para ${ship.ml_shipment_external_id}:`, qrErr.message);
        // No bloqueamos la importacion si falla el QR
      }

      packageRefs.push({
        shipment_id: ship.ml_shipment_id,
        package_id: newPackage.package_id,
        tracking_code: trackingCode
      });
    }

    await t.commit();
    return {
      pickup_id: targetPickupId,
      packages_created: packageRefs.length
    };

  } catch (error) {
    await t.rollback();
    console.error('[ML Import] Transaction rolled back:', error.message);
    throw error;
  }
}

module.exports = {
  importShipments
};
