'use strict';

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { Pickup, Package, Client, ClientPricing, OcrProcessingQueue, sequelize } = require('../models');
const { generateUniqueTrackingCode } = require('../utils/uuidUtils');
const mlGatewayClient = require('./mlGatewayClient');

/**
 * Importa envíos específicos y los inserta como paquetes (Packages) dentro de
 * una recolección (Pickup) ya existente.
 * 
 * @param {Array<string>} shipmentIds Array con los IDs en el Gateway (`ml_shipment_id`)
 * @param {string} targetPickupId UUID del Pickup existente al que se van a agregar
 * @param {string} adminUserId UUID del administrador orquestando
 */
async function importShipments(shipmentIds, targetPickupId, adminUserId) {
  const t = await sequelize.transaction();
  
  try {
    // 1. Validar el Pickup de destino
    const targetPickup = await Pickup.findOne({ where: { pickup_id: targetPickupId }, transaction: t });
    if (!targetPickup) {
      throw new Error(`El Pickup de destino no existe: ${targetPickupId}`);
    }

    // 2. Obtener la data de los shipments desde el Gateway
    const { shipments } = await mlGatewayClient.getPendingShipments({ limit: 1000 });
    
    // Filtrar los shipments que nos pidieron importar
    const targetShipments = shipments.filter(s => shipmentIds.includes(s.ml_shipment_id));
    
    if (targetShipments.length === 0) {
      throw new Error("No se encontraron envíos con los IDs proporcionados en la lista de pendientes del Gateway");
    }

    // El cliente de LE asociado al Pickup
    const clientId = targetPickup.client_id;
    
    // Obtener el precio base definido para este cliente
    const pricing = await ClientPricing.findOne({ 
      where: { client_id: clientId, valid_to: null }, 
      transaction: t 
    });
    const clientPrice = pricing ? parseFloat(pricing.base_price) : 0.00;

    const packageRefs = [];

    // 3. Generar los Paquetes bajo ese Pickup
    for (const ship of targetShipments) {
      const trackingCode = await generateUniqueTrackingCode();
      let destinationAddress = ship.buyer_address;
      
      try {
         const parsedJson = JSON.parse(ship.buyer_address);
         if (parsedJson.address_line) destinationAddress = parsedJson.address_line;
      } catch(e) {}

      const newPackage = await Package.create({
        package_id: uuidv4(),
        tracking_code: trackingCode,
        external_tracking_code: String(ship.ml_shipment_external_id),
        pickup_id: targetPickupId,
        client_id: clientId,
        status: 'PENDIENTE_RECOLECCION',  // Estado inicial = pendiente de escáner
        destination_address: shipmentAddressFormatter(ship),
        recipient_name: ship.buyer_name || 'Sin Nombre',
        recipient_phone: ship.buyer_phone || '',
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

    // 4. Notificar al Gateway que estos shipments han sido procesados.
    for (const ref of packageRefs) {
      await mlGatewayClient.markShipmentAsImported(ref.shipment_id, ref.package_id);
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

/**
 * Función auxiliar para formatear la dirección en 1 string
 * El campo buyer_address contiene el raw JSON de receiver_address de ML
 * con campos: street_name, street_number, city.name, state.name, zip_code, neighborhood.name, comment
 */
function shipmentAddressFormatter(ship) {
  try {
    const addr = JSON.parse(ship.buyer_address);
    
    // Construir dirección desde los campos nativos de ML
    const streetName = addr.street_name || '';
    const streetNumber = addr.street_number || '';
    const neighborhood = addr.neighborhood?.name || '';
    const city = addr.city?.name || ship.buyer_city || '';
    const state = addr.state?.name || ship.buyer_state || '';
    const zipCode = addr.zip_code || ship.buyer_zip || '';
    const comment = addr.comment || '';
    
    let parts = [];
    
    // Calle y número
    const street = `${streetName} ${streetNumber}`.trim();
    if (street) parts.push(street);
    
    // Barrio/colonia
    if (neighborhood) parts.push(neighborhood);
    
    // Ciudad
    if (city) parts.push(city);
    
    // Estado y CP
    if (state) parts.push(state);
    if (zipCode) parts.push(`CP ${zipCode}`);
    
    let fullAddress = parts.join(', ');
    
    // Agregar comentario del comprador si existe (referencias, depto, etc)
    if (comment) {
      fullAddress += ` (${comment})`;
    }
    
    if (fullAddress) return fullAddress;
  } catch(e) {
    // Si falla el parsing, intentar con buyer_city directamente
  }
  
  // Fallback: usar los campos planos del shipment
  const fallbackParts = [];
  if (ship.buyer_city) fallbackParts.push(ship.buyer_city);
  if (ship.buyer_state) fallbackParts.push(ship.buyer_state);
  if (ship.buyer_zip) fallbackParts.push(`CP ${ship.buyer_zip}`);
  
  return fallbackParts.length > 0 
    ? fallbackParts.join(', ')
    : 'Direccion pendiente de ML';
}

module.exports = {
  importShipments
};
