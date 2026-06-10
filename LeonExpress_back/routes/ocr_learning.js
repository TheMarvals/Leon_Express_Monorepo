const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authenticateToken');
const learningEngine = require('../utils/ocrLearningEngine');
const { LearnedPattern, OcrCorrection } = require('../models');

/**
 * Middleware: Solo ADMIN puede gestionar el aprendizaje
 */
const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Solo ADMIN puede gestionar el aprendizaje OCR' });
  }
  next();
};

/**
 * GET /api/ocr-learning/stats
 * Estadísticas completas del sistema de aprendizaje
 */
router.get('/stats', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const stats = await learningEngine.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error al obtener estadísticas de aprendizaje:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas', message: error.message });
  }
});

/**
 * POST /api/ocr-learning/train
 * Ejecuta un ciclo de entrenamiento manual
 * Analiza todas las correcciones acumuladas y genera/actualiza patrones
 */
router.post('/train', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    console.log(`\n🧠 Entrenamiento solicitado por ${req.user.username}`);
    const result = await learningEngine.train();
    res.json({
      success: true,
      message: 'Ciclo de entrenamiento completado',
      ...result,
    });
  } catch (error) {
    console.error('Error en ciclo de entrenamiento:', error);
    res.status(500).json({ error: 'Error en entrenamiento', message: error.message });
  }
});

/**
 * GET /api/ocr-learning/patterns
 * Lista todos los patrones aprendidos
 */
router.get('/patterns', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { active_only = 'true' } = req.query;
    
    const where = {};
    if (active_only === 'true') where.is_active = true;

    const patterns = await LearnedPattern.findAll({
      where,
      order: [['success_rate', 'DESC'], ['usage_count', 'DESC']],
    });

    res.json({
      patterns,
      total: patterns.length,
    });
  } catch (error) {
    console.error('Error al obtener patrones:', error);
    res.status(500).json({ error: 'Error al obtener patrones', message: error.message });
  }
});

/**
 * POST /api/ocr-learning/patterns/:id/toggle
 * Activar o desactivar un patrón aprendido
 */
router.post('/patterns/:id/toggle', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const pattern = await LearnedPattern.findByPk(req.params.id);
    if (!pattern) {
      return res.status(404).json({ error: 'Patrón no encontrado' });
    }

    await pattern.update({ is_active: !pattern.is_active });

    res.json({
      success: true,
      pattern_name: pattern.pattern_name,
      is_active: pattern.is_active,
      message: pattern.is_active ? 'Patrón activado' : 'Patrón desactivado',
    });
  } catch (error) {
    console.error('Error al toggle patrón:', error);
    res.status(500).json({ error: 'Error al toggle patrón', message: error.message });
  }
});

/**
 * DELETE /api/ocr-learning/patterns/:id
 * Eliminar un patrón aprendido
 */
router.delete('/patterns/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const pattern = await LearnedPattern.findByPk(req.params.id);
    if (!pattern) {
      return res.status(404).json({ error: 'Patrón no encontrado' });
    }

    await pattern.destroy();
    res.json({ success: true, message: `Patrón ${pattern.pattern_name} eliminado` });
  } catch (error) {
    console.error('Error al eliminar patrón:', error);
    res.status(500).json({ error: 'Error al eliminar patrón', message: error.message });
  }
});

/**
 * GET /api/ocr-learning/corrections
 * Ver historial de correcciones (para análisis)
 */
router.get('/corrections', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { limit = 50, field_name, parser_used } = req.query;
    
    const where = {};
    if (field_name) where.field_name = field_name;
    if (parser_used) where.parser_used = parser_used;

    const corrections = await OcrCorrection.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit, 10),
      attributes: ['id', 'field_name', 'original_value', 'corrected_value', 
                   'correction_type', 'confidence_before', 'parser_used', 'created_at'],
    });

    res.json({
      corrections,
      total: corrections.length,
    });
  } catch (error) {
    console.error('Error al obtener correcciones:', error);
    res.status(500).json({ error: 'Error al obtener correcciones', message: error.message });
  }
});

/**
 * GET /api/ocr-learning/improvement-report
 * Reporte de mejora: cómo ha ido mejorando la tasa de auto-aprobación
 */
router.get('/improvement-report', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { OcrProcessingQueue } = require('../models');
    const { sequelize } = require('../models');

    // Tendencia de auto-aprobación por semana
    const weeklyTrend = await sequelize.query(`
      SELECT 
        YEARWEEK(processed_at, 1) as yearweek,
        MIN(DATE(processed_at)) as week_start,
        COUNT(*) as total_processed,
        SUM(CASE WHEN auto_approved = 1 THEN 1 ELSE 0 END) as auto_approved,
        SUM(CASE WHEN status = 'needs_review' OR status = 'completed' THEN 1 ELSE 0 END) as manual_review,
        ROUND(AVG(overall_confidence), 1) as avg_confidence,
        ROUND(SUM(CASE WHEN auto_approved = 1 THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) as approval_rate_pct
      FROM ocr_processing_queue
      WHERE processed_at IS NOT NULL
      GROUP BY YEARWEEK(processed_at, 1)
      ORDER BY yearweek DESC
      LIMIT 12
    `, { type: sequelize.QueryTypes.SELECT });

    // Correcciones por semana (menos correcciones = mejor)
    const correctionTrend = await sequelize.query(`
      SELECT 
        YEARWEEK(created_at, 1) as yearweek,
        MIN(DATE(created_at)) as week_start,
        COUNT(*) as total_corrections,
        COUNT(DISTINCT queue_id) as packages_corrected,
        COUNT(DISTINCT corrected_by) as unique_reviewers
      FROM ocr_corrections
      GROUP BY YEARWEEK(created_at, 1)
      ORDER BY yearweek DESC
      LIMIT 12
    `, { type: sequelize.QueryTypes.SELECT });

    // Top errores por campo (qué falla más)
    const topErrors = await sequelize.query(`
      SELECT 
        field_name,
        parser_used,
        correction_type,
        COUNT(*) as error_count
      FROM ocr_corrections
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY field_name, parser_used, correction_type
      ORDER BY error_count DESC
      LIMIT 15
    `, { type: sequelize.QueryTypes.SELECT });

    res.json({
      weekly_approval_trend: weeklyTrend,
      weekly_correction_trend: correctionTrend,
      top_errors_last_30_days: topErrors,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error al generar reporte de mejora:', error);
    res.status(500).json({ error: 'Error al generar reporte', message: error.message });
  }
});

module.exports = router;
