const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { decodeQRFromImage, extractTrackingCodeFromQR } = require('./utils/qrDecoder');
const { extractData } = require('./utils/smartOcrParser');

// Simulamos el OCR que daría una imagen borrosa para probar las "estrategias de rescate"
const MOCK_OCR_DATA = {
    "label_1770069811828_4.jpg": "Venta ID: 2000009545954713\nEnvio Flex\nEntrega: 10-Oct\nDestinatario: VICTOR ARIAS FERNANDEZ\nDireccion: Jose Joaquin Perez 4417\nReferencia: Portin Gris\nEnvio: 4 5 6 6 0 2 1 8 5 1 7"
};

async function testRescueStrategies() {
    const scannerDir = path.join(__dirname, 'SCANNER');
    const files = fs.readdirSync(scannerDir).filter(f => f.startsWith('label_') && f.endsWith('.jpg'));

    console.log('🧪 PROBANDO ESTRATEGIAS DE RESCATE (ML vs 2000)\n');

    for (const file of files) {
        console.log(`\n--- ARCHIVO: ${file} ---`);
        const imagePath = path.join(scannerDir, file);

        try {
            const optimizedBuffer = await sharp(imagePath)
                .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();

            const base64 = `data:image/jpeg;base64,${optimizedBuffer.toString('base64')}`;

            // 1. Decodificación REAL del QR
            console.log('📱 Intentando decodificar QR...');
            const rawQrContent = await decodeQRFromImage(base64);
            const qrTracking = extractTrackingCodeFromQR(rawQrContent);
            console.log(`📡 Resultado QR: ${qrTracking || 'No detectado'}`);

            // 2. Extracción con OCR (Usando mock para ver si rescata el 45 del texto)
            const ocrText = MOCK_OCR_DATA[file] || "Texto OCR no disponible";
            console.log('\n📝 Texto OCR detectado (simulado):');
            console.log(ocrText);

            console.log('\n⚙️ Ejecutando extractData con prioridad de rescate...');
            const result = extractData(ocrText, qrTracking);

            console.log(`\n🎯 Resultado Final:`);
            console.log(`   - Parser: ${result.parser_used}`);
            console.log(`   - ID Externo: ${result.data.external_tracking_code}`);
            console.log(`   - Origen: ${result.debug?.tracking_source || 'N/A'}`);

            if (result.data.external_tracking_code?.startsWith('4')) {
                console.log('\n✅ ÉXITO: Se priorizó el código de Mercado Libre sobre el 2000.');
            } else {
                console.error('\n❌ FALLO: Sigue tomando el código 2000.');
            }

        } catch (err) {
            console.error(`❌ Error:`, err.message);
        }
        console.log('------------------------------------------');
    }
}

testRescueStrategies().catch(console.error);
