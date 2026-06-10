'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: '192.168.1.250',
        port: process.env.DB_PORT || 3306,
        user: 'marval',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const externalCode = '46529487661';

    console.log(`\n=== Buscando paquetes con código externo ${externalCode} ===\n`);

    const [packages] = await connection.execute(`
        SELECT package_id, tracking_code, external_tracking_code, status, created_at, updated_at
        FROM packages
        WHERE external_tracking_code = ?
    `, [externalCode]);

    console.log("Paquetes encontrados:");
    console.table(packages);

    for (const pkg of packages) {
        console.log(`\n--- OCR Records para el paquete ${pkg.tracking_code} (${pkg.package_id}) ---`);
        const [ocrRecords] = await connection.execute(`
            SELECT id, batch_id, status, error_message, created_at
            FROM ocr_processing_queue
            WHERE package_id = ?
        `, [pkg.package_id]);

        console.table(ocrRecords);
    }

    await connection.end();
}

main().catch(console.error);
