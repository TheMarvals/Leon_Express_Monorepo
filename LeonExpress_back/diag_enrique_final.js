require('dotenv').config();
const { User, Route, Package, Vehicle, VehicleType, Delivery, Client, RoutePackage, InvoiceItem, Invoice, DriverPayout, PayoutItem } = require('./models');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

(async () => {
    try {
        console.log('\n=== DIAGNÓSTICO USUARIOS ENRIQUE ===');
        const enriques = await User.findAll({
            where: { full_name: { [Op.like]: '%Enrique%' } },
            include: [{ model: require('./models').Role, as: 'role' }]
        });

        for (const user of enriques) {
            console.log(`\n👤 Usuario: ${user.full_name} (ID: ${user.user_id})`);
            console.log(`   Rol: ${user.role ? user.role.role_name : 'N/A'}`);

            const vehicle = await Vehicle.findOne({
                where: { user_id: user.user_id },
                include: [{ model: VehicleType, as: 'vehicleType' }]
            });

            if (vehicle) {
                console.log(`   🚗 Vehículo: ${vehicle.license_plate}`);
                console.log(`      Tipo: ${vehicle.vehicleType ? vehicle.vehicleType.type_name : 'N/A'}`);
                console.log(`      Costo Base: ${vehicle.vehicleType ? vehicle.vehicleType.base_delivery_cost : 'N/A'}`);
            } else {
                console.log('   🚫 Sin vehículo asignado.');
            }

            // Últimas rutas
            const routes = await Route.findAll({
                where: { user_id: user.user_id },
                order: [['created_at', 'DESC']],
                limit: 3,
                include: [{ model: RoutePackage, as: 'routePackages', limit: 1, include: [{ model: Package, as: 'package' }] }]
            });

            console.log(`   🛣️  Rutas recientes: ${routes.length}`);
            routes.forEach(r => {
                console.log(`      - ${r.route_name} (${r.created_at}) [ID: ${r.route_id}]`);
                if (r.routePackages.length > 0 && r.routePackages[0].package) {
                    console.log(`        Muestra Costo Pkg: ${r.routePackages[0].package.delivery_cost}`);
                }
            });
        }

        console.log('\n=== CORRECCIÓN FACTURA LE675011 ===');
        const pkg = await Package.findOne({ where: { tracking_code: 'LE675011' } });

        if (pkg) {
            console.log(`Paquete: ${pkg.tracking_code} (Status: ${pkg.status})`);

            // Buscar item de factura (cargo envío)
            const invoiceItem = await InvoiceItem.findOne({
                where: {
                    package_id: pkg.package_id,
                    item_description: { [Op.like]: 'Envío%' }
                }
            });

            if (invoiceItem) {
                console.log(`✅ Facturado en Invoice ID: ${invoiceItem.invoice_id}`);

                // Buscar si ya existe el crédito COD
                const creditItem = await InvoiceItem.findOne({
                    where: {
                        package_id: pkg.package_id,
                        item_description: { [Op.like]: 'Crédito COD%' }
                    }
                });

                if (creditItem) {
                    console.log(`✅ Crédito COD ya existe: ${creditItem.amount}`);
                } else {
                    console.log('⚠️ Crédito COD NO existe. Insertando corrección...');

                    await InvoiceItem.create({
                        invoice_item_id: uuidv4(),
                        invoice_id: invoiceItem.invoice_id,
                        package_id: pkg.package_id,
                        item_description: 'Crédito COD - LE675011 (Corrección)',
                        amount: -3000.00
                    });

                    // Recalcular total de la factura
                    const allItems = await InvoiceItem.findAll({ where: { invoice_id: invoiceItem.invoice_id } });
                    const newTotal = allItems.reduce((sum, item) => sum + parseFloat(item.amount), 0);

                    await Invoice.update(
                        { total_amount: newTotal },
                        { where: { invoice_id: invoiceItem.invoice_id } }
                    );

                    console.log(`✅ Corrección aplicada. Nuevo total factura: ${newTotal}`);
                }
            } else {
                console.log('⚠️ El envío de este paquete NO ha sido facturado aún.');
            }
        } else {
            console.log('❌ Paquete LE675011 no encontrado.');
        }

    } catch (e) {
        console.error('Error:', e);
    }
})();
