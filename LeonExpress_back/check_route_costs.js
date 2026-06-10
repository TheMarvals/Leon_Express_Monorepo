require('dotenv').config();
const { Route, Package, User, RoutePackage, Client, ClientPricing, sequelize } = require('./models');
const { Op } = require('sequelize');

(async () => {
    try {
        console.log('--- Finding Package ---');
        // Buscar el paquete específico para encontrar la ruta
        const targetPackage = await Package.findOne({
            where: { recipient_name: { [Op.like]: '%Amilcar Andres Henriquez Hernandez%' } }
        });

        let routes = [];
        if (targetPackage) {
            console.log(`✅ Package Found: ${targetPackage.tracking_code} | ID: ${targetPackage.package_id}`);
            // Find the route containing this package
            const routePackage = await RoutePackage.findOne({
                where: { package_id: targetPackage.package_id },
                include: [{
                    model: Route,
                    as: 'route',
                    include: [
                        {
                            model: RoutePackage,
                            as: 'routePackages',
                            include: [
                                {
                                    model: Package,
                                    as: 'package',
                                    attributes: ['package_id', 'tracking_code', 'delivery_cost', 'client_price', 'destination_address', 'recipient_name', 'client_id', 'is_cod', 'cod_amount']
                                }
                            ]
                        }
                    ]
                }]
            });
            if (routePackage && routePackage.route) {
                routes = [routePackage.route];
            }
        } else {
            console.log('No package found for Amilcar.');
            return;
        }

        if (routes.length > 0) {
            const route = routes[0];
            console.log(`📦 Route: ${route.route_name} | ID: ${route.route_id} | Status: ${route.status}`);
            console.log('--- Packages ---');
            route.routePackages.forEach(rp => {
                const p = rp.package;
                if (p) {
                    console.log(`Package: ${p.tracking_code}`);
                    console.log(`  Recipient: ${p.recipient_name}`);
                    console.log(`  Address: ${p.destination_address}`);
                    console.log(`  Delivery Cost: ${p.delivery_cost}`);
                    console.log(`  Client Price: ${p.client_price}`);
                    console.log(`  Client ID: ${p.client_id}`);
                    console.log(`  Is COD: ${p.is_cod} | COD Amount: ${p.cod_amount}`);
                    console.log('----------------');
                }
            });
        }

        console.log('--- Client Pricing Analysis ---');
        const clientIds = ['550e8400-e29b-41d4-a716-446655440009', 'ebae3b5d-f839-4649-afe4-3fff9697b80c'];

        for (const clientId of clientIds) {
            const client = await Client.findByPk(clientId);
            const pricing = await ClientPricing.findAll({ where: { client_id: clientId } });

            console.log(`Client: ${client ? client.client_name : 'Unknown'} (${clientId})`);
            if (pricing && pricing.length > 0) {
                pricing.forEach(p => {
                    console.log(`  Pricing: Base Price ${p.base_price} | Valid From: ${p.valid_from} | Valid To: ${p.valid_to}`);
                });
            } else {
                console.log('  No custom pricing found (Default used?)');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // await sequelize.close(); 
    }
})();
