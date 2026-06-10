// models/DriverEarningsSummary.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Ajusta la ruta según sea necesario

class DriverEarningsSummary extends Model {}

DriverEarningsSummary.init({
    user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
    },
    driver_name: DataTypes.STRING,
    total_payout_issued: DataTypes.FLOAT,
    total_payout_paid: DataTypes.FLOAT,
}, {
    sequelize,
    modelName: 'DriverEarningsSummary',
    tableName: 'vw_driver_earnings_summary',
    timestamps: false,
});

// Exportar el modelo
module.exports = DriverEarningsSummary;
