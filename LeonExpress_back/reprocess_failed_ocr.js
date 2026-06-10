'use strict';

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const { Package, Pickup, OcrProcessingQueue: OcrProcessingQueueModel, sequelize } = require('./models');
const { extractData, shouldAutoApprove } = require('./utils/smartOcrParser');
const { decodeQRFromImage, extractTrackingCodeFromQR } = require('./utils/qrDecoder');

// Configuración
const OCR_LOCAL_URL = process.env.OCR_LOCAL_URL || 'http://leonexpress_ocr:8000/parse/image';

async function reprocessFailedOcr() {
  console.log('🚀 Iniciando re-procesamiento de OCR fallidos (E500) con corrección de precios...');

  try {
    const failedItems = await OcrProcessingQueueModel.findAll({
      where: {
        status: 'needs_review',
        error_message: { [require('sequelize').Op.or]: [
           { [require('sequelize').Op.like]: '%Error E500%' },
           { [require('sequelize').Op.like]: '%Error de procesamiento OCR%' }
        ] }
      },
      order: [['created_at', 'DESC']],
      limit: 150
    });

    console.log(`🔍 Encontrados ${failedItems.length} registros para re-procesar.`);

    let autoApprovedCount = 0;
    let manualReviewCount = 0;
    let errorCount = 0;

    for (const item of failedItems) {
      if (item.package_id) continue; // Saltar si ya fue vinculado en un intento anterior que falló en DB

      console.log(`\n📦 [${item.filename}] Procesando...`);
      
      try {
        if (!await fileExists(item.image_path)) {
          console.error(`   ❌ Archivo no encontrado: ${item.image_path}`);
          continue;
        }
        
        const imageBuffer = await fs.readFile(item.image_path);
        const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        // QR
        let qrTrackingCode = null;
        try {
          const qrContent = await decodeQRFromImage(base64Image);
          if (qrContent) qrTrackingCode = extractTrackingCodeFromQR(qrContent);
        } catch (qrErr) {}

        // OCR Local
        const form = new FormData();
        form.append('base64Image', base64Image);
        form.append('language', 'spa');

        const response = await axios.post(OCR_LOCAL_URL, form, {
          headers: form.getHeaders(),
          timeout: 60000
        });

        if (response.data.IsErroredOnProcessing) {
          throw new Error(response.data.ErrorMessage || 'Error en OCR local');
        }

        const ocrText = response.data.ParsedResults?.[0]?.ParsedText || '';
        const extracted = extractData(ocrText, qrTrackingCode);
        const autoApprove = shouldAutoApprove(extracted);

        // Actualizar registro
        await item.update({
          status: autoApprove ? 'auto_approved' : 'needs_review',
          ocr_raw_text: ocrText,
          extracted_data: extracted.data,
          confidence_scores: extracted.confidence,
          overall_confidence: extracted.overall_confidence,
          parser_used: extracted.parser_used,
          fields_extracted: extracted.fields_extracted,
          auto_approved: autoApprove,
          error_message: null,
          processed_at: new Date()
        });

        if (autoApprove) {
          console.log(`   ✅ AUTO-APROBADO: ${extracted.data.recipient_name}`);
          
          const t = await sequelize.transaction();
          try {
             const existing = await Package.findOne({ 
               where: { external_tracking_code: extracted.data.external_tracking_code || 'NEVER_MATCH' },
               transaction: t
             });

             if (existing) {
               console.log(`   ⚠️ Ya existe (${existing.tracking_code}), vinculando...`);
               await item.update({ package_id: existing.package_id, is_duplicate: true }, { transaction: t });
             } else {
               const tracking_code = await generateTrackingCode();
               const pickup = await Pickup.findByPk(item.pickup_id, { transaction: t });
               
               const newPackage = await Package.create({
                 package_id: uuidv4(),
                 tracking_code: tracking_code,
                 external_tracking_code: extracted.data.external_tracking_code || null,
                 pickup_id: item.pickup_id,
                 status: 'RECOLECTADO_EN_ORIGEN',
                 recipient_name: extracted.data.recipient_name || '',
                 destination_address: extracted.data.destination_address || '',
                 recipient_phone: extracted.data.recipient_phone || '',
                 scanned_at_origin_datetime: new Date(),
                 client_id: pickup?.client_id,
                 client_price: 0, // Fallback a 0 si no se tiene
                 delivery_cost: 0 // Fallback a 0
               }, { transaction: t });

               await item.update({ package_id: newPackage.package_id }, { transaction: t });
               console.log(`   🚀 Paquete creado: ${tracking_code}`);
             }
             await t.commit();
             autoApprovedCount++;
          } catch (err) {
             await t.rollback();
             console.error(`   ❌ Error en DB: ${err.message}`);
             errorCount++;
          }
        } else {
          manualReviewCount++;
        }
      } catch (itemErr) {
        console.error(`   ❌ Fallo: ${itemErr.message}`);
        errorCount++;
      }
    }
    console.log(`\n✅ RE-PROCESAMIENTO FINALIZADO`);
  } catch (globalErr) {
    console.error('❌ Error general:', globalErr);
  } finally {
    process.exit();
  }
}

async function fileExists(filePath) {
  try { await fs.access(filePath); return true; } catch { return false; }
}

async function generateTrackingCode() {
  return `LE${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`;
}

reprocessFailedOcr();
