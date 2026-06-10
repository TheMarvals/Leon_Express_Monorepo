const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

const dbConfig = {
    host: '100.107.192.117',
    port: 3306,
    user: 'marval',
    password: 'ThomasMarval2105..',
    database: 'leon_express',
    multipleStatements: true
};

async function runMigration() {
    let connection;

    try {
        console.log('🔌 Conectando a la base de datos...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conexión exitosa\n');

        // Leer el archivo SQL
        const sqlFile = path.join(__dirname, '../migrations/add_change_fields_to_packages.sql');
        const sql = await fs.readFile(sqlFile, 'utf8');

        console.log('📝 Ejecutando migración...\n');
        console.log(sql);
        console.log('\n');

        // Ejecutar la migración
        await connection.query(sql);

        console.log('✅ Migración ejecutada exitosamente!');
        console.log('\n📊 Nuevos campos agregados a la tabla packages:');
        console.log('   - is_change (BOOLEAN)');
        console.log('   - change_received (BOOLEAN)');
        console.log('   - change_received_at (DATETIME)');
        console.log('   - change_received_by (VARCHAR(36))');
        console.log('   - change_notes (TEXT)');

    } catch (error) {
        console.error('\n❌ Error ejecutando migración:', error.message);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Conexión cerrada');
        }
    }
}

runMigration()
    .then(() => {
        console.log('\n🎉 Proceso completado');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 Error fatal:', error);
        process.exit(1);
    });
