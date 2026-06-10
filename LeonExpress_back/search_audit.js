require('dotenv').config();
const { AuditLog } = require('./models');
const { Op } = require('sequelize');

async function searchAudit() {
    try {
        const logs = await AuditLog.findAll({
            where: {
                details: {
                    [Op.like]: '%00f9c4a7-a46c-41f0-a6e7-7e3dcb3da1b1%'
                }
            },
            order: [['created_at', 'ASC']]
        });

        console.log('--- AUDIT LOGS SEARCH ---');
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
searchAudit();
