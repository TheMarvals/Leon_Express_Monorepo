require('dotenv').config();
const { sequelize, Pickup, Package, Route, RoutePackage, Delivery, DeliveryPhoto, Return, Cancellation, OcrProcessingQueue, AuditLog, Cost, Invoice, InvoiceItem, Payment, DriverPayout, PayoutItem, DriverPayment, BillingPeriod } = require('./models');

async function cleanDB() {
  try {
    console.log('🔄 Conectando a la base de datos del Backend...');
    await sequelize.authenticate();
    console.log('✅ Conexión establecida.');

    console.log('⚠️  Desactivando validación de llaves foráneas...');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0;');

    const modelsToClean = [
      { name: 'DeliveryPhoto', model: DeliveryPhoto },
      { name: 'Delivery', model: Delivery },
      { name: 'RoutePackage', model: RoutePackage },
      { name: 'Route', model: Route },
      { name: 'Return', model: Return },
      { name: 'Cancellation', model: Cancellation },
      { name: 'OcrProcessingQueue', model: OcrProcessingQueue },
      { name: 'Package', model: Package },
      { name: 'Pickup', model: Pickup },
      { name: 'AuditLog', model: AuditLog },
      { name: 'Cost', model: Cost },
      { name: 'InvoiceItem', model: InvoiceItem },
      { name: 'Payment', model: Payment },
      { name: 'Invoice', model: Invoice },
      { name: 'PayoutItem', model: PayoutItem },
      { name: 'DriverPayment', model: DriverPayment },
      { name: 'DriverPayout', model: DriverPayout },
      { name: 'BillingPeriod', model: BillingPeriod }
    ];

    for (const { name, model } of modelsToClean) {
      if (model) {
        console.log(`🗑️  Truncando tabla: ${name}...`);
        await model.destroy({ where: {}, truncate: true, cascade: true });
      } else {
        console.warn(`⚠️  Modelo ${name} no encontrado, saltando...`);
      }
    }

    console.log('🔒 Reactivando validación de llaves foráneas...');
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1;');

    console.log('✅ LIMPIEZA DE BASE DE DATOS (BACKEND) COMPLETADA.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
    process.exit(1);
  }
}

cleanDB();
