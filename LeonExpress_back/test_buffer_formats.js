const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function testBufferFormats() {
    const imagePath = path.join(__dirname, 'SCANNER/img1.jpg');

    console.log('🧪 PROBANDO DIFERENTES FORMATOS DE BUFFER PARA IMG1\n');

    // Formato 1: Como lo hacíamos antes (base64 string)
    console.log('1️⃣ Probando con base64 string:');
    const optimizedBuffer1 = await sharp(imagePath)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    const base64 = `data:image/jpeg;base64,${optimizedBuffer1.toString('base64')}`;

    const { decodeQRFromImage, extractTrackingCodeFromQR } = require('./utils/qrDecoder');
    const result1 = await decodeQRFromImage(base64);
    console.log(`   Resultado: ${result1 ? result1.substring(0, 50) + '...' : 'NULL'}\n`);

    // Formato 2: Directamente el buffer
    console.log('2️⃣ Probando con Buffer directo:');
    const result2 = await decodeQRFromImage(optimizedBuffer1);
    console.log(`   Resultado: ${result2 ? result2.substring(0, 50) + '...' : 'NULL'}\n`);

    // Formato 3: Path directo
    console.log('3️⃣ Probando con path file (sin sharp):');
    const fileBuffer = fs.readFileSync(imagePath);
    const result3 = await decodeQRFromImage(fileBuffer);
    console.log(`   Resultado: ${result3 ? result3.substring(0, 50) + '...' : 'NULL'}\n`);

    if (result1 || result2 || result3) {
        const finalResult = result1 || result2 || result3;
        console.log('\n✅ QR ENCONTRADO!');
        console.log('Contenido completo:');
        console.log(finalResult);

        const tracking = extractTrackingCodeFromQR(finalResult);
        console.log(`\n🎯 Tracking extraído: ${tracking}`);
    } else {
        console.log('\n❌ TODOS LOS FORMATOS FALLARON');
    }
}

testBufferFormats().catch(console.error);
