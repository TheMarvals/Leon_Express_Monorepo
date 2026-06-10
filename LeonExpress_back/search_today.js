require('dotenv').config();
const { AuditLog } = require('./models');
const { Op } = require('sequelize');

async function searchTodayAudit() {
    try {
        const todayAtZero = new Date();
        todayAtZero.setHours(0, 0, 0, 0);

        const logs = await AuditLog.findAll({
            where: {
                created_at: { [Op.gte]: todayAtZero }
            },
            order: [['created_at', 'DESC']]
        });

        console.log(`--- TODAY AUDIT LOGS (${logs.length}) ---`);
        console.log(JSON.stringify(logs.map(l => ({
            action: l.action,
            details: l.details,
            created_at: l.created_at
        })), null, 2));

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
searchTodayAudit();
