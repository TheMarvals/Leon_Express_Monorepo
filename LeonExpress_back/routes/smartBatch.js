const express = require('express');
const router = express.Router();
const ocrQueue = require('../utils/ocrProcessingQueue');
const { v4: uuidv4 } = require('uuid');

/**
 * @swagger
 * /api/smart-batch/upload:
 *   post:
 *     summary: Sube un batch de fotos de etiquetas para procesamiento automático
 *     tags: [Smart OCR]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pickup_id
 *               - images
 *             properties:
 *               pickup_id:
 *                 type: string
 *                 format: uuid
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   description: Imagen en base64
 *               client_price:
 *                 type: number
 *                 description: Precio del cliente para los paquetes
 *               delivery_cost:
 *                 type: number
 *                 description: Costo de entrega para los paquetes
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Batch agregado exitosamente a la cola
 *       400:
 *         description: Datos inválidos
 */
router.post('/upload', async (req, res) => {
  try {
    const { pickup_id, images, metadata, client_price, delivery_cost, idempotency_key } = req.body;
    
    if (!pickup_id) {
      return res.status(400).json({ error: 'pickup_id es requerido' });
    }
    
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos una imagen' });
    }
    
    const batch_id = uuidv4();
    
    console.log(`📸 SMART BATCH: Nueva solicitud - ${images.length} imágenes para pickup ${pickup_id}`);
    console.log(`💰 Precios recibidos: client_price=${client_price}, delivery_cost=${delivery_cost}`);
    
    const result = await ocrQueue.addBatch({
      batch_id,
      pickup_id,
      images,
      metadata: metadata || {},
      client_price: client_price || 0,
      delivery_cost: delivery_cost || 0,
      idempotency_key
    });
    
    res.json({
      success: true,
      ...result,
      message: 'Batch agregado a la cola de procesamiento'
    });
    
  } catch (error) {
    console.error('[Smart Batch Upload Error]', error.message);
    res.status(500).json({ error: 'Error al procesar el batch', details: error.message });
  }
});

/**
 * @swagger
 * /api/smart-batch/{batchId}/status:
 *   get:
 *     summary: Consulta el estado de procesamiento de un batch
 *     tags: [Smart OCR]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado del batch
 *       404:
 *         description: Batch no encontrado
 */
router.get('/:batchId/status', async (req, res) => {
  try {
    const { batchId } = req.params;
    
    const status = await ocrQueue.getBatchStatus(batchId);
    
    if (!status) {
      return res.status(404).json({ error: 'Batch no encontrado' });
    }
    
    res.json(status);
    
  } catch (error) {
    console.error('[Smart Batch Status Error]', error.message);
    res.status(500).json({ error: 'Error al consultar estado', details: error.message });
  }
});

/**
 * @swagger
 * /api/smart-batch/stats:
 *   get:
 *     summary: Obtiene estadísticas en tiempo real del procesamiento
 *     tags: [Smart OCR]
 *     responses:
 *       200:
 *         description: Estadísticas del sistema
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = ocrQueue.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[Smart Batch Stats Error]', error.message);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

/**
 * @swagger
 * /api/smart-batch/{pickup_id}/packages:
 *   get:
 *     summary: Lista todos los paquetes procesados para un pickup
 *     tags: [Smart OCR]
 *     parameters:
 *       - in: path
 *         name: pickup_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de paquetes
 */
router.get('/:pickup_id/packages', async (req, res) => {
  try {
    const { pickup_id } = req.params;
    
    // TODO: Implementar consulta a BD para obtener paquetes
    // Por ahora retornamos mock
    res.json({
      pickup_id,
      packages: [],
      summary: {
        total: 0,
        auto_approved: 0,
        needs_review: 0,
        errors: 0
      }
    });
    
  } catch (error) {
    console.error('[Get Packages Error]', error.message);
    res.status(500).json({ error: 'Error al obtener paquetes' });
  }
});

module.exports = router;
