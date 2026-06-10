'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { Route, User, Vehicle, Warehouse, Package, RoutePackage, Pickup, VehicleType, sequelize } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const { Op } = require('sequelize');
const { queueNotification, queueNotificationForRole } = require('../utils/notificationService');
const { logAudit } = require('../utils/audit');
const { decodeQRFromImage, extractTrackingCodeFromQR } = require('../utils/qrDecoder');
const { extractData } = require('../utils/smartOcrParser');
const axios = require('axios');
const FormData = require('form-data');

const router = express.Router();

// --- Validadores ---
const validateRouteCreation = [
  body('user_id').isUUID(4).withMessage('ID de conductor inválido'),
  body('vehicle_id').isUUID(4).withMessage('ID de vehículo inválido'),
  body('warehouse_id').isUUID(4).withMessage('ID de almacén inválido'),
  body('start_date').isISO8601().toDate().withMessage('Fecha de inicio inválida'),
  body('route_type').isIn(['ENTREGA', 'DEVOLUCION']).withMessage("El tipo de ruta debe ser 'ENTREGA' o 'DEVOLUCION'")
];

const validatePackageAssignment = [
  body('package_ids').isArray({ min: 1 }).withMessage('Se requiere un arreglo de IDs de paquetes.'),
  body('package_ids.*').isUUID(4).withMessage('Cada ID de paquete debe ser un UUID válido.')
];


// Rutas de gestión de rutas de entrega y devolución


/**
 * @openapi
 * components:
 *   schemas:
 *     Route:
 *       type: object
 *       properties:
 *         route_id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *         vehicle_id:
 *           type: string
 *           format: uuid
 *         warehouse_id:
 *           type: string
 *           format: uuid
 *         start_date:
 *           type: string
 *           format: date-time
 *         route_type:
 *           type: string
 *           enum: [ENTREGA, DEVOLUCION]
 *         status:
 *           type: string
 *           enum: [PENDIENTE, EN_PROGRESO, COMPLETADA, CANCELADA]
 *         created_at:
 *           type: string
 *           format: date-time
 * 
 *     RouteCreate:
 *       type: object
 *       required:
 *         - user_id
 *         - vehicle_id
 *         - warehouse_id
 *         - start_date
 *         - route_type
 *       properties:
 *         user_id:
 *           type: string
 *           format: uuid
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *           description: ID del conductor asignado
 *         vehicle_id:
 *           type: string
 *           format: uuid
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *           description: ID del vehículo asignado
 *         warehouse_id:
 *           type: string
 *           format: uuid
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *           description: ID del almacén de origen
 *         start_date:
 *           type: string
 *           format: date-time
 *           example: "2023-06-15T08:00:00Z"
 *           description: Fecha y hora de inicio programada
 *         route_type:
 *           type: string
 *           enum: [ENTREGA, DEVOLUCION]
 *           example: "ENTREGA"
 *           description: Tipo de ruta (entrega o devolución)
 * 
 *     RouteDetail:
 *       type: object
 *       properties:
 *         route_id:
 *           type: string
 *           format: uuid
 *         start_date:
 *           type: string
 *           format: date-time
 *         route_type:
 *           type: string
 *         status:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         user:
 *           $ref: '#/components/schemas/UserBasic'
 *         vehicle:
 *           type: object
 *           properties:
 *             vehicle_id:
 *               type: string
 *               format: uuid
 *             license_plate:
 *               type: string
 *             vehicleType:
 *               type: object
 *               properties:
 *                 type_name:
 *                   type: string
 *         routePackages:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               package:
 *                 $ref: '#/components/schemas/PackageBasic'
 * 
 *     UserBasic:
 *       type: object
 *       properties:
 *         user_id:
 *           type: string
 *           format: uuid
 *         full_name:
 *           type: string
 * 
 *     PackageBasic:
 *       type: object
 *       properties:
 *         package_id:
 *           type: string
 *           format: uuid
 *         tracking_code:
 *           type: string
 *         status:
 *           type: string
 *         destination_address:
 *           type: string
 */


// POST / - Crear una nueva ruta
router.post('/', authenticateToken, roleValidator(['ADMIN']), validateRouteCreation, async (req, res) => {
  const errors = validationResult(req);
  console.log(req.body)
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const t = await sequelize.transaction();
  try {
    const { user_id, vehicle_id, warehouse_id, start_date, route_type, route_name } = req.body;

    // Validaciones de existencia dentro de la transacción
    const driver = await User.findOne({ where: { user_id } }, { transaction: t });
    if (!driver) {
      await t.rollback();
      return res.status(404).json({ error: 'Conductor no encontrado o no tiene el rol correcto.' });
    }

    const vehicle = await Vehicle.findByPk(vehicle_id, { transaction: t });
    if (!vehicle) {
      await t.rollback();
      return res.status(404).json({ error: 'Vehículo no encontrado.' });
    }

    const newRoute = await Route.create({
      route_id: uuidv4(),
      route_name: route_name || null,
      user_id,
      vehicle_id,
      warehouse_id,
      start_date,
      route_type,
      status: 'PENDIENTE'
    }, { transaction: t });

    const formattedStart = start_date ? new Date(start_date).toLocaleString('es-CL') : '';
    queueNotification({
      userId: user_id,
      title: 'Nueva ruta asignada',
      message: `Se te asignó una nueva ruta${formattedStart ? ` con inicio ${formattedStart}` : ''}.`,
      link: `/routes/${newRoute.route_id}`
    }, { transaction: t });

    // Log de auditoría
    await logAudit(req.user.user_id, 'CREATE_ROUTE', {
      route_id: newRoute.route_id,
      route_name: newRoute.route_name,
      driver_id: user_id,
      vehicle_id,
      route_type
    });

    await t.commit();
    res.status(201).json(newRoute);

  } catch (error) {
    await t.rollback();
    console.error("Error al crear la ruta:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /:id - Obtener detalle de una ruta y sus paquetes
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const route = await Route.findByPk(req.params.id, {
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'full_name'] },
        { model: Vehicle, as: 'vehicle', include: ['vehicleType'] },
        {
          model: RoutePackage,
          as: 'routePackages',
          include: [{
            model: Package,
            as: 'package',
            attributes: [
              'package_id',
              'tracking_code',
              'status',
              'destination_address',
              'recipient_name',
              'pending_return_user_id'
            ],
            include: [{ model: User, as: 'pendingReturnDriver', attributes: ['full_name'] }]
          }]
        }
      ]
    });

    if (!route) return res.status(404).json({ error: 'Ruta no encontrada' });
    res.json(route);

  } catch (error) {
    console.error("Error al obtener la ruta:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const whereClause = {};
    if (req.user.role === 'DRIVER') {
      whereClause.user_id = req.user.user_id;
    }

    const routes = await Route.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['user_id', 'full_name'] },
        { model: Vehicle, as: 'vehicle', attributes: ['vehicle_id', 'license_plate'] },
        // --- INICIO DE LA CORRECCIÓN ---
        // Añade esta línea para incluir los datos del almacén
        { model: Warehouse, as: 'warehouse', attributes: ['warehouse_id', 'warehouse_name'] }
        // --- FIN DE LA CORRECCIÓN ---
      ],
      attributes: {
        include: [
          [
            sequelize.literal(`(
              SELECT COUNT(*)
              FROM route_packages AS rp
              JOIN packages AS p ON rp.package_id = p.package_id
              WHERE rp.route_id = Route.route_id
              AND p.pending_return_user_id IS NOT NULL
            )`),
            'pending_returns_count'
          ]
        ]
      },
      order: [['created_at', 'DESC']]
    });

    res.json({
      routes: routes,
      total: routes.length
    });

  } catch (error) {
    console.error("Error al obtener las rutas:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});



// POST /:id/packages - Asignar paquetes a una ruta
router.post('/:id/packages', authenticateToken, roleValidator(['ADMIN']), validatePackageAssignment, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const t = await sequelize.transaction();
  try {
    const routeId = req.params.id;
    const { package_ids } = req.body;

    let route;
    try {
      route = await Route.findByPk(routeId, {
        include: [{ model: Vehicle, as: 'vehicle' }],
        transaction: t
      });
    } catch (eLoaderError) {
      console.warn('⚠️ Error eager loading vehicle in POST /packages:', eLoaderError.message);
      // Fallback: buscar sin include
      route = await Route.findByPk(routeId, { transaction: t });
    }

    if (!route) {
      await t.rollback();
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    if (route.status !== 'PENDIENTE') {
      await t.rollback();
      return res.status(409).json({ error: 'Solo se pueden asignar paquetes a rutas en estado PENDIENTE.' });
    }

    // Obtener costo de entrega basado en el vehículo de la ruta
    let newDeliveryCost = null;
    try {
      if (route.vehicle && route.vehicle.type_id) {
        if (VehicleType) {
          const vehicleType = await VehicleType.findByPk(route.vehicle.type_id, { transaction: t });
          if (vehicleType) {
            newDeliveryCost = vehicleType.base_delivery_cost;
          }
        } else {
          console.warn('⚠️ VehicleType model is undefined in POST /packages route');
        }
      } else if (route.vehicle_id && !route.vehicle) {
        // Si falló el eager loading pero tenemos vehicle_id, intentamos buscarlo manualmente
        const veh = await Vehicle.findByPk(route.vehicle_id, { transaction: t });
        if (veh && veh.type_id && VehicleType) {
          const vt = await VehicleType.findByPk(veh.type_id, { transaction: t });
          if (vt) newDeliveryCost = vt.base_delivery_cost;
        }
      }
    } catch (costError) {
      console.error('⚠️ Error calculating delivery cost in POST /packages (ignoring to allow assignment):', costError);
    }

    const packages = await Package.findAll({
      where: { package_id: { [Op.in]: package_ids } },
      include: [{ model: Pickup, as: 'pickup', attributes: ['status'] }],
      transaction: t
    });
    if (packages.length !== package_ids.length) {
      await t.rollback();
      return res.status(400).json({ error: 'Uno o más IDs de paquetes no son válidos.' });
    }

    const validStatuses = ['RECOLECTADO_EN_ORIGEN', 'RECIBIDO_EN_ALMACEN', 'INCIDENCIA_ENTREGA', 'REPROGRAMADO', 'DEVUELTO_ALMACEN'];
    for (const pkg of packages) {
      // Validar que la recolección esté verificada
      if (!pkg.pickup || pkg.pickup.status !== 'VERIFICADO_EN_ALMACEN') {
        await t.rollback();
        return res.status(409).json({ error: `El paquete ${pkg.tracking_code} no puede ser asignado porque su recolección no ha sido verificada en almacén.` });
      }

      if (!validStatuses.includes(pkg.status)) {
        await t.rollback();
        return res.status(409).json({ error: `El paquete ${pkg.tracking_code} está en estado '${pkg.status}' y no puede ser asignado.` });
      }

      // --- NUEVA VALIDACIÓN: Bloquear si está pendiente de devolución física ---
      if (pkg.pending_return_user_id) {
        await t.rollback();
        return res.status(409).json({
          error: `El paquete ${pkg.tracking_code} no puede ser asignado porque aún figura en poder del conductor. Deber ser recibido físicamente en el almacén primero.`
        });
      }
      // -------------------------------------------------------------------------
    }

    // 1. Crear las asociaciones en RoutePackage
    const routePackageData = package_ids.map(pkgId => ({
      route_package_id: uuidv4(),
      route_id: routeId,
      package_id: pkgId
    }));
    await RoutePackage.bulkCreate(routePackageData, { transaction: t });

    // 2. Actualizar el estado  de los paquetes
    const updateData = {
      status: 'ASIGNADO_A_RUTA'
    };

    await Package.update(
      updateData,
      {
        where: { package_id: { [Op.in]: package_ids } },
        transaction: t
      }
    );

    // Si encontramos un costo válido para el vehículo, lo aplicamos SOLO a los paquetes que NO fueron editados manualmente
    if (newDeliveryCost) {
      await Package.update(
        { delivery_cost: newDeliveryCost },
        {
          where: {
            package_id: { [Op.in]: package_ids },
            [Op.or]: [
              { is_delivery_cost_manual: false },
              { is_delivery_cost_manual: null }
            ]
          },
          transaction: t
        }
      );
    }
    // --- FIN DE LA LÓGICA AÑADIDA ---

    await t.commit();
    res.status(200).json({ message: `${package_ids.length} paquetes asignados exitosamente a la ruta.` });

  } catch (error) {
    await t.rollback();
    console.error("Error al asignar paquetes a la ruta:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Helper function para llamar a OCR.space
async function callOcrSpace(image) {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) {
    throw new Error('La API Key de OCR.space no está configurada en el archivo .env');
  }

  const apiUrl = 'https://api.ocr.space/parse/image';
  const form = new FormData();

  form.append('base64Image', image);
  form.append('language', 'spa');
  form.append('apikey', apiKey);
  form.append('detectOrientation', 'true');
  form.append('OCREngine', '2');

  const response = await axios.post(apiUrl, form, {
    headers: form.getHeaders(),
  });

  if (response.data.IsErroredOnProcessing) {
    const errorMessage = Array.isArray(response.data.ErrorMessage)
      ? response.data.ErrorMessage.join(', ')
      : 'Error desconocido del servicio OCR';
    const error = new Error(errorMessage);
    error.isOcrSpaceError = true;
    throw error;
  }

  const parsedText = response.data.ParsedResults?.[0]?.ParsedText || '';
  return parsedText;
}

/**
 * @openapi
 * /routes/{id}/scan-package:
 *   post:
 *     tags: [Rutas]
 *     summary: Escanear QR de paquete y agregarlo a la ruta
 *     description: Permite al conductor escanear el QR de un paquete físico y agregarlo automáticamente a su ruta asignada
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 description: Imagen en base64 del QR/etiqueta del paquete
 *     responses:
 *       '200':
 *         description: Paquete agregado exitosamente a la ruta
 *       '400':
 *         description: Error en la solicitud
 *       '403':
 *         description: No autorizado - Solo el conductor asignado puede escanear
 *       '404':
 *         description: Ruta o paquete no encontrado
 *       '409':
 *         description: Conflicto - Paquete ya asignado o ruta no en estado correcto
 *       '500':
 *         description: Error del servidor
 */
router.post('/:id/scan-package', authenticateToken, [
  body('image').optional().isString().withMessage('La imagen debe ser una cadena base64'),
  body('external_tracking_code').optional().isString().notEmpty().withMessage('El código de seguimiento externo debe ser una cadena no vacía')
], async (req, res) => {
  const startTime = Date.now(); // ⏱️ Iniciar medición de tiempo
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const t = await sequelize.transaction();
  try {
    const routeId = req.params.id;
    const { image, external_tracking_code } = req.body;
    const userId = req.user.user_id;

    console.log('====================================');
    console.log('📦 SCAN-PACKAGE REQUEST');
    console.log('Route ID:', routeId);
    console.log('User ID:', userId);
    console.log('Has Image:', !!image);
    console.log('External Tracking Code (raw):', external_tracking_code);
    console.log('External Tracking Code (type):', typeof external_tracking_code);
    console.log('External Tracking Code (length):', external_tracking_code?.length);
    console.log('====================================');

    // Validar que se proporcione al menos una forma de obtener el tracking code
    if (!image && !external_tracking_code) {
      await t.rollback();
      return res.status(400).json({
        error: 'Se requiere una imagen en base64 o un código de seguimiento externo'
      });
    }

    // 1. Verificar que la ruta existe
    // Intentamos incluir el vehículo, si falla por eager loading, hacemos fallback a búsqueda simple
    let route;
    try {
      route = await Route.findByPk(routeId, {
        include: [{ model: Vehicle, as: 'vehicle' }],
        transaction: t
      });
    } catch (eLoaderError) {
      console.warn('⚠️ Error eager loading vehicle in scan-package:', eLoaderError.message);
      // Fallback: buscar sin include
      route = await Route.findByPk(routeId, { transaction: t });
    }

    if (!route) {
      await t.rollback();
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    // Obtener costo de entrega basado en el vehículo de la ruta
    let newDeliveryCost = null;
    try {
      if (route.vehicle && route.vehicle.type_id) {
        if (VehicleType) {
          const vehicleType = await VehicleType.findByPk(route.vehicle.type_id, { transaction: t });
          if (vehicleType) {
            newDeliveryCost = vehicleType.base_delivery_cost;
          }
        } else {
          console.warn('⚠️ VehicleType model is undefined in scan-package route');
        }
      } else if (route.vehicle_id && !route.vehicle) {
        // Si falló el eager loading pero tenemos vehicle_id, intentamos buscarlo manualmente
        const veh = await Vehicle.findByPk(route.vehicle_id, { transaction: t });
        if (veh && veh.type_id && VehicleType) {
          const vt = await VehicleType.findByPk(veh.type_id, { transaction: t });
          if (vt) newDeliveryCost = vt.base_delivery_cost;
        }
      }
    } catch (costError) {
      console.error('⚠️ Error calculating delivery cost in scan-package (ignoring to allow scan):', costError);
      // No hacemos rollback, permitimos que el escaneo continúe sin actualizar costo
    }

    // 2. Verificar que el usuario es el conductor asignado
    if (route.user_id !== userId) {
      await t.rollback();
      return res.status(403).json({ error: 'Solo el conductor asignado a esta ruta puede escanear paquetes' });
    }

    // 3. Verificar que la ruta está en estado PENDIENTE
    if (route.status !== 'PENDIENTE') {
      await t.rollback();
      return res.status(409).json({ error: 'Solo se pueden escanear paquetes para rutas en estado PENDIENTE' });
    }

    // 4. Actualizar loading_status a LOADING si está en NOT_STARTED
    if (route.loading_status === 'NOT_STARTED') {
      await route.update({ loading_status: 'LOADING' }, { transaction: t });
    }

    // Variable para tracking del origen (definida fuera para scope)
    let qrTrackingCode = null;

    // 5. Obtener external_tracking_code
    let externalTrackingCode = external_tracking_code; // Si se proporciona manualmente, usarlo primero

    // Si no se proporcionó manualmente y hay imagen, intentar extraerlo
    if (!externalTrackingCode && image) {
      // 5.1. Intentar decodificar QR primero
      console.log('📱 Intentando decodificar QR...');
      try {
        const qrContent = await decodeQRFromImage(image);
        if (qrContent) {
          console.log(`✓ QR decodificado (primeros 200 caracteres): ${qrContent.substring(0, 200)}`);
          qrTrackingCode = extractTrackingCodeFromQR(qrContent);
          if (qrTrackingCode) {
            console.log(`✅ Tracking code extraído del QR: ${qrTrackingCode}`);
            externalTrackingCode = qrTrackingCode;
          } else {
            console.log(`⚠️  No se pudo extraer tracking code del contenido del QR`);
          }
        } else {
          console.log(`⚠️  No se pudo decodificar el QR de la imagen`);
        }
      } catch (error) {
        console.log(`⚠️  Error al decodificar QR: ${error.message}`);
        console.error(error);
      }

      // 5.2. Si no se obtuvo del QR, usar OCR del texto
      if (!externalTrackingCode) {
        console.log('🔤 Usando OCR para extraer tracking code del texto...');
        try {
          const ocrText = await callOcrSpace(image);
          if (ocrText && ocrText.length > 20) {
            const extracted = extractData(ocrText, null);
            externalTrackingCode = extracted.data.external_tracking_code;
            if (externalTrackingCode) {
              console.log(`✅ Tracking code extraído del OCR: ${externalTrackingCode}`);
            }
          }
        } catch (error) {
          console.error('Error en OCR:', error.message);
        }
      }
    }

    // 6. Validar que tenemos un tracking code
    if (!externalTrackingCode) {
      await t.rollback();
      return res.status(400).json({
        error: 'No se pudo obtener el código de seguimiento externo',
        details: image
          ? 'No se pudo extraer el código de seguimiento externo del QR ni del texto de la imagen. Intenta ingresarlo manualmente.'
          : 'Se requiere una imagen en base64 o un código de seguimiento externo'
      });
    }

    // 7. Busqueda inteligente de paquetes (Manejo de duplicados)
    console.log(`🔍 Buscando paquete con tracking: "${externalTrackingCode}"`);

    // Buscamos TODOS los paquetes que coincidan, no solo el primero
    const potentialPackages = await Package.findAll({
      where: {
        [Op.or]: [
          { external_tracking_code: externalTrackingCode },
          { tracking_code: externalTrackingCode }
        ]
      },
      include: [{ model: Pickup, as: 'pickup', attributes: ['status'] }], // Incluir pickup para validar estado
      transaction: t
    });

    console.log(`   Encontrados ${potentialPackages.length} candidatos.`);

    let packageToAdd = null;

    if (potentialPackages.length === 0) {
      // Si no hay coincidencia exacta, intentar Smart Search (LIKE)
      const likeMatches = await Package.findAll({
        where: {
          [Op.or]: [
            { external_tracking_code: { [Op.like]: `%${externalTrackingCode}%` } },
            { tracking_code: { [Op.like]: `%${externalTrackingCode}%` } },
          ]
        },
        limit: 5,
        include: [{ model: Pickup, as: 'pickup', attributes: ['status'] }],
        transaction: t
      });

      if (likeMatches.length === 1) {
        packageToAdd = likeMatches[0];
      } else if (likeMatches.length > 1) {
        const assignableLike = likeMatches.filter(p =>
          ['RECIBIDO_EN_ALMACEN', 'ASIGNADO_A_RUTA', 'INCIDENCIA_ENTREGA', 'REPROGRAMADO', 'DEVUELTO_ALMACEN', 'RECOLECTADO_EN_ORIGEN'].includes(p.status)
        );
        if (assignableLike.length === 1) {
          packageToAdd = assignableLike[0];
        } else {
          await t.rollback();
          return res.status(409).json({
            error: 'Código ambiguo',
            details: `El código coincide parcialmente con varios paquetes.`,
            matches: likeMatches.map(p => p.external_tracking_code)
          });
        }
      }
    } else if (potentialPackages.length === 1) {
      packageToAdd = potentialPackages[0];
    } else {
      // CASO DE DUPLICADOS: Filtrar por estados válidos de asignación
      const assignableStatuses = ['RECIBIDO_EN_ALMACEN', 'ASIGNADO_A_RUTA', 'INCIDENCIA_ENTREGA', 'REPROGRAMADO', 'DEVUELTO_ALMACEN', 'RECOLECTADO_EN_ORIGEN'];
      const assignableCandidates = potentialPackages.filter(p => assignableStatuses.includes(p.status));

      if (assignableCandidates.length === 1) {
        packageToAdd = assignableCandidates[0];
        console.log(`✅ Duplicado resuelto: Seleccionado ${packageToAdd.tracking_code} por estar disponible (${packageToAdd.status}).`);
      } else if (assignableCandidates.length > 1) {
        await t.rollback();
        return res.status(409).json({
          error: 'Código ambiguo (Múltiples disponibles)',
          details: `Hay ${assignableCandidates.length} paquetes disponibles con este código. Por favor escanea el código interno (LE...)`,
          matches: assignableCandidates.map(p => `${p.tracking_code} (${p.status})`)
        });
      } else {
        packageToAdd = potentialPackages[0];
      }
    }

    if (!packageToAdd) {
      await t.rollback();
      return res.status(404).json({
        error: 'Paquete no encontrado',
        details: `No se encontró un paquete con código externo '${externalTrackingCode}' en la base de datos`,
        external_tracking_code: externalTrackingCode
      });
    }

    // 8. Verificar que el paquete esté en un estado válido y su recolección esté verificada
    const validStatuses = ['RECIBIDO_EN_ALMACEN', 'ASIGNADO_A_RUTA', 'INCIDENCIA_ENTREGA', 'REPROGRAMADO', 'DEVUELTO_ALMACEN', 'RECOLECTADO_EN_ORIGEN'];

    // Validar estado del paquete
    if (!validStatuses.includes(packageToAdd.status)) {
      await t.rollback();
      return res.status(409).json({
        error: 'Paquete no disponible',
        details: `El paquete está en estado '${packageToAdd.status}' y no puede ser asignado`,
        current_status: packageToAdd.status
      });
    }

    // Validar estado de la recolección (Pickup)
    console.log(`🔍 Validando Pickup del paquete. Status paquete: ${packageToAdd.status}, Pickup ID: ${packageToAdd.pickup_id}, Status Pickup: ${packageToAdd.pickup?.status}`);

    if (!packageToAdd.pickup || packageToAdd.pickup.status !== 'VERIFICADO_EN_ALMACEN') {
      const currentStatus = packageToAdd.pickup ? packageToAdd.pickup.status : 'SIN_RECOLECCION';
      console.warn(`⛔ Bloqueando asignación: Pickup ${packageToAdd.pickup_id || 'N/A'} no verificado (${currentStatus})`);
      await t.rollback();
      return res.status(409).json({
        error: 'Recolección no verificada',
        details: `Este paquete no puede ser asignado. Debe tener una recolección asociada y esta debe estar 'VERIFICADO EN ALMACÉN'. Estado actual: ${currentStatus}`,
        current_pickup_status: currentStatus
      });
    }

    // 9. Verificar asignación a otra ruta
    const existingAssignment = await RoutePackage.findOne({
      where: { package_id: packageToAdd.package_id },
      include: [{
        model: Route,
        as: 'route',
        where: {
          status: { [Op.in]: ['PENDIENTE', 'EN_PROGRESO'] },
          route_id: { [Op.ne]: routeId }
        }
      }],
      transaction: t
    });

    if (existingAssignment) {
      if (existingAssignment.route.loading_status === 'APPROVED') {
        await t.rollback();
        return res.status(409).json({
          error: 'Paquete ya asignado',
          details: `Este paquete ya está asignado a la ruta aprobada '${existingAssignment.route.route_name}'`
        });
      }
      console.log(`🔄 Transfiriendo paquete de ruta ${existingAssignment.route_id} a ${routeId}`);
      await existingAssignment.destroy({ transaction: t });
    }

    // 10. Verificar si ya está en esta ruta
    const alreadyInRoute = await RoutePackage.findOne({
      where: { route_id: routeId, package_id: packageToAdd.package_id },
      transaction: t
    });

    if (alreadyInRoute) {
      await t.rollback();
      const pkgInfo = await Package.findByPk(packageToAdd.package_id, {
        attributes: ['package_id', 'tracking_code', 'external_tracking_code', 'recipient_name', 'destination_address', 'status']
      });
      return res.status(200).json({
        message: 'Paquete ya verificado en la ruta',
        package: pkgInfo,
        already_in_route: true,
        validation_only: true
      });
    }

    // 11. Agregar a la ruta
    await RoutePackage.create({
      route_package_id: uuidv4(),
      route_id: routeId,
      package_id: packageToAdd.package_id
    }, { transaction: t });

    // 12. Actualizar estado y costo del paquete
    const updateData = {
      status: 'ASIGNADO_A_RUTA',
      assigned_to_route_datetime: new Date(),
      pending_return_user_id: null // Aquí sí limpiamos porque el driver lo tiene físicamente
    };

    if (newDeliveryCost && packageToAdd.is_delivery_cost_manual !== true) {
      updateData.delivery_cost = newDeliveryCost;
    }

    await Package.update(
      updateData,
      {
        where: { package_id: packageToAdd.package_id },
        transaction: t
      }
    );

    // Obtener información completa del paquete para la respuesta (DENTRO de la transacción)
    const packageInfo = await Package.findByPk(packageToAdd.package_id, {
      attributes: ['package_id', 'tracking_code', 'external_tracking_code', 'recipient_name', 'destination_address', 'status', 'delivery_cost'],
      transaction: t
    });

    await t.commit();

    res.status(200).json({
      message: 'Paquete agregado exitosamente a la ruta',
      package: packageInfo,
      source: qrTrackingCode ? 'QR' : 'OCR'
    });

  } catch (error) {
    // Solo hacemos rollback si la transacción NO ha terminado
    if (!t.finished) {
      await t.rollback();
    }
    console.error("Error al escanear y agregar paquete:", error);
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
});

/**
 * @openapi
 * /routes/{id}/finish-loading:
 *   post:
 *     tags: [Rutas]
 *     summary: Finalizar carga de paquetes
 *     description: Permite al conductor indicar que terminó de escanear todos los paquetes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Carga finalizada exitosamente
 *       '403':
 *         description: No autorizado - Solo el conductor asignado puede finalizar
 *       '404':
 *         description: Ruta no encontrada
 *       '409':
 *         description: Conflicto - No hay paquetes o ya está finalizada
 *       '500':
 *         description: Error del servidor
 */
router.post('/:id/finish-loading', authenticateToken, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const routeId = req.params.id;
    const userId = req.user.user_id;

    const route = await Route.findByPk(routeId, { transaction: t });
    if (!route) {
      await t.rollback();
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    // Verificar que el usuario es el conductor asignado
    if (route.user_id !== userId) {
      await t.rollback();
      return res.status(403).json({ error: 'Solo el conductor asignado a esta ruta puede finalizar la carga' });
    }

    // Verificar que la ruta está en estado PENDIENTE
    if (route.status !== 'PENDIENTE') {
      await t.rollback();
      return res.status(409).json({ error: 'Solo se puede finalizar la carga de rutas en estado PENDIENTE' });
    }

    // Verificar que hay paquetes agregados
    const packageCount = await RoutePackage.count({
      where: { route_id: routeId },
      transaction: t
    });

    if (packageCount === 0) {
      await t.rollback();
      return res.status(409).json({ error: 'No se puede finalizar la carga sin paquetes agregados' });
    }

    // Verificar que no esté ya finalizada
    if (route.loading_status === 'LOADING_COMPLETED' || route.loading_status === 'APPROVED') {
      await t.rollback();
      return res.status(409).json({ error: 'La carga ya está finalizada o aprobada' });
    }

    // Actualizar estado de carga
    await route.update({ loading_status: 'LOADING_COMPLETED' }, { transaction: t });

    await t.commit();

    res.status(200).json({
      message: 'Carga finalizada exitosamente',
      package_count: packageCount,
      status: 'LOADING_COMPLETED',
      next_step: 'Esperando aprobación del administrador'
    });

  } catch (error) {
    await t.rollback();
    console.error("Error al finalizar carga:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * @openapi
 * /routes/{id}/approve-loading:
 *   post:
 *     tags: [Rutas]
 *     summary: Aprobar carga de paquetes
 *     description: Permite al administrador aprobar la carga de paquetes y verificar el número correcto
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expected_count:
 *                 type: integer
 *                 description: Número esperado de paquetes (opcional, para verificación)
 *     responses:
 *       '200':
 *         description: Carga aprobada exitosamente
 *       '400':
 *         description: Error en la solicitud
 *       '403':
 *         description: No autorizado - Solo administradores
 *       '404':
 *         description: Ruta no encontrada
 *       '409':
 *         description: Conflicto - Carga no completada o número incorrecto
 *       '500':
 *         description: Error del servidor
 */
router.post('/:id/approve-loading', authenticateToken, roleValidator(['ADMIN']), [
  body('expected_count').optional().isInt({ min: 0 }).withMessage('El número esperado debe ser un entero positivo')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const t = await sequelize.transaction();
  try {
    const routeId = req.params.id;
    const { expected_count } = req.body;

    const route = await Route.findByPk(routeId, { transaction: t });
    if (!route) {
      await t.rollback();
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    // Verificar que la carga esté completada
    if (route.loading_status !== 'LOADING_COMPLETED') {
      await t.rollback();
      return res.status(409).json({
        error: 'La carga no está completada',
        current_status: route.loading_status,
        details: 'El conductor debe finalizar la carga antes de que pueda ser aprobada'
      });
    }

    // Contar paquetes actuales
    const actualCount = await RoutePackage.count({
      where: { route_id: routeId },
      transaction: t
    });

    // Si se proporciona expected_count, verificar que coincida
    if (expected_count !== undefined && expected_count !== null) {
      if (actualCount !== expected_count) {
        await t.rollback();
        return res.status(409).json({
          error: 'Número de paquetes no coincide',
          expected: expected_count,
          actual: actualCount,
          details: `Se esperaban ${expected_count} paquetes pero se encontraron ${actualCount}`
        });
      }
    }

    // Aprobar carga
    await route.update({ loading_status: 'APPROVED' }, { transaction: t });

    await t.commit();

    // Log de auditoría
    await logAudit(req.user.user_id, 'APPROVE_ROUTE_LOADING', {
      route_id: route.route_id,
      route_name: route.route_name,
      package_count: actualCount,
      expected_count: expected_count || null
    });

    res.status(200).json({
      message: 'Carga aprobada exitosamente',
      package_count: actualCount,
      status: 'APPROVED',
      next_step: 'El conductor puede iniciar la ruta'
    });

  } catch (error) {
    await t.rollback();
    console.error("Error al aprobar carga:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * @openapi
 * /routes/{id}/status:
 *   put:
 *     tags: [Rutas]
 *     summary: Actualizar el estado de una ruta
 *     description: Permite a un conductor iniciar o finalizar una ruta. Contiene lógica de negocio para actualizar paquetes asociados.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [EN_PROGRESO, FINALIZADA]
 *     responses:
 *       '200':
 *         description: Estado de la ruta actualizado.
 *       '404':
 *         description: Ruta no encontrada.
 *       '409':
 *         description: Conflicto - No se puede finalizar la ruta porque tiene paquetes pendientes.
 *       '500':
 *         description: Error del servidor.
 */
router.put('/:id/status', authenticateToken, async (req, res) => {
  const routeId = req.params.id;
  const { status: newStatus } = req.body;
  const t = await sequelize.transaction();

  try {
    const route = await Route.findByPk(routeId, { include: ['routePackages'], transaction: t });
    if (!route) {
      await t.rollback();
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    // --- LÓGICA PARA INICIAR RUTA ---
    if (newStatus === 'EN_PROGRESO' && route.status === 'PENDIENTE') {
      // Verificar que la carga esté aprobada (si se usó el nuevo flujo de escaneo)
      // Si loading_status es NOT_STARTED, puede ser una ruta con asignación manual (compatibilidad)
      if (route.loading_status !== 'NOT_STARTED' && route.loading_status !== 'APPROVED') {
        await t.rollback();
        return res.status(409).json({
          error: 'No se puede iniciar la ruta',
          current_loading_status: route.loading_status,
          details: route.loading_status === 'LOADING'
            ? 'La carga de paquetes aún no está finalizada. Debes finalizar la carga primero.'
            : route.loading_status === 'LOADING_COMPLETED'
              ? 'La carga está finalizada pero esperando aprobación del administrador.'
              : 'La carga debe estar aprobada antes de iniciar la ruta.'
        });
      }

      // Verificar que hay paquetes asignados
      if (!route.routePackages || route.routePackages.length === 0) {
        await t.rollback();
        return res.status(409).json({
          error: 'No se puede iniciar una ruta sin paquetes asignados'
        });
      }

      const packageIds = route.routePackages.map(rp => rp.package_id);

      // --- MEJORA: Solo pasar a EN_RUTA_ENTREGA los paquetes que NO estén ya entregados o cancelados ---
      // Esto evita que si un admin reinicia una ruta, se pierdan las entregas ya hechas.
      await Package.update(
        { status: 'EN_RUTA_ENTREGA' },
        {
          where: {
            package_id: { [Op.in]: packageIds },
            status: { [Op.notIn]: ['ENTREGADO', 'CANCELADO', 'DEVUELTO_A_CLIENTE'] }
          },
          transaction: t
        }
      );
    }
    // --- LÓGICA PARA FINALIZAR RUTA ---
    else if (newStatus === 'FINALIZADA' && route.status === 'EN_PROGRESO') {
      const packageIds = route.routePackages.map(rp => rp.package_id);
      const packages = await Package.findAll({ where: { package_id: { [Op.in]: packageIds } }, transaction: t });

      // - ASIGNADO_A_RUTA: El paquete ya fue reasignado a otra ruta nueva
      const finalStates = ['ENTREGADO', 'INCIDENCIA_ENTREGA', 'REPROGRAMADO', 'DEVUELTO_ALMACEN', 'ASIGNADO_A_RUTA'];

      const allPackagesHandled = packages.every(pkg => finalStates.includes(pkg.status));

      if (!allPackagesHandled) {
        // Identificar cuáles paquetes están pendientes para dar mejor feedback
        const pendingPackages = packages.filter(pkg => !finalStates.includes(pkg.status));
        const pendingInfo = pendingPackages.map(pkg => `${pkg.tracking_code} (${pkg.status})`).join(', ');

        await t.rollback();
        return res.status(409).json({
          error: 'No se puede finalizar la ruta. Aún hay paquetes sin gestionar.',
          pending_packages: pendingInfo,
          details: `Los siguientes paquetes aún no han sido procesados: ${pendingInfo}`
        });
      }

      // --- MEJORA: Liberar paquetes no entregados para que vuelvan a estar disponibles ---
      // Solo liberamos aquellos que están en tránsito o con incidencia,
      // pero respetamos los que ya han sido asignados a una nueva ruta (ASIGNADO_A_RUTA)
      // -----------------------------------------------------------------------------
      // LÓGICA DE PAQUETES NO ENTREGADOS (PENDIENTES DE DEVOLUCIÓN FÍSICA)
      // -----------------------------------------------------------------------------
      // Buscamos los paquetes que no llegaron a un estado final satisfactorio
      const packagesToRelease = packages.filter(pkg =>
        ['EN_RUTA_ENTREGA', 'INCIDENCIA_ENTREGA', 'REPROGRAMADO'].includes(pkg.status)
      );

      if (packagesToRelease.length > 0) {
        const idsToRelease = packagesToRelease.map(p => p.package_id);

        // Mantenemos su estado actual (o forzamos a INCIDENCIA_ENTREGA si estaba en ruta)
        // pero marcamos quién debe devolverlo físicamente o re-intentar
        await Package.update(
          {
            // Si estaba 'EN_RUTA_ENTREGA', lo movemos a 'INCIDENCIA_ENTREGA' para que no quede en el limbo
            status: sequelize.literal("CASE WHEN status = 'EN_RUTA_ENTREGA' THEN 'INCIDENCIA_ENTREGA' ELSE status END"),
            pending_return_user_id: route.user_id
          },
          {
            where: { package_id: { [Op.in]: idsToRelease } },
            transaction: t
          }
        );

        console.log(`🏠 [ROUTE] Marcados ${idsToRelease.length} paquetes como 'En poder del conductor' para la ruta finalizada.`);
      }
      // -----------------------------------------------------------------------------
    } else {
      await t.rollback();
      return res.status(409).json({ error: `Transición de estado no válida de ${route.status} a ${newStatus}` });
    }

    // Actualiza el estado de la ruta
    const oldStatus = route.status;
    route.status = newStatus;
    if (newStatus === 'FINALIZADA') {
      route.end_date = new Date();
    }
    await route.save({ transaction: t });

    // Log de auditoría para cambio de estado
    await logAudit(req.user.user_id, 'UPDATE_ROUTE', {
      route_id: route.route_id,
      route_name: route.route_name,
      old_status: oldStatus,
      new_status: newStatus,
      action_type: 'status_change'
    });

    const driver = await User.findByPk(route.user_id, { transaction: t, attributes: ['full_name'] });
    const routeLabel = route.route_name || route.route_id;

    if (newStatus === 'FINALIZADA') {
      queueNotificationForRole('ADMIN', {
        title: 'Ruta finalizada',
        message: `El conductor ${driver ? driver.full_name : ''} finalizó la ruta ${routeLabel}.`,
        link: `/routes/${route.route_id}`
      }, { transaction: t });
    }

    await t.commit();
    res.status(200).json(route);

  } catch (error) {
    await t.rollback();
    console.error("Error al actualizar estado de la ruta:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * @openapi
 * /routes/{id}:
 *   delete:
 *     tags: [Rutas]
 *     summary: Eliminar una ruta
 *     description: Permite a un administrador eliminar una ruta siempre que no haya sido aprobada para salir a reparto. Los paquetes volverán a estar disponibles.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       '200':
 *         description: Ruta eliminada exitosamente
 *       '403':
 *         description: No autorizado
 *       '404':
 *         description: Ruta no encontrada
 *       '409':
 *         description: Conflicto - La ruta ya fue aprobada y no se puede eliminar
 *       '500':
 *         description: Error del servidor
 */
router.delete('/:id', authenticateToken, roleValidator(['ADMIN']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const routeId = req.params.id;
    const route = await Route.findByPk(routeId, {
      include: [{ model: RoutePackage, as: 'routePackages' }],
      transaction: t
    });

    if (!route) {
      await t.rollback();
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    // Solo impedir eliminar si ya está finalizada
    if (route.status === 'FINALIZADA') {
      await t.rollback();
      return res.status(409).json({ error: 'No se puede eliminar una ruta que ya ha sido finalizada' });
    }

    const packageIds = route.routePackages.map(rp => rp.package_id);

    // 1. Desasociar paquetes y determinar el nuevo estado correcto de cada uno
    const packagesToUpdate = await Package.findAll({
      where: { package_id: { [Op.in]: packageIds } },
      include: [{ model: Pickup, as: 'pickup' }],
      transaction: t
    });

    for (const pkg of packagesToUpdate) {
      let nextStatus = 'RECOLECTADO_EN_ORIGEN';
      if (pkg.pending_return_user_id) {
        nextStatus = 'INCIDENCIA_ENTREGA';
      } else if (pkg.received_at_warehouse_datetime) {
        nextStatus = 'RECIBIDO_EN_ALMACEN';
      } else if (pkg.pickup && pkg.pickup.status === 'VERIFICADO_EN_ALMACEN') {
        nextStatus = 'RECIBIDO_EN_ALMACEN';
      }
      
      await pkg.update({ status: nextStatus }, { transaction: t });
    }

    // 2. Eliminar la ruta (las entradas en RoutePackage se eliminan por CASCADE según el modelo)
    await route.destroy({ transaction: t });

    await logAudit(req.user.user_id, 'DELETE_ROUTE', {
      route_id: routeId,
      route_name: route.route_name,
      package_count: packageIds.length
    });

    await t.commit();
    res.status(200).json({ message: 'Ruta eliminada exitosamente y paquetes liberados' });

  } catch (error) {
    await t.rollback();
    console.error("Error al eliminar ruta:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * @openapi
 * /routes/{id}/packages/{packageId}:
 *   delete:
 *     tags: [Rutas]
 *     summary: Eliminar un paquete de una ruta
 *     description: Permite eliminar un paquete específico de una ruta antes de ser aprobada.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID de la ruta
 *       - in: path
 *         name: packageId
 *         required: true
 *         description: ID del paquete
 *     responses:
 *       '200':
 *         description: Paquete eliminado de la ruta exitosamente
 *       '403':
 *         description: No autorizado
 *       '404':
 *         description: Ruta o paquete no encontrado en la ruta
 */
router.delete('/:id/packages/:packageId', authenticateToken, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id: routeId, packageId } = req.params;
    const userId = req.user.user_id;

    const route = await Route.findByPk(routeId, { transaction: t });
    if (!route) {
      await t.rollback();
      return res.status(404).json({ error: 'Ruta no encontrada' });
    }

    // Validar permisos
    const isAdmin = req.user.role === 'ADMIN';
    const isAssignedDriver = route.user_id === userId;

    if (!isAdmin && !isAssignedDriver) {
      await t.rollback();
      return res.status(403).json({ error: 'No tienes permiso para modificar esta ruta' });
    }

    // Validar estado de la ruta
    if (route.loading_status === 'APPROVED' || route.status !== 'PENDIENTE') {
      await t.rollback();
      return res.status(409).json({ error: 'No se pueden eliminar paquetes de una ruta aprobada o en progreso' });
    }

    // Buscar la asociación
    const routePackage = await RoutePackage.findOne({
      where: { route_id: routeId, package_id: packageId },
      transaction: t
    });

    if (!routePackage) {
      await t.rollback();
      return res.status(404).json({ error: 'El paquete no está asignado a esta ruta' });
    }

    // 1. Eliminar asociación
    await routePackage.destroy({ transaction: t });

    // 2. Liberar paquete
    const pkgToLiberate = await Package.findByPk(packageId, { 
      include: [{ model: Pickup, as: 'pickup' }],
      transaction: t 
    });

    if (pkgToLiberate) {
      let nextStatus = 'RECOLECTADO_EN_ORIGEN';
      if (pkgToLiberate.pending_return_user_id) {
        nextStatus = 'INCIDENCIA_ENTREGA';
      } else if (pkgToLiberate.received_at_warehouse_datetime) {
        nextStatus = 'RECIBIDO_EN_ALMACEN';
      } else if (pkgToLiberate.pickup && pkgToLiberate.pickup.status === 'VERIFICADO_EN_ALMACEN') {
        nextStatus = 'RECIBIDO_EN_ALMACEN';
      }
      
      await pkgToLiberate.update({ status: nextStatus }, { transaction: t });
    }

    // 3. Si la ruta estaba en LOADING_COMPLETED, volver a LOADING ya que cambió el contenido
    if (route.loading_status === 'LOADING_COMPLETED') {
      await route.update({ loading_status: 'LOADING' }, { transaction: t });
    }

    await logAudit(req.user.user_id, 'REMOVE_PACKAGE_FROM_ROUTE', {
      route_id: routeId,
      package_id: packageId
    });

    await t.commit();
    res.status(200).json({ message: 'Paquete eliminado de la ruta exitosamente' });

  } catch (error) {
    await t.rollback();
    console.error("Error al eliminar paquete de la ruta:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/routes/:id/load-my-pending-packages - El conductor carga sus propios paquetes pendientes (los que se llevó a casa)
router.post('/:id/load-my-pending-packages', authenticateToken, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const routeId = req.params.id;
    const userId = req.user.user_id;

    // 1. Validar la ruta
    const route = await Route.findByPk(routeId, { transaction: t });
    if (!route) {
      await t.rollback();
      return res.status(404).json({ error: 'Ruta no encontrada.' });
    }

    if (route.user_id !== userId && req.user.role !== 'ADMIN') {
      await t.rollback();
      return res.status(403).json({ error: 'No tienes permiso para cargar paquetes en esta ruta.' });
    }

    if (route.status !== 'PENDIENTE') {
      await t.rollback();
      return res.status(409).json({ error: 'Solo se pueden cargar paquetes en rutas pendientes.' });
    }

    // 2. Buscar paquetes que este conductor tiene en su poder (pendientes de devolución física)
    const pendingPackages = await Package.findAll({
      where: { pending_return_user_id: userId },
      transaction: t
    });

    if (pendingPackages.length === 0) {
      await t.rollback();
      return res.status(404).json({ error: 'No tienes paquetes pendientes de entrega física en tu poder.' });
    }

    const packageIds = pendingPackages.map(p => p.package_id);

    // 3. Crear registros en RoutePackage
    const routePackages = packageIds.map(pkgId => ({
      route_package_id: uuidv4(),
      route_id: routeId,
      package_id: pkgId
    }));

    await RoutePackage.bulkCreate(routePackages, { transaction: t });

    // 4. Actualizar paquetes (Estado y limpiar marca de pendiente)
    await Package.update(
      {
        status: 'ASIGNADO_A_RUTA',
        pending_return_user_id: null,
        assigned_to_route_datetime: new Date()
      },
      {
        where: { package_id: { [Op.in]: packageIds } },
        transaction: t
      }
    );

    await t.commit();
    res.json({
      message: `Se han cargado ${packageIds.length} paquetes a tu ruta exitosamente.`,
      count: packageIds.length
    });

  } catch (error) {
    if (t) await t.rollback();
    console.error('Error al cargar paquetes pendientes:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

module.exports = router;