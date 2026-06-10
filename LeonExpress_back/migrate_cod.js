require('dotenv').config();
const { sequelize } = require('./models');
async function migrate() {
    try {
        console.log('🚀 Iniciando migración...');
        await sequelize.query('ALTER TABLE payout_items ADD COLUMN IF NOT EXISTS cod_amount DECIMAL(10, 2) DEFAULT 0');
        console.log('✅ Columna cod_amount añadida (o ya existía).');
        process.exit(0);
    } catch (e) {
        console.error('❌ Error en migración:', e);
        process.exit(1);
    }
}
migrate();
