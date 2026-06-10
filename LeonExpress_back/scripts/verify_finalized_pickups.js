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

    // PASO 1: Ver recolecciones afectadas
    console.log('=== PASO 1: Recolecciones en RECOLECCION_FINALIZADA_DRIVER ===\n');
    const [rows] = await connection.execute(`
        SELECT 
            p.pickup_id,
            p.status,
            p.pickup_scheduled_date,
            c.client_name,
            u.full_name AS driver_name,
            (SELECT COUNT(*) FROM packages pkg WHERE pkg.pickup_id = p.pickup_id) AS total_packages
        FROM pickups p
        LEFT JOIN clients c ON c.client_id = p.client_id
        LEFT JOIN users u ON u.user_id = p.user_id
        WHERE p.status = 'RECOLECCION_FINALIZADA_DRIVER'
        ORDER BY p.pickup_scheduled_date DESC
    `);

    if (rows.length === 0) {
        console.log('⚠️  No hay recolecciones en estado RECOLECCION_FINALIZADA_DRIVER.');
        await connection.end();
        return;
    }

    console.table(rows);
    console.log(`\n📦 Total de recolecciones a actualizar: ${rows.length}\n`);

    // PASO 2: Actualizar SOLO las recolecciones (NO los paquetes)
    console.log('=== PASO 2: Actualizando recolecciones a VERIFICADO_EN_ALMACEN ===\n');
    const [result] = await connection.execute(`
        UPDATE pickups 
        SET 
            status = 'VERIFICADO_EN_ALMACEN',
            verified_at_warehouse_at = NOW(),
            updated_at = NOW()
        WHERE status = 'RECOLECCION_FINALIZADA_DRIVER'
    `);

    console.log(`✅ Recolecciones actualizadas: ${result.affectedRows}`);
    console.log(`ℹ️  Los paquetes NO fueron modificados.\n`);

    // PASO 3: Verificación
    const [check] = await connection.execute(`
        SELECT COUNT(*) AS remaining FROM pickups WHERE status = 'RECOLECCION_FINALIZADA_DRIVER'
    `);
    console.log(`🔍 Recolecciones restantes en RECOLECCION_FINALIZADA_DRIVER: ${check[0].remaining}`);

    await connection.end();
    console.log('\n✅ Script finalizado correctamente.');
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
