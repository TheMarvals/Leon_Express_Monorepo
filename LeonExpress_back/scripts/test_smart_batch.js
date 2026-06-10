#!/usr/bin/env node

/**
 * Script de prueba del sistema Smart Batch OCR
 * Simula la subida de un batch de imágenes
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:4100/api';
const SCANNER_DIR = path.join(__dirname, '..', 'SCANNER');

async function testSmartBatch() {
  console.log('🧪 Iniciando prueba del Smart Batch OCR...\n');

  try {
    // 1. Verificar que el API esté disponible
    console.log('1️⃣ Verificando API...');
    const statsResponse = await axios.get(`${API_URL}/smart-batch/stats`);
    console.log('✅ API respondiendo:', statsResponse.data);
    console.log('');

    // 2. Leer imágenes del directorio SCANNER
    console.log('2️⃣ Buscando imágenes de prueba...');
    const files = fs.readdirSync(SCANNER_DIR).filter(f => 
      f.match(/\.(jpg|jpeg|png)$/i)
    );
    
    if (files.length === 0) {
      console.log('❌ No se encontraron imágenes en SCANNER/');
      return;
    }
    
    console.log(`✅ Encontradas ${files.length} imágenes:`, files);
    console.log('');

    // 3. Convertir imágenes a base64
    console.log('3️⃣ Convirtiendo imágenes a base64...');
    const images = files.slice(0, 2).map(file => { // Solo 2 para la prueba
      const filePath = path.join(SCANNER_DIR, file);
      const imageBuffer = fs.readFileSync(filePath);
      return imageBuffer.toString('base64');
    });
    console.log(`✅ ${images.length} imágenes convertidas`);
    console.log('');

    // 4. Crear un pickup_id de prueba (usar uno existente en tu BD)
    const pickup_id = 'test-pickup-' + Date.now();
    console.log('4️⃣ Usando pickup_id:', pickup_id);
    console.log('⚠️  NOTA: Debes usar un pickup_id real de tu BD para que funcione');
    console.log('');

    // 5. Subir el batch
    console.log('5️⃣ Subiendo batch al servidor...');
    const uploadResponse = await axios.post(`${API_URL}/smart-batch/upload`, {
      pickup_id: pickup_id,
      images: images
    });
    
    const { batch_id } = uploadResponse.data;
    console.log('✅ Batch subido exitosamente!');
    console.log('📦 Batch ID:', batch_id);
    console.log('');

    // 6. Polling del estado
    console.log('6️⃣ Monitoreando procesamiento...');
    let completed = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await axios.get(`${API_URL}/smart-batch/${batch_id}/status`);
      const status = statusResponse.data;
      
      attempts++;
      console.log(`   [${attempts}] Procesadas: ${status.processed}/${status.total_images} | Auto: ${status.auto_approved} | Revisar: ${status.needs_review} | Errores: ${status.errors}`);
      
      if (status.processed === status.total_images) {
        completed = true;
        console.log('');
        console.log('✅ Procesamiento completado!');
        console.log('');
        console.log('📊 RESULTADOS FINALES:');
        console.log('   Total imágenes:', status.total_images);
        console.log('   Auto-aprobados:', status.auto_approved);
        console.log('   Necesitan revisión:', status.needs_review);
        console.log('   Errores:', status.errors);
        console.log('   Estado:', status.status);
        console.log('');
        
        // Mostrar detalles de cada imagen
        if (status.items && status.items.length > 0) {
          console.log('📝 DETALLES DE CADA IMAGEN:');
          status.items.forEach((item, idx) => {
            console.log(`\n   Imagen ${idx + 1}:`);
            console.log(`   - Estado: ${item.status}`);
            console.log(`   - Parser: ${item.parser_used || 'N/A'}`);
            console.log(`   - Confianza: ${item.overall_confidence || 0}%`);
            console.log(`   - Campos: ${item.fields_extracted || 0}`);
            console.log(`   - Auto-aprobado: ${item.auto_approved ? 'SÍ' : 'NO'}`);
            
            if (item.extracted_data) {
              console.log('   - Datos extraídos:', JSON.stringify(item.extracted_data, null, 4).substring(0, 200) + '...');
            }
            
            if (item.error_message) {
              console.log('   - Error:', item.error_message);
            }
          });
        }
      }
    }

    if (!completed) {
      console.log('⚠️  Timeout: El procesamiento tomó demasiado tiempo');
    }

    console.log('\n🎉 Prueba completada!');

  } catch (error) {
    console.error('❌ Error en la prueba:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Detalles:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Ejecutar prueba
testSmartBatch();
