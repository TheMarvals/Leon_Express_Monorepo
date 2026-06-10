const cron = require('node-cron');
const { sequelize } = require('../models');
const { v4: uuidv4 } = require('uuid');

/**
 * Servicio de automatización de facturación y pagos
 * 
 * Este servicio ejecuta automáticamente los procedimientos almacenados
 * para cerrar períodos semanales, generar facturas y pagos a conductores.
 */

// Auxiliar para formatear fechas en YYYY-MM-DD usando hora local (evita saltos de día por UTC)
function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Función para cerrar el período semanal actual
async function closeCurrentWeeklyPeriod() {
  const currentDate = new Date();

  // Lógica robusta para determinar qué semana cerrar:
  // Queremos cerrar la semana que termina en el domingo más cercano (hoy o pasado).
  const dayOfWeek = currentDate.getDay(); // 0 = Domingo, 1 = Lunes, ...

  if (dayOfWeek > 0) {
    // Si es Lunes a Sábado, retrocedemos al Domingo anterior para cerrar la semana que acaba de pasar.
    console.log(`ℹ️ Detectado día ${dayOfWeek}. Retrocediendo al Domingo pasado para cerrar la semana anterior.`);
    currentDate.setDate(currentDate.getDate() - dayOfWeek);
  } else {
    // Si es Domingo, verificamos la hora. Si es muy temprano, quizás queremos cerrar la semana anterior?
    // Pero el cron corre a las 23:00, así que el comportamiento por defecto de "hoy" es correcto.
    console.log('ℹ️ Detectado Domingo. Procediendo a cerrar la semana que termina hoy.');
  }

  const formattedDate = getLocalDateString(currentDate);

  console.log('🔄 [BILLING AUTOMATION] Iniciando cierre de período semanal (Modo JS)...');
  console.log('📅 Fecha de referencia (Domingo de cierre):', formattedDate);

  try {
    // 1. Calcular fechas del período
    const currentYear = currentDate.getFullYear();
    const currentWeek = getWeekNumber(currentDate);

    // Calcular inicio y fin de la semana (lunes a domingo)
    const periodStart = getWeekStartDate(currentYear, currentWeek);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);

    const startDate = getLocalDateString(periodStart);
    const endDate = getLocalDateString(periodEnd);

    console.log(`📅 Período identificado: ${startDate} a ${endDate}`);

    // 2. Generar Facturas
    await generateWeeklyInvoices(startDate, endDate);

    // 3. Generar Pagos a Conductores
    await generateDriverPayouts(startDate, endDate);

    // 4. Cerrar el período en la base de datos
    console.log('🔒 Cerrando período en BD...');
    await sequelize.query(`
      UPDATE billing_periods 
      SET status = 'CLOSED'
      WHERE period_type = 'WEEKLY' 
        AND start_date = :startDate 
        AND end_date = :endDate
    `, {
      replacements: { startDate, endDate }
    });

    console.log('✅ [BILLING AUTOMATION] Período semanal cerrado exitosamente');

    // 5. Crear INMEDIATAMENTE el nuevo período (Lunes siguiente)
    // Esto asegura que al día siguiente (Lunes) el dashboard ya muestre la semana 8 activa.
    const newPeriodStart = new Date(periodEnd); // Domingo actual
    newPeriodStart.setDate(newPeriodStart.getDate() + 1); // Lunes siguiente

    const newPeriodEnd = new Date(newPeriodStart);
    newPeriodEnd.setDate(newPeriodStart.getDate() + 6); // Domingo siguiente

    const newStartDateStr = getLocalDateString(newPeriodStart);
    const newEndDateStr = getLocalDateString(newPeriodEnd);

    await getOrCreatePeriod(newStartDateStr, newEndDateStr);
    console.log(`✨ [BILLING AUTOMATION] Nuevo período creado automáticamente: ${newStartDateStr} al ${newEndDateStr}`);

    // Audit Log
    await sequelize.query(
      `INSERT INTO audit_log (log_id, user_id, action, target_table, details) 
       VALUES (UUID(), NULL, 'AUTO_WEEKLY_PERIOD_CLOSE', 'billing_periods', ?)`,
      {
        replacements: [`Cierre automático de período semanal - ${startDate} a ${endDate}. Nuevo iniciado: ${newStartDateStr}`]
      }
    );

    return { success: true, date: formattedDate };

  } catch (error) {
    console.error('❌ [BILLING AUTOMATION] Error al cerrar período semanal:', error.message);

    try {
      await sequelize.query(
        `INSERT INTO audit_log (log_id, user_id, action, target_table, details) 
         VALUES (UUID(), NULL, 'AUTO_WEEKLY_PERIOD_CLOSE_ERROR', 'billing_periods', ?)`,
        {
          replacements: [`Error en cierre automático: ${error.message}`]
        }
      );
    } catch (auditError) {
      console.error('Error al registrar auditoría de error:', auditError.message);
    }
    throw error;
  }
}

// Función interna para obtener o crear un período por fechas (Asegura consistencia)
async function getOrCreatePeriod(startDate, endDate, transaction = null) {
  // Buscar por fechas exactas para evitar duplicados por errores de cálculo de semana
  let [period] = await sequelize.query(
    `SELECT period_id, year_number, period_number FROM billing_periods 
     WHERE period_type = 'WEEKLY' AND start_date = :startDate AND end_date = :endDate LIMIT 1`,
    { replacements: { startDate, endDate }, type: sequelize.QueryTypes.SELECT, transaction }
  );

  if (period) {
    return period;
  }

  // Si no existe, crearlo. Usamos la fecha de inicio para calcular el número de semana.
  // Normalizamos a mediodía para evitar saltos de día por zona horaria.
  const dateObj = new Date(startDate);
  dateObj.setHours(12, 0, 0, 0);

  const yearNumber = dateObj.getFullYear();
  const weekNumber = getWeekNumber(dateObj);
  const periodId = uuidv4();

  await sequelize.query(
    `INSERT INTO billing_periods (period_id, period_type, start_date, end_date, year_number, period_number, status)
     VALUES (:periodId, 'WEEKLY', :startDate, :endDate, :yearNumber, :weekNumber, 'ACTIVE')`,
    { replacements: { periodId, startDate, endDate, yearNumber, weekNumber }, transaction }
  );

  return { period_id: periodId, year_number: yearNumber, period_number: weekNumber };
}

// Función para generar facturas semanales manualmente (Implementada en JS para mayor confiabilidad)
async function generateWeeklyInvoices(startDate, endDate) {
  console.log('📄 [BILLING] Generando facturas semanales (Modo JS)...');
  console.log(`📅 Período: ${startDate} a ${endDate}`);

  const transaction = await sequelize.transaction();

  try {
    // 1. Obtener o crear período (Centralizado)
    const period = await getOrCreatePeriod(startDate, endDate, transaction);
    const periodId = period.period_id;

    // 2. Obtener clientes con paquetes entregados no facturados
    const clients = await sequelize.query(`
      SELECT DISTINCT p.client_id 
      FROM packages p
      WHERE p.status = 'ENTREGADO' 
        AND DATE(p.delivered_datetime) BETWEEN :startDate AND :endDate
        AND NOT EXISTS (
          SELECT 1 FROM invoice_items ii
          JOIN invoices i ON ii.invoice_id = i.invoice_id
          JOIN billing_periods bp ON i.period_id = bp.period_id
          WHERE ii.package_id = p.package_id AND bp.start_date = :startDate
        )
    `, { replacements: { startDate, endDate }, type: sequelize.QueryTypes.SELECT, transaction });

    console.log(`👥 Clientes a facturar: ${clients.length}`);

    let invoicesCreated = 0;

    for (const client of clients) {
      const clientId = client.client_id;
      const invoiceId = uuidv4();

      // Obtener plazo de pago desde configuración
      const [config] = await sequelize.query(
        "SELECT config_value FROM system_config WHERE config_key = 'default_invoice_due_days' LIMIT 1",
        { type: sequelize.QueryTypes.SELECT, transaction }
      );
      const dueDays = parseInt(config?.config_value || '14');
      const dueDate = new Date(endDate);
      dueDate.setDate(dueDate.getDate() + dueDays);
      const dueDateStr = getLocalDateString(dueDate);

      // 3. Crear cabecera de factura
      await sequelize.query(`
        INSERT INTO invoices (invoice_id, client_id, period_id, invoice_date, due_date, status)
        VALUES (:invoiceId, :clientId, :periodId, :endDate, :dueDate, 'PENDIENTE')
      `, { replacements: { invoiceId, clientId, periodId, endDate, dueDate: dueDateStr }, transaction });

      // 4. Insertar ítems de paquetes
      await sequelize.query(`
        INSERT INTO invoice_items (invoice_item_id, invoice_id, package_id, item_description, amount)
        SELECT UUID(), :invoiceId, p.package_id, 
               CONCAT('Envío - ', LEFT(p.tracking_code, 30), '... a ', SUBSTRING(p.destination_address, 1, 150)), p.client_price
        FROM packages p 
        WHERE p.client_id = :clientId AND p.status = 'ENTREGADO'
          AND DATE(p.delivered_datetime) BETWEEN :startDate AND :endDate
      `, { replacements: { invoiceId, clientId, startDate, endDate }, transaction });

      // 5. Insertar ítems de cargos adicionales
      await sequelize.query(`
        INSERT INTO invoice_items (invoice_item_id, invoice_id, package_id, item_description, amount)
        SELECT UUID(), :invoiceId, pc.package_id, c.cost_name, pc.applied_value
        FROM package_costs pc 
        JOIN costs c ON pc.cost_id = c.cost_id
        WHERE pc.package_id IN (
            SELECT package_id FROM packages
            WHERE client_id = :clientId AND status = 'ENTREGADO'
            AND DATE(delivered_datetime) BETWEEN :startDate AND :endDate)
        AND pc.cost_type = 'CLIENT_CHARGE'
      `, { replacements: { invoiceId, clientId, startDate, endDate }, transaction });

      // 5.5. Insertar abonos por COD recaudado (Abonos al cliente que bajan su deuda)
      await sequelize.query(`
        INSERT INTO invoice_items (invoice_item_id, invoice_id, package_id, item_description, amount)
        SELECT UUID(), :invoiceId, p.package_id, 
               CONCAT('Crédito COD - ', p.tracking_code), -d.collected_amount
        FROM packages p 
        JOIN deliveries d ON p.package_id = d.package_id
        WHERE p.client_id = :clientId AND p.status = 'ENTREGADO'
          AND d.collected_amount > 0
          AND DATE(p.delivered_datetime) BETWEEN :startDate AND :endDate
          AND NOT EXISTS (
            SELECT 1 FROM invoice_items ii2 
            WHERE ii2.package_id = p.package_id 
              AND ii2.invoice_id = :invoiceId
              AND ii2.item_description LIKE 'Crédito COD%'
          )
      `, { replacements: { invoiceId, clientId, startDate, endDate }, transaction });

      // 6. Actualizar total de la factura
      await sequelize.query(`
        UPDATE invoices i
        SET total_amount = (SELECT COALESCE(SUM(amount), 0) FROM invoice_items WHERE invoice_id = :invoiceId)
        WHERE invoice_id = :invoiceId
      `, { replacements: { invoiceId }, transaction });

      invoicesCreated++;
    }

    await transaction.commit();
    console.log(`✅ [BILLING] Facturas generadas exitosamente: ${invoicesCreated}`);
    return { success: true, startDate, endDate, invoicesCreated };

  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('❌ [BILLING] Error al generar facturas (JS):', error.message);
    throw error;
  }
}

// Función para generar pagos a conductores manualmente (Lógica movida a JS para evitar errores de SP)
async function generateDriverPayouts(startDate, endDate) {
  console.log('💰 [BILLING] Generando pagos a conductores (Modo JS)...');
  console.log(`📅 Período: ${startDate} a ${endDate}`);

  const transaction = await sequelize.transaction();

  try {
    // 1. Obtener Periodo (Consistente con Invoices)
    const period = await getOrCreatePeriod(startDate, endDate, transaction);
    const periodId = period.period_id;

    // 2. Obtener lista de conductores
    const drivers = await sequelize.query(
      `SELECT DISTINCT u.user_id 
       FROM users u 
       JOIN roles r ON u.role_id = r.role_id 
       WHERE r.role_name = 'DRIVER'`,
      { type: sequelize.QueryTypes.SELECT, transaction }
    );

    console.log(`👥 Procesando ${drivers.length} conductores...`);

    let totalItems = 0;

    for (const driver of drivers) {
      const userId = driver.user_id;

      // 3. Obtener o crear Payout Header (Lógica movida a JS para evitar llamar al SP)
      let [payout] = await sequelize.query(
        `SELECT payout_id FROM driver_payouts WHERE user_id = :userId AND period_id = :periodId LIMIT 1`,
        { replacements: { userId, periodId }, type: sequelize.QueryTypes.SELECT, transaction }
      );

      let payoutId;
      if (!payout) {
        payoutId = uuidv4();
        await sequelize.query(
          `INSERT INTO driver_payouts (payout_id, user_id, period_id, payout_date, status)
           VALUES (:payoutId, :userId, :periodId, :endDate, 'PENDIENTE')`,
          { replacements: { payoutId, userId, periodId, endDate }, transaction }
        );
      } else {
        payoutId = payout.payout_id;
      }

      // 3. Procesar Entregas
      const deliveries = await sequelize.query(`
        SELECT p.package_id, p.tracking_code, p.delivery_cost
        FROM packages p JOIN deliveries d ON p.package_id = d.package_id
        WHERE d.user_id = :userId AND d.status_at_delivery = 'ENTREGADO'
          AND DATE(d.attempted_at) BETWEEN :startDate AND :endDate
          AND NOT EXISTS (SELECT 1 FROM payout_items pi WHERE pi.package_id = p.package_id AND pi.payout_id = :payoutId)
      `, {
        replacements: { userId, startDate, endDate, payoutId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });

      for (const item of deliveries) {
        await sequelize.query(`
          INSERT IGNORE INTO payout_items (payout_item_id, payout_id, package_id, item_description, amount)
          VALUES (:uuid, :payoutId, :pkgId, :desc, :amt)
        `, {
          replacements: {
            uuid: uuidv4(),
            payoutId,
            pkgId: item.package_id,
            desc: `Entrega - ${item.tracking_code}`,
            amt: item.delivery_cost
          },
          transaction
        });
        totalItems++;
      }

      // 4. Procesar Recolecciones
      const pickups = await sequelize.query(`
        SELECT pi.pickup_id, c.client_name, pi.pickup_cost
        FROM pickups pi JOIN clients c ON pi.client_id = c.client_id
        WHERE pi.user_id = :userId AND pi.status = 'VERIFICADO_EN_ALMACEN'
          AND DATE(pi.verified_at_warehouse_at) BETWEEN :startDate AND :endDate
          AND NOT EXISTS (SELECT 1 FROM payout_items p_it WHERE p_it.pickup_id = pi.pickup_id AND p_it.payout_id = :payoutId)
      `, {
        replacements: { userId, startDate, endDate, payoutId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });

      for (const item of pickups) {
        await sequelize.query(`
          INSERT IGNORE INTO payout_items (payout_item_id, payout_id, pickup_id, item_description, amount)
          VALUES (:uuid, :payoutId, :pickupId, :desc, :amt)
        `, {
          replacements: {
            uuid: uuidv4(),
            payoutId,
            pickupId: item.pickup_id,
            desc: `Recolección - Cliente ${item.client_name}`,
            amt: item.pickup_cost
          },
          transaction
        });
        totalItems++;
      }

      // 5. Procesar Deducciones por COD (Dinero recaudado por el conductor)
      const codCollections = await sequelize.query(`
        SELECT d.package_id, p.tracking_code, d.collected_amount
        FROM deliveries d JOIN packages p ON d.package_id = p.package_id
        WHERE d.user_id = :userId 
          AND d.status_at_delivery = 'ENTREGADO'
          AND d.collected_amount > 0
          AND DATE(d.attempted_at) BETWEEN :startDate AND :endDate
          AND NOT EXISTS (
            SELECT 1 FROM payout_items pi 
            WHERE pi.package_id = d.package_id 
              AND pi.payout_id = :payoutId 
              AND pi.item_description LIKE '%Retención COD%'
          )
      `, {
        replacements: { userId, startDate, endDate, payoutId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });

      for (const item of codCollections) {
        const codAmt = parseFloat(item.collected_amount);
        const amount = -Math.abs(codAmt);

        await sequelize.query(`
          INSERT INTO payout_items (payout_item_id, payout_id, package_id, item_description, amount)
          VALUES (:uuid, :payoutId, :packageId, :desc, :amount)
          ON DUPLICATE KEY UPDATE
            amount = amount + VALUES(amount),
            item_description = CASE 
                WHEN item_description NOT LIKE '%Retención COD%' THEN CONCAT(item_description, ' (+ Retención COD $', :codAmtStr, ')')
                ELSE item_description
              END
        `, {
          replacements: {
            uuid: uuidv4(),
            payoutId,
            packageId: item.package_id,
            desc: `Retención COD - ${item.tracking_code}`,
            amount: amount,
            codAmtStr: codAmt.toFixed(0)
          },
          transaction
        });
        totalItems++;
      }

      // 6. Procesar Créditos/Costos
      const costs = await sequelize.query(`
        SELECT pc.package_id, c.cost_name, pc.applied_value
        FROM package_costs pc JOIN costs c ON pc.cost_id = c.cost_id
        JOIN packages p ON pc.package_id = p.package_id JOIN deliveries d ON p.package_id = d.package_id
        WHERE d.user_id = :userId AND pc.cost_type = 'DRIVER_CREDIT'
          AND DATE(d.attempted_at) BETWEEN :startDate AND :endDate
          AND NOT EXISTS (SELECT 1 FROM payout_items pi WHERE pi.package_id = pc.package_id AND pi.payout_id = :payoutId AND pi.amount = pc.applied_value)
      `, {
        replacements: { userId, startDate, endDate, payoutId },
        type: sequelize.QueryTypes.SELECT,
        transaction
      });

      for (const item of costs) {
        await sequelize.query(`
          INSERT IGNORE INTO payout_items (payout_item_id, payout_id, package_id, item_description, amount)
          VALUES (:uuid, :payoutId, :pkgId, :desc, :amt)
        `, {
          replacements: {
            uuid: uuidv4(),
            payoutId,
            pkgId: item.package_id,
            desc: item.cost_name,
            amt: item.applied_value
          },
          transaction
        });
        totalItems++;
      }

      // 6. Limpieza: Si el pago quedó en 0 (sin items), eliminarlo para no ensuciar el reporte
      // Esto maneja tanto pagos nuevos vacíos como pagos existentes que siguen en 0
      const [payoutStatus] = await sequelize.query(
        'SELECT total_amount FROM driver_payouts WHERE payout_id = :payoutId',
        { replacements: { payoutId }, type: sequelize.QueryTypes.SELECT, transaction }
      );

      if (payoutStatus && parseFloat(payoutStatus.total_amount) === 0) {
        console.log(`🗑️ Eliminando pago vacío para driver ${userId}`);
        await sequelize.query(
          'DELETE FROM driver_payouts WHERE payout_id = :payoutId',
          { replacements: { payoutId }, transaction }
        );
      }
    }

    await transaction.commit();
    console.log(`✅ [BILLING] Pagos generados exitosamente. Items creados: ${totalItems}`);

    return { success: true, startDate, endDate, itemsCreated: totalItems };
  } catch (error) {
    await transaction.rollback();
    console.error('❌ [BILLING] Error al generar pagos (JS):', error.message);
    throw error;
  }
}

// Función para crear o obtener el período actual
async function getOrCreateCurrentPeriod() {
  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentWeek = getWeekNumber(currentDate);

    // Calcular inicio y fin de semana (lunes a domingo)
    const periodStart = getWeekStartDate(currentYear, currentWeek);
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);

    const periodStartStr = getLocalDateString(periodStart);
    const periodEndStr = getLocalDateString(periodEnd);

    // Buscar período existente
    const rows = await sequelize.query(`
      SELECT 
        period_id,
        period_type,
        start_date,
        end_date,
        year_number,
        period_number,
        status,
        created_at
      FROM billing_periods
      WHERE period_type = 'WEEKLY'
        AND start_date = ?
        AND end_date = ?
      LIMIT 1
    `, {
      replacements: [periodStartStr, periodEndStr],
      type: sequelize.QueryTypes.SELECT
    });

    if (rows.length > 0) {
      return rows[0];
    }

    // Si no existe, crearlo
    console.log('📅 [BILLING] Creando período actual que no existe...');
    const periodId = uuidv4();

    await sequelize.query(`
      INSERT INTO billing_periods 
        (period_id, period_type, start_date, end_date, year_number, period_number, status)
      VALUES (?, 'WEEKLY', ?, ?, ?, ?, 'ACTIVE')
    `, {
      replacements: [periodId, periodStartStr, periodEndStr, currentYear, currentWeek]
    });

    console.log('✅ [BILLING] Período actual creado:', periodStartStr, 'a', periodEndStr);

    return {
      period_id: periodId,
      period_type: 'WEEKLY',
      start_date: periodStartStr,
      end_date: periodEndStr,
      year_number: currentYear,
      period_number: currentWeek,
      status: 'ACTIVE',
      created_at: new Date()
    };
  } catch (error) {
    console.error('❌ Error al obtener/crear período:', error);
    throw error;
  }
}

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

// Función para obtener información del período actual
async function getCurrentPeriodInfo() {
  try {
    const rows = await sequelize.query(`
      SELECT 
        period_id,
        period_type,
        start_date,
        end_date,
        year_number,
        period_number,
        status,
        created_at
      FROM billing_periods
      WHERE period_type = 'WEEKLY'
        AND CURDATE() BETWEEN start_date AND end_date
      LIMIT 1
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('❌ Error al obtener información del período:', error);
    throw error;
  }
}

// Función para obtener estadísticas del último cierre
async function getLastClosureStats() {
  try {
    const periods = await sequelize.query(`
      SELECT 
        bp.period_id,
        bp.start_date,
        bp.end_date,
        bp.status,
        (SELECT COUNT(*) FROM invoices WHERE period_id = bp.period_id) as total_invoices,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE period_id = bp.period_id) as total_invoiced,
        (SELECT COUNT(*) FROM driver_payouts WHERE period_id = bp.period_id) as total_payouts,
        (SELECT COALESCE(SUM(total_amount), 0) FROM driver_payouts WHERE period_id = bp.period_id) as total_paid_to_drivers
      FROM billing_periods bp
      WHERE bp.period_type = 'WEEKLY'
        AND bp.status = 'CLOSED'
      ORDER BY bp.end_date DESC
      LIMIT 1
    `, {
      type: sequelize.QueryTypes.SELECT
    });

    return periods.length > 0 ? periods[0] : null;
  } catch (error) {
    console.error('❌ Error al obtener estadísticas:', error);
    throw error;
  }
}

// Configurar CRON job para ejecución automática
// Se ejecuta todos los domingos a las 23:00 (11 PM)
function setupAutomaticBilling() {
  console.log('⏰ [BILLING AUTOMATION] Configurando CRON job automático...');
  console.log('📅 Frecuencia: Todos los domingos a las 23:00');

  // Cron pattern: '0 23 * * 0' = A las 23:00 los domingos
  // Minuto Hora Día_mes Mes Día_semana
  const task = cron.schedule('0 23 * * 0', async () => {
    console.log('\n🚀 ========================================');
    console.log('🚀 [BILLING AUTOMATION] Ejecutando cierre semanal automático');
    console.log('🚀 ========================================\n');

    try {
      const result = await closeCurrentWeeklyPeriod();
      console.log('\n✅ ========================================');
      console.log('✅ [BILLING AUTOMATION] Cierre completado con éxito');
      console.log('✅ ========================================\n');
    } catch (error) {
      console.error('\n❌ ========================================');
      console.error('❌ [BILLING AUTOMATION] Error en cierre automático');
      console.error('❌ ========================================\n');
      console.error(error);
    }
  }, {
    scheduled: true,
    timezone: "America/Santiago" // Timezone de Chile
  });

  console.log('✅ [BILLING AUTOMATION] CRON job configurado exitosamente');
  // Note: node-cron doesn't provide nextDates() API

  return task;
}

// Variable para almacenar el job
let billingCronJob = null;

// Función para iniciar el servicio de automatización
function startBillingAutomation() {
  if (!billingCronJob) {
    billingCronJob = setupAutomaticBilling();
    console.log('🟢 [BILLING AUTOMATION] Servicio iniciado');
  } else {
    console.log('⚠️ [BILLING AUTOMATION] El servicio ya está en ejecución');
  }
}

// Función para detener el servicio de automatización
function stopBillingAutomation() {
  if (billingCronJob) {
    billingCronJob.stop();
    billingCronJob = null;
    console.log('🔴 [BILLING AUTOMATION] Servicio detenido');
  } else {
    console.log('⚠️ [BILLING AUTOMATION] El servicio no está en ejecución');
  }
}

// Función para verificar si el servicio está activo
function isBillingAutomationActive() {
  return billingCronJob !== null;
}

module.exports = {
  // Funciones automáticas
  startBillingAutomation,
  stopBillingAutomation,
  isBillingAutomationActive,

  // Funciones manuales (para API)
  closeCurrentWeeklyPeriod,
  generateWeeklyInvoices,
  generateDriverPayouts,

  // Funciones de consulta
  getCurrentPeriodInfo,
  getOrCreateCurrentPeriod,
  getLastClosureStats
};

