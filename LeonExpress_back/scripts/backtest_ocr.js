const { OcrProcessingQueue } = require('../models');
const { extractData, shouldAutoApprove } = require('../utils/smartOcrParser');

async function runBacktest() {
    console.log('🚀 Iniciando Backtesting Masivo del OCR Inteligente...');
    console.log('Recopilando datos históricos (las últimas 1000 etiquetas procesadas)...');

    try {
        // Obtenemos un bloque grande de registros antiguos
        const queueItems = await OcrProcessingQueue.findAll({
            order: [['created_at', 'DESC']],
            limit: 1000
        });

        const validItems = queueItems.filter(i => i.ocr_raw_text && i.ocr_raw_text.length > 5);

        console.log(`\n✅ Se encontraron ${validItems.length} registros válidos con texto extraído por OCR.`);
        console.log('🧠 Re-procesando todo con el código actual... (esto simulará el comportamiento de hoy)\n');

        let total = validItems.length;
        let autoApproved = 0;
        let manualReview = 0;
        const parsersUsed = {};
        const failureReasons = {
            missing_name: 0,
            missing_address: 0,
            missing_tracking: 0,
            low_confidence: 0
        };

        // Apagamos los console.log del parser para que no ensucien la consola de reporte
        const originalConsoleLog = console.log;
        console.log = function () { };

        validItems.forEach(item => {
            const extracted = extractData(item.ocr_raw_text);
            const isApproved = shouldAutoApprove(extracted);

            if (isApproved) {
                autoApproved++;
            } else {
                manualReview++;

                // Analizar por qué falló
                if (!extracted.data.recipient_name) failureReasons.missing_name++;
                if (!extracted.data.destination_address) failureReasons.missing_address++;
                if (!extracted.data.external_tracking_code) failureReasons.missing_tracking++;
                if (extracted.overall_confidence < 75) failureReasons.low_confidence++;
            }

            const parser = extracted.parser_used || 'Desconocido';
            parsersUsed[parser] = (parsersUsed[parser] || 0) + 1;
        });

        // Restauramos console.log
        console.log = originalConsoleLog;

        console.log('==================================================');
        console.log('📊 RESULTADOS DEL BACKTESTING (Reglas de Extracción Actuales)');
        console.log('==================================================');
        console.log(`Total Analizados     : ${total}`);
        console.log(`Aprobación Automática: ${autoApproved} (${((autoApproved / total) * 100).toFixed(2)}%)`);
        console.log(`Requieren Revisión   : ${manualReview} (${((manualReview / total) * 100).toFixed(2)}%)`);

        if (manualReview > 0) {
            console.log('\n⚠️ Motivos Principales de Fallo en Revisión (Pueden superponerse):');
            console.log(`  - Falta Tracking Code: ${failureReasons.missing_tracking}`);
            console.log(`  - Falta Dirección    : ${failureReasons.missing_address}`);
            console.log(`  - Falta Nombre       : ${failureReasons.missing_name}`);
            console.log(`  - Baja Confianza(<75): ${failureReasons.low_confidence}`);
        }

        console.log('\n🔍 Tipos de Etiquetas Detectadas:');
        Object.entries(parsersUsed).sort((a, b) => b[1] - a[1]).forEach(([parser, count]) => {
            console.log(`  - [${parser}]: ${count} etiquetas (${((count / total) * 100).toFixed(1)}%)`);
        });
        console.log('==================================================');

    } catch (error) {
        console.error('❌ Error durante el backtesting:', error);
    }

    process.exit(0);
}

runBacktest();
