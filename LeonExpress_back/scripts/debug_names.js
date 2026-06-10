const { OcrProcessingQueue } = require('../models');
const { extractData } = require('../utils/smartOcrParser');

async function debugMissingNames() {
    try {
        const queueItems = await OcrProcessingQueue.findAll({
            order: [['created_at', 'DESC']],
            limit: 1000
        });

        const validItems = queueItems.filter(i => i.ocr_raw_text && i.ocr_raw_text.length > 5);

        // Apagamos los console.log del parser
        const originalConsoleLog = console.log;
        console.log = function () { };

        let missingNameExamples = [];

        validItems.forEach(item => {
            const extracted = extractData(item.ocr_raw_text);

            if (!extracted.data.destination_address && extracted.parser_used === 'Mercado Libre') {
                missingNameExamples.push(item.ocr_raw_text);
            }
        });

        // Restauramos console.log
        console.log = originalConsoleLog;

        console.log('--- OCR REAL DE ETIQUETAS SIN DIRECCION EN MERCADO LIBRE ---');
        missingNameExamples.slice(0, 5).forEach((text, i) => {
            console.log(`\nEJEMPLO ${i + 1}:\n${text}`);
        });

    } catch (error) {
        console.error(error);
    }
    process.exit();
}

debugMissingNames();
