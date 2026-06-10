require('dotenv').config();
const { Package, Pickup, Route } = require('./models');
const { Op } = require('sequelize');

(async () => {
    try {
        console.log('=== SEGURO MEDICO: ARREGLANDO PICKUPS NO VERIFICADAS DE PAQUETES ASIGNADOS ===');

        // 1. Encontrar Pickups que tienen paquetes YA asignados a ruta, pero la Pickup sigue abierta
        //    (Esto limpia el desastre causado por el bug anterior)

        const problemPickups = await Pickup.findAll({
            where: {
                status: { [Op.ne]: 'VERIFICADO_EN_ALMACEN' }
            },
            include: [{
                model: Package,
                as: 'packages',
                where: {
                    status: 'ASIGNADO_A_RUTA' // Solo nos importa si ya entraron al flujo siguiente
                },
                required: true // Inner join
            }]
        });

        console.log(`🔍 Se encontraron ${problemPickups.length} Pickups inconsistentes.`);

        for (const p of problemPickups) {
            console.log(`   🔧 Corrigiendo Pickup ${p.pickup_id} (Status: ${p.status}) - Tiene ${p.packages.length} paquetes asignados.`);

            await p.update({
                status: 'VERIFICADO_EN_ALMACEN',
                verified_at_warehouse_at: new Date(), // Asumimos verificacion ahora para arreglar flujo
                notes: (p.notes || '') + ' [AUTO-FIX: Verificado automáticament por sistema debido a paquetes ya en ruta]'
            });

            // Tambien asegurarnos que los paquetes esten en estado correcto? 
            // Si estan en ASIGNADO_A_RUTA, ya pasaron RECIBIDO_EN_ALMACEN. No tocamos paquetes.
        }

        console.log('✅ Corrección masiva completada.');

    } catch (e) {
        console.error(e);
    }
})();
