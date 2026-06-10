const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middlewares/authenticateToken');
const { OcrProcessingQueue, Package } = require('../models');

/**
 * GET /api/ocr-duplicate/pending/:pickup_id
 * Obtener duplicados pendientes de confirmación para un pickup específico
 */
router.get('/pending/:pickup_id', authenticateToken, async (req, res) => {
  try {
    const { pickup_id } = req.params;

    // Buscar registros que necesitan confirmación (duplicados sin resolver)
    const pendingDuplicates = await OcrProcessingQueue.findAll({
      where: {
        pickup_id: pickup_id,
        status: 'needs_review',
        is_duplicate: true,
        reviewed_by: null // No ha sido revisado aún
      },
      order: [['created_at', 'ASC']],
      limit: 10 // Máximo 10 a la vez para no sobrecargar
    });

    if (pendingDuplicates.length === 0) {
      return res.json({
        has_pending: false,
        duplicates: []
      });
    }

    // Para cada duplicado, buscar el paquete original
    const duplicatesWithOriginal = await Promise.all(
      pendingDuplicates.map(async (item) => {
        const extractedData = item.extracted_data;
        const originalPackage = await Package.findOne({
          where: { 
            external_tracking_code: extractedData.external_tracking_code 
          },
          order: [['created_at', 'DESC']]
        });

        return {
          queue_id: item.id,
          external_code: extractedData.external_tracking_code,
          filename: item.filename,
          created_at: item.created_at,
          new_scan_data: extractedData,
          original_package: originalPackage ? {
            tracking_code: originalPackage.tracking_code,
            external_tracking_code: originalPackage.external_tracking_code,
            created_at: originalPackage.created_at,
            status: originalPackage.status,
            recipient_name: originalPackage.recipient_name,
            destination_address: originalPackage.destination_address
          } : null
        };
      })
    );

    res.json({
      has_pending: true,
      count: duplicatesWithOriginal.length,
      duplicates: duplicatesWithOriginal
    });

  } catch (error) {
    console.error('Error al obtener duplicados pendientes:', error);
    res.status(500).json({
      error: 'Error interno',
      message: error.message
    });
  }
});

module.exports = router;
