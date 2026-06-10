const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authenticateToken');
const { Package, OcrProcessingQueue, Pickup } = require('../models');
const { v4: uuidv4 } = require('uuid');

/**
 * Genera un tracking code único
 */
async function generateUniqueTrackingCode() {
  const prefix = 'LE';
  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const randomPart = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    const trackingCode = prefix + randomPart;
    const existing = await Package.findOne({
      where: { tracking_code: trackingCode }
    });
    if (!existing) {
      return trackingCode;
    }
  }
  throw new Error('No se pudo generar un código de seguimiento único después de 10 intentos');
}

/**
 * POST /api/ocr-duplicate/confirm
 * Confirmar qué hacer con un duplicado detectado durante el escaneo
 * 
 * Body:
 * {
 *   queue_id: "id del registro en ocr_processing_queue",
 *   action: "create" | "return",
 *   notes: "opcional"
 * }
 */
router.post('/confirm', authenticateToken, async (req, res) => {
  try {
    const { queue_id, action, notes } = req.body;
    const user_id = req.user.user_id;

    console.log('🔍 [DUPLICATE CONFIRM] Request received:', {
      queue_id,
      action,
      notes: notes ? notes.substring(0, 50) + '...' : null,
      user_id
    });

    // Validar acción
    if (!['create', 'return', 'discard'].includes(action)) {
      console.log('❌ [DUPLICATE CONFIRM] Invalid action:', action);
      return res.status(400).json({
        error: 'Acción inválida',
        message: 'action debe ser "create", "return" o "discard"'
      });
    }

    // Buscar el registro en la cola
    const queueItem = await OcrProcessingQueue.findByPk(queue_id, {
      include: [
        {
          model: Pickup,
          as: 'pickup',
          attributes: ['pickup_id', 'client_id', 'pickup_scheduled_date']
        }
      ]
    });

    console.log('🔍 [DUPLICATE CONFIRM] Queue item found:', {
      found: !!queueItem,
      queue_id,
      status: queueItem?.status,
      is_duplicate: queueItem?.is_duplicate
    });

    if (!queueItem) {
      console.log('❌ [DUPLICATE CONFIRM] Queue item not found');
      return res.status(404).json({
        error: 'Registro no encontrado',
        message: `No se encontró el registro con ID ${queue_id}`
      });
    }

    // Verificar que sea un duplicado pendiente de confirmación
    const isValidStatus = queueItem.status === 'needs_review' || (queueItem.status === 'error' && !queueItem.reviewed_by);
    if (!queueItem.is_duplicate || !isValidStatus) {
      console.log('❌ [DUPLICATE CONFIRM] Invalid state:', {
        is_duplicate: queueItem.is_duplicate,
        status: queueItem.status,
        reviewed_by: queueItem.reviewed_by
      });
      return res.status(400).json({
        error: 'Estado inválido',
        message: 'Este registro no es un duplicado pendiente de confirmación'
      });
    }

    const extractedData = queueItem.extracted_data;

    // El campo extracted_data es JSON en Sequelize, así que ya viene parseado como objeto
    // Pero por si acaso viene como string, lo parseamos
    let parsedExtractedData = extractedData;
    if (typeof extractedData === 'string') {
      try {
        parsedExtractedData = JSON.parse(extractedData);
      } catch (e) {
        console.error('❌ [DUPLICATE CONFIRM] Error parsing extractedData:', e);
        parsedExtractedData = {};
      }
    }

    console.log('🔍 [DUPLICATE CONFIRM] Raw extractedData:', extractedData);
    console.log('🔍 [DUPLICATE CONFIRM] Parsed extractedData:', parsedExtractedData);
    console.log('🔍 [DUPLICATE CONFIRM] External tracking code:', parsedExtractedData.external_tracking_code);

    // Obtener valores de precio/costo desde el paquete original si no vienen en extractedData
    let clientPrice = parsedExtractedData.client_price;
    let deliveryCost = parsedExtractedData.delivery_cost;

    // Convertir a número si es necesario
    if (typeof clientPrice === 'string') {
      clientPrice = parseFloat(clientPrice) || null;
    } else if (typeof clientPrice !== 'number') {
      clientPrice = null;
    }

    if (typeof deliveryCost === 'string') {
      deliveryCost = parseFloat(deliveryCost) || null;
    } else if (typeof deliveryCost !== 'number') {
      deliveryCost = null;
    }

    const extCode = parsedExtractedData.external_tracking_code;
    // REFINAMIENTO: Solo bloquear si el parser identificó explícitamente que es Mercado Libre
    // Esto permite que códigos de Cruzec (que también empiezan con 2000) pasen si el parser es 'CRUZEC' o 'Generic'
    if (extCode && extCode.startsWith('20000') && extCode.length === 16 && queueItem.parser_used === 'Mercado Libre') {
      return res.status(400).json({
        error: 'Código inválido: ID de Venta detectado',
        message: `El código '${extCode}' corresponde a un ID de Venta interno de Mercado Libre. Por favor use el código de Envío (4...).`
      });
    }

    console.log('💰 [DUPLICATE CONFIRM] Price/Cost from extractedData:', {
      clientPrice,
      deliveryCost,
      hasOriginalPackage: !!queueItem.duplicate_of_package_id,
      extractedClientPrice: parsedExtractedData.client_price,
      extractedDeliveryCost: parsedExtractedData.delivery_cost,
      extractedClientPriceType: typeof parsedExtractedData.client_price,
      extractedDeliveryCostType: typeof parsedExtractedData.delivery_cost
    });

    if (action === 'discard') {
      console.log('🗑️ [DUPLICATE CONFIRM] Processing DISCARD action');
      try {
        // Simplemente marcamos el registro de la cola OCR como descartado (error)
        await queueItem.update({
          status: 'error',
          reviewed_by: user_id,
          reviewed_at: new Date(),
          reviewer_notes: notes || 'Descartado - Foto repetida de la misma recolección'
        });

        console.log(`🗑️ DUPLICADO DESCARTADO:`);
        console.log(`   Queue ID: ${queue_id}`);

        return res.json({
          success: true,
          action: 'discard',
          message: 'Registro original mantenido. Duplicado escaneado fue descartado exitosamente.',
          package: null
        });
      } catch (error) {
        console.error('Error al descartar registro duplicado:', error);
        return res.status(500).json({
          error: 'Error al descartar el registro duplicado',
          message: error.message
        });
      }
    } else if (action === 'return') {
      console.log('🔄 [DUPLICATE CONFIRM] Processing RETURN action');
      // CREAR paquete con estado DEVUELTO_A_CLIENTE para auditoría
      try {
        const trackingCode = await generateUniqueTrackingCode();
        // Validar que el código externo exista
        if (!parsedExtractedData.external_tracking_code) {
          console.log('❌ [DUPLICATE CONFIRM] Missing external_tracking_code for RETURN');
          return res.status(400).json({
            error: 'Código externo obligatorio',
            message: 'No se puede crear el paquete de devolución sin código externo. Verifica el registro OCR.'
          });
        }

        const packageData = {
          package_id: uuidv4(),
          tracking_code: trackingCode,
          external_tracking_code: parsedExtractedData.external_tracking_code,
          duplicate_handling: 'error_return',
          duplicate_notes: notes || 'Duplicado - Error del cliente. Paquete devuelto.',
          duplicate_reviewed_by: user_id,
          duplicate_reviewed_at: new Date(),
          pickup_id: queueItem.pickup_id,
          client_id: queueItem.pickup.client_id,
          status: 'DEVUELTO_A_CLIENTE',
          recipient_name: parsedExtractedData.recipient_name || 'Sin nombre',
          recipient_phone: parsedExtractedData.recipient_phone || '',
          destination_address: parsedExtractedData.destination_address || '',
          destination_city: parsedExtractedData.destination_city || '',
          destination_department: parsedExtractedData.destination_department || '',
          is_cod: false,
          cod_amount: 0,
          client_price: 0,
          delivery_cost: 0,
          scanned_at_origin_datetime: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        };

        const returnedPackage = await Package.create(packageData);

        // Actualizar cola
        await queueItem.update({
          status: 'completed',
          package_id: returnedPackage.package_id,
          reviewed_by: user_id,
          reviewed_at: new Date(),
          reviewer_notes: notes || 'Duplicado confirmado como error - devuelto al cliente'
        });

        console.log(`📦 DUPLICADO MARCADO PARA DEVOLUCIÓN:`);
        console.log(`   Queue ID: ${queue_id}`);
        console.log(`   Package ID: ${returnedPackage.package_id}`);
        console.log(`   Tracking Code: ${returnedPackage.tracking_code}`);
        console.log(`   External Code: ${returnedPackage.external_tracking_code}`);
        console.log(`   Estado: DEVUELTO_A_CLIENTE`);
        console.log(`   Razón: ${packageData.duplicate_notes}`);

        return res.json({
          success: true,
          action: 'return',
          message: 'Paquete creado con estado DEVUELTO_A_CLIENTE para registro de auditoría',
          package: {
            package_id: returnedPackage.package_id,
            tracking_code: returnedPackage.tracking_code,
            external_tracking_code: returnedPackage.external_tracking_code,
            status: returnedPackage.status,
            duplicate_handling: returnedPackage.duplicate_handling
          }
        });

      } catch (error) {
        console.error('Error al crear paquete de devolución:', error);
        return res.status(500).json({
          error: 'Error al crear registro de devolución',
          message: error.message
        });
      }

    } else if (action === 'create') {
      console.log('🔄 [DUPLICATE CONFIRM] Processing CREATE action');
      // CREAR paquete como multi-parte
      try {
        // Determinar el estado del paquete basado en el estado del pickup
        let packageStatus = 'RECOLECTADO_EN_ORIGEN';
        const pickupStatus = queueItem.pickup.status;

        if (pickupStatus === 'ENTREGADO_EN_ALMACEN' || pickupStatus === 'VERIFICADO_EN_ALMACEN') {
          packageStatus = 'RECIBIDO_EN_ALMACEN';
          console.log(`📦 Paquete se creará con estado ${packageStatus} porque pickup ya está en ${pickupStatus}`);
        }

        // Si no tenemos precios, intentar obtenerlos del paquete original
        if ((!clientPrice || !deliveryCost) && queueItem.duplicate_of_package_id) {
          const originalPackage = await Package.findOne({ where: { package_id: queueItem.duplicate_of_package_id } });
          if (originalPackage) {
            if (!clientPrice) clientPrice = parseFloat(originalPackage.client_price) || 0;
            if (!deliveryCost) deliveryCost = parseFloat(originalPackage.delivery_cost) || 0;
            console.log('💰 [DUPLICATE CONFIRM] Price/Cost from original package:', {
              clientPrice,
              deliveryCost,
              originalClientPrice: originalPackage.client_price,
              originalDeliveryCost: originalPackage.delivery_cost
            });
          }
        }

        // Generar tracking code
        const trackingCode = await generateUniqueTrackingCode();
        // Si aún no existen, lanzar error
        if (typeof clientPrice !== 'number' || typeof deliveryCost !== 'number') {
          console.log('❌ [DUPLICATE CONFIRM] Missing price/cost values:', {
            clientPrice: typeof clientPrice,
            deliveryCost: typeof deliveryCost
          });
          return res.status(400).json({
            error: 'Faltan valores de precio/costo',
            message: 'No se pudo obtener client_price o delivery_cost para el paquete multi-parte.'
          });
        }

        const packageData = {
          package_id: uuidv4(),
          tracking_code: trackingCode,
          external_tracking_code: parsedExtractedData.external_tracking_code || null,
          duplicate_handling: 'multi_part',
          duplicate_notes: notes || 'Envío multi-parte confirmado por admin/warehouse',
          duplicate_reviewed_by: user_id,
          duplicate_reviewed_at: new Date(),
          pickup_id: queueItem.pickup_id,
          client_id: queueItem.pickup.client_id,
          status: packageStatus,
          recipient_name: parsedExtractedData.recipient_name || 'Sin nombre',
          recipient_phone: parsedExtractedData.recipient_phone || '',
          destination_address: parsedExtractedData.destination_address || '',
          destination_city: parsedExtractedData.destination_city || '',
          destination_department: parsedExtractedData.destination_department || '',
          is_cod: typeof parsedExtractedData.is_cod !== 'undefined' ? parsedExtractedData.is_cod : false,
          cod_amount: typeof parsedExtractedData.cod_amount !== 'undefined' ? parsedExtractedData.cod_amount : 0,
          client_price: clientPrice,
          delivery_cost: deliveryCost,
          scanned_at_origin_datetime: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        };

        console.log('📦 [DUPLICATE CONFIRM] Package data to create:', {
          external_tracking_code: packageData.external_tracking_code,
          client_price: packageData.client_price,
          delivery_cost: packageData.delivery_cost
        });

        const newPackage = await Package.create(packageData);

        // Actualizar cola
        await queueItem.update({
          status: 'completed',
          package_id: newPackage.package_id,
          reviewed_by: user_id,
          reviewed_at: new Date(),
          reviewer_notes: notes || 'Duplicado confirmado como multi-parte'
        });

        console.log(`✅ PAQUETE MULTI-PARTE CREADO:`);
        console.log(`   Queue ID: ${queue_id}`);
        console.log(`   Package ID: ${newPackage.package_id}`);
        console.log(`   Tracking Code: ${newPackage.tracking_code}`);
        console.log(`   External Code: ${newPackage.external_tracking_code}`);

        return res.json({
          success: true,
          action: 'create',
          message: 'Paquete multi-parte creado exitosamente',
          package: {
            package_id: newPackage.package_id,
            tracking_code: newPackage.tracking_code,
            external_tracking_code: newPackage.external_tracking_code,
            duplicate_handling: newPackage.duplicate_handling
          }
        });
      } catch (error) {
        console.error('Error al crear paquete multi-parte:', error);
        return res.status(500).json({
          error: 'Error al crear paquete multi-parte',
          message: error.message
        });
      }
    }
  } catch (error) {
    console.error('Error en el procesamiento de confirmación de duplicado:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      message: error.message
    });
  }
});

module.exports = router;