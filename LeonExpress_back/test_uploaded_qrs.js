const fs = require('fs');
const path = require('path');
const { decodeQRFromImage, extractTrackingCodeFromQR } = require('./utils/qrDecoder');

async function testUploadedQRs() {
    const tests = [
        { file: 'SCANNER/cruzec_qr.png', expected: 'Cruzec con JotForm URL' },
        { file: 'SCANNER/ml_qr.png', expected: 'Mercado Libre con JSON' },
    ];

    console.log('🚀 PROBANDO QR CODES DE IMÁGENES SUBIDAS\n');

    for (const test of tests) {
        const imagePath = path.join(__dirname, test.file);

        if (!fs.existsSync(imagePath)) {
            console.log(`⚠️ Archivo ${test.file} no existe`);
            continue;
        }

        console.log(`\n${'='.repeat(70)}`);
        console.log(`📸 ARCHIVO: ${test.file}`);
        console.log(`📋 ESPERADO: ${test.expected}`);
        console.log('='.repeat(70));

        try {
            // Leer imagen
            const imageBuffer = fs.readFileSync(imagePath);

            // Decodificar QR
            console.log('\n📱 Decodificando QR...');
            const rawQrContent = await decodeQRFromImage(imageBuffer);

            if (rawQrContent) {
                console.log(`\n✅ QR DETECTADO!`);
                console.log(`📦 Contenido (primeros 300 caracteres):`);
                console.log(rawQrContent.substring(0, 300));

                // Extraer tracking code
                console.log(`\n🔍 Extrayendo tracking code...`);
                const trackingCode = extractTrackingCodeFromQR(rawQrContent);

                console.log(`\n🎯 RESULTADO FINAL:`);
                console.log(`   Tracking Code: ${trackingCode || 'NO EXTRAÍDO'}`);

                if (trackingCode) {
                    if (trackingCode.startsWith('2000')) {
                        console.log(`   Tipo: ✅ Cruzec (${trackingCode.length} dígitos)`);
                    } else if (trackingCode.startsWith('45') || trackingCode.startsWith('46')) {
                        console.log(`   Tipo: ✅ Mercado Libre (${trackingCode.length} dígitos)`);
                    } else {
                        console.log(`   Tipo: ⚠️ Otro (${trackingCode.length} caracteres)`);
                    }
                }
            } else {
                console.log('\n❌ NO SE DETECTÓ QR CODE');
            }

        } catch (err) {
            console.error(`\n❌ ERROR: ${err.message}`);
        }
    }
}

testUploadedQRs().catch(console.error);
