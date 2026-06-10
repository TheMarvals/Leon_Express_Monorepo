require('dotenv').config();
const sequelize = require('./config/database');

async function test() {
    try {
        await sequelize.authenticate();
        console.log('✅ DATABASE_CONNECTED');

        const [logs] = await sequelize.query(`
      SELECT * FROM audit_log 
      WHERE action LIKE '%WEEKLY_PERIOD_CLOSE%' 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

        console.log('--- AUDIT LOGS ---');
        console.log(JSON.stringify(logs, null, 2));

        const [periods] = await sequelize.query(`
      SELECT * FROM billing_periods 
      ORDER BY end_date DESC 
      LIMIT 5
    `);

        console.log('--- BILLING PERIODS ---');
        console.log(JSON.stringify(periods, null, 2));

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        if (error.original) console.error('Original error:', error.original);
    }
    process.exit(0);
}

test();
