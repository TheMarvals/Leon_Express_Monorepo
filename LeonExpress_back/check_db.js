require('dotenv').config();
const { sequelize } = require('./models');
async function check() {
    try {
        const [results] = await sequelize.query('DESCRIBE payout_items');
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
