const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authenticateToken');
const { OcrProcessingQueue, Package, Pickup, Client, User } = require('../models');
const { Op } = require('sequelize');
const learningEngine = require('../utils/ocrLearningEngine');

/**
 * Middleware para verificar que el usuario sea ADMIN o WAREHOUSE_STAFF
 */
const authorizeReview = (req, res, next) => {
  const userRole = req.user.role;

  if (!['ADMIN', 'WAREHOUSE_STAFF'].includes(userRole)) {
    return res.status(403).json({
      error: 'Acceso denegado',
      message: 'Solo ADMIN y WAREHOUSE_STAFF pueden revisar paquetes OCR'
    });
  }

  next();
};

/**
 * GET /api/ocr-review/pending
 * Lista todos los paquetes que requieren revisión manual
 */
router.get('/pending', authenticateToken, authorizeReview, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, type = 'all' } = req.query;
    const offset = (page - 1) * pageSize;

    // Construir filtros según el tipo
    let whereClause = {
      [Op.or]: [
        { status: 'needs_review' },
        {
          status: 'error',
          reviewed_by: { [Op.is]: null }
        }
      ]
    };

    if (type === 'duplicates') {
      // Solo duplicados
      whereClause.is_duplicate = true;
    } else if (type === 'low_confidence') {
      // Solo baja confianza (sin duplicados)
      whereClause.is_duplicate = false;
      whereClause.overall_confidence = { [Op.lt]: 75 };
    } else if (type === 'all') {
      // Todos EXCEPTO duplicados (los duplicados tienen su propia pestaña)
      whereClause.is_duplicate = false;
    }

    // Obtener registros de la cola OCR
    const { count, rows: queueItems } = await OcrProcessingQueue.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Pickup,
          as: 'pickup',
          include: [
            {
              model: Client,
              as: 'client',
              attributes: ['client_id', 'client_name', 'email', 'phone']
            },
            {
              model: User,
              as: 'driver',
              attributes: ['user_id', 'username', 'full_name']
            }
          ]
        },
        {
          model: Package,
          as: 'package',
          required: false,
          attributes: ['package_id', 'tracking_code', 'external_tracking_code', 'status',
            'duplicate_handling', 'duplicate_notes']
        }
      ],
      order: [['created_at', 'ASC']],
      limit: parseInt(pageSize),
      offset: offset
    });

    // Formatear respuesta
    const items = await Promise.all(queueItems.map(async (item) => {
      // Si es duplicado, buscar el paquete original
      let duplicatePackage = null;
      if (item.is_duplicate && item.duplicate_of_package_id) {
        duplicatePackage = await Package.findOne({
          where: { package_id: item.duplicate_of_package_id },
          attributes: ['package_id', 'tracking_code', 'external_tracking_code',
            'recipient_name', 'recipient_phone', 'destination_address',
            'status', 'created_at']
        });
        
        if (duplicatePackage) {
          const origOcr = await OcrProcessingQueue.findOne({
            where: { package_id: duplicatePackage.package_id },
            attributes: ['image_path'],
            order: [['created_at', 'DESC']]
          });
          duplicatePackage.dataValues.image_path = origOcr ? origOcr.image_path : null;
        }
      }

      return {
        id: item.id,
        batch_id: item.batch_id,
        filename: item.filename,
        image_path: item.image_path,
        status: item.status,
        created_at: item.created_at,
        processed_at: item.processed_at,

        // Datos OCR (parsear JSON si es string)
        ocr_raw_text: item.ocr_raw_text,
        extracted_data: typeof item.extracted_data === 'string'
          ? JSON.parse(item.extracted_data)
          : item.extracted_data,
        confidence_scores: typeof item.confidence_scores === 'string'
          ? JSON.parse(item.confidence_scores)
          : item.confidence_scores,
        overall_confidence: item.overall_confidence,
        parser_used: item.parser_used,
        fields_extracted: item.fields_extracted,

        // Duplicado
        is_duplicate: item.is_duplicate,
        duplicate_of_package_id: item.duplicate_of_package_id,
        duplicate_reason: item.duplicate_reason,
        duplicate_package: duplicatePackage ? duplicatePackage.toJSON() : null,

        // Paquete creado (si existe)
        package: item.package ? {
          package_id: item.package.package_id,
          tracking_code: item.package.tracking_code,
          external_tracking_code: item.package.external_tracking_code,
          status: item.package.status,
          duplicate_handling: item.package.duplicate_handling,
          duplicate_notes: item.package.duplicate_notes
        } : null,

        // Información del pickup
        pickup: {
          pickup_id: item.pickup.pickup_id,
          client_id: item.pickup.client_id, // ✅ AGREGADO: client_id directo para fácil acceso
          pickup_scheduled_date: item.pickup.pickup_scheduled_date,
          pickup_status: item.pickup.pickup_status,
          client: item.pickup.client ? {
            client_id: item.pickup.client.client_id,
            client_name: item.pickup.client.client_name,
            email: item.pickup.client.email,
            phone: item.pickup.client.phone
          } : null,
          driver: item.pickup.driver ? {
            user_id: item.pickup.driver.user_id,
            name: item.pickup.driver.full_name,
            username: item.pickup.driver.username
          } : null
        }
      };
    }));

    res.json({
      items,
      pagination: {
        total: count,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(count / pageSize)
      },
      summary: {
        total_pending: count,
        type: type
      }
    });

  } catch (error) {
    console.error('Error al obtener paquetes pendientes de revisión:', error);
    res.status(500).json({
      error: 'Error al obtener paquetes pendientes',
      message: error.message
    });
  }
});

/**
 * GET /api/ocr-review/stats
 * Estadísticas de la cola de revisión OCR
 */
router.get('/stats', authenticateToken, authorizeReview, async (req, res) => {
  try {
    const [total_pending, total_duplicates, total_low_confidence, total_processed_today] = await Promise.all([
      OcrProcessingQueue.count({
        where: {
          [Op.or]: [
            { status: 'needs_review' },
            { status: 'error', reviewed_by: { [Op.is]: null } }
          ]
        }
      }),
      OcrProcessingQueue.count({
        where: {
          [Op.or]: [
            { status: 'needs_review' },
            { status: 'error', reviewed_by: { [Op.is]: null } }
          ],
          is_duplicate: true
        }
      }),
      OcrProcessingQueue.count({
        where: {
          [Op.or]: [
            { status: 'needs_review' },
            { status: 'error', reviewed_by: { [Op.is]: null } }
          ],
          is_duplicate: false,
          overall_confidence: { [Op.lt]: 75 }
        }
      }),
      OcrProcessingQueue.count({
        where: {
          processed_at: {
            [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      })
    ]);

    res.json({
      total_pending,
      total_duplicates,
      total_low_confidence,
      total_processed_today,
      needs_attention: total_pending > 0
    });

  } catch (error) {
    console.error('Error al obtener estadísticas OCR:', error);
    res.status(500).json({
      error: 'Error al obtener estadísticas',
      message: error.message
    });
  }
});

/**
 * GET /api/ocr-review/grouped
 * Obtener paquetes pendientes agrupados por día y hora
 * Retorna estructura organizada para mostrar en tabs dinámicos
 */
router.get('/grouped', authenticateToken, authorizeReview, async (req, res) => {
  try {
    const { include_duplicates = 'false' } = req.query;

    // Construir filtro base
    const whereClause = {
      [Op.or]: [
        { status: 'needs_review' },
        {
          status: 'error',
          reviewed_by: { [Op.is]: null }
        }
      ]
    };

    // Excluir duplicados por defecto (tienen su propia pestaña)
    if (include_duplicates === 'false') {
      whereClause.is_duplicate = false;
    }

    // Obtener todos los paquetes pendientes
    const queueItems = await OcrProcessingQueue.findAll({
      where: whereClause,
      include: [
        {
          model: Pickup,
          as: 'pickup',
          include: [
            {
              model: Client,
              as: 'client',
              attributes: ['client_id', 'client_name', 'email', 'phone']
            },
            {
              model: User,
              as: 'driver',
              attributes: ['user_id', 'username', 'full_name']
            }
          ]
        },
        {
          model: Package,
          as: 'package',
          required: false,
          attributes: ['package_id', 'tracking_code', 'external_tracking_code', 'status']
        }
      ],
      order: [['created_at', 'DESC']] // Más recientes primero
    });

    // --- ENRIQUECIMIENTO DE DUPLICADOS ---
    // Obtener los IDs de los paquetes originales referenciados
    const duplicateIds = queueItems
      .filter(item => item.is_duplicate && item.duplicate_of_package_id)
      .map(item => item.duplicate_of_package_id);

    // Buscar los datos de los paquetes originales
    let originalPackagesMap = {};
    if (duplicateIds.length > 0) {
      const originalPackages = await Package.findAll({
        where: {
          package_id: { [Op.in]: duplicateIds }
        },
        attributes: ['package_id', 'tracking_code', 'external_tracking_code', 'recipient_name', 'destination_address', 'status', 'created_at']
      });

      originalPackages.forEach(pkg => {
        originalPackagesMap[pkg.package_id] = pkg;
      });
    }
    // --- FIN ENRIQUECIMIENTO ---

    // Función auxiliar para formatear items
    const formatItem = (item) => ({
      id: item.id,
      batch_id: item.batch_id,
      filename: item.filename,
      image_path: item.image_path,
      status: item.status,
      created_at: item.created_at,
      processed_at: item.processed_at,
      ocr_raw_text: item.ocr_raw_text,
      extracted_data: typeof item.extracted_data === 'string'
        ? JSON.parse(item.extracted_data)
        : item.extracted_data,
      confidence_scores: typeof item.confidence_scores === 'string'
        ? JSON.parse(item.confidence_scores)
        : item.confidence_scores,
      overall_confidence: item.overall_confidence,
      parser_used: item.parser_used,
      fields_extracted: item.fields_extracted,
      is_duplicate: item.is_duplicate,
      duplicate_of_package_id: item.duplicate_of_package_id,
      duplicate_reason: item.duplicate_reason,
      duplicate_package: item.duplicate_of_package_id && originalPackagesMap[item.duplicate_of_package_id] ? {
        package_id: originalPackagesMap[item.duplicate_of_package_id].package_id,
        tracking_code: originalPackagesMap[item.duplicate_of_package_id].tracking_code,
        external_tracking_code: originalPackagesMap[item.duplicate_of_package_id].external_tracking_code,
        recipient_name: originalPackagesMap[item.duplicate_of_package_id].recipient_name,
        destination_address: originalPackagesMap[item.duplicate_of_package_id].destination_address,
        status: originalPackagesMap[item.duplicate_of_package_id].status,
        created_at: originalPackagesMap[item.duplicate_of_package_id].created_at
      } : null,
      package: item.package ? {
        package_id: item.package.package_id,
        tracking_code: item.package.tracking_code,
        external_tracking_code: item.package.external_tracking_code,
        status: item.package.status
      } : null,
      pickup: {
        pickup_id: item.pickup.pickup_id,
        client_id: item.pickup.client_id,
        pickup_scheduled_date: item.pickup.pickup_scheduled_date,
        pickup_status: item.pickup.pickup_status,
        client: item.pickup.client ? {
          client_id: item.pickup.client.client_id,
          client_name: item.pickup.client.client_name,
          email: item.pickup.client.email,
          phone: item.pickup.client.phone
        } : null,
        driver: item.pickup.driver ? {
          user_id: item.pickup.driver.user_id,
          name: item.pickup.driver.full_name,
          username: item.pickup.driver.username
        } : null
      }
    });

    // Agrupar por períodos de tiempo
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const last7DaysStart = new Date(todayStart);
    last7DaysStart.setDate(last7DaysStart.getDate() - 7);

    // Grupos de tiempo
    const groups = {
      today: {
        label: 'Hoy',
        date: todayStart.toISOString().split('T')[0],
        items: [],
        hourlyGroups: {} // Subgrupos por hora
      },
      yesterday: {
        label: 'Ayer',
        date: yesterdayStart.toISOString().split('T')[0],
        items: [],
        hourlyGroups: {}
      },
      last7Days: {
        label: 'Últimos 7 días',
        dateRange: {
          start: last7DaysStart.toISOString().split('T')[0],
          end: yesterdayStart.toISOString().split('T')[0]
        },
        items: [],
        dailyGroups: {} // Subgrupos por día
      },
      older: {
        label: 'Más antiguos',
        items: [],
        dailyGroups: {}
      }
    };

    // Clasificar items en grupos
    queueItems.forEach(item => {
      const formattedItem = formatItem(item);
      const itemDate = new Date(item.created_at);
      const itemHour = itemDate.getHours();
      const itemDateStr = itemDate.toISOString().split('T')[0];

      if (itemDate >= todayStart) {
        // Hoy
        groups.today.items.push(formattedItem);
        const hourKey = `${itemHour.toString().padStart(2, '0')}:00`;
        if (!groups.today.hourlyGroups[hourKey]) {
          groups.today.hourlyGroups[hourKey] = {
            hour: hourKey,
            label: `${hourKey} - ${((itemHour + 1) % 24).toString().padStart(2, '0')}:00`,
            items: []
          };
        }
        groups.today.hourlyGroups[hourKey].items.push(formattedItem);
      } else if (itemDate >= yesterdayStart) {
        // Ayer
        groups.yesterday.items.push(formattedItem);
        const hourKey = `${itemHour.toString().padStart(2, '0')}:00`;
        if (!groups.yesterday.hourlyGroups[hourKey]) {
          groups.yesterday.hourlyGroups[hourKey] = {
            hour: hourKey,
            label: `${hourKey} - ${((itemHour + 1) % 24).toString().padStart(2, '0')}:00`,
            items: []
          };
        }
        groups.yesterday.hourlyGroups[hourKey].items.push(formattedItem);
      } else if (itemDate >= last7DaysStart) {
        // Últimos 7 días
        groups.last7Days.items.push(formattedItem);
        if (!groups.last7Days.dailyGroups[itemDateStr]) {
          groups.last7Days.dailyGroups[itemDateStr] = {
            date: itemDateStr,
            label: itemDate.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }),
            items: []
          };
        }
        groups.last7Days.dailyGroups[itemDateStr].items.push(formattedItem);
      } else {
        // Más antiguos
        groups.older.items.push(formattedItem);
        if (!groups.older.dailyGroups[itemDateStr]) {
          groups.older.dailyGroups[itemDateStr] = {
            date: itemDateStr,
            label: itemDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }),
            items: []
          };
        }
        groups.older.dailyGroups[itemDateStr].items.push(formattedItem);
      }
    });

    // Convertir hourlyGroups y dailyGroups de objetos a arrays ordenados
    groups.today.hourlyGroups = Object.values(groups.today.hourlyGroups).sort((a, b) =>
      b.hour.localeCompare(a.hour) // Más recientes primero
    );
    groups.yesterday.hourlyGroups = Object.values(groups.yesterday.hourlyGroups).sort((a, b) =>
      b.hour.localeCompare(a.hour)
    );
    groups.last7Days.dailyGroups = Object.values(groups.last7Days.dailyGroups).sort((a, b) =>
      b.date.localeCompare(a.date) // Más recientes primero
    );
    groups.older.dailyGroups = Object.values(groups.older.dailyGroups).sort((a, b) =>
      b.date.localeCompare(a.date)
    );

    // Resumen de cantidades
    const summary = {
      total: queueItems.length,
      today: groups.today.items.length,
      yesterday: groups.yesterday.items.length,
      last7Days: groups.last7Days.items.length,
      older: groups.older.items.length
    };

    res.json({
      groups,
      summary,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error al obtener paquetes agrupados:', error);
    res.status(500).json({
      error: 'Error al obtener paquetes agrupados',
      message: error.message
    });
  }
});

/**
 * POST /api/ocr-review/:queue_id/approve
 * Aprobar y crear paquete con datos corregidos (o confirmados)
 */
router.post('/:queue_id/approve', authenticateToken, authorizeReview, async (req, res) => {
  try {
    const { queue_id } = req.params;
    const { corrected_data, notes } = req.body;
    const user_id = req.user.user_id;

    console.log('\n🔍 [APPROVE] Iniciando aprobación de paquete OCR');
    console.log('   Queue ID:', queue_id);
    console.log('   User ID:', user_id);
    console.log('   Datos recibidos:', JSON.stringify(corrected_data, null, 2));



    // Buscar el item en la cola
    const queueItem = await OcrProcessingQueue.findByPk(queue_id, {
      include: [{ model: Pickup, as: 'pickup' }]
    });

    if (!queueItem) {
      console.error('❌ [APPROVE] Item no encontrado:', queue_id);
      return res.status(404).json({ error: 'Item no encontrado en la cola' });
    }

    console.log('✅ [APPROVE] Item encontrado:', {
      id: queueItem.id,
      status: queueItem.status,
      pickup_id: queueItem.pickup_id,
      package_id: queueItem.package_id
    });

    // ADVERTENCIA: Código de Venta ML detectado (pero NO bloquear - el reviewer ya decidió aprobar)
    // La validación hard de shouldAutoApprove ya envió esto a revisión manual.
    // Si el reviewer decide aprobar con este código, se respeta su decisión.
    const extCode = corrected_data.external_tracking_code;
    if (extCode && extCode.startsWith('20000') && extCode.length === 16 && queueItem.parser_used === 'Mercado Libre') {
      console.warn(`⚠️ [APPROVE] ADVERTENCIA: Código de Venta ML detectado (${extCode}). El reviewer decidió aprobar de todas formas.`);
    }

    if (queueItem.status !== 'needs_review' && queueItem.status !== 'error') {
      console.warn('⚠️ [APPROVE] Item ya procesado:', queueItem.status);
      return res.status(400).json({
        error: 'Este item ya fue procesado o completado',
        current_status: queueItem.status
      });
    }

    // Si ya tiene un paquete creado, actualizarlo
    if (queueItem.package_id) {
      console.log('📦 [APPROVE] Paquete ya existe, actualizando:', queueItem.package_id);
      const existingPackage = await Package.findByPk(queueItem.package_id);
      if (existingPackage) {
        await existingPackage.update({
          ...corrected_data,
          status: 'RECOLECTADO_EN_ORIGEN' // Confirmar que está listo
        });

        // Actualizar cola
        await queueItem.update({
          status: 'completed',
          auto_approved: false,
          reviewed_by: user_id,
          reviewed_at: new Date(),
          extracted_data: corrected_data
        });

        // 🧠 APRENDIZAJE: Registrar correcciones
        const originalExtracted = typeof queueItem.extracted_data === 'string'
          ? JSON.parse(queueItem.extracted_data)
          : (queueItem.extracted_data || {});
        await learningEngine.recordCorrections(
          queue_id, originalExtracted, corrected_data,
          user_id, queueItem.parser_used, queueItem.ocr_raw_text
        );

        console.log('✅ [APPROVE] Paquete actualizado exitosamente');
        return res.json({
          success: true,
          message: 'Paquete actualizado y aprobado',
          package_id: existingPackage.package_id,
          tracking_code: existingPackage.tracking_code
        });
      }
    }

    // Crear nuevo paquete con datos corregidos
    console.log('📦 [APPROVE] Creando nuevo paquete...');
    const { v4: uuidv4 } = require('uuid');

    // Generar tracking code
    const generateTrackingCode = async () => {
      const prefix = 'LE';
      const randomNum = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      const tracking_code = `${prefix}${randomNum}`;

      const existing = await Package.findOne({ where: { tracking_code } });
      if (existing) {
        return generateTrackingCode(); // Recursivo si existe
      }
      return tracking_code;
    };

    const tracking_code = await generateTrackingCode();
    console.log('🔢 [APPROVE] Tracking code generado:', tracking_code);

    const packageData = {
      package_id: uuidv4(),
      tracking_code,
      external_tracking_code: corrected_data.external_tracking_code || null,
      pickup_id: queueItem.pickup_id,
      client_id: queueItem.pickup.client_id,
      status: 'RECOLECTADO_EN_ORIGEN',
      is_cod: corrected_data.is_cod || false,
      cod_amount: corrected_data.cod_amount || 0,
      client_price: corrected_data.client_price || 0,
      delivery_cost: corrected_data.delivery_cost || 0,
      scanned_at_origin_datetime: new Date(),
      destination_address: corrected_data.destination_address || '',
      recipient_name: corrected_data.recipient_name || '',
      recipient_phone: corrected_data.recipient_phone || ''
    };

    console.log('📋 [APPROVE] Datos del paquete a crear:', JSON.stringify(packageData, null, 2));

    const newPackage = await Package.create(packageData);
    console.log('✅ [APPROVE] Paquete creado:', newPackage.package_id);

    // Actualizar cola
    console.log('📝 [APPROVE] Actualizando estado de la cola...');
    await queueItem.update({
      status: 'completed',
      auto_approved: false,
      package_id: newPackage.package_id,
      reviewed_by: user_id,
      reviewed_at: new Date(),
      extracted_data: corrected_data
    });

    // 🧠 APRENDIZAJE: Registrar las correcciones del reviewer
    const originalExtracted = typeof queueItem.extracted_data === 'string'
      ? JSON.parse(queueItem.extracted_data)
      : (queueItem.extracted_data || {});
    const learningResult = await learningEngine.recordCorrections(
      queue_id, originalExtracted, corrected_data,
      user_id, queueItem.parser_used, queueItem.ocr_raw_text
    );

    console.log('✅ [APPROVE] Cola actualizada exitosamente');
    console.log(`🧠 [APPROVE] Correcciones registradas para aprendizaje: ${learningResult.recorded}`);
    console.log('🎉 [APPROVE] Proceso completado exitosamente\n');

    res.json({
      success: true,
      message: 'Paquete creado y aprobado exitosamente',
      package_id: newPackage.package_id,
      tracking_code: newPackage.tracking_code,
      learning: {
        corrections_recorded: learningResult.recorded,
        corrections: learningResult.corrections || []
      }
    });

  } catch (error) {
    console.error('\n❌❌❌ [APPROVE] ERROR CRÍTICO ❌❌❌');
    console.error('Tipo de error:', error.name);
    console.error('Mensaje:', error.message);
    console.error('Stack:', error.stack);

    if (error.errors) {
      console.error('Errores de validación:');
      error.errors.forEach((err, idx) => {
        console.error(`  ${idx + 1}. Campo: ${err.path}, Mensaje: ${err.message}`);
      });
    }

    res.status(500).json({
      error: 'Error al aprobar paquete',
      message: error.message,
      details: error.errors ? error.errors.map(e => ({ field: e.path, message: e.message })) : null
    });
  }
});

/**
 * POST /api/ocr-review/:queue_id/reject
 * Rechazar paquete OCR (marcar como error)
 */
router.post('/:queue_id/reject', authenticateToken, authorizeReview, async (req, res) => {
  try {
    const { queue_id } = req.params;

    const queueItem = await OcrProcessingQueue.findByPk(queue_id);

    if (!queueItem) {
      return res.status(404).json({ error: 'Item no encontrado o ya eliminado' });
    }

    // ELIMINAR REGISTRO FÍSICAMENTE DE LA COLA
    await queueItem.destroy();

    res.json({
      success: true,
      message: 'Paquete descartado y eliminado del sistema'
    });

  } catch (error) {
    console.error('Error al descartar paquete OCR:', error);
    res.status(500).json({
      error: 'Error al descartar paquete',
      message: error.message
    });
  }
});

/**
 * GET /api/ocr-review/history
 * Búsqueda en el historial de OCR (paquetes procesados, aprobados o rechazados)
 */
router.get('/history', authenticateToken, authorizeReview, async (req, res) => {
  try {
    const { search = '', limit = 50 } = req.query;

    const whereClause = {
      status: { [Op.in]: ['completed', 'error', 'auto_approved'] }
    };

    if (search && search.trim() !== '') {
      const parsedSearch = search.trim();
      whereClause[Op.or] = [
        { extracted_data: { [Op.like]: `%${parsedSearch}%` } },
        { ocr_raw_text: { [Op.like]: `%${parsedSearch}%` } },
        { '$package.tracking_code$': { [Op.like]: `%${parsedSearch}%` } },
        { '$package.external_tracking_code$': { [Op.like]: `%${parsedSearch}%` } }
      ];
    }

    const historyItems = await OcrProcessingQueue.findAll({
      where: whereClause,
      include: [
        {
          model: Package,
          as: 'package',
          required: false,
          attributes: ['package_id', 'tracking_code', 'external_tracking_code', 'status', 'duplicate_handling', 'created_at', 'recipient_name']
        },
        {
          model: User,
          as: 'reviewer',
          required: false,
          attributes: ['full_name', 'username']
        }
      ],
      order: [['processed_at', 'DESC']],
      limit: parseInt(limit, 10) || 50
    });

    const formatted = historyItems.map(item => {
      let duplicateHandlingLabel = 'N/A';
      if (item.status === 'auto_approved') duplicateHandlingLabel = 'Auto-Aprobado';
      else if (item.status === 'completed') duplicateHandlingLabel = item.package?.duplicate_handling || 'Aprobado Manual';
      else if (item.status === 'error') duplicateHandlingLabel = 'Rechazado';

      let extracted = typeof item.extracted_data === 'string' ? JSON.parse(item.extracted_data) : (item.extracted_data || {});

      return {
        id: item.id,
        tracking_code: item.package?.tracking_code || 'N/A',
        external_tracking_code: extracted.external_tracking_code || item.package?.external_tracking_code || 'N/A',
        recipient_name: extracted.recipient_name || item.package?.recipient_name || 'N/A',
        status: item.package?.status || item.status,
        duplicate_handling: duplicateHandlingLabel,
        created_at: item.package?.created_at || item.processed_at || item.created_at,
        reviewed_by_name: item.reviewer?.full_name || 'Sistema',
        reason: item.is_duplicate ? 'Duplicado' : (item.error_message || 'Baja Confianza / Faltan Datos'),
        action_notes: item.error_message || item.duplicate_reason || ''
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('Error al obtener historial OCR:', error);
    res.status(500).json({ error: 'Error al obtener historial OCR', message: error.message });
  }
});

module.exports = router;
