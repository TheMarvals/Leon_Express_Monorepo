require('dotenv').config();
const { User, Route, Package, Vehicle, VehicleType, Delivery, Client, RoutePackage, InvoiceItem, Invoice, DriverPayout, PayoutItem } = require('./models');
const { Op } = require('sequelize');

(async () => {
    try {
        console.log('\n=== DIAGNÓSTICO ENRIQUE ===');
        const enrique = await User.findOne({ where: { full_name: { [Op.like]: '%Enrique%' } } });

        if (enrique) {
            console.log(`Usuario: ${enrique.full_name} (ID: ${enrique.user_id})`);

            const vehicle = await Vehicle.findOne({
                where: { user_id: enrique.user_id },
                include: [{ model: VehicleType, as: 'vehicleType' }]
            });

            if (vehicle) {
                console.log(`Vehículo: ${vehicle.license_plate}`);
                console.log(`Tipo: ${vehicle.vehicleType ? vehicle.vehicleType.type_name : 'N/A'}`);
                console.log(`Costo Base Configurado: ${vehicle.vehicleType ? vehicle.vehicleType.base_delivery_cost : 'N/A'}`);
            } else {
                console.log('⚠️ Enrique no tiene vehículo asignado directamente.');
            }

            // Últimas 3 rutas
            const lastRoutes = await Route.findAll({
                where: { user_id: enrique.user_id },
                order: [['created_at', 'DESC']],
                limit: 3,
                include: [{
                    model: RoutePackage,
                    as: 'routePackages',
                    include: [{ model: Package, as: 'package' }]
                }]
            });

            console.log('\nÚltimas Rutas:');
            lastRoutes.forEach(r => {
                console.log(`- Ruta: ${r.route_name} (${r.created_at})`);
                const pkgCount = r.routePackages.length;
                if (pkgCount > 0) {
                    // Muestra costo del primer paquete como muestra
                    const firstPkg = r.routePackages[0].package;
                    if (firstPkg) {
                        console.log(`  Muestra Pkg (${firstPkg.tracking_code}): Costo = ${firstPkg.delivery_cost}`);
                    }
                }
            });
        } else {
            console.log('❌ Usuario Enrique no encontrado');
        }

        console.log('\n=== DIAGNÓSTICO PAQUETE LE675011 (3000) ===');
        const pkg = await Package.findOne({
            where: { tracking_code: 'LE675011' },
            include: [
                { model: Delivery, as: 'deliveries' },
                { model: Client, as: 'client' }
            ]
        });

        if (pkg) {
            console.log(`Paquete: ${pkg.tracking_code}`);
            console.log(`Cliente: ${pkg.client ? pkg.client.client_name : 'N/A'} (ID: ${pkg.client_id})`);
            console.log(`COD Amount: ${pkg.cod_amount}`);
            console.log(`Client Price: ${pkg.client_price}`);
            console.log(`Status Actual: ${pkg.status}`);

            const delivery = await Delivery.findOne({
                where: { package_id: pkg.package_id, status_at_delivery: 'ENTREGADO' }
            });

            if (delivery) {
                console.log(`✅ Entregado el: ${delivery.attempted_at || delivery.created_at}`);
                console.log(`   ID Entrega: ${delivery.delivery_id}`);
            } else {
                console.log('⚠️ No tiene registro de entrega exitosa.');
            }

            // Verificar si está en algún Payout (Pago a Conductor)
            const payoutItem = await PayoutItem.findOne({
                where: { package_id: pkg.package_id },
                include: [{ model: DriverPayout, as: 'driverPayout' }]
            });

            if (payoutItem) {
                console.log(`💰 PAGADO A CONDUCTOR: Sí`);
                console.log(`   Payout ID: ${payoutItem.payout_id}`);
                console.log(`   Estado Pago: ${payoutItem.driverPayout.status}`);
            } else {
                console.log(`💰 PAGADO A CONDUCTOR: No`);
            }

            // Verificar Facturación Cliente
            const invoiceItem = await InvoiceItem.findOne({
                where: { package_id: pkg.package_id },
                include: [{ model: Invoice, as: 'invoice' }]
            });
            if (invoiceItem) {
                console.log(`📄 FACTURADO A CLIENTE: Sí`);
                console.log(`   Invoice ID: ${invoiceItem.invoice_id}`);
            } else {
                console.log(`📄 FACTURADO A CLIENTE: No`);
            }

        } else {
            console.log('❌ Paquete LE675011 no encontrado');
        }

    } catch (e) {
        console.error(e);
    }
})();
