require('dotenv').config();
const { User, Route, Package, Vehicle, VehicleType, Invoice, InvoiceItem } = require('./models');
const { Op } = require('sequelize');

(async () => {
    try {
        console.log('=== FIXING EVERYTHING (ARREGLANDO TODO) ===');

        /* 1. FACTURA LE675011 */
        console.log('\n--- 1. FACTURA LE675011 ---');
        const pkg = await Package.findOne({ where: { tracking_code: 'LE675011' } });

        if (pkg) {
            // Buscar el item de envio
            const item = await InvoiceItem.findOne({
                where: {
                    package_id: pkg.package_id,
                    item_description: { [Op.like]: 'Envío%' }
                }
            });

            if (item) {
                console.log(`Original Item: ${item.item_description} | Amount: ${item.amount}`);

                // Si el monto es mayor a 0 (significa que no tiene el descuento aplicado aun)
                // Ojo: Si el envio cuesta 2200 y el credito es 3000, el resultado es -800.
                if (parseFloat(item.amount) > 0) {
                    const creditAmount = 3000.00;
                    const newAmount = parseFloat(item.amount) - creditAmount;
                    const newDesc = `${item.item_description} | Crédito COD: -$${creditAmount}`;

                    await item.update({
                        amount: newAmount,
                        item_description: newDesc
                    });
                    console.log(`✅ Item actualizado: ${newDesc} | Nuevo Monto: ${newAmount}`);

                    // Recalcular total factura
                    const allItems = await InvoiceItem.findAll({ where: { invoice_id: item.invoice_id } });
                    const newTotal = allItems.reduce((sum, i) => sum + parseFloat(i.amount), 0);

                    await Invoice.update({ total_amount: newTotal }, { where: { invoice_id: item.invoice_id } });
                    console.log(`✅ Total Factura actualizado a: ${newTotal}`);
                } else {
                    console.log('⚠️ El item ya parece tener el descuento aplicado (monto <= 0).');
                }
            } else {
                console.log('❌ No se encontró el item de envío para este paquete.');
            }
        } else {
            console.log('❌ Paquete LE675011 no encontrado.');
        }

        /* 2. ENRIQUE ADMIN VS DRIVER */
        console.log('\n--- 2. RUTAS ENRIQUE (ADMIN -> DRIVER) ---');

        // Buscar usuarios por nombre
        const enriques = await User.findAll({
            where: { full_name: { [Op.like]: '%Enrique%' } },
            include: [{ model: Vehicle, as: 'vehicles' }]
        });

        let adminUser = null;
        let driverUser = null;

        for (const u of enriques) {
            // Admin es el que no tiene vehiculos (o rol ADMIN, pero aqui simplificamos)
            if (!u.vehicles || u.vehicles.length === 0) {
                adminUser = u;
            } else {
                driverUser = u; // Asumimos que el que tiene vehiculo es el correcto para rutas
            }
        }

        if (adminUser && driverUser) {
            console.log(`Admin (Incorrecto para rutas): ${adminUser.full_name} (${adminUser.user_id})`);
            console.log(`Driver (Correcto para rutas): ${driverUser.full_name} (${driverUser.user_id}) con vehículo`);

            // Buscar rutas asignadas al Admin
            const badRoutes = await Route.findAll({ where: { user_id: adminUser.user_id } });

            if (badRoutes.length > 0) {
                console.log(`🔍 Encontradas ${badRoutes.length} rutas asignadas incorrectamente al Admin.`);

                // Reasignar al Driver
                await Route.update(
                    { user_id: driverUser.user_id },
                    { where: { user_id: adminUser.user_id } }
                );
                console.log(`✅ Todas las rutas han sido reasignadas al Driver correcto.`);
            } else {
                console.log('✅ No hay rutas asignadas incorrectamente al Admin.');
            }
        } else {
            console.log('⚠️ No se pudieron identificar claramente al Admin y al Driver (falta vehiculo o usuario).');
        }

    } catch (e) {
        console.error('Error:', e);
    }
})();
