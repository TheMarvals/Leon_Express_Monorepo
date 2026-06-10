require('dotenv').config();
const { Route, Vehicle, VehicleType, sequelize } = require('./models');

(async () => {
    try {
        console.log('--- Iniciando Debug ---');

        // Buscar una ruta reciente
        const route = await Route.findOne({
            order: [['created_at', 'DESC']],
            include: [{ model: Vehicle, as: 'vehicle' }]
        });

        if (!route) {
            console.log('No se encontró ruta reciente.');
            return;
        }

        console.log(`Ruta encontrada: ${route.route_id}`);
        if (route.vehicle) {
            console.log(`Vehículo: ${route.vehicle.license_plate} (TypeID: ${route.vehicle.type_id})`);

            // Simular la lógica que agregué en route.js
            if (route.vehicle.type_id) {
                // AQUÍ es donde podría fallar si VehicleType no está definido o algo
                const vehicleType = await VehicleType.findByPk(route.vehicle.type_id);

                if (vehicleType) {
                    console.log(`Tipo de Vehículo: ${vehicleType.type_name}`);
                    console.log(`Costo Base: ${vehicleType.base_delivery_cost}`);
                } else {
                    console.log('VehicleType not found via findByPk');
                }
            } else {
                console.log('Vehicle has no type_id');
            }
        } else {
            console.log('Ruta sin vehículo.');
        }

    } catch (error) {
        console.error('❌ ERROR FATAL:', error);
    } finally {
        // await sequelize.close();
    }
})();
