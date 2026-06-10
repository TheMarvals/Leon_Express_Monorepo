require('dotenv').config();
const { Route, Package, Vehicle, VehicleType, RoutePackage, sequelize } = require('./models');
const { Op } = require('sequelize');

(async () => {
    try {
        console.log('--- Iniciando Corrección de Costos de Entrega ---');

        // 1. Buscar rutas activas o finalizadas recientemente (últimos 7 días por seguridad)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const routes = await Route.findAll({
            where: {
                // status: { [Op.in]: ['EN_PROGRESO', 'FINALIZADA', 'PENDIENTE'] }, // Puedes filtrar por estado si prefieres
                created_at: { [Op.gte]: sevenDaysAgo }
            },
            include: [
                {
                    model: Vehicle,
                    as: 'vehicle',
                    include: [{ model: VehicleType, as: 'vehicleType' }] // Asegúrate del alias correcto
                },
                {
                    model: RoutePackage,
                    as: 'routePackages',
                    include: [{ model: Package, as: 'package' }]
                }
            ]
        });

        console.log(`🔍 Se encontraron ${routes.length} rutas para analizar.`);

        let updatedPackagesCount = 0;

        for (const route of routes) {
            const vehicle = route.vehicle;
            if (!vehicle) {
                console.warn(`⚠️ Ruta ${route.route_name} (${route.route_id}) no tiene vehículo asignado. Saltando.`);
                continue;
            }

            // Obtener el tipo de vehículo de forma robusta (a veces alias falla)
            let vehicleType = vehicle.VehicleType;
            if (!vehicleType && vehicle.type_id) {
                vehicleType = await VehicleType.findByPk(vehicle.type_id);
            }

            if (!vehicleType) {
                console.warn(`⚠️ Vehículo ${vehicle.license_plate} no tiene tipo válido. Saltando.`);
                continue;
            }

            const correctCost = parseFloat(vehicleType.base_delivery_cost);
            console.log(`🚚 Ruta: ${route.route_name} | Vehículo: ${vehicle.license_plate} (${vehicleType.type_name}) | Costo Correcto: $${correctCost}`);

            const packagesToUpdate = [];

            for (const rp of route.routePackages) {
                const pkg = rp.package;
                if (!pkg) continue;

                const currentCost = parseFloat(pkg.delivery_cost);

                // Si el costo es diferente, lo marcamos para actualizar
                if (Math.abs(currentCost - correctCost) > 0.01) { // Comparación segura de floats
                    console.log(`   🔸 Actualizando Paquete ${pkg.tracking_code}: $${currentCost} -> $${correctCost}`);
                    packagesToUpdate.push(pkg.package_id);
                }
            }

            if (packagesToUpdate.length > 0) {
                await Package.update(
                    { delivery_cost: correctCost },
                    { where: { package_id: { [Op.in]: packagesToUpdate } } }
                );
                updatedPackagesCount += packagesToUpdate.length;
            }
        }

        console.log('--- Finalizado ---');
        console.log(`✅ Total de paquetes corregidos: ${updatedPackagesCount}`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        // await sequelize.close(); // Opcional
    }
})();
