const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { decodeQRFromImage, extractTrackingCodeFromQR } = require('./utils/qrDecoder');
const { extractData } = require('./utils/smartOcrParser');

async function testFinalAlgorithm() {
    const scannerDir = path.join(__dirname, 'SCANNER');
    const files = fs.readdirSync(scannerDir).filter(f => f.startsWith('label_') && f.endsWith('.jpg'));

    console.log('🚀 PROBANDO SUPREMACÍA DEL QR (FINAL)\n');

    for (const file of files) {
        console.log(`\n--- ARCHIVO: ${file} ---`);
        const imagePath = path.join(scannerDir, file);

        try {
            // 1. Optimizar imagen
            const optimizedBuffer = await sharp(imagePath)
                .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
            const base64 = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;

            // 2. Decodificar QR
            console.log('📱 Decodificando QR...');
            const rawQrContent = await decodeQRFromImage(base64);
            let qrTracking = null;

            if (rawQrContent) {
                console.log(`   - QR RAW: ${rawQrContent.substring(0, 50)}...`);
                qrTracking = extractTrackingCodeFromQR(rawQrContent);
                console.log(`   - QR CLEAN TRACKING: ${qrTracking}`);
            } else {
                console.log('   - ❌ No se detectó QR');
            }

            // 3. Ejecutar Parser (sin simular OCR, pasando string vacío si quieres probar solo la "Supremacía")
            // Pero usaremos un texto dummy para verificar que NO lo usa si hay QR
            const dummyOcr = "Venta ID: 999999999999\nEnvio: 1 2 3 4 5 6 7 8 9\nMERCADO LIBRE";

            console.log('\n⚙️ Ejecutando extractData con OCR "basura" para probar bypass...');
            const result = extractData(dummyOcr, qrTracking);

            console.log(`\n🎯 Resultado Final:`);
            console.log(`   - ID Externo: ${result.data.external_tracking_code}`);
            console.log(`   - Fuente: ${result.tracking_candidates[0]?.source}`);

            if (qrTracking && result.data.external_tracking_code === qrTracking) {
                console.log('\n✅ ÉXITO: El sistema usó el código del QR y ignoró el OCR.');
            } else if (!qrTracking) {
                console.log('\n⚠️ ADVERTENCIA: No había QR, se usó lógica de respaldo.');
            } else {
                console.log('\n❌ FALLO: El sistema NO usó el código del QR.');
            }

        } catch (err) {
            console.error(`❌ Error:`, err.message);
        }
        console.log('------------------------------------------');
    }
}

testFinalAlgorithm().catch(console.error);
