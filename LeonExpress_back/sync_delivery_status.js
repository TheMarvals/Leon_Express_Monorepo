require('dotenv').config();
const { Package, Delivery, sequelize } = require('./models');
const { Op } = require('sequelize');

async function syncStatuses() {
    const t = await sequelize.transaction();
    try {
        console.log('🔍 Buscando paquetes con discrepancias...');

        // Buscar paquetes que NO están como ENTREGADO pero tienen una entrega exitosa
        const pkgs = await Package.findAll({
            where: {
                status: { [Op.notIn]: ['ENTREGADO', 'CANCELADO', 'DEVUELTO_A_CLIENTE'] }
            },
            include: [{
                model: Delivery,
                as: 'deliveries',
                where: {
                    status_at_delivery: 'ENTREGADO'
                }
            }],
            transaction: t
        });

        console.log(`📊 Se encontraron ${pkgs.length} paquetes para corregir.`);

        for (const p of pkgs) {
            console.log(`✅ Sincronizando: ${p.tracking_code} -> ENTREGADO`);
            await p.update({ status: 'ENTREGADO' }, { transaction: t });
        }

        await t.commit();
        console.log('\n✨ Sincronización completada exitosamente.');
        process.exit(0);
    } catch (e) {
        await t.rollback();
        console.error('❌ Error durante la sincronización:', e);
        process.exit(1);
    }
}

syncStatuses();
