const fs = require('fs').promises;
const { Jimp } = require('jimp');
const QrCodeReader = require('qrcode-reader');
const jsQR = require('jsqr');

const sharp = require('sharp');

/**
 * Decodifica un código QR de una imagen enviada como buffer/base64
 * Intenta múltiples pre-procesamientos para mejorar la lectura en fotos difíciles
 */
async function decodeQRFromImage(imageInput) {
  try {
    let imageBuffer;
    if (typeof imageInput === 'string') {
      if (imageInput.startsWith('data:')) {
        imageBuffer = Buffer.from(imageInput.split(',')[1], 'base64');
      } else if (imageInput.startsWith('/')) {
        imageBuffer = await fs.readFile(imageInput);
      } else {
        imageBuffer = Buffer.from(imageInput, 'base64');
      }
    } else {
      imageBuffer = imageInput;
    }

    // Estrategia: Intentar múltiples versiones de la imagen
    const attempts = [
      // 1. Original (re-escalado para nitidez)
      { name: 'Original', processor: (s) => s.resize(1200, 1200, { fit: 'inside' }) },
      // 2. Escala de grises + Contraste alto
      { name: 'Grayscale + Contrast', processor: (s) => s.resize(1200, 1200, { fit: 'inside' }).grayscale().linear(1.5, -0.2) },
      // 3. Umbralización (Threshold) - bueno para QR ruidosos
      { name: 'Threshold', processor: (s) => s.resize(1200, 1200, { fit: 'inside' }).grayscale().threshold(128) },
      // 4. Sharpen (Enfocar)
      { name: 'Sharpen', processor: (s) => s.resize(1200, 1200, { fit: 'inside' }).sharpen() }
    ];

    for (const attempt of attempts) {
      try {
        const processedBuffer = await attempt.processor(sharp(imageBuffer)).toBuffer();
        const { data, info } = await sharp(processedBuffer)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const code = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
          inversionAttempts: "attemptBoth",
        });

        if (code && code.data) {
          console.log(`✅ QR decodificado exitosamente usando estrategia: ${attempt.name}`);
          return code.data;
        }
      } catch (err) {
        console.warn(`⚠️ Error en intento QR (${attempt.name}): ${err.message}`);
      }
    }

    // Fallback: Jimp + qrcode-reader (el método antiguo por si acaso)
    const jimpImage = await Jimp.read(imageBuffer);
    return new Promise((resolve) => {
      const qrBody = new QrCodeReader();
      qrBody.callback = (err, result) => {
        if (err || !result) {
          resolve(null);
        } else {
          console.log(`✅ QR decodificado usando fallback Jimp/qrcode-reader`);
          resolve(result.result);
        }
      };
      qrBody.decode(jimpImage.bitmap);
    });

  } catch (error) {
    console.error(`❌ Error fatal al decodificar QR:`, error.message);
    return null;
  }
}

/**
 * Helper: Verifica si un código de tracking corresponde a un formato de MercadoLibre Chile
 */
function isMLTrackingCode(code) {
  if (!code) return false;
  const clean = String(code).replace(/[\s-]/g, '');
  return /^(4\d{10}|3\d{9,10}|2[1-9]\d{10,14})$/.test(clean);
}

/**
 * Extrae el código de tracking externo del contenido de un QR code
 */
function extractTrackingCodeFromQR(qrContent) {
  if (!qrContent) return null;

  qrContent = String(qrContent).trim();
  console.log(`🔍 Analizando contenido del QR: "${qrContent}"`);

  let jsonData = null;
  let genericCandidate = null;

  // ESTRATEGIA JSON: Mercado Libre suele enviar JSON
  try {
    const cleanedContent = qrContent.replace(/^[^{]*/, '').replace(/[^}]*$/, '');
    if (cleanedContent.startsWith('{') && cleanedContent.endsWith('}')) {
      jsonData = JSON.parse(cleanedContent);
      console.log("✅ QR contiene JSON válido");
    }
  } catch (e) {
    // No es JSON válido
  }

  if (jsonData) {
    // 1. Prioridad Máxima: Campo ID que sea ML
    if (jsonData.id && isMLTrackingCode(jsonData.id)) {
      const val = String(jsonData.id);
      console.log(`✅ ID Mercado Libre encontrado en JSON QR: ${val}`);
      return val;
    }

    // 2. Búsqueda exhaustiva en TODO el JSON por si el campo tiene otro nombre
    for (const key in jsonData) {
      const val = String(jsonData[key]);
      if (isMLTrackingCode(val)) {
        console.log(`✅ Código ML encontrado en JSON QR (campo personalizado '${key}'): ${val}`);
        return val;
      }
    }

    // 3. Otros campos comunes (como respaldo)
    const mlFields = ['shipment_id', 'shipmentId', 'tracking_code', 'trackingCode', 'envio', 'venta_id', 'order_id'];
    for (const field of mlFields) {
      if (jsonData[field] && isMLTrackingCode(jsonData[field])) {
        const val = String(jsonData[field]);
        console.log(`✅ Código ML encontrado en JSON QR (campo ${field}): ${val}`);
        return val;
      }
    }

    // Guardar el ID como candidato secundario (podría ser un 2000...)
    if (jsonData.id) genericCandidate = String(jsonData.id);
  }

  // ESTRATEGIA REGEX: Buscar patrones ML en el texto plano (con límites de palabra/número)
  const mlPattern = /\b(?:4\s*[5-9](?:\s*\d){9,11}|3\s*\d(?:\s*\d){8,10}|2\s*[1-9](?:\s*\d){10,14})\b/;
  const mlMatch = qrContent.match(mlPattern);
  if (mlMatch) {
    const val = mlMatch[0].replace(/\s+/g, '');
    console.log(`✅ Tracking ML detectado en texto plano del QR: ${val}`);
    return val;
  }

  // ESTRATEGIA URL: Buscar en URLs de tracking
  const urlPatterns = [
    /mercadolibre[^/]*\/tracking\/(\d+)/i,
    /tracking[\/=](\d+)/i,
    /form\.jotform\.com\/.*\[CODIGO\]=([a-zA-Z0-9-]+)/i, // JotForm específico Cruzec
  ];
  for (const pattern of urlPatterns) {
    const match = qrContent.match(pattern);
    if (match && match[1]) {
      // Limpiar el código extraído (a veces viene con prefijos como fcfc81fc-)
      let val = match[1];
      // Si contiene un guión, tomar lo que sigue al último guión si es numérico y largo
      if (val.includes('-')) {
        const parts = val.split('-');
        const lastPart = parts[parts.length - 1];
        if (/^\d+$/.test(lastPart) && lastPart.length > 8) {
          val = lastPart;
        }
      }

      console.log(`✅ Código extraído de URL en QR: ${val}`);
      return val;
    }
  }

  // ESTRATEGIA CARRIERS ALTERNATIVOS: Buscar patrones conocidos (Cruzec, etc.)
  const altPatterns = [
    /\b(2000(?:\s*\d){12,16})\b/,      // CRUZEC (directo)
    /Venta[:\s]*((?:\d\s*){16,20})/i,  // CRUZEC (explícito)
  ];
  for (const pattern of altPatterns) {
    const match = qrContent.match(pattern);
    if (match && match[1]) {
      const val = match[1].replace(/\s+/g, '');
      console.log(`✅ Código de carrier secundario detectado en QR: ${val}`);
      return val;
    }
  }

  // ÚLTIMO RECURSO JSON: Si teníamos un ID genérico en el JSON y nada de arriba funcionó
  if (genericCandidate) {
    console.log(`✅ Usando ID genérico del JSON QR: ${genericCandidate}`);
    return genericCandidate;
  }

  // ESTRATEGIA NUMÉRICA PURA
  const onlyNumbers = qrContent.replace(/\D/g, '');
  if (onlyNumbers.length >= 8 && onlyNumbers.length <= 22) {
    console.log(`✅ Código numérico crudo detectado en QR: ${onlyNumbers}`);
    return onlyNumbers;
  }

  console.log(`❌ No se pudo extraer código de tracking del QR`);
  return null;
}

module.exports = {
  decodeQRFromImage,
  extractTrackingCodeFromQR
};
