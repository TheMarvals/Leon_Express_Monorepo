'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authenticateToken');
const hasRole = require('../middlewares/roleValidator');
const mlGatewayClient = require('../services/mlGatewayClient');
const mlImportService = require('../services/mlImportService');

/**
 * RUTAS DE ADMIN: Solo usuarios ADMIN pueden gestionar la integración
 */

// GET /api/mercadolibre/accounts
// Retorna las cuentas de ML vinculadas
router.get('/accounts', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const data = await mlGatewayClient.getAccounts();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar las cuentas vinculadas', details: error.message });
  }
});

// GET /api/mercadolibre/shipments/pending
// Retorna los envíos que están pendientes de importar a LE
router.get('/shipments/pending', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const data = await mlGatewayClient.getPendingShipments(req.query);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar envíos pendientes', details: error.message });
  }
});

// GET /api/mercadolibre/shipments/pending/count
// Retorna la cantidad de envíos pendientes (útil para badges en UI)
router.get('/shipments/pending/count', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const count = await mlGatewayClient.getPendingShipmentsCount(req.query.ml_account_id);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: 'Error al contar envíos pendientes', details: error.message });
  }
});

// POST /api/mercadolibre/shipments/import
// Importa envíos y crea los Packages bajo un Pickup existente
router.post('/shipments/import', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const { shipment_ids, target_pickup_id } = req.body;
    
    if (!shipment_ids || !Array.isArray(shipment_ids) || shipment_ids.length === 0) {
      return res.status(400).json({ error: 'Debe proveer array de shipment_ids' });
    }
    if (!target_pickup_id) {
      return res.status(400).json({ error: 'Debe especificar target_pickup_id' });
    }

    const adminUserId = req.user.user_id;

    const result = await mlImportService.importShipments(shipment_ids, target_pickup_id, adminUserId);
    res.json({ message: 'Envíos importados con éxito al Pickup', result });

  } catch (error) {
    res.status(500).json({ error: 'Error durante la importación', details: error.message });
  }
});

// POST /api/mercadolibre/generate-link/:clientId
// Genera un link dinámico para enviárselo a un cliente
router.post('/generate-link/:clientId', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const adminInfo = `${req.user.username} (ID: ${req.user.user_id})`;
    const data = await mlGatewayClient.generateLink(req.params.clientId, adminInfo);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo crear el link de vinculación', details: error.message });
  }
});

// POST /api/mercadolibre/sync
// Forza la sincronización de todas las cuentas con MercadoLibre
router.post('/sync', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const data = await mlGatewayClient.syncAll();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo forzar la sincronización', details: error.message });
  }
});

// DELETE /api/mercadolibre/accounts/:id
// Desvincula (soft-delete) una cuenta de ML del gateway
router.delete('/accounts/:id', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const data = await mlGatewayClient.deleteAccount(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo desvincular la cuenta', details: error.message });
  }
});

// POST /api/mercadolibre/accounts/:id/sync
// Fuerza la sincronización de una cuenta específica
router.post('/accounts/:id/sync', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const data = await mlGatewayClient.forceSyncNow(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo forzar la sincronización de la cuenta', details: error.message });
  }
});

// POST /api/mercadolibre/webhook/cancel
// Recibe notificación del ML Gateway sobre cancelaciones post-recolección
router.post('/webhook/cancel', async (req, res) => {
  try {
    const token = req.headers['x-webhook-token'];
    if (token !== (process.env.INTERNAL_WEBHOOK_TOKEN || 'leonexpress-internal-webhook')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { ml_code, ml_shipment_id } = req.body;
    if (!ml_code) return res.status(400).json({ error: 'Falta ml_code' });

    const { Package, Cancellation, RoutePackage, Route } = require('../models');
    const { v4: uuidv4 } = require('uuid');
    const { queueNotification } = require('../utils/notificationService');

    const pkg = await Package.findOne({
      where: { external_tracking_code: String(ml_code) },
      include: [
        {
          model: RoutePackage,
          as: 'route_packages',
          include: [{ model: Route, as: 'route' }]
        }
      ]
    });

    if (!pkg) {
      return res.status(404).json({ error: 'Paquete no encontrado localmente' });
    }

    const finalStatuses = ['ENTREGADO', 'DEVUELTO_A_CLIENTE', 'DEVUELTO_ALMACEN', 'CANCELADO'];
    if (finalStatuses.includes(pkg.status)) {
      return res.json({ message: `El paquete ya tiene estado final: ${pkg.status}` });
    }

    const oldStatus = pkg.status;
    pkg.status = 'CANCELADO';
    await pkg.save();

    await Cancellation.create({
      cancellation_id: uuidv4(),
      package_id: pkg.package_id,
      reason: 'SOLICITUD_CLIENTE',
      notes: 'Cancelado por el comprador en MercadoLibre (vía Webhook)',
      refund_amount: 0.00
    });

    // Enviar notificación al chofer si está asignado a una ruta
    if (pkg.route_packages && pkg.route_packages.length > 0) {
      // Tomamos la última ruta asignada
      const lastRoutePkg = pkg.route_packages[pkg.route_packages.length - 1];
      if (lastRoutePkg.route && lastRoutePkg.route.user_id) {
        queueNotification({
          userId: lastRoutePkg.route.user_id,
          title: '🚨 Paquete Cancelado por ML',
          message: `El comprador canceló la compra del paquete ML: ${ml_code}. NO LO ENTREGUES.`,
          shouldSendPush: true
        });
      }
    }

    console.log(`🚨 [ML-WEBHOOK] Paquete ${ml_code} marcado como CANCELADO. Estado anterior: ${oldStatus}`);
    res.json({ message: 'Paquete cancelado exitosamente' });
  } catch (error) {
    console.error('Error en webhook de cancelación:', error);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
});

module.exports = router;
