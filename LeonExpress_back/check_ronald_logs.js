require('dotenv').config();
const { AuditLog } = require('./models');
const { Op } = require('sequelize');

async function checkRonaldLogs() {
    try {
        const todayAtZero = new Date();
        todayAtZero.setHours(0, 0, 0, 0);

        const logs = await AuditLog.findAll({
            where: {
                user_id: { [Op.in]: ['c94b32ae-0fda-44e0-acd2-aa6811cc8348', '130ab480-4892-4a3a-8cee-26dbd093711e'] },
                created_at: { [Op.gte]: todayAtZero }
            },
            order: [['created_at', 'DESC']]
        });

        console.log(`--- RONALD TODAY LOGS (${logs.length}) ---`);
        logs.forEach(l => {
            console.log(`[${l.created_at}] ${l.action}: ${l.details}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkRonaldLogs();
