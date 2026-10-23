'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authenticateToken');
const hasRole = require('../middlewares/roleValidator');
const mlGatewayClient = require('../services/mlGatewayClient');
const mlImportService = require('../services/mlImportService');
const mlAccountAccess = require('../services/mlAccountAccessService');

/**
 * RUTAS DE ADMIN: Solo usuarios ADMIN pueden gestionar la integración
 */

// GET /api/mercadolibre/accounts
// Retorna las cuentas de ML vinculadas
router.get('/accounts', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const accounts = await mlAccountAccess.getAccounts();
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar las cuentas vinculadas', details: error.message });
  }
});

router.get('/accounts/available', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const accounts = await mlAccountAccess.getAvailableAccounts();
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar cuentas disponibles', details: error.message });
  }
});

router.post('/accounts/:id/link', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    if (!req.body.client_id) return res.status(400).json({ error: 'Debe seleccionar un cliente' });
    const account = await mlAccountAccess.linkAccount(req.params.id, req.body.client_id);
    res.json({ message: 'Cuenta vinculada únicamente a Leon Express.', account });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/mercadolibre/shipments/pending
// Retorna los envíos que están pendientes de importar a LE
router.get('/shipments/pending', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const data = await mlAccountAccess.getPendingShipments(req.query);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar envíos pendientes', details: error.message });
  }
});

// GET /api/mercadolibre/shipments/pending/count
// Retorna la cantidad de envíos pendientes (útil para badges en UI)
router.get('/shipments/pending/count', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    const count = await mlAccountAccess.getPendingCount(req.query.ml_account_id);
    res.json(count);
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
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Error durante la importación', details: error.message });
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
    const data = await mlAccountAccess.syncAccessibleAccounts();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo forzar la sincronización', details: error.message });
  }
});

// DELETE /api/mercadolibre/accounts/:id
// Quita la cuenta solo de Leon Express; no revoca el OAuth global del gateway.
router.delete('/accounts/:id', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    await mlAccountAccess.assertAccessible(req.params.id);
    await mlAccountAccess.excludeAccount(req.params.id);
    res.json({ message: 'Cuenta quitada de Leon Express. El gateway y otras aplicaciones no fueron modificados.' });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo desvincular la cuenta', details: error.message });
  }
});

// POST /api/mercadolibre/accounts/:id/sync
// Fuerza la sincronización de una cuenta específica
router.post('/accounts/:id/sync', authMiddleware, hasRole(['ADMIN']), async (req, res) => {
  try {
    await mlAccountAccess.assertAccessible(req.params.id);
    const data = await mlAccountAccess.refreshAccount(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'No se pudo forzar la sincronización de la cuenta', details: error.message });
  }
});

// Durable gateway notifications carry resource IDs only; always reread ML.
router.post('/webhook/event', async (req, res) => {
  const events = require('../services/mlEvents');
  if (!events.authorized(req.headers['x-webhook-token'])) return res.status(403).json({ error: 'Forbidden' });
  try { res.json(await events.processEvent(req.body)); }
  catch (error) { res.status(error.status === 400 ? 400 : 503).json({ error: 'No se pudo verificar el evento en Mercado Libre' }); }
});

// Compatibility during cutover: never trust a cancellation supplied by the old cache.
router.post('/webhook/cancel', async (req, res) => {
  const events = require('../services/mlEvents');
  if (!events.authorized(req.headers['x-webhook-token'])) return res.status(403).json({ error: 'Forbidden' });
  const id = String(req.body.ml_code || '');
  if (!/^\d{1,20}$/.test(id)) return res.status(400).json({ error: 'Código inválido' });
  try {
    const { Package } = require('../models');
    const pkg = await Package.findOne({ where: { external_tracking_code: id } });
    if (!pkg) return res.json({ ignored: true });
    const accounts = (await mlAccountAccess.getAccounts()).filter(a => String(a.client_id) === String(pkg.client_id));
    for (const account of accounts) {
      try {
        const ship = await require('../services/mlLiveShipments').detail(account, id);
        await events.applyShipment(account, ship);
        return res.json({ processed: true });
      } catch (error) { if (![403, 404].includes(error.response?.status || error.status)) throw error; }
    }
    res.json({ ignored: true });
  } catch { res.status(503).json({ error: 'No se pudo verificar la cancelación' }); }
});

// ==========================================
// RUTAS DE CLIENTES: Portal de Autogestión
// ==========================================

// GET /api/mercadolibre/my-account
// Lista todas las cuentas del cliente; conserva account para consumidores anteriores.
router.get('/my-account', authMiddleware, hasRole(['CLIENT']), async (req, res) => {
  try {
    const clientId = req.user.client_id;
    if (!clientId) {
      return res.status(400).json({ error: 'Usuario no tiene cliente asociado' });
    }
    try {
      const accounts = await mlAccountAccess.getAccounts();
      const ownedAccounts = accounts.filter(a => String(a.client_id) === String(clientId));
      return res.json({ accounts: ownedAccounts, account: ownedAccounts[0] || null });
    } catch (gatewayError) {
      console.warn('ML Gateway no disponible en /my-account:', gatewayError.message);
      return res.json({ accounts: [], account: null, gateway_status: 'UNAVAILABLE' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar cuenta de Mercado Libre', details: error.message });
  }
});

// POST /api/mercadolibre/my-account/link
// Genera el link de vinculación directa para el cliente logueado
router.post('/my-account/link', authMiddleware, hasRole(['CLIENT']), async (req, res) => {
  try {
    const clientId = req.user.client_id;
    if (!clientId) {
      return res.status(400).json({ error: 'Usuario no tiene cliente asociado' });
    }
    const clientInfo = `${req.user.username || req.user.user_id} (ID: ${req.user.user_id}, cliente: ${clientId})`;
    const data = await mlGatewayClient.generateLink(clientId, clientInfo);
    res.json({
      ...data,
      authUrl: data.url || data.authUrl,
    });
  } catch (error) {
    res.status(500).json({ error: 'No se pudo generar el enlace de vinculación', details: error.message });
  }
});

// POST /api/mercadolibre/my-account/sync
// Sincroniza una cuenta del cliente o todas si no se especifica ml_account_id.
router.post('/my-account/sync', authMiddleware, hasRole(['CLIENT']), async (req, res) => {
  try {
    const clientId = req.user.client_id;
    if (!clientId) {
      return res.status(400).json({ error: 'Usuario no tiene cliente asociado' });
    }
    const accounts = await mlAccountAccess.getAccounts();
    const ownedAccounts = accounts.filter(a => String(a.client_id) === String(clientId));
    const accountId = req.body?.ml_account_id;
    const selected = accountId
      ? ownedAccounts.filter(a => String(a.ml_account_id) === String(accountId))
      : ownedAccounts;
    if (selected.length === 0) {
      return res.status(404).json({ error: 'No se encontró una cuenta de Mercado Libre vinculada.' });
    }
    const results = await Promise.allSettled(selected.map(account => mlAccountAccess.refreshAccount(account.ml_account_id)));
    const failed = selected.filter((account, index) => results[index].status === 'rejected').map(account => account.ml_account_id);
    if (failed.length) {
      return res.status(502).json({ error: 'No se pudieron sincronizar todas las cuentas. Intenta nuevamente.', failed_account_ids: failed });
    }
    res.json({ message: `Sincronización iniciada para ${selected.length} cuenta(s) de Mercado Libre.` });
  } catch (error) {
    res.status(500).json({ error: 'Error al forzar la sincronización', details: error.message });
  }
});

// DELETE /api/mercadolibre/my-account
// Desvincula únicamente la cuenta seleccionada del cliente en Leon Express.
router.delete('/my-account', authMiddleware, hasRole(['CLIENT']), async (req, res) => {
  try {
    const clientId = req.user.client_id;
    if (!clientId) {
      return res.status(400).json({ error: 'Usuario no tiene cliente asociado' });
    }
    const accounts = await mlAccountAccess.getAccounts();
    const ownedAccounts = accounts.filter(a => String(a.client_id) === String(clientId));
    const accountId = req.query.ml_account_id;
    if (!accountId && ownedAccounts.length > 1) {
      return res.status(400).json({ error: 'Debes seleccionar la cuenta que deseas desvincular.' });
    }
    const account = accountId
      ? ownedAccounts.find(a => String(a.ml_account_id) === String(accountId))
      : ownedAccounts[0];
    if (!account) {
      return res.status(404).json({ error: 'No se encontró una cuenta de Mercado Libre vinculada.' });
    }
    await mlAccountAccess.excludeAccount(account.ml_account_id);
    res.json({ message: 'Cuenta de Mercado Libre desvinculada exitosamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al desvincular cuenta', details: error.message });
  }
});

module.exports = router;
