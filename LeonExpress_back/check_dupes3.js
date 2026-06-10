const { Package, OcrProcessingQueue, User, sequelize } = require('./models');

async function run() {
  try {
    const extTracking = '3229233889';
    console.log("== TRACKING EXTERNO 3229233889 ==");
    let pkgs = await Package.findAll({ where: { external_tracking_code: extTracking } });
    for (const pkg of pkgs) {
      console.log(`Pkg ID: ${pkg.package_id} | Tracking: ${pkg.tracking_code} | Estado: ${pkg.status}`);
      const ocr = await OcrProcessingQueue.findOne({ where: { package_id: pkg.package_id } });
      if (ocr) {
        let name = "Ninguno";
        if (ocr.reviewed_by) {
            const user = await User.findByPk(ocr.reviewed_by);
            name = user ? user.full_name : ocr.reviewed_by;
        }
        console.log(` => OCR ID: ${ocr.id} | reviewed_by: ${name} | auto_approved: ${ocr.auto_approved} | created_at: ${ocr.created_at}`);
      }
    }
    
    console.log("\n== DESTINATARIO MAXIMILIANO ARANCIBIA ==");
    const { Op } = require('sequelize');
    const maxPkgs = await Package.findAll({ where: { recipient_name: { [Op.like]: '%Maximiliano%Arancibia%' } } });
    for (const pkg of maxPkgs) {
      console.log(`Pkg ID: ${pkg.package_id} | Tracking: ${pkg.tracking_code} | Ext: ${pkg.external_tracking_code} | Estado: ${pkg.status}`);
      const ocr = await OcrProcessingQueue.findOne({ where: { package_id: pkg.package_id } });
      if (ocr) {
        let name = "Ninguno";
        if (ocr.reviewed_by) {
            const user = await User.findByPk(ocr.reviewed_by);
            name = user ? user.full_name : ocr.reviewed_by;
        }
        console.log(` => OCR ID: ${ocr.id} | reviewed_by: ${name} | auto_approved: ${ocr.auto_approved} | created_at: ${ocr.created_at}`);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await sequelize.close();
  }
}
run();
