const fs = require('fs').promises;
const path = require('path');
const { extractData, shouldAutoApprove } = require('../utils/smartOcrParser');

async function testParsers() {
  console.log('\n🧪 TESTING SMART OCR PARSERS\n');
  console.log('='.repeat(80));
  
  // Cargar resultados OCR de las etiquetas de referencia
  const resultsPath = path.join(__dirname, '..', 'SCANNER', 'ocr_analysis_results.json');
  const ocrResults = JSON.parse(await fs.readFile(resultsPath, 'utf8'));
  
  for (const [filename, ocrText] of Object.entries(ocrResults)) {
    console.log(`\n📸 TESTING: ${filename}`);
    console.log('-'.repeat(80));
    
    // Extraer datos
    const extracted = extractData(ocrText);
    
    // Mostrar resultados
    console.log(`\n🔍 Parser usado: ${extracted.parser_used}`);
    console.log(`📊 Confianza general: ${extracted.overall_confidence}%`);
    console.log(`📋 Campos extraídos: ${extracted.fields_extracted}`);
    
    console.log('\n✅ DATOS EXTRAÍDOS:');
    Object.entries(extracted.data).forEach(([field, value]) => {
      const confidence = extracted.confidence[field] || 0;
      const emoji = confidence >= 80 ? '✅' : confidence >= 60 ? '⚠️' : '❌';
      console.log(`   ${emoji} ${field}: "${value}" (${confidence}%)`);
    });
    
    // Decisión automática
    const autoApprove = shouldAutoApprove(extracted);
    console.log(`\n🤖 DECISIÓN: ${autoApprove ? '✅ AUTO-APROBAR' : '⚠️ REQUIERE REVISIÓN'}`);
    
    if (!autoApprove) {
      console.log('   Razones:');
      if (extracted.overall_confidence < 80) {
        console.log(`   - Confianza general baja: ${extracted.overall_confidence}%`);
      }
      if (!extracted.data.recipient_name) {
        console.log('   - Falta nombre del destinatario');
      }
      if (!extracted.data.destination_address) {
        console.log('   - Falta dirección');
      }
    }
    
    console.log('\n' + '='.repeat(80));
  }
  
  console.log('\n✅ TESTING COMPLETADO\n');
}

testParsers().catch(console.error);
