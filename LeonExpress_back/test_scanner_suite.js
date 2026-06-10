const fs = require('fs').promises;
const path = require('path');
const { extractData } = require('./utils/smartOcrParser');
const { extractTrackingCodeFromQR } = require('./utils/qrDecoder');

const cachedOcr = {
    "Jumpseller.jpg": "fumpseller 2025-10-11\nREF: 11120897\nORDEN: 5307\nMITENTE: León Imi\nRECCION: Andrea doria 272\nDESTINATARIO: Michelle Varels\nDIRECCION: Lota 2325, Depto 76\nProvidencia, Región Metropolitana, CL\nOBSERVACION:\nFONO:+56990758342\n11120897\nBULTO\nPESO\n1/1\n4.0 KG\nDIMENSIONES 1 CM X 1 CM X 1 CM",
    "Leon_import.jpg": "CAMBIO #L4415\nNOMBRE: ALEJANDRO ESPINDOLA\nTELÉFONO: +56 9 9575 8125\nPRODUCTO: ESTANTE DE LAVADORA\nDIRECCION: SANTA ISABEL NORTE\n7310 CASA 63\nCOMUNA: PUENTE ALTO\nOBSERVACION: DEJAR Y RECIBIR\nANTERIOR\nLEÓN IMPORT\nLeonimport_\nwww.leonimport.cl\n+56989168226",
    "ML.jpg": "Venta ID: 2000013363147880\n1\nUnidad\n• Freidora De Aire 6 Litros Digital 2400w 220v\nNegra Dorada Canasto Único\nSKU: 3656-NL\nLEON IMPORT SPA LEÓN IMPO #1513023287\nAndrea Doria 2720\nPedro Aguirre Cerda, Pedro Aguine Cerda, RM\n(Metropolitana)\nVenta: 2000013363147880 Envio: 45661088516\nEnvio Turbo\nEntrega:\n10-Oct. 14 a 16 hs\nANILLO ESTE\nSAN MIGUEL\nRESIDENCIAL\nDireccion: alcalde pedro alarcon 825\nReferencia: entregar en conserjeria\nDestinatario: auri orta (ORAU196987)",
    "img.jpg": "DIRECTO\nHIA HON BI\n3014700154\nRemitente:\nN-J de orden:\n3014700154\nDestinatario:\nENVIAME\nSERVICIO\nexpress\nCOSTOO SEGUMIENTO\n3014700154\nREMITENTE\nLEON IMPORT SPA\nSCA1432\nANDREA DORIA 2720.289,753\nKatherine Salazar montenegro\nSan pablo2076.701 A\nSANTIAGO,SANTIAGO\nENVIAME\nMANKETPLACE\nFalabelia.com\n154007743\nKetherine Salazar / Tel. 947302281\nSen pablo 2076, Bantiego\nWEDARVADIOY\n2025-10-17\n847382281\n50001\n* Set 3 Bandas Para Ejercicios Elásticas\n/Cant: 1",
    "crusec.jpeg": "Crusec Espejo De Cuerpo Entero 160 X 50\nCm Anti Explosión Marco Negro. SKU:\nESPEJOENTERO160X50\n\nVenta: 2000009974451129\n\nCRUSEC Cam. Lo Echevers 550, B.14\nQuilicura, RM +56 9 5875 0361\n\nEnviado por LEON\nEntregar: 12/11/2025\n\nRM\nÑuñoa\n\nDirección: Av. Irarrázaval 1989, 7750000 Ñuñoa, Región\nMetropolitana, Chile\nReferencia: 2102 Torre A\nDestinatario: Alberto Enrique Arriagada Ibacache\nCelular: 966778639\nESCANEAR EL QR Y ENTREGAR"
};

const simulatedQrs = {
    "ML.jpg": "2000013363147880", // QR de ML que a veces trae solo el 2000
    "crusec.jpeg": "2000009974451129",
    "Jumpseller.jpg": "11120897",
    "img.jpg": "3014700154"
};

async function runTestSuite() {
    console.log('🚀 INICIANDO SUITE DE PRUEBAS DEL ESCÁNER\n');

    for (const [filename, text] of Object.entries(cachedOcr)) {
        console.log(`\n--- PRUEBA: ${filename} ---`);
        const qrContent = simulatedQrs[filename] || null;
        const qrTrackingCode = qrContent ? extractTrackingCodeFromQR(qrContent) : null;

        if (qrContent) {
            console.log(`📱 QR encontrado: ${qrContent}`);
            if (qrTrackingCode) console.log(`✅ Tracking extraído de QR: ${qrTrackingCode}`);
        }

        const result = extractData(text, qrTrackingCode);

        console.log(`🎯 Parser: ${result.parser_used}`);
        console.log(`📦 Datos finales:`, JSON.stringify(result.data, null, 2));

        // Verificación especial para el caso de conflicto
        if (filename === 'ML.jpg') {
            if (result.data.external_tracking_code === '45661088516') {
                console.log('✅ TEST PASSED: Se priorizó el código 45 de ML sobre el 2000 del QR.');
            } else {
                console.log('❌ TEST FAILED: Se usó el código incorrecto.');
            }
        }
        console.log('----------------------------');
    }
}

runTestSuite().catch(console.error);
