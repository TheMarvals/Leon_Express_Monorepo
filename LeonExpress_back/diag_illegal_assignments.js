require('dotenv').config();
const { Package, Pickup, Route, RoutePackage } = require('./models');
const { Op } = require('sequelize');

(async () => {
    try {
        console.log('=== DIAGNOSTICO DE ASIGNACIONES ILEGALES ===');

        // Buscar paquetes asignados a ruta (status ASIGNADO_A_RUTA)
        // O que esten en RoutePackage asociados a rutas activas

        const illegalPackages = await Package.findAll({
            where: {
                status: 'ASIGNADO_A_RUTA'
            },
            include: [
                {
                    model: Pickup,
                    as: 'pickup',
                    where: {
                        status: { [Op.ne]: 'VERIFICADO_EN_ALMACEN' }
                    }
                }
            ],
            limit: 50
        });

        console.log(`\n📦 Paquetes 'ASIGNADO_A_RUTA' con Pickup NO Verificado: ${illegalPackages.length}`);

        illegalPackages.forEach(p => {
            console.log(`   - Pkg: ${p.tracking_code} | Pickup: ${p.pickup ? p.pickup.status : 'NULL'}`);
        });

        // Revisar si existen paquetes sin Pickup que esten asignados
        const noPickupPackages = await Package.findAll({
            where: {
                status: 'ASIGNADO_A_RUTA',
                pickup_id: null
            },
            limit: 10
        });

        console.log(`\n📦 Paquetes 'ASIGNADO_A_RUTA' SIN Pickup: ${noPickupPackages.length}`);
        noPickupPackages.forEach(p => console.log(`   - Pkg: ${p.tracking_code}`));

    } catch (e) {
        console.error(e);
    }
})();
