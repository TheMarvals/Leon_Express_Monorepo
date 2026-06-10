const { Package, PackageCost, Delivery, DeliveryPhoto, OcrProcessingQueue } = require('./models');
const { Op } = require('sequelize');

/**
 * Script para eliminar paquetes duplicados manteniendo el más antiguo
 */
async function removeDuplicatePackages() {
    console.log('🗑️  Iniciando eliminación de paquetes duplicados...\n');

    try {
        // Lista de códigos externos duplicados identificados
        const duplicatedExternalCodes = [
            '46407925639',  // Yanaina Dasilva Ortiz
            '46407893705',  // Maria jose nieto
            '56987393582',  // ZHARA
            '46408134300',  // Viviana Bravo Tobar
            'L6523'         // DAVID
        ];

        let totalDeleted = 0;

        for (const externalCode of duplicatedExternalCodes) {
            console.log(`\n📦 Procesando código externo: ${externalCode}`);

            // Buscar todos los paquetes con este código externo, ordenados por fecha de creación
            const duplicates = await Package.findAll({
                where: { external_tracking_code: externalCode },
                order: [['created_at', 'ASC']] // Más antiguo primero
            });

            if (duplicates.length <= 1) {
                console.log(`   ✓ Solo hay ${duplicates.length} paquete(s), no hay duplicados para eliminar`);
                continue;
            }

            console.log(`   ⚠️  Encontrados ${duplicates.length} paquetes duplicados:`);

            // Mostrar todos los paquetes
            duplicates.forEach((pkg, idx) => {
                console.log(`      ${idx + 1}. ${pkg.tracking_code} - ${pkg.recipient_name} (${pkg.created_at})`);
            });

            // Mantener el primero (más antiguo), eliminar los demás
            const toKeep = duplicates[0];
            const toDelete = duplicates.slice(1);

            console.log(`\n   ✅ MANTENIENDO: ${toKeep.tracking_code} (creado: ${toKeep.created_at})`);
            console.log(`   🗑️  ELIMINANDO ${toDelete.length} duplicado(s):\n`);

            for (const pkg of toDelete) {
                console.log(`      🗑️  Eliminando ${pkg.tracking_code} (${pkg.recipient_name})...`);

                // Eliminar registros relacionados primero

                // 1. Eliminar fotos de entregas
                const deliveries = await Delivery.findAll({
                    where: { package_id: pkg.package_id }
                });

                for (const delivery of deliveries) {
                    await DeliveryPhoto.destroy({
                        where: { delivery_id: delivery.delivery_id }
                    });
                }

                // 2. Eliminar entregas
                await Delivery.destroy({
                    where: { package_id: pkg.package_id }
                });

                // 3. Eliminar costos del paquete
                await PackageCost.destroy({
                    where: { package_id: pkg.package_id }
                });

                // 4. Actualizar registros OCR (poner package_id en null)
                await OcrProcessingQueue.update(
                    { package_id: null },
                    { where: { package_id: pkg.package_id } }
                );

                // 5. Finalmente, eliminar el paquete
                await pkg.destroy();

                console.log(`         ✓ Eliminado exitosamente`);
                totalDeleted++;
            }
        }

        console.log(`\n\n✅ Proceso completado!`);
        console.log(`📊 Total de paquetes duplicados eliminados: ${totalDeleted}`);
        console.log(`📦 Paquetes únicos mantenidos: ${duplicatedExternalCodes.length}`);

    } catch (error) {
        console.error('\n❌ Error durante la eliminación:', error);
        throw error;
    }
}

// Ejecutar el script
removeDuplicatePackages()
    .then(() => {
        console.log('\n🎉 Script finalizado exitosamente');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Error fatal:', error);
        process.exit(1);
    });
