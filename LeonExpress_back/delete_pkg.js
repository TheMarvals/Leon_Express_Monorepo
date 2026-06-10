const { Package, OcrProcessingQueue, Delivery, AuditLog, RoutePackage, sequelize } = require('./models');

async function deletePackage() {
  const trackingCode = 'LE195137';
  try {
    const pkg = await Package.findOne({ where: { tracking_code: trackingCode } });
    if (!pkg) {
      console.log(`❌ Paquete ${trackingCode} no encontrado.`);
      return;
    }

    console.log(`🗑️ Eliminando Paquete ID: ${pkg.package_id}`);
    
    // Limpiar dependencias manuales (por si acaso no hay CASCADE)
    await OcrProcessingQueue.destroy({ where: { package_id: pkg.package_id } });
    await Delivery.destroy({ where: { package_id: pkg.package_id } });
    await AuditLog.destroy({ where: { target_id: pkg.package_id } });
    await RoutePackage.destroy({ where: { package_id: pkg.package_id } });
    
    // Eliminar el paquete
    await pkg.destroy();
    
    console.log(`✅ Paquete ${trackingCode} eliminado correctamente de la base de datos de producción.`);
  } catch (error) {
    console.error('Error al intentar eliminar el paquete:', error);
  } finally {
    await sequelize.close();
  }
}

deletePackage();
