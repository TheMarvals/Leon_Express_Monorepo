// models/ClientBillingSummary.js
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Ajusta la ruta según sea necesario

class ClientBillingSummary extends Model {}

ClientBillingSummary.init({
    client_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
    },
    client_name: DataTypes.STRING,
    total_billed: DataTypes.FLOAT,
    total_paid: DataTypes.FLOAT,
    total_outstanding: DataTypes.FLOAT,
}, {
    sequelize,
    modelName: 'ClientBillingSummary',
    tableName: 'vw_client_billing_summary',
    timestamps: false,
});

// Exportar el modelo
module.exports = ClientBillingSummary;
