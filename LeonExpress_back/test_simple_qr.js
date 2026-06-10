const { Jimp } = require('jimp');
const QrCodeReader = require('qrcode-reader');
const fs = require('fs');
const path = require('path');

async function testOnlyQrcodeReader() {
    const imagePath = path.join(__dirname, 'SCANNER/img1.jpg');

    console.log('🔍 PROBANDO SOLO CON QRCODE-READER (VERSIÓN CLÁSICA)\n');

    try {
        const image = await Jimp.read(imagePath);
        console.log(`📏 Dimensiones: ${image.bitmap.width}x${image.bitmap.height}`);

        const result = await new Promise((resolve) => {
            const qr = new QrCodeReader();
            qr.callback = (err, value) => {
                if (err) {
                    console.log('❌ Error:', err.message);
                    resolve(null);
                } else if (!value) {
                    resolve(null);
                } else {
                    resolve(value.result);
                }
            };
            qr.decode(image.bitmap);
        });

        if (result) {
            console.log('\n✅ QR ENCONTRADO con qrcode-reader clásico!');
            console.log(result.substring(0, 200));
        } else {
            console.log('\n❌ qrcode-reader no encontró QR');
            console.log('\n💡 Probando con resize...');

            // Resize y retry
            const resized = image.clone().resize({ w: 1000 });
            const result2 = await new Promise((resolve) => {
                const qr = new QrCodeReader();
                qr.callback = (err, value) => {
                    if (err || !value) resolve(null);
                    else resolve(value.result);
                };
                qr.decode(resized.bitmap);
            });

            if (result2) {
                console.log('✅ QR ENCONTRADO con resize!');
                console.log(result2.substring(0, 200));
            } else {
                console.log('❌ Tampoco funcionó con resize');
            }
        }

    } catch (err) {
        console.error('Error:', err.message);
        console.error(err.stack);
    }
}

testOnlyQrcodeReader().catch(console.error);
