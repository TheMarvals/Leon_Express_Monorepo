require('dotenv').config();
const { AuditLog } = require('./models');
const { Op } = require('sequelize');

async function fullAuditSearch() {
    try {
        const logs = await AuditLog.findAll({
            where: {
                [Op.or]: [
                    { target_id: '00f9c4a7-a46c-41f0-a6e7-7e3dcb3da1b1' },
                    { details: { [Op.like]: '%00f9c4a7-a46c-41f0-a6e7-7e3dcb3da1b1%' } }
                ]
            },
            order: [['created_at', 'ASC']]
        });

        console.log(`--- FULL AUDIT TRAIL FOR 00f9c4a7... (${logs.length}) ---`);
        logs.forEach(l => {
            console.log(`[${l.created_at}] ${l.action}: ${l.details}`);
        });

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
fullAuditSearch();
