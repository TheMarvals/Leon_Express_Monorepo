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

    const specificPickupId = '25116aa7-a099-41ee-a3f2-f9298b13c5a5';

    console.log(`\n=== Forzando actualización del Pickup ${specificPickupId} a VERIFICADO_EN_ALMACEN ===\n`);

    const [result] = await connection.execute(`
        UPDATE pickups 
        SET status = 'VERIFICADO_EN_ALMACEN' 
        WHERE pickup_id = ?
    `, [specificPickupId]);

    console.log(`Filas afectadas: ${result.affectedRows}`);
    if (result.affectedRows > 0) {
        console.log(`✅ ¡Pickup ${specificPickupId} actualizado exitosamente! Los paquetes NO fueron modificados.`);
    } else {
        console.log('⚠️ No se encontró el pickup especificado.');
    }

    await connection.end();
}

main().catch(console.error);
