require('dotenv').config();
const { Package, Delivery, RoutePackage, Route, AuditLog } = require('./models');
const { Op } = require('sequelize');

async function deepInvestigation() {
    try {
        console.log('--- BUSCANDO TODOS LOS PAQUETES RELACIONADOS CON LE558391 o 46416837804 ---');
        const pkgs = await Package.findAll({
            where: {
                [Op.or]: [
                    { tracking_code: { [Op.like]: '%LE558391%' } },
                    { external_tracking_code: { [Op.like]: '%46416837804%' } }
                ]
            }
        });

        for (const p of pkgs) {
            console.log(`\nPaquete: ${p.package_id}`);
            console.log(`Tracking: ${p.tracking_code} | External: ${p.external_tracking_code}`);
            console.log(`Status: ${p.status}`);
            console.log(`Created: ${p.created_at}`);

            const deliveries = await Delivery.findAll({ where: { package_id: p.package_id } });
            console.log(`Entregas (${deliveries.length}):`, deliveries.map(d => `${d.status_at_delivery} on ${d.attempted_at}`));

            const rps = await RoutePackage.findAll({
                where: { package_id: p.package_id },
                include: [{ model: Route, as: 'route' }]
            });
            console.log(`Rutas (${rps.length}):`, rps.map(rp => `Route ${rp.route_id} (${rp.route?.status}) assigned at ${rp.created_at}`));

            const logs = await AuditLog.findAll({
                where: {
                    [Op.or]: [
                        { target_id: p.package_id },
                        { details: { [Op.like]: `%${p.package_id}%` } },
                        { details: { [Op.like]: `%${p.tracking_code}%` } }
                    ]
                },
                order: [['created_at', 'DESC']]
            });
            console.log(`Logs de Auditoría recomendados (${logs.length}):`);
            logs.slice(0, 5).forEach(l => console.log(`  [${l.created_at}] ${l.action}: ${l.details}`));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
deepInvestigation();
