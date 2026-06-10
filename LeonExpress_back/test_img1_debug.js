const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { Jimp } = require('jimp');
const QrCodeReader = require('qrcode-reader');
const jsQR = require('jsqr');

async function debugImg1() {
    const imagePath = path.join(__dirname, 'SCANNER', 'img1.jpg');

    console.log('🔍 DEBUG: img1.jpg\n');

    // Obtener metadata
    const metadata = await sharp(imagePath).metadata();
    console.log(`📏 Metadata: ${metadata.width}x${metadata.height}, formato: ${metadata.format}`);

    // Probar con diferentes variaciones
    console.log('\n1️⃣ Imagen original sin resize:');
    const originalBuffer = fs.readFileSync(imagePath);
    const base64Original = `data:image/jpeg;base64,${originalBuffer.toString('base64')}`;
    const result1 = await testDecode(base64Original, '  ');

    console.log('\n2️⃣ Con resize 2000px (como el test):');
    const resized2000 = await sharp(imagePath)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    const base64_2000 = `data:image/jpeg;base64,${resized2000.toString('base64')}`;
    const result2 = await testDecode(base64_2000, '  ');

    console.log('\n3️⃣ Con resize 1000px:');
    const resized1000 = await sharp(imagePath)
        .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
    const base64_1000 = `data:image/jpeg;base64,${resized1000.toString('base64')}`;
    const result3 = await testDecode(base64_1000, '  ');

    console.log('\n4️⃣ En escala de grises:');
    const grayscale = await sharp(imagePath)
        .grayscale()
        .resize(1500, 1500, { fit: 'inside' })
        .jpeg({ quality: 90 })
        .toBuffer();
    const base64_gray = `data:image/jpeg;base64,${grayscale.toString('base64')}`;
    const result4 = await testDecode(base64_gray, '  ');

    if (result1 || result2 || result3 || result4) {
        console.log('\n✅ SE ENCONTRÓ QR EN AL MENOS UNA VARIACIÓN');
    } else {
        console.log('\n❌ NO SE ENCONTRÓ QR EN NINGUNA VARIACIÓN');
    }
}

async function testDecode(base64Image, prefix = '') {
    try {
        const image = await Jimp.read(base64Image);
        const { width, height } = image.bitmap;

        // jsQR
        const imageData = new Uint8ClampedArray(image.bitmap.data);
        const code = jsQR(imageData, width, height, {
            inversionAttempts: "attemptBoth",
        });

        if (code) {
            console.log(`${prefix}✅ jsQR: ${code.data.substring(0, 50)}...`);
            return code.data;
        }

        // qrcode-reader
        const result = await new Promise((resolve) => {
            const qr = new QrCodeReader();
            qr.callback = (err, value) => {
                if (err || !value) resolve(null);
                else resolve(value.result);
            };
            qr.decode(image.bitmap);
        });

        if (result) {
            console.log(`${prefix}✅ qrcode-reader: ${result.substring(0, 50)}...`);
            return result;
        }

        console.log(`${prefix}❌ No detectado`);
        return null;
    } catch (err) {
        console.log(`${prefix}❌ Error: ${err.message}`);
        return null;
    }
}

debugImg1().catch(console.error);
