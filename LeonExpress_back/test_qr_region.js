const fs = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

async function inspectQRRegion() {
    const imagePath = path.join(__dirname, 'SCANNER', 'ML.jpg');

    console.log('🔍 INSPECCIONANDO IMAGEN ML.jpg\n');

    try {
        const image = await Jimp.read(imagePath);
        console.log(`📏 Dimensiones: ${image.bitmap.width}x${image.bitmap.height}`);
        console.log(`🎨 Formato: ${image.getMIME()}`);

        // Las etiquetas de ML suelen tener el QR en la parte inferior izquierda
        // Vamos a extraer solo esa región para debugging
        const qrRegionWidth = Math.floor(image.bitmap.width * 0.4);
        const qrRegionHeight = Math.floor(image.bitmap.height * 0.3);
        const qrRegionX = Math.floor(image.bitmap.width * 0.05);
        const qrRegionY = Math.floor(image.bitmap.height * 0.6);

        console.log(`\n📍 Extrayendo región probable del QR:`);
        console.log(`   X: ${qrRegionX}, Y: ${qrRegionY}`);
        console.log(`   Ancho: ${qrRegionWidth}, Alto: ${qrRegionHeight}`);

        const qrCrop = image.clone()
            .crop({ x: qrRegionX, y: qrRegionY, w: qrRegionWidth, h: qrRegionHeight });

        const outputPath = path.join(__dirname, 'SCANNER', 'ML_qr_region.jpg');
        await qrCrop.write(outputPath);

        console.log(`\n✅ Región QR guardada en: ${outputPath}`);
        console.log(`   Dimensiones de región: ${qrCrop.bitmap.width}x${qrCrop.bitmap.height}`);

        // Ahora vamos a intentar decodificar esta región específica
        const QrCodeReader = require('qrcode-reader');
        const jsQR = require('jsqr');

        console.log('\n📱 Intentando decodificar región QR con jsQR...');
        const imageData = new Uint8ClampedArray(qrCrop.bitmap.data);
        const code = jsQR(imageData, qrCrop.bitmap.width, qrCrop.bitmap.height, {
            inversionAttempts: "attemptBoth",
        });

        if (code) {
            console.log('✅ ¡QR DETECTADO CON JSQR!');
            console.log(`Contenido: ${code.data.substring(0, 200)}`);
        } else {
            console.log('❌ jsQR no detectó QR en la región');

            console.log('\n📱 Intentando con qrcode-reader...');
            const result = await new Promise((resolve) => {
                const qr = new QrCodeReader();
                qr.callback = (err, value) => {
                    if (err || !value) {
                        resolve(null);
                    } else {
                        resolve(value.result);
                    }
                };
                qr.decode(qrCrop.bitmap);
            });

            if (result) {
                console.log('✅ ¡QR DETECTADO CON QRCODE-READER!');
                console.log(`Contenido: ${result.substring(0, 200)}`);
            } else {
                console.log('❌ qrcode-reader tampoco detectó QR');
                console.log('\n💡 Posibles causas:');
                console.log('   1. El QR está en otra posición de la imagen');
                console.log('   2. El QR necesita más preprocessing (contraste, escala de grises...)');
                console.log('   3. La resolución es demasiado alta o baja');
            }
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err.stack);
    }
}

inspectQRRegion().catch(console.error);
