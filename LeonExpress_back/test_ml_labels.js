const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { decodeQRFromImage, extractTrackingCodeFromQR } = require('./utils/qrDecoder');
const { extractData } = require('./utils/smartOcrParser');

async function testMLLabels() {
    const scannerDir = path.join(__dirname, 'SCANNER');
    // Test específicamente con las etiquetas de Mercado Libre
    const mlFiles = ['ML.jpg', 'img1.jpg'];

    console.log('🧪 PROBANDO ETIQUETAS DE MERCADO LIBRE\n');

    for (const file of mlFiles) {
        const imagePath = path.join(scannerDir, file);

        if (!fs.existsSync(imagePath)) {
            console.log(`⚠️ Archivo ${file} no existe, saltando...`);
            continue;
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`📸 ARCHIVO: ${file}`);
        console.log('='.repeat(60));

        try {
            // 1. Leer imagen original
            const metadata = await sharp(imagePath).metadata();
            console.log(`📏 Resolución original: ${metadata.width}x${metadata.height}`);

            // 2. Optimizar imagen
            console.log('🔧 Optimizando imagen...');
            const optimizedBuffer = await sharp(imagePath)
                .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 90 })
                .toBuffer();
            const base64 = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;

            // 3. Decodificar QR
            console.log('\n📱 DECODIFICACIÓN DE QR:');
            const rawQrContent = await decodeQRFromImage(base64);

            if (rawQrContent) {
                console.log(`✅ QR RAW detectado (${rawQrContent.length} caracteres):`);
                console.log(rawQrContent);
                console.log('\n🔍 Extrayendo tracking code del QR...');
                const qrTracking = extractTrackingCodeFromQR(rawQrContent);
                console.log(`\n🎯 TRACKING DEL QR: ${qrTracking || 'NO EXTRAÍDO'}`);

                // 4. Simular OCR con texto dummy
                const dummyOcr = "Mercado Libre\nEnvio Flex\nVenta ID: 999999\nTracking: 111111";

                console.log('\n📋 PROCESAMIENTO CON SMART OCR:');
                const result = extractData(dummyOcr, qrTracking);

                console.log(`\n✅ RESULTADO FINAL:`);
                console.log(`   Parser: ${result.parser_used}`);
                console.log(`   Tracking Externo: ${result.data.external_tracking_code}`);
                console.log(`   Confianza: ${result.overall_confidence}%`);

                if (qrTracking && result.data.external_tracking_code === qrTracking) {
                    console.log('\n✅ ¡PERFECTO! El sistema usó el código del QR correctamente.');
                } else if (!qrTracking) {
                    console.log('\n❌ PROBLEMA: No se pudo leer el QR');
                } else {
                    console.log(`\n⚠️ ADVERTENCIA: QR detectado (${qrTracking}) pero el resultado final es diferente (${result.data.external_tracking_code})`);
                }
            } else {
                console.log('❌ No se detectó ningún QR en la imagen');
                console.log('\n🔍 Verificando si la imagen tiene suficiente resolución...');

                // Intentar con imagen sin resize
                console.log('Probando con imagen original sin resize...');
                const originalBase64 = `data:image/jpeg;base64,${fs.readFileSync(imagePath).toString('base64')}`;
                const rawQrOriginal = await decodeQRFromImage(originalBase64);

                if (rawQrOriginal) {
                    console.log('✅ QR detectado en imagen original (sin resize)');
                    console.log(rawQrOriginal.substring(0, 100) + '...');
                } else {
                    console.log('❌ Tampoco se detectó QR en imagen original');
                }
            }

        } catch (err) {
            console.error(`\n❌ ERROR: ${err.message}`);
            console.error(err.stack);
        }
    }
}

testMLLabels().catch(console.error);
