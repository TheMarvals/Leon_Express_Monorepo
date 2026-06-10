const fs = require('fs').promises;
const path = require('path');

// Lazy-loaded learning engine to avoid circular deps
let _learningEngine = null;
function getLearningEngine() {
  if (!_learningEngine) {
    try {
      _learningEngine = require('./ocrLearningEngine');
    } catch (err) {
      console.warn('⚠️ Learning engine not available:', err.message);
      _learningEngine = null;
    }
  }
  return _learningEngine;
}

/**
 * Sistema de parsers optimizados con manejo robusto de tracking codes
 */

// MEJORA: Patrones universales de tracking code como fallback (soportando espacios y pegados a texto)
const UNIVERSAL_TRACKING_PATTERNS = [
  /(4[5-9](?:\s*\d){9,11})/g,          // Mercado Libre/Flex/Envíos (starts with 45-49)
  /\b(2000(?:\s*\d){12,16})\b/g,       // CRUZEC
  /\b((?:\d\s*){12,18})\b/g,           // Otros largos
  /\b([A-Z]\s*(?:\d\s*){6,12})\b/g,     // Alfanuméricos (L123456)
  /\b((?:\d\s*){8,11})\b/g,            // Medianos
];

const labelParsers = {
  // Parser para etiquetas Mercado Libre (MUY ALTA PRIORIDAD)
  mercadoLibre: {
    name: 'Mercado Libre',
    priority: 1,
    detect: (text) => {
      const upper = text.toUpperCase();
      const hasMLKeywords = upper.includes('MERCADOLIBRE') ||
        upper.includes('MERCADO LIBRE') ||
        upper.includes('MERCADOENVIOS') ||
        upper.includes('ML CHILE') ||
        upper.includes('ENVIO TURBO') ||
        upper.includes('ENVÍO TURBO') ||
        /ENV[IÍO0]+ FLEX/i.test(upper) ||
        /ENV[IÍO0]+ TURBO/i.test(upper) ||
        upper.includes('FLEX') ||
        upper.includes('CHILE-FLEX') ||
        upper.includes('COMPRA #') ||
        (upper.includes('VENTA ID') && !upper.includes('CRUZEC'));

      // Si tiene un código que empieza por 45-49, es ML casi seguro (insensible a espacios)
      const hasMLCode = /4\s*[5-9](?:\s*\d){9,11}/.test(text);

      return hasMLKeywords || hasMLCode;
    },
    patterns: {
      recipient_name: /(?:Dest[A-Za-z]{3,10}|Nombre)\s*[:;\s]*([^\(\n#]+)/i,
      alt_recipient_name: /([A-Za-zÁÉÍÓÚÑáéíóúñ\s]+?)\s*\([A-Z0-9]{5,}\)/i,
      destination_address: /(?:D[ilr1It\.\s]*r?e[c\.,\s]+[il1I\s]+[oó0\s]+n|Direcci[oóeé]n|Destino)\s*[:;\s]*([\s\S]+?)(?=\s*(?:[Rr]e[tf][eé]r|Comuna|Tel|Cel|Fono|OBS|CP|Cod|SANTIAGO|REGION|Colina|$))/i,
      alt_address: /(?:D[ilr1It\.\s]*r?e[c\.,\s]+[il1I\s]+[oó0\s]+n|Direcci[oóeé]n|Destino)\s*[:;\s]*([A-ZÁÉÍÓÚÑ0-9\s#°\.]+)(?=\n|$)/i,
      alt_address2: /(?:RESIDENCIAL|COMERCIAL|EDIFICIO|CASA|OFICINA)\s*\n+([A-Za-zÁÉÍÓÚÑ0-9\s#°\.]+?)(?=\n|$|[Rr]e[tf][eé]r)/i,
      recipient_phone: /(?:Tel|Cel|Fono|Tel[eé]fono)\s*[:;\s]*(\+?56\s*9?\s*\d[\d\s]{7,12})/i,
      alt_phone: /\b(9\s*\d{8})\b/,
      external_tracking_code: /(?:Env[ií]o|Venta|ID|Ref|Orden)?\s*[:#\s]*\b(4[5-9](?:\s*\d){9,11})\b/i,
      alt_tracking_code: /\b(4[5-9](?:\s*\d){9,11})\b/,
      fallback_tracking: /\b(4[5-9](?:\s*\d){9,11})\b/i,
    }
  },

  // Parser para etiquetas CRUZEC
  cruzec: {
    name: 'CRUZEC',
    priority: 2,
    detect: (text) => {
      const upper = text.toUpperCase();
      // Excluir si parece Mercado Libre
      if (upper.includes('MERCADO LIBRE') || upper.includes('ENVIO TURBO') || upper.includes('FLEX')) return false;

      return upper.includes('CRUZEC') ||
        (upper.includes('VENTA') && /2000(?:\s*\d){12,16}/.test(text));
    },
    patterns: {
      recipient_name: /Dest[il]natar[il]o\s*[:;]\s*([^\n#]+)/i,
      destination_address: /(?:Direcci[oó]n|Direccion|D[il]recclon)\s*[:;]\s*([\s\S]+?)(?=\s*(?:Referencia|Comuna|Tel|Celular|Fono|CP|$))/i,
      recipient_phone: /(?:Celular|Tel[eé]fono)\s*[:;]\s*(\+?56\s*9?\s*\d[\d\s]{7,11})/i,
      alt_phone: /\b(9\d{8})\b/,
      external_tracking_code: /Venta\s*[:;]\s*(2000(?:\s*\d){12,16})/i,
      alt_tracking_code: /\b(2000(?:\s*\d){12,16})\b/,
    }
  },

  jumpseller: {
    name: 'Jumpseller',
    priority: 3,
    detect: (text) => {
      const upper = text.toUpperCase();
      return upper.includes('JUMP') || upper.includes('SELLER') || upper.includes('FUMP');
    },
    patterns: {
      recipient_name: /DESTINATAR[IL]O\s*[:;]\s*([^\n]+)/i,
      // BUSCAR DIRECCIÓN SOLO DESPUÉS DE DESTINATARIO (ignorando remitente)
      destination_address: /(?:DESTINATAR[IL]O[\s\S]*?)DIRECC[IL]ON\s*[:;]\s*([\s\S]+?)(?=\s*(?:Referencia|Comuna|FONO|OBS|$))/i,
      recipient_phone: /FONO\s*[:;]\s*([^\n+?]+?)(?=\n|$)/i,
      external_tracking_code: /(?:REF|ORDEN)\s*[:;]\s*((?:\d\s*){4,12})\b/i,
      alt_tracking_code: /\b((?:\d\s*){8,12})\b/,
    }
  },

  enviame: {
    name: 'ENVIAME',
    priority: 4,
    detect: (text) => {
      const upper = text.toUpperCase();
      // Evitar capturar Jumpseller si aparece la palabra
      if (upper.includes('JUMP') || upper.includes('SELLER')) return false;
      return upper.includes('ENVIAME') || upper.includes('DIRECTO') || upper.includes('COSTOO SEGUMIENTO');
    },
    patterns: {
      recipient_name: /(?:Dest[il]natar[il]o|Nombre|DEETIRATANTO|DESTINATARIO|NOMBRE)\s*[:;\s\n]+(?!(?:ENVIAME|SERVICIO|EXPRESS|DIRECTO))([^\n/\d]+?)(?=\s*(?:San|Av|Calle|Pje|Pasaje|Santa|Tel|\/|$))/i,
      alt_recipient_name: /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)\s*\/\s*Tel/i,
      recipient_phone: /(?:Tel\.?|Fono)\s*[:;\s]*(\+?56\s*9?\s*\d[\d\s]{7,10})/i,
      alt_phone: /(\+?56\s*9\s*\d{4}\s*\d{4})/,
      destination_address: /(?:DIRECCION|Direcci[oó]n|D[il]recclon)\s*[:;\s]*([^#]+?)(?=\s*(?:Santiago|Regi[oó]n|Comuna|Tel|Fono|OBS|OBSERVACION|$))/i,
      address_keyword: /(?:Av\.|Avenida|Calle|Pje|Pasaje|Santa|San|Calle|Gral|Blanco|An[íi]bal|Lota|Antonio|Pdte|Presidente)\s+([^\n,]+(?:,\s*[^\n]+)?)/i,
      fallback_address: /(?:[A-ZÁÉÍÓÚÑ][a-zñ]+\s+[A-ZÁÉÍÓÚÑ][a-zñ]+\n)([A-ZÁÉÍÓÚÑ0-9\s]+(?:#|\d+)[^\n]+)/i,
      external_tracking_code: /(?:COSTOO\s+SEGUMIENTO|N-J\s+de\s+orden|orden|DIRECTO)\s*[:;\s\n]*((?:\d\s*){10,12})/i,
      alt_tracking: /\b(301[46](?:\s*\d){6,8})\b/,
    }
  },

  leonImport: {
    name: 'Leon Import Acuerdo',
    priority: 5,
    detect: (text) => {
      const upper = text.toUpperCase();
      // Solo si es explícitamente un cambio o acuerdo, para no robar etiquetas de Enviame
      return upper.includes('CAMBIO #') || upper.includes('ACUERDO');
    },
    patterns: {
      recipient_name: /NOMBRE\s*[:;]\s*(.+?)(?=\s*(?:TEL[ÉE]FONO|CELULAR|PRODUCTO|DIRECCION|CAMBIO|ACUERDO|COMUNA|$))/i,
      recipient_phone: /TEL[ÉE]FONO\s*[:;]\s*(\+?56\s*\d[\d\s]+)/i,
      destination_address: /DIRECCION\s*[:;]\s*([^#]+?)(?=\s*(?:CAMBIO|ACUERDO|COMUNA|OBS|OBSERVACION|$))/i,
      fallback_address: /(?:SANTA\s+ISABEL|DIRECCION|D[il]recclon)\s*[:;\s]*([^#]+?)(?=\s*(?:OBS|COMUNA|OBSERVACION|$))/i,
      external_tracking_code: /(?:CAMBIO|ACUERDO)\s*#?\s*([A-Z]?\d+)/i,
      alt_tracking_code: /\b([A-Z]\s*(?:\d\s*){4,9})\b/i,
      fallback_tracking: /\b(\d{4,9})\b/,
    }
  },

  generic: {
    name: 'Generic',
    priority: 99,
    detect: () => true,
    patterns: {
      recipient_name: /(?:Nombre|Dest[il]natar[il]o|Señor\(a\))[:;\s]*([A-ZÁÉÍÓÚÑ\s]+?)(?=\s*Fono|\s*Tel|\s*Direcci[oó]n|$)/i,
      recipient_phone: /(?:Fono|Tel[eé]fono|Numero)[:;\s]*(\+?56\s*\d[\d\s-]{7,})/i,
      // MEJORA: Soportar multilinea
      destination_address: /(?:Direcci[oó]n|Direccion|D[il]recclon|Destino)[:;\s]*([\s\S]*?)(?=\n\s*(?:Fono|Tel|Cel|Observaci[oó]n|Comuna|CP)|$)/i,
      external_tracking_code: /(?:C[oó]digo|Venta|Despacho|Orden|REF)[:;\s]*([A-Z0-9]+)/i,
      alt_tracking_code: /\b((?:\d\s*){8,16})\b/,
    }
  },
};

/**
 * Helper: Verifica si un código de tracking corresponde a un formato de MercadoLibre Chile
 * (Empieza con 4 de 11 dígitos, con 3 de 10-11 dígitos, o con 2 (pero no 20) de 12-16 dígitos)
 */
function isMLTrackingCode(code) {
  if (!code) return false;
  const clean = code.replace(/[\s-]/g, '');
  return /^(4\d{10}|3\d{9,10}|2[1-9]\d{10,14})$/.test(clean);
}

/**
 * Selecciona el parser más apropiado basado en el texto OCR y el QR opcional
 */
function selectParser(ocrText, qrTrackingCode = null) {
  const textUpper = ocrText.toUpperCase();
  const qrUpper = qrTrackingCode ? qrTrackingCode.toUpperCase() : '';

  for (const [key, parser] of Object.entries(labelParsers)) {
    if (key === 'generic') continue;

    // Detectar usando texto OCR
    if (parser.detect(textUpper)) {
      console.log(`🎯 Parser seleccionado (por OCR): ${parser.name}`);
      return parser;
    }

    // Detectar usando QR (especialmente para Mercado Libre)
    if (key === 'mercadoLibre' && qrTrackingCode) {
      if (isMLTrackingCode(qrTrackingCode) || qrUpper.includes('MERCADOLIBRE')) {
        console.log(`🎯 Parser seleccionado (por QR): Mercado Libre`);
        return parser;
      }
    }
  }

  // Fallback de emergencia: Si el QR parece de ML, forzarlo aunque el OCR sea ilegible
  if (qrTrackingCode && isMLTrackingCode(qrTrackingCode)) {
    return labelParsers.mercadoLibre;
  }

  console.log(`⚠️  Usando parser genérico (ninguno específico coincidió)`);
  return labelParsers.generic;
}

/**
 * NUEVA FUNCIÓN: Extrae tracking codes usando múltiples estrategias
 */
function extractTrackingCodeAggressively(normalizedText, parser, qrTrackingCode = null) {
  const candidates = [];

  // SUPREMACÍA DEL QR: Si el QR ya nos dio un código, lo agregamos como candidato primario, 
  // pero NO hacemos short-circuit si es un código de Mercado Libre "Secundario" (20000...)
  // para permitir que el OCR encuentre el verdadero "Envío ID" (45/46...)
  if (qrTrackingCode && qrTrackingCode.trim().length > 0) {
    const val = qrTrackingCode.trim();
    const isMLSecondary = val.startsWith('2000');

    candidates.push({
      value: val,
      confidence: isMLSecondary ? 85 : 100,
      source: 'qr_code',
      raw: val
    });

    // Si NO es un código secundario problemático, podemos hacer short-circuit opcionalmente para ahorrar tiempo,
    // o simplemente dejar que siga y el QR ganará por tener confianza 100.
    // Dejemos que siga para que extraiga raw_matches correctamente.
    console.log(`✅ QR detectado: Agregando candidato (${val}) con confianza ${isMLSecondary ? 85 : 100}.`);
  }

  // 1. ESTRATEGIA DE RESCATE: Buscar códigos 45/46 que puedan estar pegados a texto o con espacios
  // Buscamos 4 seguido de espacio(s) opcional(es), luego 5 o 6, y luego el resto de los dígitos.
  const brokenMLRegex = /4\s*[56](?:\s*\d){9,11}/g;
  const brokenMatches = [...normalizedText.matchAll(brokenMLRegex)];
  brokenMatches.forEach(match => {
    const val = match[0].replace(/\s+/g, '');
    candidates.push({
      value: val,
      confidence: 98, // Muy alta confianza si encontramos este patrón exacto de ML
      source: 'broken_ml_strategy',
      raw: match[0]
    });
  });

  // 2. Intentar con el pattern principal del parser
  if (parser.patterns.external_tracking_code) {
    const match = normalizedText.match(parser.patterns.external_tracking_code);
    if (match && match[1]) {
      candidates.push({
        value: match[1].replace(/[^\w]/g, ''),
        confidence: 95,
        source: 'primary_pattern',
        raw: match[0]
      });
    }
  }

  // 3. Intentar con patterns alternativos del parser
  ['alt_tracking_code', 'alt_tracking', 'fallback_tracking'].forEach(altKey => {
    if (parser.patterns[altKey]) {
      const match = normalizedText.match(parser.patterns[altKey]);
      if (match && match[1]) {
        candidates.push({
          value: match[1].replace(/[^\w]/g, ''),
          confidence: 85,
          source: altKey,
          raw: match[0]
        });
      }
    }
  });

  // 4. Intentar con patrones universales (última opción)
  UNIVERSAL_TRACKING_PATTERNS.forEach((pattern, idx) => {
    const matches = [...normalizedText.matchAll(pattern)];
    matches.forEach(match => {
      if (match && match[1]) {
        const value = match[1].replace(/[^\w]/g, '');
        // Filtrar números que probablemente NO sean tracking codes
        if (value.length >= 8 && !isLikelyPhoneNumber(value)) {
          let confidence = 70 - (idx * 5);

          // BONUS: Si es código ML o empieza por 2000, es muy probable que sea el tracking real
          if (isMLTrackingCode(value)) confidence += 30; // Aumentado el bonus
          if (value.startsWith('2000')) confidence += 10; // Reducido bonus de 2000 para no competir con ML

          candidates.push({
            value,
            confidence,
            source: `universal_pattern_${idx}`,
            raw: match[0]
          });
        }
      }
    });
  });

  // Eliminar duplicados (mantener el de mayor confianza)
  const uniqueCandidates = [];
  const seenValues = new Set();

  candidates.sort((a, b) => b.confidence - a.confidence);

  for (const candidate of candidates) {
    if (!seenValues.has(candidate.value)) {
      seenValues.add(candidate.value);
      uniqueCandidates.push(candidate);
    }
  }

  return uniqueCandidates;
}

/**
 * Helper: Detecta si un número parece un teléfono (para filtrar falsos positivos)
 */
function isLikelyPhoneNumber(digits) {
  // Teléfonos chilenos típicamente empiezan con 56 o 9
  if (digits.startsWith('56') && digits.length >= 9 && digits.length <= 12) return true;
  if (digits.startsWith('9') && digits.length === 9) return true;
  return false;
}

/**
 * Formatear teléfono chileno (simplificado)
 */
const formatPhone = (phoneStr) => {
  let digits = phoneStr.replace(/\D/g, '');

  // Si está concatenado, extraer el número válido
  if (digits.length > 12) {
    const match = digits.match(/(?:56)?(9\d{8})/);
    if (match) {
      digits = match[0].startsWith('56') ? match[0] : `56${match[1]}`;
    } else {
      digits = digits.substring(0, 11);
    }
  }

  // Normalizar formato
  if (digits.startsWith('56')) {
    digits = digits.substring(2);
  }

  if (digits.startsWith('9') && digits.length >= 9) {
    const cleaned = digits.substring(0, 9);
    return `+56 9 ${cleaned.substring(1, 5)} ${cleaned.substring(5, 9)}`;
  }

  // Fallback
  if (digits.length >= 8) {
    return `+56 9 ${digits.substring(0, 4)} ${digits.substring(4, 8)}`;
  }

  return phoneStr; // No se pudo formatear
};

/**
 * Calcular confianza básica
 */
const calculateConfidence = (value, fieldType) => {
  let confidence = 100;

  if (!value || value.length < 2) return 0;

  // Penalizaciones
  if (value.includes('?') || value.includes('*')) confidence -= 30;
  if (value.length < 3) confidence -= 20;
  if (/[^\w\sáéíóúñÁÉÍÓÚÑ.,\-+()]/i.test(value)) confidence -= 15;

  // Validaciones por tipo
  switch (fieldType) {
    case 'recipient_phone':
      const digits = value.replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 12) confidence -= 25;
      if (!digits.startsWith('56') && !digits.startsWith('9')) confidence -= 10;
      break;
    case 'recipient_name':
      if (/\d/.test(value)) confidence -= 20;
      if (value.length < 5) confidence -= 15;
      break;
    case 'destination_address':
      if (value.length < 10) confidence -= 20;
      if (!/\d/.test(value)) confidence -= 15;
      break;
    case 'external_tracking_code':
      if (value.length < 6) confidence -= 30;
      if (value.length > 20) confidence -= 10;
      break;
  }

  return Math.max(0, Math.min(100, confidence));
};

/**
 * Extrae datos de un texto OCR usando el parser apropiado
 * @param {string} ocrText - Texto extraído por OCR
 * @param {string|null} qrTrackingCode - Código de tracking extraído del QR (opcional)
 */
function extractData(ocrText, qrTrackingCode = null) {
  console.log('\n=== INICIANDO EXTRACCIÓN DE DATOS ===');
  console.log(`QR Tracking Code recibido: ${qrTrackingCode || '(ninguno)'}`);

  const normalizedText = ocrText
    .replace(/(\r\n|\r|\n)/gm, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // MEJORA: Pasar qrTrackingCode a selectParser
  let parser = selectParser(normalizedText, qrTrackingCode);

  const extracted = {
    parser_used: parser.name,
    confidence: {},
    data: {},
    raw_matches: {},
    tracking_candidates: [] // NUEVO: Para debugging
  };

  // MEJORA CRÍTICA: Extraer tracking codes con estrategia agresiva
  console.log('\n🔍 Buscando tracking codes...');
  const trackingCandidates = extractTrackingCodeAggressively(normalizedText, parser, qrTrackingCode);
  extracted.tracking_candidates = trackingCandidates;

  console.log(`Candidatos encontrados: ${trackingCandidates.length}`);
  trackingCandidates.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.value} (confianza: ${c.confidence}%, fuente: ${c.source})`);
  });

  // NUEVA MEJORA: Si no detectamos ML pero hay un código ML en OCR con buena confianza, 
  // forzar el parser de Mercado Libre. Esto ocurre cuando la palabra "Mercado Libre" es ilegible.
  if (parser.name !== 'Mercado Libre') {
    const mlCandidate = trackingCandidates.find(c => isMLTrackingCode(c.value) && c.confidence > 70);
    if (mlCandidate) {
      console.log(`🎯 Re-detectado Mercado Libre por código ML encontrado en OCR (${mlCandidate.value})`);
      parser = labelParsers.mercadoLibre;
      extracted.parser_used = parser.name;
    }
  }

  // MEJORA CRÍTICA: Decidir qué tracking code usar
  let finalTrackingCode = null;
  let trackingSource = 'none';
  let trackingConfidence = 0;

  let mlCandidate = trackingCandidates.find(c => isMLTrackingCode(c.value));
  const qrIsML = qrTrackingCode && isMLTrackingCode(qrTrackingCode);

  // REFUERZO: Si sabemos que es Mercado Libre pero no hay candidato 45/46, 
  // buscamos CUALQUIER secuencia de 11 dígitos que empiece con 4 (puede haber fallado el 5 o 6 en el OCR)
  if (parser.name === 'Mercado Libre' && !mlCandidate && !qrIsML) {
    console.log('🧐 Modo búsqueda desesperada ML activo (Extendido)...');
    // Buscamos un 4 seguido de exactamente 10 dígitos (con espacios opcionales)
    const desperateMatch = normalizedText.match(/4(?:\s*\d){10}/);
    if (desperateMatch) {
      const val = desperateMatch[0].replace(/\s+/g, '');

      // Verificación extra: ¿Es este "falso positivo" parte de un código 2000?
      // Asegurarnos de que `val` no sea parte de un código 2000 presente en el texto
      const isFragmentOfCruzec = normalizedText.includes(`2000${val}`) || normalizedText.includes(`20000${val}`) || normalizedText.includes(`2000${val.substring(1)}`);

      if (!isFragmentOfCruzec) {
        console.log(`🎯 Encontrado código ML por búsqueda desesperada: ${val}`);
        mlCandidate = { value: val, confidence: 60, source: 'desperate_ml_scan' };
      } else {
        console.log(`⚠️ Falso positivo descartado: ${val} es parte de un código Cruzec (2000...)`);
      }
    } else {
      // Un último intento: buscar cualquier secuencia de 11 dígitos que contenga "45" o "46" en algún lado
      const lastResortMatch = normalizedText.match(/(?:\d\s*){0,5}4\s*[56](?:\s*\d){5,11}/);
      if (lastResortMatch) {
        const val = lastResortMatch[0].replace(/\s+/g, '').substring(0, 11);
        // Verificar que no sea parte de un 2000
        if (val.length >= 10 && !normalizedText.includes(`2000${val}`)) {
          console.log(`🎯 Encontrado código ML por patrón de rescate final: ${val}`);
          mlCandidate = { value: val, confidence: 55, source: 'final_resort_ml_scan' };
        }
      }
    }
  }

  // REGLA DE ORO: Si hay un código ML en OCR o QR, ESE es el tracking
  if (qrIsML) {
    finalTrackingCode = qrTrackingCode.trim();
    trackingSource = 'qr';
    trackingConfidence = 100;
    console.log(`✅ Prioridad absoluta: QR es Mercado Libre (${finalTrackingCode})`);
  } else if (mlCandidate) {
    finalTrackingCode = mlCandidate.value;
    trackingSource = mlCandidate.source;
    trackingConfidence = mlCandidate.confidence;
    console.log(`✅ Prioridad absoluta: OCR encontró código Mercado Libre (${finalTrackingCode}) ignorando QR`);
  }
  // Si NO hay código ML pero el parser es Mercado Libre y el QR o Texto tiene un 2000
  // Es mejor devolver el 2000 completo que un fragmento roto
  else if (parser.name === 'Mercado Libre') {
    const cruzecQr = qrTrackingCode && qrTrackingCode.startsWith('2000') ? qrTrackingCode : null;
    const cruzecOcr = trackingCandidates.find(c => c.value.startsWith('2000'));

    if (cruzecQr || cruzecOcr) {
      finalTrackingCode = cruzecQr || cruzecOcr.value;
      trackingSource = cruzecQr ? 'qr' : cruzecOcr.source;
      trackingConfidence = 80;
      console.log(`⚠️ Etiqueta ML: No se halló ID ML. Usando ID Cruzec completo (${finalTrackingCode}) en lugar de fragmentos peligrosos.`);
    } else {
      // Si no hay ni ML ni 2000, usar el mejor candidato genérico
      if (trackingCandidates.length > 0) {
        finalTrackingCode = trackingCandidates[0].value;
        trackingSource = trackingCandidates[0].source;
        trackingConfidence = trackingCandidates[0].confidence;
        console.log(`✅ Usando mejor candidato OCR (fallback): ${finalTrackingCode}`);
      }
    }
  }
  // Si no hay conflicto, seguir con prioridad normal (QR primero)
  else if (qrTrackingCode && qrTrackingCode.trim().length > 0) {
    finalTrackingCode = qrTrackingCode.trim();
    trackingSource = 'qr';
    trackingConfidence = 100;
    console.log(`✅ Usando tracking del QR: ${finalTrackingCode}`);
  }
  else if (trackingCandidates.length > 0) {
    const bestCandidate = trackingCandidates[0];
    finalTrackingCode = bestCandidate.value;
    trackingSource = bestCandidate.source;
    trackingConfidence = bestCandidate.confidence;
    console.log(`✅ Usando mejor candidato OCR: ${finalTrackingCode}`);
  }

  // Guardar raw match si aplica
  if (finalTrackingCode) {
    const matchingCandidate = trackingCandidates.find(c => c.value === finalTrackingCode);
    if (matchingCandidate) {
      extracted.raw_matches.external_tracking_code = matchingCandidate.raw;
    }
  }

  // Guardar tracking code final
  if (finalTrackingCode) {
    extracted.data.external_tracking_code = finalTrackingCode;
    extracted.confidence.external_tracking_code = trackingConfidence;
    extracted.tracking_source = trackingSource;
  }

  // Extraer otros campos (nombre, dirección, teléfono)
  console.log('\n📋 Extrayendo otros campos...');
  Object.entries(parser.patterns).forEach(([fieldName, regex]) => {
    // Saltar tracking codes (ya los manejamos arriba)
    if (fieldName.includes('tracking')) return;

    const match = normalizedText.match(regex);
    if (match && match[1]) {
      let value = match[1].trim();

      // Limpieza específica para nombres (REQUISITO CRÍTICO para Enviame/Directo)
      if (fieldName === 'recipient_name' || fieldName === 'alt_recipient_name') {
        // Limpieza INTELIGENTE: Detectar cualquier variación de "DESTINATARIO" 
        // (Empieza con D, N o C, tiene letras mayúsculas y termina con prefijo común o dos puntos)
        const trashRegex = /^(?:(?:D[EUTI]+[A-Z]*|NOMB[A-Z]*|NOTA[A-Z]*|COM|SERV|EXPR|DIRECT|ENVIA)[A-Z]*|DEST)\s*[:\s]*/i;

        // También limpiar si quedan residuos pegados al inicio (ej. "DEUTIETARIOEsteban")
        // Busca palabra larga en mayusculas al inicio que no parece un nombre propio normal (Esteban)
        const gluedTrashRegex = /^(?:D[EUTI]{2,}[A-Z]*TARIO|N[O0]MBRE)(?=[A-Z])/i;

        let cleanedValue = value.replace(trashRegex, '').replace(gluedTrashRegex, '');

        // Limpieza final de caracteres raros al inicio
        value = cleanedValue.replace(/^[^a-zA-Z0-9]+/, '').trim();
      }

      // Post-procesamiento según tipo de campo
      switch (fieldName) {
        case 'recipient_phone':
        case 'alt_phone':
          value = formatPhone(value);
          if (!extracted.data.recipient_phone) {
            extracted.data.recipient_phone = value;
            extracted.confidence.recipient_phone = calculateConfidence(value, 'recipient_phone');
            console.log(`  ✓ Teléfono: ${value}`);
          }
          break;

        case 'alt_recipient_name':
          if (!extracted.data.recipient_name) {
            extracted.data.recipient_name = value;
            extracted.confidence.recipient_name = calculateConfidence(value, 'recipient_name');
            console.log(`  ✓ Nombre: ${value}`);
          }
          break;

        case 'destination_address':
          value = value.replace(/OBSERVACION/gi, '').trim();
          if (extracted.data.comuna) {
            value = `${value}, ${extracted.data.comuna}`;
          }
          extracted.data[fieldName] = value;
          extracted.confidence[fieldName] = calculateConfidence(value, fieldName);
          console.log(`  ✓ Dirección: ${value}`);
          break;

        default:
          if (!fieldName.startsWith('alt_')) {
            extracted.data[fieldName] = value;
            extracted.confidence[fieldName] = calculateConfidence(value, fieldName);
            console.log(`  ✓ ${fieldName}: ${value}`);
          }
      }

      if (!fieldName.startsWith('alt_') && !fieldName.includes('tracking')) {
        extracted.raw_matches[fieldName] = match[0];
      }
    }
  });

  // Reemplazos de fallback si los campos principales fallaron
  if (!extracted.data.destination_address) {
    if (extracted.data.address_keyword) {
      extracted.data.destination_address = extracted.data.address_keyword;
      extracted.confidence.destination_address = extracted.confidence.address_keyword || 60;
      console.log(`  🔄 Usando address_keyword como destination_address: ${extracted.data.destination_address}`);
    } else if (extracted.data.fallback_address) {
      extracted.data.destination_address = extracted.data.fallback_address;
      extracted.confidence.destination_address = extracted.confidence.fallback_address || 50;
      console.log(`  🔄 Usando fallback_address como destination_address: ${extracted.data.destination_address}`);
    } else if (extracted.data.alt_address2) {
      extracted.data.destination_address = extracted.data.alt_address2;
      extracted.confidence.destination_address = extracted.confidence.alt_address2 || 50;
      console.log(`  🔄 Usando alt_address2 como destination_address: ${extracted.data.destination_address}`);
    }
  }

  if (!extracted.data.recipient_name && extracted.data.alt_recipient_name) {
    extracted.data.recipient_name = extracted.data.alt_recipient_name;
    extracted.confidence.recipient_name = extracted.confidence.alt_recipient_name || 50;
    console.log(`  🔄 Usando alt_recipient_name como recipient_name: ${extracted.data.recipient_name}`);
  }

  // Calcular confianza general
  const confidenceValues = Object.values(extracted.confidence);
  extracted.overall_confidence = confidenceValues.length > 0
    ? Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length)
    : 0;

  extracted.fields_extracted = Object.keys(extracted.data).length;

  console.log('\n=== RESUMEN DE EXTRACCIÓN ===');
  console.log(`Parser usado: ${parser.name}`);
  console.log(`Campos extraídos: ${extracted.fields_extracted}`);
  console.log(`Confianza general: ${extracted.overall_confidence}%`);
  console.log(`Tracking code: ${finalTrackingCode || '(ninguno)'} [${trackingSource}]`);
  console.log('================================\n');

  return extracted;
}

/**
 * Determina si los datos extraídos son suficientes para auto-aprobar
 */
function shouldAutoApprove(extracted) {
  const requiredFields = ['recipient_name', 'destination_address', 'external_tracking_code'];
  const hasRequiredFields = requiredFields.every(field => extracted.data[field]);

  const minConfidence = 75; // Reducido de 80 para ser más flexible
  const avgConfidence = extracted.overall_confidence;

  const shouldApprove = hasRequiredFields && avgConfidence >= minConfidence;

  // --- REGLA ESPECIAL: Bloquear auto-aprobación si es Mercado Libre y tiene ID de Venta (2000...) ---
  // IMPORTANTE: Permitir 2000... si es Cruzec (u otro parser) de modo que no bloqueemos tracking válidos que empiecen con 2000
  const extCode = extracted.data.external_tracking_code;
  if (extCode && extCode.startsWith('20000') && extCode.length === 16 && extracted.parser_used === 'Mercado Libre') {
    console.log(`\n🤖 Auto-aprobación: NO ❌ (BLOQUEADO: ID de Venta ML ${extCode} detectado)`);
    console.log(`   Razón: Se requiere revisión manual para cambiar al código de Envío.`);
    return false;
  }
  // -------------------------------------------------------------------------------

  console.log(`\n🤖 Auto-aprobación: ${shouldApprove ? 'SÍ ✅' : 'NO ❌'}`);
  console.log(`  - Campos requeridos: ${hasRequiredFields ? '✅' : '❌'}`);
  console.log(`  - Confianza suficiente (${avgConfidence}% >= ${minConfidence}%): ${avgConfidence >= minConfidence ? '✅' : '❌'}`);

  return shouldApprove;
}

/**
 * Versión mejorada de extractData que aplica patrones aprendidos
 * Llama a extractData normal y luego aplica mejoras del motor de aprendizaje
 */
async function extractDataWithLearning(ocrText, qrTrackingCode = null) {
  // 1. Extracción normal
  const extracted = extractData(ocrText, qrTrackingCode);

  // 2. Aplicar patrones aprendidos
  const engine = getLearningEngine();
  if (engine) {
    try {
      const { data: enhancedData, patternsApplied } = await engine.applyLearnedPatterns(
        extracted.data,
        extracted.parser_used
      );

      if (patternsApplied > 0) {
        extracted.data = enhancedData;
        extracted.learning_applied = patternsApplied;
        console.log(`🧠 [LEARNING] ${patternsApplied} patrón(es) aprendido(s) aplicado(s)`);

        // Recalcular confianza (subir un poco por haber aplicado aprendizaje)
        const bonus = Math.min(patternsApplied * 2, 5);
        extracted.overall_confidence = Math.min(100, extracted.overall_confidence + bonus);
      }
    } catch (err) {
      console.warn('⚠️ [LEARNING] Error al aplicar patrones:', err.message);
    }
  }

  return extracted;
}

module.exports = {
  labelParsers,
  selectParser,
  extractData,
  extractDataWithLearning,
  shouldAutoApprove,
  extractTrackingCodeAggressively,
};