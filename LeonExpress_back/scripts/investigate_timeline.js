'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function main() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: 'marval',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    const pickupId = '25116aa7-a099-41ee-a3f2-f9298b13c5a5';
    console.log(`\n--- Audit Logs for Pickup ${pickupId} ---`);
    const [auditLogs] = await connection.execute(`
        SELECT 
            created_at,
            user_id,
            action,
            details
        FROM audit_log
        WHERE details LIKE ?
        ORDER BY created_at ASC
    `, [`%${pickupId}%`]);

    for (const log of auditLogs) {
        console.log(`[${log.created_at.toISOString()}] User ${log.user_id} - ${log.action}`);
        console.log(JSON.stringify(JSON.parse(log.details), null, 2));
        console.log('---------------------');
    }

    if (auditLogs.length === 0) {
        console.log('No audit logs found for this pickup.');
    }

    await connection.end();
}

main().catch(console.error);
