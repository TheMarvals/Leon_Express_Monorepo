const { Sequelize } = require('sequelize');
const dns = require('dns');

// Forzar resolución IPv4 si el host es localhost o 127.0.0.1
let dbHost = process.env.DB_HOST;
if (dbHost === 'localhost' || dbHost === '127.0.0.1') {
    dbHost = '127.0.0.1'; // Forzar IPv4 explícitamente
}

const sequelize = new Sequelize(
    process.env.DB_NAME,    
    process.env.DB_USER,    
    process.env.DB_PASSWORD,
    {
        host: dbHost,
        port: process.env.DB_PORT || 3306, 
        dialect: 'mysql',
        define: {
            timestamps: true,
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            underscored: true,
            freezeTableName: true
        },
        logging: false,
        pool: {
            max: 10,
            min: 0,
            acquire: 60000, // 60 segundos para adquirir conexión
            idle: 10000, // 10 segundos antes de cerrar conexión inactiva
        },
        dialectOptions: {
            connectTimeout: 60000, // 60 segundos timeout de conexión
            // Deshabilitar SSL completamente para conexiones locales (MariaDB/MySQL)
            ssl: false,
        },
        retry: {
            max: 3, // Reintentar hasta 3 veces
        },
    },
);

// Manejo de errores de conexión
sequelize.authenticate()
    .then(() => {
        console.log('✅ Conexión a la base de datos establecida correctamente.');
    })
    .catch(err => {
        console.error('❌ Error al conectar con la base de datos:', err.message);
        console.error('⚠️  El servidor continuará intentando reconectar...');
    });

module.exports = sequelize;