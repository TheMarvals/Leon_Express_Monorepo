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
const { withPickupPackageLock } = require('../utils/pickupPackageLock');

/**
 * RUTAS DE DRIVER / ALMACEN para recolección de paquetes de MercadoLibre
 */

// POST /api/ml-confirm/packages/confirm-ml
// Escaneo del paquete ML para certificarlo como RECOLECTADO_EN_ORIGEN
router.post('/packages/confirm-ml', authMiddleware, hasRole(['ADMIN', 'DRIVER']), async (req, res) => {
  try {
    const { pickup_id, raw_qr_data } = req.body;
    const inputCode = req.body.ml_code;
    if (typeof inputCode !== 'string' || !inputCode.trim()) {
      return res.status(400).json({ error: 'El código del paquete es requerido' });
    }
    const trimmedCode = inputCode.trim();
    const ml_code = /^[\d\s-]+$/.test(trimmedCode) ? trimmedCode.replace(/[\s-]/g, '') : trimmedCode;

    console.log('🔍 [ML-CONFIRM] Recibido:', {
      pickup_id,
      ml_code,
      raw_qr_data_length: raw_qr_data ? raw_qr_data.length : 0,
      raw_qr_data_preview: typeof raw_qr_data === 'string' ? raw_qr_data.substring(0, 200) : null,
    });

    if (!pickup_id || !ml_code) {
      return res.status(400).json({ error: 'Faltan campos: pickup_id y ml_code son requeridos' });
    }

    const confirmation = await withPickupPackageLock(pickup_id, async (pickup, transaction) => {
      // Recheck after locking: simultaneous scans must see the first committed package.
      let pkg = await Package.findOne({
        where: {
          pickup_id: pickup_id,
          [Op.or]: [{ external_tracking_code: ml_code }, { tracking_code: ml_code }]
        },
        transaction
      });

      // Si no está asignado a este pickup_id, buscar si es un paquete manual pendiente de este cliente
      if (!pkg) {
        pkg = await Package.findOne({
          where: {
            client_id: pickup.client_id,
            pickup_id: null,
            status: 'PENDIENTE_RECOLECCION',
            [Op.or]: [{ external_tracking_code: ml_code }, { tracking_code: ml_code }]
          },
          transaction
        });

      }

      // Buscar primero y bloquear después por PK, igual que la edición/eliminación
      // del cliente. Releer evita usar una instancia borrada mientras esperábamos.
      if (pkg) pkg = await Package.findByPk(pkg.package_id, { transaction, lock: transaction.LOCK.UPDATE });
      if (pkg) {
        if (String(pkg.client_id) !== String(pickup.client_id) || (pkg.pickup_id && String(pkg.pickup_id) !== String(pickup_id))) {
          throw Object.assign(new Error('El paquete ya no está disponible para esta recolección.'), { status: 409 });
        }
        if (!pkg.pickup_id) {
          if (pkg.status !== 'PENDIENTE_RECOLECCION') {
            throw Object.assign(new Error('El paquete ya no está pendiente de recolección.'), { status: 409 });
          }
          await pkg.update({ pickup_id }, { transaction });
        }
        if (pkg.status !== 'PENDIENTE_RECOLECCION') {
           return { pkg, alreadyConfirmed: true };
        }
        // Confirmamos el paquete
        await pkg.update({
          status: 'RECOLECTADO_EN_ORIGEN',
          scanned_at_origin_datetime: new Date()
        }, { transaction });
      } else {
        // --- FLUJO DINÁMICO: AUTO-IMPORTACIÓN ---
        if (!/^(4\d{10}|3\d{9,10}|2\d{11,15})$/.test(ml_code)) {
          const error = new Error('Código no registrado en esta recolección. Puedes tomar una foto de la etiqueta.');
          error.status = 404;
          error.allowPhoto = true;
          throw error;
        }

        const mlGatewayClient = require('../services/mlGatewayClient');
        const mlAccountAccess = require('../services/mlAccountAccessService');

        // Consultamos el banco de ML buscando este tracking
        const pendingData = await mlGatewayClient.getPendingShipments({ search: ml_code });

        if (!pendingData || !pendingData.shipments || pendingData.shipments.length === 0) {
          throw Object.assign(new Error('El paquete no se encuentra disponible en MercadoLibre.'), { status: 404, allowPhoto: true });
        }

        // Buscar coincidencia exacta (la API de gateway puede retornar coincidencias parciales con LIKE)
        let shipment = pendingData.shipments.find(s => String(s.ml_shipment_external_id) === String(ml_code));
        if (!shipment) {
          throw Object.assign(new Error('El paquete no está disponible (quizás ya fue cancelado o importado).'), { status: 404, allowPhoto: true });
        }

        // Validar que la cuenta de ML dueña del paquete le pertenezca al cliente del Pickup
        const accessibleAccounts = await mlAccountAccess.getAccounts();
        const clientAccounts = accessibleAccounts
          .filter(a => String(a.client_id) === String(pickup.client_id))
          .map(a => String(a.ml_account_id));

        if (!clientAccounts.includes(String(shipment.ml_account_id))) {
          throw Object.assign(new Error('Este paquete pertenece a otro cliente distinto al de esta recolección.'), { status: 403 });
        }

        shipment = await require('../services/mlRecipientService').prepareShipment(shipment);

        // Auto-importamos el paquete a LeonExpress
        const newPackageId = uuidv4();
        const { generateUniqueTrackingCode } = require('../utils/uuidUtils');
        const trackingCode = await generateUniqueTrackingCode();

        // Obtener precio del cliente
        const { ClientPricing } = require('../models');
        const pricing = await ClientPricing.findOne({
          where: { client_id: pickup.client_id, valid_to: null }, transaction
        });
        const clientPrice = pricing ? parseFloat(pricing.base_price) : 0.00;


        pkg = await Package.create({
          package_id: newPackageId,
          tracking_code: trackingCode,
          pickup_id: pickup_id,
          client_id: pickup.client_id,
          recipient_name: shipment.recipient_name,
          recipient_phone: shipment.recipient_phone,
          destination_address: shipment.destination_address,
          external_tracking_code: shipment.ml_shipment_external_id,
          status: 'RECOLECTADO_EN_ORIGEN',
          client_price: clientPrice,
          delivery_cost: 0.00,
          is_cod: false,
          scanned_at_origin_datetime: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction });

        // Notificamos al ML Gateway que este envío ya fue consumido
        transaction.afterCommit(async () => {
          try {
            await mlGatewayClient.markShipmentAsImported(shipment.ml_shipment_id, newPackageId);
          } catch (error) {
            console.error('No se pudo notificar la importación al gateway ML:', error.message);
          }
        });
        console.log(`✅ [ML-CONFIRM] Paquete ${ml_code} auto-importado exitosamente al vuelo.`);
      }

      return { pkg, alreadyConfirmed: false };
    });
    const { pkg, alreadyConfirmed } = confirmation;

    // ── Regenerar QR con la data EXACTA del paquete físico ──
    if (typeof raw_qr_data === 'string' && raw_qr_data && !alreadyConfirmed) {
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
      message: alreadyConfirmed ? 'El paquete ya estaba confirmado' : 'Confirmado correctamente',
      already_confirmed: alreadyConfirmed,
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
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Error al confirmar paquete ML', allow_photo: error.allowPhoto === true, details: error.message });
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
