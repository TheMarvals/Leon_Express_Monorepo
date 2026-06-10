require('dotenv').config();
const { AuditLog } = require('./models');
const { Op } = require('sequelize');

async function searchDeleteRoute() {
    try {
        const logs = await AuditLog.findAll({
            where: {
                action: 'DELETE_ROUTE',
                created_at: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) }
            }
        });

        console.log(`--- DELETE ROUTE TODAY (${logs.length}) ---`);
        logs.forEach(l => console.log(`[${l.created_at}] ${l.details}`));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
searchDeleteRoute();
