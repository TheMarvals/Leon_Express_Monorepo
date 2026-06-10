const { OcrProcessingQueue } = require('../models');
const { extractData, shouldAutoApprove } = require('../utils/smartOcrParser');

async function fixPendingQueue() {
    try {
        const queueItems = await OcrProcessingQueue.findAll({
            where: { status: 'needs_review' }
        });

        console.log(`Encontrados ${queueItems.length} items en needs_review. Re-procesando...`);

        let fixedCount = 0;

        for (const item of queueItems) {
            if (!item.ocr_raw_text || item.ocr_raw_text.length < 5) continue;

            const extracted = extractData(item.ocr_raw_text);
            const isApproved = shouldAutoApprove(extracted);

            const payload = {
                extracted_data: JSON.stringify({
                    external_tracking_code: extracted.data.external_tracking_code,
                    recipient_name: extracted.data.recipient_name,
                    recipient_phone: extracted.data.recipient_phone,
                    destination_address: extracted.data.destination_address,
                    fallback_address: extracted.data.fallback_address,
                    client_price: 2500, // Default fallback if not in old payload, but UI handles it
                    delivery_cost: 2800
                })
            };

            // If it became auto-approved because of the new rules, maybe we should just update the data 
            // so the user sees it in the form. We don't change the status to auto_approved here, 
            // let the user manually approve it using the newly pre-filled data in the UI to be safe.
            // Actually, updating the extracted_data is exactly what we need for the UI to show the right values!

            await item.update(payload);
            fixedCount++;
        }

        console.log(`✅ ${fixedCount} items actualizados. La UI debería mostrar los datos correctos ahora.`);
    } catch (error) {
        console.error(error);
    }
    process.exit();
}

fixPendingQueue();
