const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');

// Función para optimizar imagen antes de OCR
async function optimizeImage(imagePath) {
  try {
    const buffer = await sharp(imagePath)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    return buffer;
  } catch (error) {
    console.error('Error optimizando imagen:', error.message);
    return await fs.readFile(imagePath);
  }
}

// Función para analizar etiquetas de referencia
async function analyzeLabelImage(imagePath) {
  try {
    const imageBuffer = await optimizeImage(imagePath);
    const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    
    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (!apiKey) {
      throw new Error('La API Key de OCR.space no está configurada en el archivo .env');
    }
    const apiUrl = 'https://api.ocr.space/parse/image';
    const form = new FormData();
    
    form.append('base64Image', base64Image);
    form.append('language', 'spa');
    form.append('apikey', apiKey);
    form.append('detectOrientation', 'true');
    form.append('OCREngine', '2');
    
    const response = await axios.post(apiUrl, form, {
      headers: form.getHeaders(),
    });
    
    if (response.data.IsErroredOnProcessing) {
      throw new Error(response.data.ErrorMessage);
    }
    
    return response.data.ParsedResults?.[0]?.ParsedText || '';
  } catch (error) {
    console.error(`Error procesando ${imagePath}:`, error.message);
    return null;
  }
}

async function analyzeAllLabels() {
  const scannerDir = path.join(__dirname, '..', 'SCANNER');
  const files = await fs.readdir(scannerDir);
  const imageFiles = files.filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'));
  
  console.log(`\n🔍 Analizando ${imageFiles.length} etiquetas de referencia...\n`);
  
  const results = {};
  
  for (const file of imageFiles) {
    const filePath = path.join(scannerDir, file);
    console.log(`📸 Procesando: ${file}...`);
    
    const text = await analyzeLabelImage(filePath);
    
    if (text) {
      results[file] = text;
      console.log(`✅ Completado: ${file}`);
      console.log(`📝 Primeros 200 caracteres:\n${text.substring(0, 200)}...\n`);
    } else {
      console.log(`❌ Error procesando: ${file}\n`);
    }
    
    // Pausa para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Guardar resultados
  const outputPath = path.join(__dirname, '..', 'SCANNER', 'ocr_analysis_results.json');
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
  
  console.log(`\n✅ Análisis completo. Resultados guardados en: ${outputPath}`);
  
  return results;
}

// Ejecutar análisis
analyzeAllLabels().catch(console.error);
