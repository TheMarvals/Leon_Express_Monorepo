require('dotenv').config();
const { User, Route, Package, Vehicle, VehicleType, Delivery, Client, RoutePackage } = require('./models');
const { Op } = require('sequelize');

(async () => {
    try {
        console.log('--- BUSCANDO A ENRIQUE ---');
        const enrique = await User.findOne({ where: { full_name: { [Op.like]: '%Enrique%' } } });
        if (enrique) {
            console.log('Enrique found:', enrique.user_id, 'Name:', enrique.full_name);
            const vehicle = await Vehicle.findOne({
                where: { user_id: enrique.user_id },
                include: [{ model: VehicleType, as: 'vehicleType' }]
            });
            if (vehicle) {
                console.log('Vehicle:', vehicle.license_plate, 'Type:', vehicle.vehicleType ? vehicle.vehicleType.type_name : 'N/A', 'Base:', vehicle.vehicleType ? vehicle.vehicleType.base_delivery_cost : 'N/A');
            }

            const routes = await Route.findAll({
                where: { user_id: enrique.user_id },
                order: [['created_at', 'DESC']],
                limit: 5
            });
            for (const r of routes) {
                console.log('\n--- Route:', r.route_id, r.route_name, r.created_at, '---');
                const rps = await RoutePackage.findAll({
                    where: { route_id: r.route_id },
                    include: [{ model: Package, as: 'package' }]
                });
                rps.forEach(rp => {
                    if (rp.package) console.log('  Pkg:', rp.package.tracking_code, 'DC:', rp.package.delivery_cost);
                });
            }
        }

        console.log('\n--- Searching for $3000 package delivered on Feb 4 ---');
        const start = '2026-02-04 00:00:00';
        const end = '2026-02-04 23:59:59';
        const deliveries = await Delivery.findAll({
            where: { created_at: { [Op.between]: [start, end] } },
            include: [{ model: Package, as: 'package', include: [{ model: Client, as: 'client' }] }]
        });

        deliveries.forEach(d => {
            const p = d.package;
            if (p && (p.cod_amount == 3000 || p.client_price == 3000)) {
                console.log('MATCH FOUND!');
                console.log('  Tracking:', p.tracking_code, 'COD:', p.cod_amount, 'Price:', p.client_price, 'Client:', p.client ? p.client.name : 'N/A', 'Date:', d.created_at);
            }
        });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
