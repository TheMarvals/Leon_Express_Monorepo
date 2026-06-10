require('dotenv').config();
const { Package, Delivery } = require('./models');
const { Op } = require('sequelize');

async function findDiscrepancies() {
    try {
        const pkgs = await Package.findAll({
            where: {
                status: { [Op.ne]: 'ENTREGADO' }
            },
            include: [{
                model: Delivery,
                as: 'deliveries',
                where: {
                    status_at_delivery: 'ENTREGADO'
                }
            }]
        });

        console.log(`--- DISCREPANCIES FOUND: ${pkgs.length} ---`);
        for (const p of pkgs) {
            console.log(`Package: ${p.package_id} | Tracking: ${p.tracking_code} | Current Package Status: ${p.status}`);
            console.log(`Deliveries:`, p.deliveries.map(d => `${d.status_at_delivery} on ${d.attempted_at}`));
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
findDiscrepancies();
