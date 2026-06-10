require('dotenv').config();
const { AuditLog } = require('./models');
const { Op } = require('sequelize');

async function findRouteLog() {
    try {
        const logs = await AuditLog.findAll({
            where: {
                details: { [Op.like]: '%305901a9-47a4-47eb-889f-9b566a958e11%' }
            }
        });

        console.log(`--- ROUTE AUDIT LOGS (${logs.length}) ---`);
        logs.forEach(l => console.log(`[${l.created_at}] ${l.action}: ${l.details}`));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
findRouteLog();
