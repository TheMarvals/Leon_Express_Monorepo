// models/FullPackageJourney.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Asegúrate de que la ruta sea correcta

class FullPackageJourney extends Model {}

FullPackageJourney.init({
    package_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
    },
    tracking_code: DataTypes.STRING,
    package_status: DataTypes.STRING,
    client_name: DataTypes.STRING,
    client_price: DataTypes.FLOAT,
    delivery_cost: DataTypes.FLOAT,
    profit: DataTypes.FLOAT,
    destination_address: DataTypes.STRING,
    recipient_name: DataTypes.STRING,
    pickup_scheduled_date: DataTypes.DATE,
    pickup_driver: DataTypes.STRING,
    route_id: DataTypes.INTEGER,
    route_start_date: DataTypes.DATE,
    delivery_driver: DataTypes.STRING,
    status_at_delivery: DataTypes.STRING,
    delivery_attempt_date: DataTypes.DATE,
}, {
    sequelize,
    modelName: 'FullPackageJourney',
    tableName: 'vw_full_package_journey', // Nombre de la vista
    timestamps: false, // No hay timestamps en vistas
});

// Exportar el modelo
module.exports = FullPackageJourney;
