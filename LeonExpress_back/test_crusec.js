const fs = require('fs').promises;
const path = require('path');
const { extractData } = require('./utils/smartOcrParser');
const { decodeQRFromImage, extractTrackingCodeFromQR } = require('./utils/qrDecoder');

async function testCruzecLabel() {
    console.log('🧪 Probando etiqueta Cruzec...');

    // 1. Simular OCR del texto (lo que leería el OCR de la imagen crusec.jpeg)
    const simulatedOcrText = `
Crusec Espejo De Cuerpo Entero 160 X 50
Cm Anti Explosión Marco Negro. SKU:
ESPEJOENTERO160X50

Venta: 2000009974451129

CRUSEC Cam. Lo Echevers 550, B.14
Quilicura, RM +56 9 5875 0361

Enviado por LEON
Entregar: 12/11/2025

RM
Ñuñoa

Dirección: Av. Irarrázaval 1989, 7750000 Ñuñoa, Región
Metropolitana, Chile
Referencia: 2102 Torre A
Destinatario: Alberto Enrique Arriagada Ibacache
Celular: 966778639
ESCANEAR EL QR Y ENTREGAR
  `;

    // 2. Simular QR (lo que decodificaría el sistema del QR de esa imagen)
    const simulatedQrContent = "2000009974451129";
    const qrTrackingCode = extractTrackingCodeFromQR(simulatedQrContent);

    console.log(`📱 QR Decodificado: ${simulatedQrContent}`);
    console.log(`✅ Tracking Code de QR: ${qrTrackingCode}`);

    // 3. Procesar con el Smart Parser
    const extracted = extractData(simulatedOcrText, qrTrackingCode);

    console.log('\n📦 RESULTADO DE EXTRACCIÓN:');
    console.log(JSON.stringify(extracted.data, null, 2));
    console.log(`\n🎯 Parser usado: ${extracted.parser_used}`);
    console.log(`📊 Confianza: ${extracted.overall_confidence}%`);
}

testCruzecLabel().catch(console.error);
