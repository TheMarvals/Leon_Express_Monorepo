const { decodeQRFromImage, extractTrackingCodeFromQR } = require('../utils/qrDecoder');

async function test() {
    const imagePath = '/tmp/last_label.jpg';
    console.log(`Testing QR decoding for: ${imagePath}`);

    const qrContent = await decodeQRFromImage(imagePath);
    if (qrContent) {
        console.log('✅ QR Decoded Content:', qrContent);
        const tracking = extractTrackingCodeFromQR(qrContent);
        console.log('✅ Tracking Code:', tracking);
    } else {
        console.log('❌ Failed to decode QR');
    }
}

test();
