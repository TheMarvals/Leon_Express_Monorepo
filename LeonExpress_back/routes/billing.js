const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const billingService = require('../services/billingAutomation');
const { sequelize } = require('../models');

/**
 * Rutas de administración de facturación y pagos
 * Todas las rutas requieren autenticación de administrador
 */

// Middleware: solo administradores
router.use(authenticateToken, roleValidator(['ADMIN']));

/**
 * GET /billing/status
 * Obtiene el estado del servicio de automatización
 */
router.get('/status', async (req, res) => {
  try {
    const isActive = billingService.isBillingAutomationActive();
    const currentPeriod = await billingService.getCurrentPeriodInfo();
    const lastClosure = await billingService.getLastClosureStats();

    // Calcular próxima ejecución del CRON (domingos a las 23:00)
    const now = new Date();
    const nextSunday = new Date(now);
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(23, 0, 0, 0);

    // Si ya pasó el domingo de esta semana, calcular el siguiente
    if (now.getDay() === 0 && now.getHours() >= 23) {
      nextSunday.setDate(now.getDate() + 7);
    }

    res.json({
      automation: {
        isActive,
        cronSchedule: 'Todos los domingos a las 23:00',
        timezone: 'America/Santiago',
        nextExecution: nextSunday.toISOString()
      },
      currentPeriod,
      lastClosure
    });
  } catch (error) {
    console.error('Error al obtener estado de billing:', error);
    res.status(500).json({
      error: 'Error al obtener estado de facturación',
      details: error.message
    });
  }
});

/**
 * POST /billing/initialize-period
 * Crea el período actual si no existe
 */
router.post('/initialize-period', async (req, res) => {
  try {
    console.log('📅 [API] Inicializando período actual');
    console.log('👤 Usuario:', req.user.username);

    const period = await billingService.getOrCreateCurrentPeriod();

    // Registrar en audit_log
    await sequelize.query(
      `INSERT INTO audit_log (log_id, user_id, action, target_table, details) 
       VALUES (UUID(), ?, 'PERIOD_INITIALIZED', 'billing_periods', ?)`,
      {
        replacements: [
          req.user.user_id,
          `Período inicializado por ${req.user.username} - ${period.start_date} a ${period.end_date}`
        ]
      }
    );

    res.json({
      success: true,
      message: period.created_at ? 'Período creado exitosamente' : 'Período ya existía',
      data: period,
      executedBy: req.user.username
    });
  } catch (error) {
    console.error('❌ Error al inicializar período:', error);
    res.status(500).json({
      error: 'Error al inicializar período',
      details: error.message
    });
  }
});

// Auxiliar para fechas locales
function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * GET /billing/diagnostics
 * Diagnóstico detallado del sistema de facturación
 */
router.get('/diagnostics', async (req, res) => {
  try {
    const currentDate = getLocalDateString(new Date());

    // Calcular período actual
    const currentYear = new Date().getFullYear();
    const currentWeek = getWeekNumber(new Date());
    const periodStart = getWeekStartDate(currentYear, currentWeek);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);

    const periodStartStr = getLocalDateString(periodStart);
    const periodEndStr = getLocalDateString(periodEnd);

    // Verificar si existe período activo
    const periodCheck = await sequelize.query(`
      SELECT period_id, status, start_date, end_date
      FROM billing_periods
      WHERE period_type = 'WEEKLY' 
        AND start_date = ? 
        AND end_date = ?
      LIMIT 1
    `, {
      replacements: [periodStartStr, periodEndStr],
      type: sequelize.QueryTypes.SELECT
    });

    const periodExists = periodCheck.length > 0;
    const periodStatus = periodExists ? periodCheck[0].status : null;

    // Contar paquetes entregados sin facturar en el período actual
    const packagesToInvoice = await sequelize.query(`
      SELECT COUNT(DISTINCT p.package_id) as count
      FROM packages p
      WHERE p.status = 'ENTREGADO'
        AND DATE(p.delivered_datetime) BETWEEN ? AND ?
        AND NOT EXISTS (
          SELECT 1 FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.invoice_id
          WHERE ii.package_id = p.package_id
        )
    `, {
      replacements: [periodStartStr, periodEndStr],
      type: sequelize.QueryTypes.SELECT
    });

    // Contar recolecciones verificadas sin pagar en el período actual
    const pickupsToPay = await sequelize.query(`
      SELECT COUNT(DISTINCT p.pickup_id) as count
      FROM pickups p
      WHERE p.status = 'VERIFICADO_EN_ALMACEN'
        AND p.verified_at_warehouse_at IS NOT NULL
        AND DATE(p.verified_at_warehouse_at) BETWEEN ? AND ?
        AND NOT EXISTS (
          SELECT 1 FROM payout_items pi
          JOIN driver_payouts dp ON pi.payout_id = dp.payout_id
          WHERE pi.pickup_id = p.pickup_id
        )
    `, {
      replacements: [periodStartStr, periodEndStr],
      type: sequelize.QueryTypes.SELECT
    });

    // Contar entregas sin pagar a conductores
    const deliveriesToPay = await sequelize.query(`
      SELECT COUNT(DISTINCT p.package_id) as count
      FROM packages p
      JOIN deliveries d ON p.package_id = d.package_id
      WHERE d.status_at_delivery = 'ENTREGADO'
        AND DATE(d.attempted_at) BETWEEN ? AND ?
        AND NOT EXISTS (
          SELECT 1 FROM payout_items pi
          JOIN driver_payouts dp ON pi.payout_id = dp.payout_id
          WHERE pi.package_id = p.package_id
        )
    `, {
      replacements: [periodStartStr, periodEndStr],
      type: sequelize.QueryTypes.SELECT
    });

    // Verificar última ejecución del CRON
    const lastExecution = await sequelize.query(`
      SELECT created_at, details
      FROM audit_log
      WHERE action = 'AUTO_WEEKLY_PERIOD_CLOSE'
      ORDER BY created_at DESC
      LIMIT 1
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    // Calcular próxima ejecución
    const now = new Date();
    const nextSunday = new Date(now);
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(23, 0, 0, 0);

    if (now.getDay() === 0 && now.getHours() >= 23) {
      nextSunday.setDate(now.getDate() + 7);
    }

    const diagnostics = {
      currentPeriod: {
        startDate: periodStartStr,
        endDate: periodEndStr,
        weekNumber: currentWeek,
        year: currentYear,
        exists: periodExists,
        status: periodStatus
      },
      pendingItems: {
        packagesToInvoice: parseInt(packagesToInvoice[0]?.count || 0),
        pickupsToPay: parseInt(pickupsToPay[0]?.count || 0),
        deliveriesToPay: parseInt(deliveriesToPay[0]?.count || 0)
      },
      automation: {
        isActive: billingService.isBillingAutomationActive(),
        lastExecution: lastExecution.length > 0 ? lastExecution[0] : null,
        nextExecution: nextSunday.toISOString(),
        cronSchedule: 'Todos los domingos a las 23:00 (America/Santiago)'
      },
      recommendations: []
    };

    // Generar recomendaciones
    if (!periodExists) {
      diagnostics.recommendations.push({
        type: 'warning',
        message: 'No existe un período activo para la semana actual. Se creará automáticamente al cerrar el período.'
      });
    }

    if (periodStatus === 'CLOSED') {
      diagnostics.recommendations.push({
        type: 'info',
        message: 'El período actual ya está cerrado. Las facturas y pagos ya fueron generados.'
      });
    }

    if (diagnostics.pendingItems.packagesToInvoice === 0 && diagnostics.pendingItems.deliveriesToPay === 0) {
      diagnostics.recommendations.push({
        type: 'info',
        message: 'No hay paquetes entregados ni entregas pendientes de facturar en el período actual.'
      });
    } else {
      diagnostics.recommendations.push({
        type: 'action',
        message: `Hay ${diagnostics.pendingItems.packagesToInvoice} paquetes y ${diagnostics.pendingItems.deliveriesToPay} entregas pendientes de facturar. Puedes cerrar el período manualmente.`
      });
    }

    if (!diagnostics.automation.isActive) {
      diagnostics.recommendations.push({
        type: 'error',
        message: 'La automatización no está activa. El CRON job no está ejecutándose.'
      });
    }

    res.json({
      success: true,
      data: diagnostics
    });
  } catch (error) {
    console.error('Error en diagnóstico de billing:', error);
    res.status(500).json({
      error: 'Error al obtener diagnóstico',
      details: error.message
    });
  }
});

// Funciones auxiliares para calcular semana (ISO 8601, modo 1 como MySQL WEEK)
function getWeekNumber(date) {
  const d = new Date(date);
  // Normalizar a mediodía para evitar problemas de zona horaria si la fecha viene de un string
  d.setHours(12, 0, 0, 0);

  const jan4 = new Date(d.getFullYear(), 0, 4);
  jan4.setHours(0, 0, 0, 0);
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1;
  const jan4Day = Math.floor((jan4 - new Date(jan4.getFullYear(), 0, 1)) / 86400000) + 1;
  const jan4Weekday = jan4.getDay() || 7;
  const week1Start = jan4Day - jan4Weekday + 1;

  let weekNumber;
  if (dayOfYear < week1Start) {
    const lastYear = d.getFullYear() - 1;
    const lastDayOfYear = Math.floor((new Date(lastYear, 11, 31) - new Date(lastYear, 0, 1)) / 86400000) + 1;
    const lastJan4 = new Date(lastYear, 0, 4);
    const lastJan4Day = Math.floor((lastJan4 - new Date(lastYear, 0, 1)) / 86400000) + 1;
    const lastJan4Weekday = lastJan4.getDay() || 7;
    const lastWeek1Start = lastJan4Day - lastJan4Weekday + 1;
    weekNumber = Math.ceil((dayOfYear + lastDayOfYear - lastWeek1Start + 1) / 7);
  } else {
    weekNumber = Math.ceil((dayOfYear - week1Start + 1) / 7);
  }

  return weekNumber;
}

function getWeekStartDate(year, week) {
  const jan4 = new Date(year, 0, 4);
  jan4.setHours(0, 0, 0, 0);
  const jan4Day = Math.floor((jan4 - new Date(year, 0, 1)) / 86400000) + 1;
  const jan4Weekday = jan4.getDay() || 7;
  const week1Start = jan4Day - jan4Weekday + 1;
  const dayOfYear = week1Start + (week - 1) * 7;
  const date = new Date(year, 0, 1);
  date.setDate(dayOfYear);
  const weekday = date.getDay() || 7;
  date.setDate(date.getDate() - weekday + 1);
  return date;
}

/**
 * POST /billing/close-period
 * Cierra el período semanal actual manualmente
 */
router.post('/close-period', async (req, res) => {
  try {
    console.log('📋 [API] Solicitud manual de cierre de período');
    console.log('👤 Usuario:', req.user.username);

    const result = await billingService.closeCurrentWeeklyPeriod();

    // Registrar en audit_log quien ejecutó el cierre manual
    await sequelize.query(
      `INSERT INTO audit_log (log_id, user_id, action, target_table, details) 
       VALUES (UUID(), ?, 'MANUAL_WEEKLY_PERIOD_CLOSE', 'billing_periods', ?)`,
      {
        replacements: [
          req.user.user_id,
          `Cierre manual de período semanal ejecutado por ${req.user.username}`
        ]
      }
    );

    res.json({
      success: true,
      message: 'Período semanal cerrado exitosamente',
      data: result,
      executedBy: req.user.username
    });
  } catch (error) {
    console.error('❌ Error al cerrar período manualmente:', error);
    res.status(500).json({
      error: 'Error al cerrar período',
      details: error.message
    });
  }
});

/**
 * POST /billing/generate-invoices
 * Genera facturas para un período específico
 */
router.post('/generate-invoices', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Se requieren startDate y endDate'
      });
    }

    console.log('📄 [API] Generación manual de facturas');
    console.log('👤 Usuario:', req.user.username);
    console.log('📅 Período:', startDate, 'a', endDate);

    const result = await billingService.generateWeeklyInvoices(startDate, endDate);

    // Registrar en audit_log
    await sequelize.query(
      `INSERT INTO audit_log (log_id, user_id, action, target_table, details) 
       VALUES (UUID(), ?, 'MANUAL_INVOICE_GENERATION', 'invoices', ?)`,
      {
        replacements: [
          req.user.user_id,
          `Facturas generadas manualmente por ${req.user.username} - Período: ${startDate} a ${endDate}`
        ]
      }
    );

    res.json({
      success: true,
      message: 'Facturas generadas exitosamente',
      data: result,
      executedBy: req.user.username
    });
  } catch (error) {
    console.error('❌ Error al generar facturas:', error);
    res.status(500).json({
      error: 'Error al generar facturas',
      details: error.message
    });
  }
});

/**
 * POST /billing/generate-payouts
 * Genera pagos a conductores para un período específico
 */
router.post('/generate-payouts', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Se requieren startDate y endDate'
      });
    }

    console.log('💰 [API] Generación manual de pagos');
    console.log('👤 Usuario:', req.user.username);
    console.log('📅 Período:', startDate, 'a', endDate);

    const result = await billingService.generateDriverPayouts(startDate, endDate);

    // Registrar en audit_log
    await sequelize.query(
      `INSERT INTO audit_log (log_id, user_id, action, target_table, details) 
       VALUES (UUID(), ?, 'MANUAL_PAYOUT_GENERATION', 'driver_payouts', ?)`,
      {
        replacements: [
          req.user.user_id,
          `Pagos a conductores generados manualmente por ${req.user.username} - Período: ${startDate} a ${endDate}`
        ]
      }
    );

    res.json({
      success: true,
      message: 'Pagos a conductores generados exitosamente',
      data: result,
      executedBy: req.user.username
    });
  } catch (error) {
    console.error('❌ Error al generar pagos:', error);
    res.status(500).json({
      error: 'Error al generar pagos',
      details: error.message
    });
  }
});

/**
 * GET /billing/periods
 * Obtiene lista de períodos de facturación
 */
router.get('/periods', async (req, res) => {
  try {
    const { limit = 10, status } = req.query;

    let query = `
      SELECT 
        bp.period_id,
        bp.period_type,
        bp.start_date,
        bp.end_date,
        bp.year_number,
        bp.period_number,
        bp.status,
        bp.created_at,
        (SELECT COUNT(*) FROM invoices WHERE period_id = bp.period_id) as total_invoices,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE period_id = bp.period_id) as total_invoiced,
        (SELECT COUNT(*) FROM driver_payouts WHERE period_id = bp.period_id) as total_payouts,
        (SELECT COALESCE(SUM(total_amount), 0) FROM driver_payouts WHERE period_id = bp.period_id) as total_paid_to_drivers
      FROM billing_periods bp
      WHERE bp.period_type = 'WEEKLY'
    `;

    const params = [];

    if (status) {
      query += ' AND bp.status = ?';
      params.push(status);
    }

    query += `
      ORDER BY bp.end_date DESC
      LIMIT ?
    `;
    params.push(parseInt(limit));

    const periods = await sequelize.query(query, {
      replacements: params,
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: periods,
      count: periods.length
    });
  } catch (error) {
    console.error('Error al obtener períodos:', error);
    res.status(500).json({
      error: 'Error al obtener períodos',
      details: error.message
    });
  }
});

/**
 * GET /billing/period/:periodId
 * Obtiene detalles de un período específico
 */
router.get('/period/:periodId', async (req, res) => {
  try {
    const { periodId } = req.params;

    // Información del período
    const periods = await sequelize.query(`
      SELECT * FROM billing_periods WHERE period_id = ?
    `, {
      replacements: [periodId],
      type: sequelize.QueryTypes.SELECT
    });

    if (periods.length === 0) {
      return res.status(404).json({ error: 'Período no encontrado' });
    }

    const period = periods[0];

    // Facturas del período
    const invoices = await sequelize.query(`
      SELECT 
        i.*,
        c.client_name
      FROM invoices i
      JOIN clients c ON i.client_id = c.client_id
      WHERE i.period_id = ?
      ORDER BY i.invoice_date DESC
    `, {
      replacements: [periodId],
      type: sequelize.QueryTypes.SELECT
    });

    // Pagos del período
    const payouts = await sequelize.query(`
      SELECT 
        dp.*,
        u.full_name as driver_name
      FROM driver_payouts dp
      JOIN users u ON dp.user_id = u.user_id
      WHERE dp.period_id = ?
      ORDER BY dp.payout_date DESC
    `, {
      replacements: [periodId],
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        period,
        invoices,
        payouts
      }
    });
  } catch (error) {
    console.error('Error al obtener detalles del período:', error);
    res.status(500).json({
      error: 'Error al obtener detalles',
      details: error.message
    });
  }
});

/**
 * GET /billing/audit-log
 * Obtiene el historial de operaciones de billing
 */
router.get('/audit-log', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const logs = await sequelize.query(`
      SELECT 
        al.*,
        u.username
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.user_id
      WHERE al.action LIKE '%PERIOD_CLOSE%'
         OR al.action LIKE '%INVOICE_GENERATION%'
         OR al.action LIKE '%PAYOUT_GENERATION%'
      ORDER BY al.created_at DESC
      LIMIT ?
    `, {
      replacements: [parseInt(limit)],
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: logs,
      count: logs.length
    });
  } catch (error) {
    console.error('Error al obtener audit log:', error);
    res.status(500).json({
      error: 'Error al obtener historial',
      details: error.message
    });
  }
});

module.exports = router;

