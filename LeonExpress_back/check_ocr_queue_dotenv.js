require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
    console.log('Connecting to:', process.env.DB_HOST, process.env.DB_USER, process.env.DB_NAME);
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || '3306')
    });

    try {
        // Summary of queue statuses
        const [summary] = await connection.execute(`
      SELECT status, is_duplicate, COUNT(*) as cnt 
      FROM ocr_processing_queue 
      GROUP BY status, is_duplicate 
      ORDER BY status, is_duplicate
    `);
        console.log('\n=== OCR Queue Summary ===');
        console.table(summary);

        // Recent pending items (needs_review or error without reviewer)
        const [pending] = await connection.execute(`
      SELECT id, status, is_duplicate, pickup_id, filename, overall_confidence, created_at, reviewed_by
      FROM ocr_processing_queue 
      WHERE (status = 'needs_review' OR (status = 'error' AND reviewed_by IS NULL))
      ORDER BY created_at DESC 
      LIMIT 10
    `);
        console.log('\n=== Pending Review Items ===');
        console.table(pending);

    } catch (err) {
        console.error('Query error:', err.message);
    } finally {
        await connection.end();
    }
}

run();
