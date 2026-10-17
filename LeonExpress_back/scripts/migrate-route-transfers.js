'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function allowRepeatedRouteHistory(connection, apply) {
  const [indexes] = await connection.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='route_packages' AND INDEX_NAME='uniq_route_package' AND NON_UNIQUE=0`);
  if (!indexes.length) return true;
  if (!apply) return false;
  const [supporting] = await connection.query(`SELECT INDEX_NAME FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='route_packages' AND INDEX_NAME='idx_route_packages_route_history'`);
  await connection.query('ALTER TABLE route_packages ' +
    (supporting.length ? '' : 'ADD INDEX idx_route_packages_route_history (route_id), ') +
    'DROP INDEX uniq_route_package');
  return true;
}

async function migrate(connection, apply = false) {
  const [columns] = await connection.query(`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND ((TABLE_NAME = 'route_packages' AND COLUMN_NAME IN ('released_at', 'active_assignment_marker'))
    OR (TABLE_NAME = 'deliveries' AND COLUMN_NAME = 'successful_delivery_marker')
    OR (TABLE_NAME = 'payout_items' AND COLUMN_NAME = 'base_delivery_payment_marker'))`);
  if (columns.length === 4) {
    if (!await allowRepeatedRouteHistory(connection, apply)) return 'Falta actualizar el índice histórico de rutas. Ejecutar con --apply.';
    return 'La migración ya está aplicada.';
  }
  if (columns.length) throw new Error('Se detectó una migración parcial. Completar o revertir sus ALTER TABLE antes de reintentar.');
  const checks = [
    ['entregas exitosas duplicadas', `SELECT package_id FROM deliveries WHERE status_at_delivery = 'ENTREGADO' GROUP BY package_id HAVING COUNT(*) > 1`],
    ['pagos base de entrega duplicados', `SELECT package_id FROM payout_items WHERE package_id IS NOT NULL AND item_description LIKE 'Entrega - %' GROUP BY package_id HAVING COUNT(*) > 1`],
    ['asignaciones con última fecha ambigua', `SELECT rp.package_id FROM route_packages rp JOIN
      (SELECT package_id, MAX(created_at) AS latest_at FROM route_packages GROUP BY package_id) latest
      ON latest.package_id = rp.package_id AND latest.latest_at = rp.created_at
      GROUP BY rp.package_id HAVING COUNT(*) > 1`]
  ];
  for (const [label, sql] of checks) {
    const [rows] = await connection.query(sql);
    if (rows.length) throw new Error(`Hay ${rows.length} paquete(s) con ${label}. Revisar antes de migrar; no se modificó ningún registro.`);
  }
  if (!apply) return 'Verificación correcta. Ejecutar con --apply con el backend detenido para aplicar la migración.';
  const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/20261016_route_package_transfers.sql'), 'utf8');
  for (const statement of sql.replace(/--[^\n]*/g, '').split(';').filter((item) => item.trim())) {
    await connection.query(statement);
  }
  await allowRepeatedRouteHistory(connection, true);
  return 'Migración aplicada. Se conservaron las asignaciones anteriores.';
}

if (require.main === module) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const mysql = require('mysql2/promise');
  (async () => {
    let connection;
    try {
      connection = await mysql.createConnection({ host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
      console.log(await migrate(connection, process.argv.includes('--apply')));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    } finally {
      if (connection) await connection.end();
    }
  })();
}

module.exports = { migrate };
