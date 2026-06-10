const { Package, OcrProcessingQueue, User, sequelize } = require('./models');

async function run() {
  try {
    const extTracking = '3229233889';
    console.log("Buscando paquetes con external_tracking_code:", extTracking);
    
    let pkgs = await Package.findAll({
      where: { external_tracking_code: extTracking }
    });
    
    console.log(`Encontrados ${pkgs.length} paquetes.`);
    
    for (const pkg of pkgs) {
      console.log(`\nPaquete ID: ${pkg.package_id} | Tracking: ${pkg.tracking_code} | Estado: ${pkg.status}`);
      
      // OCR Queue
      const ocr = await OcrProcessingQueue.findOne({ where: { package_id: pkg.package_id } });
      if (ocr) {
        let reviewerName = 'Desconocido/Sistema (Auto-aprobado)';
        if (ocr.reviewed_by) {
            const user = await User.findByPk(ocr.reviewed_by);
            reviewerName = user ? user.full_name : ocr.reviewed_by;
        }
        console.log(` -> OCR Revisado por: ${reviewerName} en ${ocr.reviewed_at}`);
        console.log(` -> OCR Auto_approved: ${ocr.auto_approved}`);
        console.log(` -> OCR Image: ${ocr.image_path}`);
      } else {
        console.log(` -> No tiene registro en OCR Queue (creación manual?).`);
      }
    }
    
    console.log("\nBuscando a Maximiliano Arancibia...");
    const { Op } = require('sequelize');
    const maxPkgs = await Package.findAll({
      where: { 
        recipient_name: { [Op.like]: '%Maximiliano%Arancibia%' }
      }
    });
    console.log(`Encontrados ${maxPkgs.length} paquetes de Maximiliano.`);
    for (const pkg of maxPkgs) {
      console.log(`\nPaquete ID: ${pkg.package_id} | Tracking: ${pkg.tracking_code} | External: ${pkg.external_tracking_code} | Estado: ${pkg.status}`);
      const ocr = await OcrProcessingQueue.findOne({ where: { package_id: pkg.package_id } });
      if (ocr) {
        let reviewerName = 'Desconocido/Sistema';
        if (ocr.reviewed_by) {
            const user = await User.findByPk(ocr.reviewed_by);
            reviewerName = user ? user.full_name : ocr.reviewed_by;
        }
        console.log(` -> OCR Revisado por: ${reviewerName} en ${ocr.reviewed_at}`);
        console.log(` -> OCR Image: ${ocr.image_path}`);
      } else {
          console.log(` -> No tiene registro en OCR Queue (creación manual?).`);
      }
    }
    
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await sequelize.close();
  }
}

run();
