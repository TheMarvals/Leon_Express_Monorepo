/**
 * Script independiente para eliminar paquetes duplicados
 * Se conecta directamente a la base de datos sin usar el backend
 */

const mysql = require('mysql2/promise');

// Configuración de la base de datos
const dbConfig = {
    host: '100.107.192.117',
    port: 3306,
    user: 'marval',
    password: 'ThomasMarval2105..',
    database: 'leon_express'
};

// Códigos externos duplicados a procesar
const duplicatedExternalCodes = [
    '46407925639',  // Yanaina Dasilva Ortiz
    '46407893705',  // Maria jose nieto / María jose nieto
    '56987393582',  // ZHARA
    '46408134300',  // Viviana Bravo Tobar
    'L6523'         // DAVID
];

async function removeDuplicates() {
    let connection;

    try {
        console.log('🔌 Conectando a la base de datos...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conexión exitosa\n');

        let totalDeleted = 0;

        for (const externalCode of duplicatedExternalCodes) {
            console.log(`\n📦 Procesando código externo: ${externalCode}`);
            console.log('═'.repeat(60));

            // Buscar todos los paquetes con este código externo
            const [packages] = await connection.execute(
                `SELECT package_id, tracking_code, recipient_name, created_at 
         FROM packages 
         WHERE external_tracking_code = ? 
         ORDER BY created_at ASC`,
                [externalCode]
            );

            if (packages.length <= 1) {
                console.log(`   ✓ Solo hay ${packages.length} paquete(s), no hay duplicados`);
                continue;
            }

            console.log(`   ⚠️  Encontrados ${packages.length} paquetes duplicados:`);
            packages.forEach((pkg, idx) => {
                console.log(`      ${idx + 1}. ${pkg.tracking_code} - ${pkg.recipient_name} (${pkg.created_at})`);
            });

            // Mantener el primero (más antiguo)
            const toKeep = packages[0];
            const toDelete = packages.slice(1);

            console.log(`\n   ✅ MANTENIENDO: ${toKeep.tracking_code} (${toKeep.created_at})`);
            console.log(`   🗑️  ELIMINANDO ${toDelete.length} paquete(s):\n`);

            for (const pkg of toDelete) {
                console.log(`      🗑️  Eliminando ${pkg.tracking_code} (${pkg.recipient_name})...`);

                try {
                    // Iniciar transacción
                    await connection.beginTransaction();

                    // 1. Obtener delivery_ids
                    const [deliveries] = await connection.execute(
                        'SELECT delivery_id FROM deliveries WHERE package_id = ?',
                        [pkg.package_id]
                    );

                    // 2. Eliminar delivery_photos
                    if (deliveries.length > 0) {
                        const deliveryIds = deliveries.map(d => d.delivery_id);
                        await connection.execute(
                            `DELETE FROM delivery_photos WHERE delivery_id IN (${deliveryIds.map(() => '?').join(',')})`,
                            deliveryIds
                        );
                        console.log(`         ✓ ${deliveries.length} delivery photo(s) eliminadas`);
                    }

                    // 3. Eliminar deliveries
                    const [deliveryResult] = await connection.execute(
                        'DELETE FROM deliveries WHERE package_id = ?',
                        [pkg.package_id]
                    );
                    if (deliveryResult.affectedRows > 0) {
                        console.log(`         ✓ ${deliveryResult.affectedRows} delivery(ies) eliminada(s)`);
                    }

                    // 4. Eliminar package_costs
                    const [costsResult] = await connection.execute(
                        'DELETE FROM package_costs WHERE package_id = ?',
                        [pkg.package_id]
                    );
                    if (costsResult.affectedRows > 0) {
                        console.log(`         ✓ ${costsResult.affectedRows} costo(s) eliminado(s)`);
                    }

                    // 5. Eliminar route_packages
                    const [routeResult] = await connection.execute(
                        'DELETE FROM route_packages WHERE package_id = ?',
                        [pkg.package_id]
                    );
                    if (routeResult.affectedRows > 0) {
                        console.log(`         ✓ ${routeResult.affectedRows} route_package(s) eliminado(s)`);
                    }

                    // 6. Actualizar ocr_processing_queue (poner package_id en NULL)
                    const [ocrResult] = await connection.execute(
                        'UPDATE ocr_processing_queue SET package_id = NULL WHERE package_id = ?',
                        [pkg.package_id]
                    );
                    if (ocrResult.affectedRows > 0) {
                        console.log(`         ✓ ${ocrResult.affectedRows} registro(s) OCR actualizado(s)`);
                    }

                    // 7. Eliminar el paquete
                    await connection.execute(
                        'DELETE FROM packages WHERE package_id = ?',
                        [pkg.package_id]
                    );

                    // Confirmar transacción
                    await connection.commit();

                    console.log(`         ✅ Paquete ${pkg.tracking_code} eliminado exitosamente`);
                    totalDeleted++;

                } catch (error) {
                    // Revertir transacción en caso de error
                    await connection.rollback();
                    console.error(`         ❌ Error al eliminar ${pkg.tracking_code}:`, error.message);
                    throw error;
                }
            }
        }

        console.log('\n\n' + '═'.repeat(60));
        console.log('✅ PROCESO COMPLETADO');
        console.log('═'.repeat(60));
        console.log(`📊 Total de paquetes duplicados eliminados: ${totalDeleted}`);
        console.log(`📦 Códigos externos procesados: ${duplicatedExternalCodes.length}`);

        // Verificar resultado final
        console.log('\n📋 Verificación final:');
        for (const externalCode of duplicatedExternalCodes) {
            const [result] = await connection.execute(
                `SELECT COUNT(*) as count, GROUP_CONCAT(tracking_code ORDER BY created_at) as codes
         FROM packages 
         WHERE external_tracking_code = ?`,
                [externalCode]
            );
            console.log(`   ${externalCode}: ${result[0].count} paquete(s) - ${result[0].codes || 'ninguno'}`);
        }

    } catch (error) {
        console.error('\n❌ ERROR FATAL:', error);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Conexión cerrada');
        }
    }
}

// Ejecutar
console.log('🗑️  SCRIPT DE ELIMINACIÓN DE PAQUETES DUPLICADOS');
console.log('═'.repeat(60));
console.log('Base de datos:', dbConfig.host);
console.log('Database:', dbConfig.database);
console.log('═'.repeat(60) + '\n');

removeDuplicates()
    .then(() => {
        console.log('\n🎉 Script finalizado exitosamente');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Error fatal:', error.message);
        process.exit(1);
    });
