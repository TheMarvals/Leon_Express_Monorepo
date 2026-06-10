#!/usr/bin/env node
// dump_db.js — Exporta toda la DB a un archivo .sql usando mysql2

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const config = {
    host: '192.168.1.250',
    port: 3306,
    user: 'marval',
    password: 'ThomasMarval2105..',
    database: 'leon_express',
    multipleStatements: true,
};

const OUTPUT_FILE = path.join('/tmp', `leon_express_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sql`);

async function dump() {
    console.log(`🔌 Conectando a ${config.host}:${config.port}/${config.database}...`);
    const conn = await mysql.createConnection(config);

    let sql = '';
    sql += `-- Leon Express DB Backup\n`;
    sql += `-- Generado: ${new Date().toISOString()}\n`;
    sql += `-- Host: ${config.host}\n\n`;
    sql += `SET FOREIGN_KEY_CHECKS=0;\n`;
    sql += `SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n`;
    sql += `SET NAMES utf8mb4;\n\n`;

    // Obtener lista de tablas
    const [tables] = await conn.query(`SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'`);
    const tableNames = tables.map(r => Object.values(r)[0]);
    console.log(`📋 Tablas encontradas: ${tableNames.length}`);

    for (const table of tableNames) {
        console.log(`  → Exportando: ${table}`);

        // DROP + CREATE TABLE
        const [[createRow]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
        const createStmt = createRow['Create Table'];
        sql += `-- ─────────────────────────────────\n`;
        sql += `-- Tabla: ${table}\n`;
        sql += `-- ─────────────────────────────────\n`;
        sql += `DROP TABLE IF EXISTS \`${table}\`;\n`;
        sql += createStmt + ';\n\n';

        // Datos
        const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
        if (rows.length > 0) {
            const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
            const chunkSize = 500;
            for (let i = 0; i < rows.length; i += chunkSize) {
                const chunk = rows.slice(i, i + chunkSize);
                const values = chunk.map(row =>
                    '(' + Object.values(row).map(v => {
                        if (v === null) return 'NULL';
                        if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
                        if (typeof v === 'number') return v;
                        if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
                        return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
                    }).join(', ') + ')'
                ).join(',\n  ');
                sql += `INSERT INTO \`${table}\` (${cols}) VALUES\n  ${values};\n\n`;
            }
        }
    }

    // Exportar VIEWs
    const [views] = await conn.query(`SHOW FULL TABLES WHERE Table_type = 'VIEW'`);
    const viewNames = views.map(r => Object.values(r)[0]);
    if (viewNames.length > 0) {
        sql += `\n-- ═════════════════════════════════\n-- VIEWS\n-- ═════════════════════════════════\n\n`;
        for (const view of viewNames) {
            console.log(`  → Exportando VIEW: ${view}`);
            const [[viewRow]] = await conn.query(`SHOW CREATE VIEW \`${view}\``);
            sql += `DROP VIEW IF EXISTS \`${view}\`;\n`;
            sql += viewRow['Create View'] + ';\n\n';
        }
    }

    sql += `SET FOREIGN_KEY_CHECKS=1;\n`;

    await conn.end();

    fs.writeFileSync(OUTPUT_FILE, sql, 'utf8');
    const sizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
    console.log(`\n✅ Backup completado!`);
    console.log(`📁 Archivo: ${OUTPUT_FILE}`);
    console.log(`📦 Tamaño: ${sizeKB} KB`);
    console.log(`📊 Tablas: ${tableNames.length} | Vistas: ${viewNames.length}`);
}

dump().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
