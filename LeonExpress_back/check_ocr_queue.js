const { OcrProcessingQueue } = require('./models');

(async () => {
  try {
    const records = await OcrProcessingQueue.findAll({
      order: [['created_at', 'DESC']],
      limit: 5,
      attributes: [
        'id', 
        'filename', 
        'status', 
        'is_duplicate', 
        'duplicate_reason',
        'external_tracking_code',
        'created_at'
      ]
    });

    console.log('\n📊 Últimos 5 registros en ocr_processing_queue:\n');
    
    if (records.length === 0) {
      console.log('❌ No hay registros en la tabla');
    } else {
      records.forEach((r, i) => {
        console.log(`${i + 1}. ${r.filename}`);
        console.log(`   ID: ${r.id}`);
        console.log(`   Status: ${r.status}`);
        console.log(`   Duplicate: ${r.is_duplicate ? '⚠️  YES' : '✓ NO'}`);
        console.log(`   External Code: ${r.external_tracking_code}`);
        console.log(`   Created: ${r.created_at}`);
        if (r.is_duplicate) {
          console.log(`   Reason: ${r.duplicate_reason}`);
        }
        console.log('');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
