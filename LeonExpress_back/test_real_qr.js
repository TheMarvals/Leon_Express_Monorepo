const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { decodeQRFromImage, extractTrackingCodeFromQR } = require('./utils/qrDecoder');
const { extractData } = require('./utils/smartOcrParser');

// Cargamos el OCR cacheado
const cachedOcr = JSON.parse(fs.readFileSync(path.join(__dirname, 'SCANNER/ocr_analysis_results.json'), 'utf8'));

async function testRealImages() {
    const scannerDir = path.join(__dirname, 'SCANNER');
    const files = fs.readdirSync(scannerDir).filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'));

    console.log('🚀 PROBANDO DECODIFICACIÓN REAL DE QR DESDE IMÁGENES\n');

    for (const file of files) {
        console.log(`\n--- ARCHIVO: ${file} ---`);
        const imagePath = path.join(scannerDir, file);

        try {
            // Optimizamos igual que en la app real
            const optimizedBuffer = await sharp(imagePath)
                .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();

            const base64 = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;

            // 1. Decodificación REAL del QR
            const rawQrContent = await decodeQRFromImage(base64);

            if (rawQrContent) {
                console.log(`📱 QR Crudo Detectado: ${rawQrContent}`);

                // 2. Extracción del Tracking del QR
                const qrTracking = extractTrackingCodeFromQR(rawQrContent);
                console.log(`✅ Tracking Final del QR: ${qrTracking}`);

                // 3. Simular extracción completa usando el OCR cacheado
                const ocrText = cachedOcr[file] || "";
                if (ocrText) {
                    const result = extractData(ocrText, qrTracking);
                    console.log(`🎯 Parser Usado: ${result.parser_used}`);
                    console.log(`📦 Resultado ID Externo: ${result.data.external_tracking_code}`);
                    console.log(`👤 Destinatario: ${result.data.recipient_name}`);
                }
            } else {
                console.log('❌ No se encontró QR en esta imagen o no se pudo decodificar.');
            }
        } catch (err) {
            console.error(`❌ Error procesando ${file}:`, err.message);
        }
        console.log('------------------------------------------');
    }
}

testRealImages().catch(console.error);
