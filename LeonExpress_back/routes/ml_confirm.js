'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authenticateToken');
const hasRole = require('../middlewares/roleValidator');
const { Package, Pickup, OcrProcessingQueue } = require('../models');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

/**
 * RUTAS DE DRIVER / ALMACEN para recolección de paquetes de MercadoLibre
 */

// POST /api/ml-confirm/packages/confirm-ml
// Escaneo del paquete ML para certificarlo como RECOLECTADO_EN_ORIGEN
router.post('/packages/confirm-ml', authMiddleware, hasRole(['ADMIN', 'DRIVER']), async (req, res) => {
  try {
    const { pickup_id, ml_code, raw_qr_data } = req.body;

    console.log('🔍 [ML-CONFIRM] Recibido:', {
      pickup_id,
      ml_code,
      raw_qr_data_length: raw_qr_data ? raw_qr_data.length : 0,
      raw_qr_data_preview: raw_qr_data ? raw_qr_data.substring(0, 200) : 'NULL/UNDEFINED',
    });
    
    if (!pickup_id || !ml_code) {
      return res.status(400).json({ error: 'Faltan campos: pickup_id y ml_code son requeridos' });
    }

    // Buscamos el paquete en este pickup (por si ya fue importado o pre-cargado)
    let pkg = await Package.findOne({
      where: {
        pickup_id: pickup_id,
        external_tracking_code: ml_code
      }
    });

    if (pkg) {
      if (pkg.status !== 'PENDIENTE_RECOLECCION') {
         return res.status(400).json({ error: `El envío ya fue escaneado o está en estado: ${pkg.status}` });
      }
      // Confirmamos el paquete
      await pkg.update({
        status: 'RECOLECTADO_EN_ORIGEN',
        scanned_at_origin_datetime: new Date()
      });
    } else {
      // --- FLUJO DINÁMICO: AUTO-IMPORTACIÓN ---
      const pickup = await Pickup.findByPk(pickup_id);
      if (!pickup) return res.status(404).json({ error: 'Recolección no encontrada.' });

      const mlGatewayClient = require('../services/mlGatewayClient');
      
      // Consultamos el banco de ML buscando este tracking
      const pendingData = await mlGatewayClient.getPendingShipments({ search: ml_code });
      
      if (!pendingData || !pendingData.shipments || pendingData.shipments.length === 0) {
        return res.status(404).json({ error: 'El paquete no se encuentra disponible en MercadoLibre.' });
      }

      // Buscar coincidencia exacta (la API de gateway puede retornar coincidencias parciales con LIKE)
      const shipment = pendingData.shipments.find(s => String(s.ml_shipment_external_id) === String(ml_code));
      if (!shipment) {
        return res.status(404).json({ error: 'El paquete no está disponible (quizás ya fue cancelado o importado).' });
      }

      // Validar que la cuenta de ML dueña del paquete le pertenezca al cliente del Pickup
      const accountsData = await mlGatewayClient.getAccounts();
      const clientAccounts = (accountsData.accounts || [])
        .filter(a => a.client_id === pickup.client_id)
        .map(a => a.ml_account_id);

      if (!clientAccounts.includes(shipment.ml_account_id)) {
        return res.status(403).json({ error: 'Este paquete pertenece a otro cliente distinto al de esta recolección.' });
      }

      // Auto-importamos el paquete a LeonExpress
      const newPackageId = uuidv4();
      const { generateUniqueTrackingCode } = require('../utils/uuidUtils');
      const trackingCode = await generateUniqueTrackingCode();

      // Obtener precio del cliente
      const { ClientPricing } = require('../models');
      const pricing = await ClientPricing.findOne({ 
        where: { client_id: pickup.client_id, valid_to: null }
      });
      const clientPrice = pricing ? parseFloat(pricing.base_price) : 0.00;

      let destinationAddress = shipment.buyer_address || 'Dirección de MercadoLibre';
      try {
         const parsedJson = JSON.parse(destinationAddress);
         if (parsedJson.address_line) destinationAddress = parsedJson.address_line;
      } catch(e) {}

      pkg = await Package.create({
        package_id: newPackageId,
        tracking_code: trackingCode,
        pickup_id: pickup_id,
        client_id: pickup.client_id,
        recipient_name: shipment.buyer_name || 'Comprador ML',
        recipient_phone: shipment.buyer_phone || '',
        destination_address: destinationAddress,
        external_tracking_code: shipment.ml_shipment_external_id,
        status: 'RECOLECTADO_EN_ORIGEN',
        client_price: clientPrice,
        delivery_cost: 0.00,
        is_cod: false,
        scanned_at_origin_datetime: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      });

      // Notificamos al ML Gateway que este envío ya fue consumido
      await mlGatewayClient.markShipmentAsImported(shipment.ml_shipment_id, newPackageId);
      console.log(`✅ [ML-CONFIRM] Paquete ${ml_code} auto-importado exitosamente al vuelo.`);
    }

    // ── Regenerar QR con la data EXACTA del paquete físico ──
    if (raw_qr_data) {
      try {
        const labelId = uuidv4();
        const labelDir = path.join(__dirname, '..', 'uploads', 'pickups', pickup_id, 'labels');
        fs.mkdirSync(labelDir, { recursive: true });

        const labelFilename = `${pkg.package_id}_qr.png`;
        const labelPath = path.join(labelDir, labelFilename);
        const relativePath = `/uploads/pickups/${pickup_id}/labels/${labelFilename}`;

        // Generar QR con los datos originales exactos
        await QRCode.toFile(labelPath, raw_qr_data, {
          errorCorrectionLevel: 'H',
          width: 400,
          margin: 2,
        });

        // Borrar registro anterior si existe (para re-escaneos)
        await OcrProcessingQueue.destroy({ where: { package_id: pkg.package_id } });

        // Crear nuevo registro con el QR real
        await OcrProcessingQueue.create({
          id: labelId,
          pickup_id: pickup_id,
          batch_id: pickup_id,
          image_path: relativePath,
          filename: labelFilename,
          status: 'auto_approved',
          ocr_raw_text: raw_qr_data,
          parser_used: 'ml-qr-scan',
          overall_confidence: 100.00,
          auto_approved: true,
          package_id: pkg.package_id,
          fields_extracted: 1,
        });

        console.log(`✅ QR regenerado para paquete ${pkg.package_id} con data original`);
      } catch (qrErr) {
        console.error('⚠️ Error generando QR desde raw_qr_data:', qrErr.message);
        // No falla la confirmación, solo el QR
      }
    }

    // Calculamos progreso del pickup (para feedback visual)
    const totalExpected = await Package.count({ where: { pickup_id: pickup_id, external_tracking_code: { [Op.ne]: null } } });
    const confirmed = await Package.count({ where: { pickup_id: pickup_id, status: 'RECOLECTADO_EN_ORIGEN' } });

    res.json({
      message: 'Confirmado correctamente',
      package: {
        id: pkg.package_id,
        name: pkg.recipient_name,
        address: pkg.destination_address,
      },
      progress: {
        total_expected: totalExpected,
        confirmed: confirmed
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Error al confirmar paquete ML', details: error.message });
  }
});

// GET /api/ml-confirm/pickups/:id/ml-progress
// Permite al driver ver cuántos paquetes de ML lleva escaneados en este pickup
router.get('/pickups/:id/ml-progress', authMiddleware, hasRole(['ADMIN', 'DRIVER']), async (req, res) => {
  try {
    const pickupId = req.params.id;

    // Con el nuevo flujo dinámico, ya no hay paquetes "pendientes" precargados
    // Solo contamos y devolvemos los que ya han sido confirmados/escaneados
    const confirmed = await Package.findAll({
      where: { 
        pickup_id: pickupId, 
        status: { [Op.in]: ['RECOLECTADO_EN_ORIGEN', 'INGRESADO', 'EN_TRANSITO'] },
        external_tracking_code: { [Op.ne]: null }
      },
      attributes: ['package_id', 'external_tracking_code', 'recipient_name']
    });

    res.json({
      total_expected: confirmed.length, // Ya no hay "total" conocido
      confirmed_count: confirmed.length,
      pending_count: 0,
      pending_packages: [],
      confirmed_packages: confirmed
    });

  } catch (error) {
    res.status(500).json({ error: 'Error al consultar progreso de ML', details: error.message });
  }
});

module.exports = router;
