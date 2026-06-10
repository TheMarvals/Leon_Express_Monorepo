const mysql = require('mysql2/promise');

async function run() {
    const connection = await mysql.createConnection({
        host: '192.168.1.250',
        user: 'root',
        password: 'dalton25',
        database: 'Leon_Express'
    });

    try {
        const [rows] = await connection.execute('SELECT id, status, is_duplicate, created_at, reviewed_by FROM ocr_processing_queue ORDER BY created_at DESC LIMIT 20');
        console.log(JSON.stringify(rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await connection.end();
    }
}

run();
