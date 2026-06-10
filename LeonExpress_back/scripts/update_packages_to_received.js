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

    console.log('✅ Conectado a la base de datos\n');

    // PASO 1: Ver paquetes afectados
    console.log('=== PASO 1: Paquetes en RECOLECTADO_EN_ORIGEN de recolecciones VERIFICADAS ===\n');
    const [rows] = await connection.execute(`
        SELECT 
            pkg.package_id,
            pkg.tracking_code,
            pkg.status AS package_status,
            p.pickup_id,
            p.status AS pickup_status,
            c.client_name
        FROM packages pkg
        INNER JOIN pickups p ON p.pickup_id = pkg.pickup_id
        LEFT JOIN clients c ON c.client_id = pkg.client_id
        WHERE p.status = 'VERIFICADO_EN_ALMACEN'
          AND pkg.status = 'RECOLECTADO_EN_ORIGEN'
        ORDER BY p.pickup_scheduled_date DESC
    `);

    if (rows.length === 0) {
        console.log('⚠️  No hay paquetes en RECOLECTADO_EN_ORIGEN dentro de recolecciones verificadas.');
        await connection.end();
        return;
    }

    console.table(rows);
    console.log(`\n📦 Total de paquetes a actualizar: ${rows.length}\n`);

    // PASO 2: Actualizar paquetes
    console.log('=== PASO 2: Actualizando paquetes a RECIBIDO_EN_ALMACEN ===\n');
    const [result] = await connection.execute(`
        UPDATE packages pkg
        INNER JOIN pickups p ON p.pickup_id = pkg.pickup_id
        SET 
            pkg.status = 'RECIBIDO_EN_ALMACEN',
            pkg.received_at_warehouse_datetime = NOW(),
            pkg.updated_at = NOW()
        WHERE p.status = 'VERIFICADO_EN_ALMACEN'
          AND pkg.status = 'RECOLECTADO_EN_ORIGEN'
    `);

    console.log(`✅ Paquetes actualizados: ${result.affectedRows}\n`);

    // PASO 3: Verificación
    const [check] = await connection.execute(`
        SELECT COUNT(*) AS remaining 
        FROM packages pkg
        INNER JOIN pickups p ON p.pickup_id = pkg.pickup_id
        WHERE p.status = 'VERIFICADO_EN_ALMACEN'
          AND pkg.status = 'RECOLECTADO_EN_ORIGEN'
    `);
    console.log(`🔍 Paquetes restantes en RECOLECTADO_EN_ORIGEN (en pickups verificados): ${check[0].remaining}`);

    await connection.end();
    console.log('\n✅ Script finalizado correctamente.');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
