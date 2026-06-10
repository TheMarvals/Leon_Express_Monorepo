require('dotenv').config();
const { sequelize } = require('./models');

async function checkAudit() {
    try {
        const logs = await sequelize.query(`
      SELECT * FROM audit_log 
      WHERE action LIKE 'AUTO_WEEKLY_PERIOD_CLOSE%' 
      ORDER BY created_at DESC 
      LIMIT 10
    `, { type: sequelize.QueryTypes.SELECT });

        console.log(JSON.stringify(logs, null, 2));
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

checkAudit();
