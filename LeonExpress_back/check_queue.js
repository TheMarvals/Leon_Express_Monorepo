require('dotenv').config();
const { OcrProcessingQueue, Package } = require('./models');

(async () => {
  try {
    console.log('🔍 Verificando registros en ocr_processing_queue...\n');
    
    // Total de registros
    const total = await OcrProcessingQueue.count();
    console.log(`📊 Total de registros: ${total}`);
    
    // Registros pendientes de revisión
    const needsReview = await OcrProcessingQueue.count({
      where: { status: 'needs_review' }
    });
    console.log(`⏳ Pendientes de revisión (needs_review): ${needsReview}`);
    
    // Duplicados
    const duplicates = await OcrProcessingQueue.count({
      where: { is_duplicate: true }
    });
    console.log(`🔄 Total duplicados: ${duplicates}`);
    
    // Últimos 5 registros
    console.log('\n📋 Últimos 5 registros:\n');
    const records = await OcrProcessingQueue.findAll({
      order: [['created_at', 'DESC']],
      limit: 5,
      attributes: ['id', 'filename', 'status', 'is_duplicate', 'package_id', 'created_at']
    });
    
    records.forEach((record, index) => {
      console.log(`${index + 1}. ID: ${record.id}`);
      console.log(`   Archivo: ${record.filename}`);
      console.log(`   Status: ${record.status}`);
      console.log(`   Es duplicado: ${record.is_duplicate ? 'SÍ' : 'NO'}`);
      console.log(`   Package ID: ${record.package_id || 'N/A'}`);
      console.log(`   Creado: ${record.created_at}`);
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
