const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');
const { extractData, extractDataWithLearning, shouldAutoApprove } = require('./smartOcrParser');
const { decodeQRFromImage, extractTrackingCodeFromQR } = require('./qrDecoder');
const { v4: uuidv4 } = require('uuid');
const { Package, Pickup, Client, OcrProcessingQueue: OcrProcessingQueueModel } = require('../models');

/**
 * Cola de procesamiento OCR para batch de imágenes
 */
class OcrProcessingQueue {
  constructor() {
    this.queue = [];
    this.processing = new Map();
    this.results = new Map();
    this.isProcessing = false;
    this.packageCreationLock = Promise.resolve();
    this.idempotencyCache = new Set();
  }

  /**
   * Agrega un batch de imágenes a la cola
   */
  async addBatch(batchData) {
    const { batch_id, pickup_id, images, metadata, client_price, delivery_cost, idempotency_key } = batchData;

    // Reject if recently processed (idempotency strategy for frontend network retries)
    if (idempotency_key) {
      if (this.idempotencyCache.has(idempotency_key)) {
         console.log(`♻️ IDEMPOTENCIA: Ignorando batch duplicado (ya está en cola o se procesó exitosamente recientemente) key=${idempotency_key}`);
         return {
           batch_id: 'idempotent_' + idempotency_key.substring(0, 8),
           status: 'queued_previously',
           total_images: images.length,
           estimated_time: 0,
           message: 'Batch ya estaba en proceso'
         };
      }
      this.idempotencyCache.add(idempotency_key);
      // Clean up to prevent memory leak (prevent retries within 1 hour)
      setTimeout(() => this.idempotencyCache.delete(idempotency_key), 60 * 60 * 1000);
    }

    // Crear directorio para este pickup
    const uploadDir = path.join(__dirname, '..', 'uploads', 'pickups', pickup_id, 'labels');
    await fs.mkdir(uploadDir, { recursive: true });

    // Guardar metadata inicial
    const batchInfo = {
      batch_id,
      pickup_id,
      status: 'pending',
      total_images: images.length,
      processed: 0,
      auto_approved: 0,
      needs_review: 0,
      errors: 0,
      created_at: new Date().toISOString(),
      client_price: client_price || 0,
      delivery_cost: delivery_cost || 0,
      metadata,
      items: []
    };

    // Procesar cada imagen
    for (let i = 0; i < images.length; i++) {
      const imageData = images[i];
      const itemId = `${batch_id}_${i}`;
      const filename = `label_${Date.now()}_${i}.jpg`;
      const filepath = path.join(uploadDir, filename);

      // Guardar imagen
      await this.saveImage(imageData, filepath);

      // Agregar a cola
      const queueItem = {
        item_id: itemId,
        batch_id,
        pickup_id,
        image_path: filepath,
        filename,
        index: i,
        status: 'queued',
        created_at: new Date().toISOString()
      };

      this.queue.push(queueItem);
      batchInfo.items.push(queueItem);
    }

    // Guardar metadata del batch
    const metadataPath = path.join(uploadDir, `batch_${batch_id}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(batchInfo, null, 2));

    this.results.set(batch_id, batchInfo);

    // Iniciar procesamiento si no está corriendo
    if (!this.isProcessing) {
      this.processQueue();
    }

    return {
      batch_id,
      status: 'queued',
      total_images: images.length,
      estimated_time: images.length * 3 // segundos
    };
  }

  /**
   * Guarda una imagen desde base64
   */
  async saveImage(base64Data, filepath) {
    const base64Image = base64Data.startsWith('data:')
      ? base64Data.split(',')[1]
      : base64Data;

    const buffer = Buffer.from(base64Image, 'base64');

    // Guardar directamente sin procesar (el procesamiento se hace en background)
    await fs.writeFile(filepath, buffer);
  }

  /**
   * Procesa la cola de imágenes (con paralelismo limitado)
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const total = this.queue.length;
    console.log(`🔄 Iniciando procesamiento PARALELO de ${total} imágenes...`);

    // Configuración de paralelismo
    const CONCURRENT_LIMIT = 3; // Procesar hasta 3 imágenes a la vez
    const DELAY_BETWEEN_BATCHES = 500; // 500ms entre lotes (reducido de 1500ms)

    while (this.queue.length > 0) {
      // Tomar un lote de imágenes para procesar en paralelo
      const batch = this.queue.splice(0, CONCURRENT_LIMIT);
      const remaining = this.queue.length;

      console.log(`📦 Procesando lote de ${batch.length} imágenes (${remaining} restantes)...`);

      // Procesar el lote en paralelo
      const promises = batch.map(async (item) => {
        try {
          this.processing.set(item.item_id, item);
          item.status = 'processing';
          item.processing_started_at = new Date().toISOString();

          console.log(`📸 [${item.index + 1}/${total}] Procesando: ${item.filename}`);

          // Procesar imagen
          const result = await this.processImage(item);

          // Actualizar batch info
          const batchInfo = this.results.get(item.batch_id);
          if (batchInfo) {
            batchInfo.processed++;

            if (result.auto_approved) {
              batchInfo.auto_approved++;
            } else if (result.status === 'needs_review') {
              batchInfo.needs_review++;
            } else if (result.status === 'error') {
              batchInfo.errors++;
            }

            // Actualizar item en la lista
            const itemIndex = batchInfo.items.findIndex(i => i.item_id === item.item_id);
            if (itemIndex !== -1) {
              batchInfo.items[itemIndex] = { ...item, ...result };
            }

            // Actualizar metadata file
            const uploadDir = path.dirname(item.image_path);
            const metadataPath = path.join(uploadDir, `batch_${item.batch_id}.json`);
            await fs.writeFile(metadataPath, JSON.stringify(batchInfo, null, 2));
          }

          this.processing.delete(item.item_id);
          console.log(`✅ [${item.index + 1}/${total}] Completado: ${item.filename}`);

          return { success: true, item };

        } catch (error) {
          console.error(`❌ Error procesando ${item.filename}:`, error.message);
          item.status = 'error';
          item.error_message = error.message;
          this.processing.delete(item.item_id);

          // Registrar en BD como needs_review para que aparezca en el panel de revisión manual
          try {
            const { v4: uuidv4 } = require('uuid');
            await OcrProcessingQueueModel.create({
              id: uuidv4(),
              pickup_id: item.pickup_id,
              batch_id: item.batch_id,
              image_path: item.image_path,
              filename: item.filename,
              status: 'needs_review',
              ocr_raw_text: null,
              ocr_provider: 'ocrspace',
              extracted_data: null,
              confidence_scores: null,
              overall_confidence: 0,
              parser_used: null,
              fields_extracted: 0,
              is_duplicate: false,
              auto_approved: false,
              package_id: null,
              error_message: `Error de procesamiento OCR: ${error.message}`,
              processing_started_at: item.processing_started_at,
              processed_at: new Date()
            });
            console.log(`⚠️  Imagen con error registrada en BD como needs_review: ${item.filename}`);

            // Actualizar batch info
            const batchInfo = this.results.get(item.batch_id);
            if (batchInfo) {
              batchInfo.processed++;
              batchInfo.needs_review++;
              const itemIndex = batchInfo.items.findIndex(i => i.item_id === item.item_id);
              if (itemIndex !== -1) batchInfo.items[itemIndex] = { ...item, status: 'needs_review', error_message: error.message };
            }
          } catch (dbError) {
            console.error(`❌ Error al registrar imagen fallida en BD:`, dbError.message);
          }

          return { success: false, item, error };
        }
      });

      // Esperar a que termine el lote actual
      await Promise.all(promises);

      // Pausa breve entre lotes para evitar rate limiting (solo si quedan más imágenes)
      if (this.queue.length > 0) {
        console.log(`⏱️  Pausa de ${DELAY_BETWEEN_BATCHES}ms antes del siguiente lote...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    this.isProcessing = false;
    console.log('✅ Procesamiento de cola completado');

    // Cerrar el pickup automáticamente al finalizar el batch
    await this.finalizePickupIfBatchComplete();
  }

  /**
   * Finaliza el pickup si su batch está completamente procesado
   */
  async finalizePickupIfBatchComplete() {
    try {
      // Obtener todos los batch_ids únicos procesados
      const batchIds = Array.from(this.results.keys());

      for (const batchId of batchIds) {
        const batchInfo = this.results.get(batchId);

        // Si el batch está completo (todas las imágenes procesadas)
        if (batchInfo && batchInfo.processed === batchInfo.total_images) {
          const pickupId = batchInfo.pickup_id;

          console.log(`\n📦 Batch ${batchId} completado (${batchInfo.processed}/${batchInfo.total_images})`);
          console.log(`   ✓ Auto-aprobados: ${batchInfo.auto_approved}`);
          console.log(`   ⚠️  Requieren revisión: ${batchInfo.needs_review}`);
          console.log(`   ❌ Errores: ${batchInfo.errors}`);

          // Actualizar el pickup a RECOLECCION_FINALIZADA_DRIVER
          const { Pickup } = require('../models');
          const pickup = await Pickup.findByPk(pickupId);

          if (pickup) {
            // Estados permitidos para sobreescribir (es decir, evitar sobreescribir si ya está en almacén)
            const preventOverwriteStatuses = ['ENTREGADO_EN_ALMACEN', 'VERIFICADO_EN_ALMACEN', 'CANCELADO'];

            if (pickup.status !== 'RECOLECCION_FINALIZADA_DRIVER' && !preventOverwriteStatuses.includes(pickup.status)) {
              await pickup.update({
                status: 'RECOLECCION_FINALIZADA_DRIVER',
                pickup_completed_by_driver_at: new Date()
              });

              console.log(`✅ Pickup ${pickupId} actualizado a RECOLECCION_FINALIZADA_DRIVER`);
            } else {
              console.log(`ℹ️  Pickup ${pickupId} retiene su estado actual (${pickup.status}), evitando regresión de estado.`);
            }
          } else {
            console.log(`ℹ️  Pickup no encontrado: ${pickupId}`);
          }
        }
      }
    } catch (error) {
      console.error('⚠️  Error al finalizar pickup:', error.message);
      // No lanzar error, es un paso adicional no crítico
    }
  }

  /**
   * Procesa una imagen individual
   */
  async processImage(item) {
    try {
      console.log(`\n┌─────────────────────────────────────────────────────`);
      console.log(`│ 🔍 INICIANDO PROCESAMIENTO DE IMAGEN`);
      console.log(`├─────────────────────────────────────────────────────`);
      console.log(`│ Archivo: ${item.filename}`);
      console.log(`│ Pickup ID: ${item.pickup_id}`);
      console.log(`│ Batch ID: ${item.batch_id}`);
      console.log(`└─────────────────────────────────────────────────────\n`);

      // 1. Optimizar imagen (Movido desde saveImage para no bloquear el upload)
      console.log(`🖼️ [1/6] Optimizando imagen en background...`);
      const rawBuffer = await fs.readFile(item.image_path);

      let imageBuffer;
      try {
        imageBuffer = await sharp(rawBuffer)
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();

        // Sobrescribir el archivo original con la versión optimizada para ahorrar espacio
        await fs.writeFile(item.image_path, imageBuffer);
        console.log(`✓ Imagen optimizada: ${rawBuffer.length} -> ${imageBuffer.length} bytes`);
      } catch (sharpError) {
        console.warn(`⚠️ Error optimizando imagen (usando original): ${sharpError.message}`);
        imageBuffer = rawBuffer;
      }

      const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
      console.log(`✓ Imagen leída y preparada para OCR`);

      // 2. Intentar decodificar QR primero (para obtener tracking code)
      console.log(`\n📱 [2/6] Intentando decodificar código QR...`);
      let qrTrackingCode = null;
      try {
        const qrContent = await decodeQRFromImage(base64Image);
        if (qrContent) {
          console.log(`✓ QR decodificado: ${qrContent.substring(0, 100)}...`);
          qrTrackingCode = extractTrackingCodeFromQR(qrContent);
          if (qrTrackingCode) {
            console.log(`✅ Tracking code extraído del QR: ${qrTrackingCode}`);
          } else {
            console.log(`⚠️  QR decodificado pero no se pudo extraer tracking code`);
          }
        } else {
          console.log(`ℹ️  No se encontró QR code en la imagen (continuando con OCR del texto)`);
        }
      } catch (error) {
        console.log(`⚠️  Error al decodificar QR: ${error.message} (continuando con OCR del texto)`);
      }

      // 3. OCR del texto (para resto de información)
      console.log(`\n🔤 [3/6] Llamando a proveedor OCR para extraer texto...`);
      const ocrText = await this.callOcrProvider(base64Image);
      console.log(`✓ OCR completado: ${ocrText.length} caracteres extraídos`);
      console.log(`📝 Texto extraído:\n${ocrText.substring(0, 200)}...`);

      if (!ocrText || ocrText.length < 20) {
        console.log(`❌ Texto insuficiente (${ocrText.length} caracteres)`);
        return {
          status: 'error',
          error_message: 'No se pudo extraer texto suficiente de la imagen',
          ocr_text: ocrText,
          processed_at: new Date().toISOString()
        };
      }

      // 4. Extracción inteligente (usando QR tracking code si está disponible)
      console.log(`\n🧠 [4/6] Extrayendo datos estructurados (con aprendizaje)...`);
      let extracted;
      try {
        extracted = await extractDataWithLearning(ocrText, qrTrackingCode);
      } catch (learningErr) {
        console.warn('⚠️ Fallback a extracción sin aprendizaje:', learningErr.message);
        extracted = extractData(ocrText, qrTrackingCode);
      }
      console.log(`✓ Parser usado: ${extracted.parser_used}`);
      console.log(`✓ Campos extraídos: ${extracted.fields_extracted}`);
      console.log(`✓ Confianza general: ${extracted.overall_confidence}%`);
      console.log(`📦 Datos extraídos:`, JSON.stringify(extracted.data, null, 2));

      // MEJORA: Si es un tracking code de Mercado Libre, intentar consultar la información oficial en ML Gateway
      const trackingCodeToVerify = (extracted.data.tracking_code || '').replace(/[\s-]/g, '');
      const isML = /^(4\d{10}|3\d{9,10}|2[1-9]\d{10,14})$/.test(trackingCodeToVerify);
      let isMLAutoImport = false;
      let mlShipmentData = null;

      if (isML) {
        try {
          console.log(`\n🔄 [ML-GATEWAY-PRECHECK] Verificando tracking ML: ${trackingCodeToVerify}`);
          const mlGatewayClient = require('../services/mlGatewayClient');
          const { Pickup } = require('../models');
          const pickup = await Pickup.findByPk(item.pickup_id);
          
          if (pickup) {
            const pendingData = await mlGatewayClient.getPendingShipments({ search: trackingCodeToVerify });
            if (pendingData && pendingData.shipments && pendingData.shipments.length > 0) {
              const shipment = pendingData.shipments.find(s => String(s.ml_shipment_external_id) === String(trackingCodeToVerify));
              if (shipment) {
                // Validar vinculación con la cuenta de ML dueña del paquete y el cliente del Pickup
                const accountsData = await mlGatewayClient.getAccounts();
                const clientAccounts = (accountsData.accounts || [])
                  .filter(a => a.client_id === pickup.client_id)
                  .map(a => a.ml_account_id);
                
                if (clientAccounts.includes(shipment.ml_account_id)) {
                  console.log(`   ✅ Envío ML vinculado encontrado en Gateway!`);
                  isMLAutoImport = true;
                  mlShipmentData = shipment;
                } else {
                  console.log(`   ℹ️  Envío ML encontrado pero no pertenece a una cuenta vinculada de este cliente.`);
                }
              }
            }
          }
        } catch (mlErr) {
          console.error(`   ⚠️  Error al consultar Gateway ML en pre-check:`, mlErr.message);
        }
      }

      if (isMLAutoImport && mlShipmentData) {
        let destinationAddress = mlShipmentData.buyer_address || 'Dirección de MercadoLibre';
        try {
          const parsedJson = JSON.parse(destinationAddress);
          if (parsedJson.address_line) destinationAddress = parsedJson.address_line;
        } catch(e) {}

        extracted.data.recipient_name = mlShipmentData.buyer_name || extracted.data.recipient_name || 'Destinatario MercadoLibre';
        extracted.data.destination_address = destinationAddress;
        extracted.data.recipient_phone = mlShipmentData.buyer_phone || extracted.data.recipient_phone || '';
        extracted.data.external_tracking_code = trackingCodeToVerify;
        
        // Usar datos oficiales y forzar auto-aprobación
        extracted.overall_confidence = 100;
        console.log(`   ✅ Datos extraídos sobreescritos con la info oficial y limpia de MercadoLibre.`);
      }

      // 5. Decisión automática
      console.log(`\n⚖️  [5/6] Evaluando auto-aprobación...`);
      let autoApprove = shouldAutoApprove(extracted);
      if (isMLAutoImport) {
        autoApprove = true;
        console.log(`✓ Decisión: ✅ AUTO-APROBAR (Forzado por auto-importación ML)`);
      } else {
        console.log(`✓ Decisión: ${autoApprove ? '✅ AUTO-APROBAR' : '⚠️ REQUIERE REVISIÓN'}`);
      }

      // Obtener precios del batch
      const batchInfo = this.results.get(item.batch_id);
      const batchClientPrice = batchInfo?.client_price || 0;
      const batchDeliveryCost = batchInfo?.delivery_cost || 0;

      console.log(`💰 [BATCH PRICES] Batch ${item.batch_id}:`, {
        batchInfo: !!batchInfo,
        client_price: batchInfo?.client_price,
        delivery_cost: batchInfo?.delivery_cost,
        finalClientPrice: batchClientPrice,
        finalDeliveryCost: batchDeliveryCost
      });

      // Agregar precios del batch a los datos extraídos
      const enrichedExtractedData = {
        ...extracted.data,
        client_price: batchClientPrice,
        delivery_cost: batchDeliveryCost
      };

      console.log(`📦 [ENRICHED DATA] Final extracted_data:`, JSON.stringify(enrichedExtractedData, null, 2));

      const result = {
        status: autoApprove ? 'auto_approved' : 'needs_review',
        auto_approved: autoApprove,
        ocr_text: ocrText,
        extracted_data: enrichedExtractedData,
        confidence_scores: extracted.confidence,
        overall_confidence: extracted.overall_confidence,
        parser_used: extracted.parser_used,
        fields_extracted: extracted.fields_extracted,
        processed_at: new Date().toISOString(),
        package_id: null, // Se llenará si se crea automáticamente
        is_duplicate: false // Se marca si se detecta duplicado
      };

      // 5. Si auto-aprobado, crear paquete automáticamente
      console.log(`\n📦 [6/6] Creación de paquete...`);
      if (autoApprove) {
        console.log(`✅ AUTO-APROBADO: ${enrichedExtractedData.recipient_name} (${extracted.overall_confidence}%)`);
        console.log(`🔨 Intentando crear paquete en la base de datos...`);
        try {
          console.log(`   Pickup ID: ${item.pickup_id}`);
          console.log(`   Datos con precios: ${JSON.stringify(enrichedExtractedData, null, 2)}`);

          const packageResult = await this.createPackage(item.pickup_id, enrichedExtractedData);

          // Si es duplicado, NO crear y marcar para confirmación inmediata
          if (packageResult.needs_confirmation) {
            result.status = 'needs_review';
            result.auto_approved = false;
            result.is_duplicate = true;
            result.duplicate_package = packageResult.duplicate_package;
            result.error_message = `⚠️ DUPLICADO: Ya existe ${packageResult.duplicate_package.tracking_code}. Se requiere confirmación del partner.`;

            console.log(`🛑 PROCESO DETENIDO: Se detectó duplicado del código externo`);
            console.log(`   Paquete existente: ${packageResult.duplicate_package.tracking_code}`);
            console.log(`   ⏸️  Esperando confirmación del partner antes de continuar`);
          } else {
            // No es duplicado, paquete creado exitosamente
            result.package_id = packageResult.package_id;
            result.is_duplicate = false;

            console.log(`✓✓✓ 📦 PAQUETE CREADO EXITOSAMENTE ✓✓✓`);
            console.log(`   Package ID: ${result.package_id}`);
            console.log(`   Tracking Code: ${enrichedExtractedData.tracking_code || 'generado automáticamente'}`);
          }
        } catch (error) {
          console.error(`\n❌❌❌ ERROR AL CREAR PAQUETE ❌❌❌`);
          console.error(`   Mensaje: ${error.message}`);
          console.error(`   Stack: ${error.stack}`);
          // Si falla la creación, marcar para revisión manual
          result.status = 'needs_review';
          result.auto_approved = false;
          result.error_message = `Error al crear paquete: ${error.message}`;
        }
      } else {
        console.log(`⚠️ REQUIERE REVISIÓN: ${enrichedExtractedData.recipient_name || 'Sin nombre'} (${extracted.overall_confidence}%)`);
        console.log(`   Razón: Confianza o campos insuficientes`);
      }

      console.log(`\n╔═════════════════════════════════════════════════════╗`);
      console.log(`║ ✓ RESULTADO FINAL DEL PROCESAMIENTO`);
      console.log(`╠═════════════════════════════════════════════════════╣`);
      console.log(`║ Estado: ${result.status}`);
      console.log(`║ Auto-aprobado: ${result.auto_approved ? 'SÍ' : 'NO'}`);
      console.log(`║ Package ID: ${result.package_id || 'NO CREADO'}`);
      console.log(`║ Confianza: ${result.overall_confidence}%`);
      console.log(`║ Campos: ${result.fields_extracted}`);
      console.log(`╚═════════════════════════════════════════════════════╝\n`);

      // 6. Guardar registro en la base de datos (ocr_processing_queue)
      try {
        const queueRecord = {
          id: uuidv4(), // Generar UUID para el registro
          pickup_id: item.pickup_id,
          batch_id: item.batch_id,
          image_path: item.image_path,
          filename: item.filename,
          status: result.status,
          ocr_raw_text: result.ocr_text,
          ocr_provider: 'ocrspace',
          extracted_data: result.extracted_data,
          confidence_scores: result.confidence_scores,
          overall_confidence: result.overall_confidence,
          parser_used: result.parser_used,
          fields_extracted: result.fields_extracted,
          is_duplicate: result.is_duplicate,
          duplicate_of_package_id: result.duplicate_package ?
            (await Package.findOne({
              where: { tracking_code: result.duplicate_package.tracking_code }
            }))?.package_id : null,
          duplicate_reason: result.is_duplicate ?
            result.error_message : null,
          auto_approved: result.auto_approved,
          package_id: result.package_id,
          error_message: result.error_message || null,
          processing_started_at: item.processing_started_at,
          processed_at: new Date()
        };

        console.log(`💾 Guardando en BD:`, {
          id: queueRecord.id,
          status: queueRecord.status,
          is_duplicate: queueRecord.is_duplicate,
          duplicate_of_package_id: queueRecord.duplicate_of_package_id,
          auto_approved: queueRecord.auto_approved
        });

        await OcrProcessingQueueModel.create(queueRecord);
        console.log(`✅ Registro guardado exitosamente con is_duplicate=${queueRecord.is_duplicate}`);

        // 🧠 Feedback loop: registrar éxito de patrones si fue auto-aprobado
        if (result.auto_approved && result.package_id) {
          try {
            const learningEngine = require('./ocrLearningEngine');
            await learningEngine.recordPatternSuccess(queueRecord.id, true);
          } catch (learnErr) {
            console.warn('⚠️ [LEARNING] Error en feedback loop:', learnErr.message);
          }
        }
      } catch (dbError) {
        console.error(`❌ Error al guardar en BD:`, dbError.message);
        console.error(`Stack:`, dbError.stack);
      }

      return result;

    } catch (error) {
      console.error('\n❌❌❌ ERROR FATAL EN processImage ❌❌❌');
      console.error('Error:', error);
      console.error('Stack:', error.stack);
      throw error;
    }
  }

  /**
   * Llama a OCR.space API con reintentos y fallback de motor
   * - Timeout: 60 segundos por intento
   * - Reintentos: máximo 3 con backoff exponencial (3s / 6s / 12s)
   * - Fallback: en el 2do reintento cambia de Engine 2 a Engine 1
   */
  /**
   * Llama al proveedor de OCR configurado (Local o OCR.space fallback)
   */
  async callOcrProvider(base64Image) {
    const ocrProvider = process.env.OCR_PROVIDER || 'local'; // Por defecto local si no se especifica
    const localUrl = process.env.OCR_LOCAL_URL || 'http://leonexpress_ocr:8000/parse/image';
    const ocrSpaceUrl = 'https://api.ocr.space/parse/image';
    const ocrSpaceKey = process.env.OCR_SPACE_API_KEY || 'K86104641688957';
    
    const MAX_RETRIES = 3;
    const BASE_DELAY_MS = 2000;
    const TIMEOUT_MS = 90000; // Aumentado a 90s para EasyOCR que puede ser lento en CPU

    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      let currentUrl = localUrl;
      let isLocal = true;

      // Estrategia de selección de proveedor y motor
      if (ocrProvider === 'local' && attempt === 1) {
        currentUrl = localUrl;
        isLocal = true;
        console.log(`🤖 Usando OCR LOCAL (Intento ${attempt}/${MAX_RETRIES})...`);
      } else if (ocrProvider === 'external' || attempt > 1) {
        // Si falla el local o se configuró externo, usar OCR.space
        currentUrl = ocrSpaceUrl;
        isLocal = false;
        const engine = attempt === 2 ? '2' : '1';
        console.log(`🌐 Usando OCR.space (Engine ${engine}, Intento ${attempt}/${MAX_RETRIES})...`);
      }

      const form = new FormData();
      form.append('base64Image', base64Image);
      form.append('language', 'spa');
      
      if (!isLocal) {
        form.append('apikey', ocrSpaceKey);
        form.append('detectOrientation', 'true');
        form.append('OCREngine', attempt === 2 ? '2' : '1');
      }

      try {
        if (attempt > 1) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 2);
          console.log(`⏱️  Esperando ${delay}ms para reintento...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const response = await axios.post(currentUrl, form, {
          headers: form.getHeaders(),
          timeout: TIMEOUT_MS,
        });

        if (response.data.IsErroredOnProcessing) {
          const errorMessage = Array.isArray(response.data.ErrorMessage)
            ? response.data.ErrorMessage.join(', ')
            : (response.data.ErrorMessage || 'Error desconocido del servicio OCR');
          throw new Error(errorMessage);
        }

        const text = response.data.ParsedResults?.[0]?.ParsedText || '';
        console.log(`✅ OCR exitoso (vía ${isLocal ? 'LOCAL' : 'EXTERNAL'})`);
        return text;

      } catch (error) {
        lastError = error;
        console.warn(`⚠️  Intento OCR ${attempt} fallido: ${error.message}${isLocal ? ' (Reintentando con fallback)' : ''}`);
        
        // Si es un error crítico o se agotaron los intentos, salir
        if (attempt === MAX_RETRIES) break;
      }
    }

    // Todos los intentos fallaron
    console.error(`❌ El servicio de OCR falló tras ${MAX_RETRIES} intentos: ${lastError?.message}`);
    throw lastError || new Error('No se pudo procesar el OCR después de múltiples intentos');
  }


  /**
   * Crea un paquete automáticamente desde datos OCR extraídos (Sincronizado)
   */
  async createPackage(pickup_id, extractedData) {
    if (!this.packageCreationLock) this.packageCreationLock = Promise.resolve();

    return new Promise((resolve, reject) => {
      this.packageCreationLock = this.packageCreationLock.then(async () => {
        try {
          const result = await this._doCreatePackage(pickup_id, extractedData);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Implementación interna de la creación de paquete
   */
  async _doCreatePackage(pickup_id, extractedData) {
    console.log(`\n┌─────────────────────────────────────────────────────`);
    console.log(`│ 🔨 INICIANDO CREACIÓN DE PAQUETE`);
    console.log(`├─────────────────────────────────────────────────────`);

    try {
      // 1. Validar que el pickup existe y obtener datos necesarios
      console.log(`📋 [1/5] Validando pickup...`);
      console.log(`   Pickup ID: ${pickup_id}`);

      const pickup = await Pickup.findByPk(pickup_id);
      if (!pickup) {
        console.log(`❌ Pickup NO encontrado`);
        throw new Error(`Pickup ${pickup_id} no encontrado`);
      }

      console.log(`✓ Pickup encontrado:`);
      console.log(`   Client ID: ${pickup.client_id}`);
      console.log(`   Fecha: ${pickup.pickup_scheduled_date}`);
      console.log(`   Estado: ${pickup.pickup_status}`);

      // 2. Verificar si hay paquetes con el mismo external_tracking_code
      console.log(`\n🔍 [2/5] Verificando duplicados...`);
      let isDuplicate = false;
      let duplicatePackage = null;

      // Función auxiliar para normalizar texto (para comparación)
      const normalizeText = (text) => {
        if (!text) return '';
        return text.toString()
          .toLowerCase()
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remover acentos
          .replace(/[^a-z0-9\s]/g, '') // Remover caracteres especiales
          .replace(/\s+/g, ' '); // Normalizar espacios
      };

      // Función para comparar si dos paquetes son realmente el mismo
      const areSamePackage = (pkg1, pkg2) => {
        // Normalizar destinatarios
        const recipient1 = normalizeText(pkg1.recipient_name || '');
        const recipient2 = normalizeText(pkg2.recipient_name || '');

        // Normalizar direcciones
        const address1 = normalizeText(pkg1.destination_address || '');
        const address2 = normalizeText(pkg2.destination_address || '');

        // Comparar códigos externos
        const externalCode1 = normalizeText(pkg1.external_tracking_code || '');
        const externalCode2 = normalizeText(pkg2.external_tracking_code || '');

        // Verificar que los códigos externos coincidan
        if (externalCode1 !== externalCode2) {
          return false;
        }

        // Si los códigos coinciden, verificar destinatario y dirección
        // Para ser considerado duplicado REAL, deben coincidir ambos
        const recipientsMatch = recipient1 === recipient2 && recipient1 !== '';
        const addressesMatch = address1 === address2 && address1 !== '';

        // Solo es duplicado si AMBOS (destinatario Y dirección) coinciden
        // Si solo coincide el código pero los datos son diferentes, es probablemente un envío multi-parte
        return recipientsMatch && addressesMatch;
      };

      if (extractedData.external_tracking_code) {
        // Buscar paquetes con el mismo código externo
        const packagesWithSameCode = await Package.findAll({
          where: { external_tracking_code: extractedData.external_tracking_code },
          order: [['created_at', 'DESC']]
        });

        if (packagesWithSameCode.length > 0) {
          console.log(`   ⚠️  CÓDIGO EXTERNO DUPLICADO DETECTADO!`);
          console.log(`   📦 Encontrados ${packagesWithSameCode.length} paquete(s) con código externo: ${extractedData.external_tracking_code}`);

          // Usar el primer paquete encontrado como referencia
          duplicatePackage = packagesWithSameCode[0];
          isDuplicate = true;

          // Verificar si es exactamente el mismo paquete (mismo destinatario y dirección)
          const isSamePackage = areSamePackage(extractedData, {
            recipient_name: duplicatePackage.recipient_name,
            destination_address: duplicatePackage.destination_address,
            external_tracking_code: duplicatePackage.external_tracking_code
          });

          if (isSamePackage) {
            console.log(`   🔴 DUPLICADO EXACTO: Mismo código, destinatario y dirección`);
          } else {
            console.log(`   🟡 POSIBLE MULTI-PARTE: Mismo código pero diferentes datos`);
            console.log(`   📦 Nuevo: ${extractedData.recipient_name} - ${extractedData.destination_address}`);
            console.log(`   📦 Existente: ${duplicatePackage.recipient_name} - ${duplicatePackage.destination_address}`);
          }

          console.log(`   External tracking: ${extractedData.external_tracking_code}`);
          console.log(`   Paquete existente: ${duplicatePackage.tracking_code}`);
          console.log(`   Creado: ${duplicatePackage.created_at}`);
          console.log(`   🛑 ENVIANDO A REVISIÓN - Se requiere confirmación del partner`);

          // CUALQUIER duplicado de código externo debe ir a revisión
          // No importa si parece multi-parte, el partner debe confirmar
          return {
            package_id: null,
            is_duplicate: true,
            duplicate_package: {
              tracking_code: duplicatePackage.tracking_code,
              external_tracking_code: duplicatePackage.external_tracking_code,
              recipient_name: duplicatePackage.recipient_name,
              destination_address: duplicatePackage.destination_address,
              created_at: duplicatePackage.created_at,
              status: duplicatePackage.status
            },
            needs_confirmation: true,
            is_exact_duplicate: isSamePackage // Información adicional para el partner
          };
        } else {
          console.log(`✓ No se encontraron paquetes con el mismo código externo`);
        }
      } else {
        console.log(`ℹ️  Sin código externo, no se verifica duplicado`);
      }

      // 3. Generar tracking code interno (SIEMPRE generado por el sistema)
      console.log(`\n🔢 [3/5] Generando tracking code interno del sistema...`);
      const tracking_code = await this.generateUniqueTrackingCode();
      console.log(`✓ Tracking code interno generado: ${tracking_code}`);

      // 4. Preparar datos del paquete con valores por defecto
      console.log(`\n📦 [4/5] Preparando datos del paquete...`);
      console.log(`   Código interno (tracking_code): ${tracking_code}`);
      console.log(`   Código externo (de etiqueta): ${extractedData.external_tracking_code || 'ninguno'}`);
      console.log(`   Es duplicado: ${isDuplicate ? 'SÍ' : 'NO'}`);

      const packageData = {
        package_id: uuidv4(),
        tracking_code,
        external_tracking_code: extractedData.external_tracking_code || null,

        // Manejo de duplicados
        duplicate_handling: isDuplicate ? 'pending' : null,
        duplicate_notes: isDuplicate
          ? `Duplicado de ${duplicatePackage.tracking_code} (${duplicatePackage.external_tracking_code}). Revisar si es error o envío multi-parte.`
          : null,

        pickup_id: pickup_id,
        client_id: pickup.client_id,
        status: 'RECOLECTADO_EN_ORIGEN',
        is_cod: extractedData.is_cod || false,
        cod_amount: extractedData.cod_amount || 0,
        client_price: extractedData.client_price || 0,
        delivery_cost: extractedData.delivery_cost || 0,
        scanned_at_origin_datetime: new Date(),
        destination_address: extractedData.destination_address || '',
        recipient_name: extractedData.recipient_name || '',
        recipient_phone: extractedData.recipient_phone || '',
      };

      console.log(`✓ Datos del paquete preparados:`);
      console.log(JSON.stringify(packageData, null, 2));

      // 5. Crear el paquete
      console.log(`\n💾 [6/6] Insertando en base de datos...`);
      const newPackage = await Package.create(packageData);

      console.log(`✓✓✓ PAQUETE CREADO EXITOSAMENTE ✓✓✓`);
      console.log(`   Package ID: ${newPackage.package_id}`);
      console.log(`   Tracking Code: ${newPackage.tracking_code}`);
      console.log(`   Destinatario: ${newPackage.recipient_name}`);
      console.log(`   Dirección: ${newPackage.destination_address}`);
      if (isDuplicate) {
        console.log(`   ⚠️  MARCADO COMO DUPLICADO PENDIENTE DE REVISIÓN`);
      }

      // 🚀 Si el paquete tiene tracking ML (Chilean formats: starts with 4 (11 digits), 3 (10-11 digits), or 2 (12-16 digits)), intentar confirmar con el gateway ML
      const extCode = (extractedData.external_tracking_code || '').replace(/[\s-]/g, '');
      if (/^(4\d{10}|3\d{9,10}|2\d{11,15})$/.test(extCode)) {
        console.log(`\n🔄 [ML-GATEWAY] Tracking ML detectado: ${extCode}`);
        console.log(`   Intentando confirmar con el gateway de MercadoLibre...`);
        
        try {
          const mlGatewayClient = require('../services/mlGatewayClient');
          
          // Buscar el envío en el gateway
          const pendingData = await mlGatewayClient.getPendingShipments({ search: extCode });
          
          if (pendingData && pendingData.shipments && pendingData.shipments.length > 0) {
            // Buscar coincidencia exacta
            const shipment = pendingData.shipments.find(s => 
              String(s.ml_shipment_external_id) === String(extCode)
            );
            
            if (shipment) {
              // Validar que la cuenta ML pertenezca al cliente del pickup
              const accountsData = await mlGatewayClient.getAccounts();
              const clientAccounts = (accountsData.accounts || [])
                .filter(a => a.client_id === pickup.client_id)
                .map(a => a.ml_account_id);
              
              if (clientAccounts.includes(shipment.ml_account_id)) {
                // ✅ Cuenta vinculada - marcar como importado en el gateway
                console.log(`   ✅ Cuenta ML vinculada encontrada. Marcando como importado...`);
                await mlGatewayClient.markShipmentAsImported(shipment.ml_shipment_id, newPackage.package_id);
                console.log(`   ✅ Envío ML confirmado en gateway: ${extCode}`);
              } else {
                // ❌ Cuenta NO vinculada - el paquete ya se creó vía OCR, solo informar
                console.log(`   ℹ️  Cuenta ML no vinculada a este cliente. Paquete creado vía OCR.`);
              }
            } else {
              console.log(`   ℹ️  No se encontró coincidencia exacta en gateway ML para: ${extCode}`);
            }
          } else {
            console.log(`   ℹ️  No se encontró el envío en el gateway ML (probablemente ya fue importado).`);
          }
        } catch (mlError) {
          // Si falla la comunicación con el gateway, no es crítico - el paquete ya se creó
          console.log(`   ⚠️  Error al confirmar con gateway ML (no crítico): ${mlError.message}`);
        }
      }

      console.log(`└─────────────────────────────────────────────────────\n`);

      return {
        package_id: newPackage.package_id,
        is_duplicate: isDuplicate
      };

    } catch (error) {
      console.error(`\n❌❌❌ ERROR EN createPackage ❌❌❌`);
      console.error(`   Pickup ID: ${pickup_id}`);
      console.error(`   Error: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
      console.error(`└─────────────────────────────────────────────────────\n`);
      throw error;
    }
  }

  /**
   * Genera un código de seguimiento único
   */
  async generateUniqueTrackingCode() {
    const prefix = 'LE';
    const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    const tracking_code = `${prefix}${randomNum}`;

    console.log(`   🎲 Código generado: ${tracking_code}`);

    // Verificar si ya existe
    const existing = await Package.findOne({ where: { tracking_code } });
    if (existing) {
      console.log(`   ⚠️ Código duplicado, generando otro...`);
      // Si existe, intentar de nuevo recursivamente
      return this.generateUniqueTrackingCode();
    }

    console.log(`   ✓ Código único confirmado`);
    return tracking_code;
  }

  /**
   * Obtiene el estado de un batch
   */
  async getBatchStatus(batch_id) {
    return this.results.get(batch_id) || null;
  }

  /**
   * Busca si hay un batch activo (procesándose) para un pickup específico
   */
  getActiveBatchForPickup(pickup_id) {
    const allBatches = Array.from(this.results.values());
    // Buscamos el batch más reciente para ese pickup que no esté completo
    return allBatches
      .filter(b => b.pickup_id === pickup_id && b.processed < b.total_images)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  }

  /**
   * Obtiene estadísticas en tiempo real
   */
  getStats() {
    const allBatches = Array.from(this.results.values());

    return {
      total_batches: allBatches.length,
      queued: this.queue.length,
      processing: this.processing.size,
      total_processed: allBatches.reduce((sum, b) => sum + b.processed, 0),
      total_auto_approved: allBatches.reduce((sum, b) => sum + b.auto_approved, 0),
      total_needs_review: allBatches.reduce((sum, b) => sum + b.needs_review, 0),
      total_errors: allBatches.reduce((sum, b) => sum + b.errors, 0),
    };
  }
}

// Singleton instance
const queueInstance = new OcrProcessingQueue();

module.exports = queueInstance;
