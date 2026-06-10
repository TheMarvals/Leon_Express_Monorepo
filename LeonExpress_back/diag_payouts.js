require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: parseInt(process.env.DB_PORT) || 3306
        });
        const [rows] = await connection.execute('SELECT * FROM payout_items WHERE item_description LIKE ? OR payout_id LIKE ?', ['%13a9b65e%', '%13a9b65e%']);
        console.log('Items found:', JSON.stringify(rows, null, 2));

        const [indexes] = await connection.execute('SHOW INDEX FROM payout_items');
        console.log('Indexes:', JSON.stringify(indexes, null, 2));

        await connection.end();
    } catch (e) {
        console.error('Error:', e);
    }
}
run();
