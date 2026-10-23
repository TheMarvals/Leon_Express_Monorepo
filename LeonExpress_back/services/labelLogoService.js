'use strict';
const sharp = require('sharp');
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

async function normalizeLabelLogo(file) {
  if (!file?.buffer?.length || file.buffer.length > MAX_LOGO_BYTES) {
    throw Object.assign(new Error('Selecciona un logo PNG, JPG o WebP de hasta 2 MB.'), { status: 400 });
  }
  try {
    const bytes = file.buffer;
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const isWebp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!isPng && !isJpeg && !isWebp) throw new Error('Formato inválido');
    const image = sharp(file.buffer, { limitInputPixels: 16000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Formato inválido');
    // Decodificar y reexportar: no conservar archivos activos ni metadatos del original.
    const normalized = await image.rotate().resize(900, 450, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).grayscale().png().toBuffer();
    return `data:image/png;base64,${normalized.toString('base64')}`;
  } catch {
    throw Object.assign(new Error('El logo debe ser una imagen PNG, JPG o WebP válida, sin animación y de hasta 16 megapíxeles.'), { status: 400 });
  }
}

module.exports = { MAX_LOGO_BYTES, normalizeLabelLogo };
