const { Sequelize } = require('sequelize');
const dns = require('dns');

// Robust DB configuration parsing
let dbHost = (process.env.DB_HOST || '127.0.0.1').trim();
let dbPort = Number(process.env.DB_PORT) || 3306;
let dbName = process.env.DB_NAME;
let dbUser = process.env.DB_USER;
let dbPassword = process.env.DB_PASSWORD;

// Si DB_HOST viene como URL completa (mysql://user:pass@host:port/db)
if (dbHost.startsWith('mysql://') || dbHost.startsWith('mariadb://')) {
    try {
        const parsedUrl = new URL(dbHost);
        dbHost = parsedUrl.hostname;
        if (parsedUrl.port) dbPort = Number(parsedUrl.port);
        if (parsedUrl.username) dbUser = decodeURIComponent(parsedUrl.username);
        if (parsedUrl.password) dbPassword = decodeURIComponent(parsedUrl.password);
        if (parsedUrl.pathname && parsedUrl.pathname.length > 1) {
            dbName = parsedUrl.pathname.replace(/^\//, '');
        }
    } catch (e) {
        console.warn('⚠️ No se pudo parsear DB_HOST como URL:', e.message);
    }
}

// Si dbHost contiene puerto (ej: 65.75.201.175:3306 o db.server:3306)
if (typeof dbHost === 'string' && dbHost.includes(':')) {
    const parts = dbHost.split(':');
    dbHost = parts[0];
    if (parts[1] && !isNaN(Number(parts[1]))) {
        dbPort = Number(parts[1]);
    }
}

// Forzar resolución IPv4 si el host es localhost o 127.0.0.1
if (dbHost === 'localhost' || dbHost === '127.0.0.1') {
    dbHost = '127.0.0.1';
}

const sequelize = new Sequelize(
    dbName,    
    dbUser,    
    dbPassword,
    {
        host: dbHost,
        port: dbPort, 
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