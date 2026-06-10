'use strict';

const express = require("express");
const { body, validationResult } = require("express-validator");
const { v4: uuidv4 } = require("uuid");
const { Package, PackageCost, Client, Pickup, Delivery, DeliveryPhoto, User, Cancellation, Return, OcrProcessingQueue, Route, RoutePackage, sequelize } = require('../models');
const authenticateToken = require("../middlewares/authenticateToken");
const { Op } = require("sequelize");
const { logAudit } = require("../utils/audit");
const { generateUniqueTrackingCode } = require("../utils/uuidUtils");
const roleValidator = require('../middlewares/roleValidator');

const router = express.Router();

const validatePackage = [
  body("pickup_id").isUUID(4).withMessage("ID de recolección inválido"),
  body("client_id").isUUID(4).withMessage("ID de cliente inválido"),
  body("recipient_name").isString().notEmpty().withMessage("Nombre del destinatario es requerido"),
  body("destination_address").isString().notEmpty().withMessage("Dirección de destino es requerida"),
  body("client_price").isFloat({ min: 0 }).withMessage("Precio al cliente debe ser un número positivo"),
  body("delivery_cost").isFloat({ min: 0 }).withMessage("Costo de entrega debe ser un número positivo"),
  body("scanned_at_origin_datetime").isISO8601().toDate().withMessage("Fecha de escaneo inválida"),
];

const validateVerification = [
  body('is_cod').isBoolean().withMessage('El campo is_cod debe ser un booleano.'),
  body('cod_amount').isFloat({ min: 0 }).withMessage('El monto COD debe ser un número positivo.'),
  body('client_price').isFloat({ min: 0 }).withMessage('El precio al cliente debe ser un número positivo.'),
  body('delivery_cost').isFloat({ min: 0 }).withMessage('El costo de entrega debe ser un número positivo.'),
  body('costs').optional().isArray().withMessage('Los costos deben ser un arreglo.'),
];


/**
 * @openapi
 * tags:
 *   name: Paquetes
 *   description: Gestión de paquetes y sus costos asociados
 */

/**
 * @openapi
 * /packages:
 *   get:
 *     tags:
 *       - Paquetes
 *     summary: Listar paquetes
 *     description: Obtiene una lista paginada de paquetes con sus costos asociados
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Tamaño de la página
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Término de búsqueda (código de seguimiento o nombre del destinatario)
 *     responses:
 *       '200':
 *         description: Lista de paquetes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total de paquetes
 *                 packages:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PackageWithCosts'
 *       '401':
 *         description: No autorizado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /packages:
 *   post:
 *     tags:
 *       - Paquetes
 *     summary: Crear paquete
 *     description: Crea un nuevo paquete con sus costos asociados (opcional)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PackageCreate'
 *     responses:
 *       '201':
 *         description: Paquete creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PackageWithCosts'
 *       '400':
 *         description: Error de validación o cliente no encontrado
 *       '401':
 *         description: No autorizado
 *       '409':
 *         description: Código de seguimiento ya existe
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /packages/{id}:
 *   put:
 *     tags:
 *       - Paquetes
 *     summary: Actualizar paquete
 *     description: Actualiza un paquete existente y sus costos asociados
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del paquete
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PackageUpdate'
 *     responses:
 *       '200':
 *         description: Paquete actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PackageWithCosts'
 *       '400':
 *         description: Error de validación
 *       '401':
 *         description: No autorizado
 *       '404':
 *         description: Paquete no encontrado
 *       '409':
 *         description: Código de seguimiento ya existe
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /packages/{id}:
 *   delete:
 *     tags:
 *       - Paquetes
 *     summary: Eliminar paquete
 *     description: Elimina un paquete y sus costos asociados
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del paquete
 *     responses:
 *       '200':
 *         description: Paquete eliminado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Paquete eliminado exitosamente
 *       '401':
 *         description: No autorizado
 *       '404':
 *         description: Paquete no encontrado
 *       '409':
 *         description: Conflicto (tiene registros asociados)
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     PackageWithCosts:
 *       type: object
 *       properties:
 *         package_id:
 *           type: string
 *           format: uuid
 *         tracking_code:
 *           type: string
 *         status:
 *           type: string
 *           enum: [RECOLECTADO_EN_ORIGEN, RECIBIDO_EN_ALMACEN, ASIGNADO_A_RUTA, EN_RUTA_ENTREGA, ENTREGADO, INCIDENCIA_ENTREGA, REPROGRAMADO, DEVUELTO_ALMACEN, EN_RUTA_DEVOLUCION, DEVUELTO_A_CLIENTE, CANCELADO]
 *         is_cod:
 *           type: boolean
 *         cod_amount:
 *           type: number
 *           format: float
 *           nullable: true
 *         client_price:
 *           type: number
 *           format: float
 *         delivery_cost:
 *           type: number
 *           format: float
 *         destination_address:
 *           type: string
 *         recipient_name:
 *           type: string
 *         recipient_phone:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         client:
 *           $ref: '#/components/schemas/ClientBasic'
 *         packageCosts:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PackageCost'
 * 
 *     PackageCreate:
 *       type: object
 *       required:
 *         - client_id
 *         - client_price
 *         - delivery_cost
 *       properties:
 *         tracking_code:
 *           type: string
 *           nullable: true
 *           description: Si no se proporciona, se generará automáticamente
 *         client_id:
 *           type: string
 *           format: uuid
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *         status:
 *           type: string
 *           enum: [RECOLECTADO_EN_ORIGEN, RECIBIDO_EN_ALMACEN, ASIGNADO_A_RUTA, EN_RUTA_ENTREGA, ENTREGADO, INCIDENCIA_ENTREGA, REPROGRAMADO, DEVUELTO_ALMACEN, EN_RUTA_DEVOLUCION, DEVUELTO_A_CLIENTE, CANCELADO]
 *           default: "RECOLECTADO_EN_ORIGEN"
 *         is_cod:
 *           type: boolean
 *           default: false
 *         cod_amount:
 *           type: number
 *           format: float
 *           nullable: true
 *         client_price:
 *           type: number
 *           format: float
 *           minimum: 0
 *           example: 1500.50
 *         delivery_cost:
 *           type: number
 *           format: float
 *           minimum: 0
 *           example: 500.00
 *         destination_address:
 *           type: string
 *           example: "Calle Principal 123, Ciudad"
 *         recipient_name:
 *           type: string
 *           example: "Juan Pérez"
 *         recipient_phone:
 *           type: string
 *           example: "+56912345678"
 *         costs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PackageCostInput'
 *           description: Costos adicionales asociados al paquete (opcional)
 * 
 *     PackageUpdate:
 *       type: object
 *       properties:
 *         tracking_code:
 *           type: string
 *           nullable: true
 *         client_id:
 *           type: string
 *           format: uuid
 *         status:
 *           type: string
 *           enum: [RECOLECTADO_EN_ORIGEN, RECIBIDO_EN_ALMACEN, ASIGNADO_A_RUTA, EN_RUTA_ENTREGA, ENTREGADO, INCIDENCIA_ENTREGA, REPROGRAMADO, DEVUELTO_ALMACEN, EN_RUTA_DEVOLUCION, DEVUELTO_A_CLIENTE, CANCELADO]
 *         is_cod:
 *           type: boolean
 *         cod_amount:
 *           type: number
 *           format: float
 *           nullable: true
 *         client_price:
 *           type: number
 *           format: float
 *           minimum: 0
 *         delivery_cost:
 *           type: number
 *           format: float
 *           minimum: 0
 *         destination_address:
 *           type: string
 *         recipient_name:
 *           type: string
 *         recipient_phone:
 *           type: string
 *         costs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PackageCostInput'
 *           description: Lista actualizada de costos asociados al paquete
 * 
 *     ClientBasic:
 *       type: object
 *       properties:
 *         client_id:
 *           type: string
 *           format: uuid
 *         client_name:
 *           type: string
 * 
 *     PackageCost:
 *       type: object
 *       properties:
 *         package_cost_id:
 *           type: string
 *           format: uuid
 *         package_id:
 *           type: string
 *           format: uuid
 *         cost_id:
 *           type: string
 *           format: uuid
 *         applied_value:
 *           type: number
 *           format: float
 *         created_at:
 *           type: string
 *           format: date-time
 * 
 *     PackageCostInput:
 *       type: object
 *       required:
 *         - cost_id
 *         - applied_value
 *       properties:
 *         cost_id:
 *           type: string
 *           format: uuid
 *           description: ID del tipo de costo
 *         applied_value:
 *           type: number
 *           format: float
 *           description: Valor aplicado de este costo
 */

// GET /packages - Listar paquetes con costos
router.get("/", authenticateToken, async (req, res) => {
  try {
    // --- INICIO DE LA CORRECCIÓN ---
    let { page = 1, pageSize = 10, search = "", status, pickupStatus, userId, isChange, changeReceived } = req.query;

    console.log('DEBUG - User role:', req.user.role);
    console.log('DEBUG - userId en query:', userId);

    const whereClause = {};
    const includeClause = [
      { model: Client, as: "client", attributes: ["client_id", "client_name"] },
      { model: PackageCost, as: "packageCosts" },
      { model: User, as: "changeReceivedByUser", attributes: ["user_id", "full_name"], required: false },
      { model: User, as: "pendingReturnDriver", attributes: ["user_id", "full_name"], required: false }
    ];
    let distinct = false;

    if (search) {
      whereClause[Op.or] = [
        { tracking_code: { [Op.like]: `%${search}%` } },
        { recipient_name: { [Op.like]: `%${search}%` } },
        { external_tracking_code: { [Op.like]: `%${search}%` } }
      ];
    }

    // Filtro por estado del paquete
    if (status) {
      if (status.includes(',')) {
        whereClause.status = { [Op.in]: status.split(',') };
      } else {
        whereClause.status = status;
      }
    }

    // Filtro por cambios
    if (isChange !== undefined) {
      whereClause.is_change = isChange === 'true' || isChange === true;
    }

    // Filtro por estado de recepción de cambios
    if (changeReceived !== undefined) {
      whereClause.change_received = changeReceived === 'true' || changeReceived === true;
    }

    // Filtro por estado de la recolección (Pickup)
    if (pickupStatus) {
      includeClause.push({
        model: Pickup,
        as: 'pickup',
        where: { status: pickupStatus },
        attributes: []
      });
    }

    // Solo aplicar filtro de usuario si NO es ADMIN y se especifica userId
    if (userId && req.user.role !== 'ADMIN') {
      includeClause.push({
        model: Delivery,
        as: 'deliveries',
        where: { user_id: userId },
        attributes: ['delivery_id', 'user_id', 'attempted_at', 'status_at_delivery', 'package_id'],
        required: true,
      });
      distinct = true;
    } else if (req.user.role === 'DRIVER' && !userId) {
      // Si es conductor y no se especifica userId, usar su propio ID
      includeClause.push({
        model: Delivery,
        as: 'deliveries',
        where: { user_id: req.user.user_id },
        attributes: ['delivery_id', 'user_id', 'attempted_at', 'status_at_delivery', 'package_id'],
        required: true,
      });
      distinct = true;
    }
    // --- FIN DE LA CORRECCIÓN ---

    const { count, rows: packages } = await Package.findAndCountAll({
      where: whereClause,
      include: includeClause,
      offset: (parseInt(page) - 1) * parseInt(pageSize),
      limit: parseInt(pageSize),
      order: [["created_at", "DESC"]],
      distinct: distinct, // Asegura que el conteo sea correcto
      attributes: {
        include: ['external_tracking_code']
      }
    });

    // LOG para depuración: muestra los paquetes y sus deliveries
    console.log('Respuesta /packages para userId:', userId);
    for (const pkg of packages) {
      console.log('Paquete:', pkg.package_id, 'Entregas:', pkg.deliveries ? pkg.deliveries.map(d => ({ delivery_id: d.delivery_id, attempted_at: d.attempted_at, status_at_delivery: d.status_at_delivery })) : []);
    }

    res.json({ total: count, packages });
  } catch (error) {
    console.error("Error al obtener paquetes:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});


// En tu archivo routes/package.js

// POST /packages - Crear paquete
router.post("/", authenticateToken, validatePackage, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await t.rollback();
      return res.status(400).json({ errors: errors.array() });
    }

    let { tracking_code, external_tracking_code, costs, ...packageData } = req.body;

    // --- INICIO DE LA CORRECCIÓN ---

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
      return recipientsMatch && addressesMatch;
    };

    // 1. Validar unicidad del código de seguimiento externo ANTES de crear
    // CUALQUIER código externo duplicado debe ser rechazado
    if (external_tracking_code) {


      const packagesWithSameCode = await Package.findAll({
        where: { external_tracking_code },
        attributes: ['package_id', 'tracking_code', 'external_tracking_code', 'recipient_name', 'destination_address', 'created_at']
      });

      if (packagesWithSameCode.length > 0) {
        const existingPackage = packagesWithSameCode[0];

        // Verificar si es exactamente el mismo paquete
        const isSamePackage = areSamePackage(packageData, {
          recipient_name: existingPackage.recipient_name,
          destination_address: existingPackage.destination_address,
          external_tracking_code: existingPackage.external_tracking_code
        });

        // RECHAZAR con información detallada
        await t.rollback();
        return res.status(409).json({
          error: `Código externo duplicado: Ya existe un paquete con el código '${external_tracking_code}'.`,
          duplicate_type: isSamePackage ? 'EXACT_DUPLICATE' : 'POSSIBLE_MULTIPART',
          message: isSamePackage
            ? 'Este es un duplicado exacto (mismo código, destinatario y dirección).'
            : 'Posible envío multi-parte. Si es válido, por favor verifique los datos o use un código diferente.',
          duplicate_package: {
            tracking_code: existingPackage.tracking_code,
            external_tracking_code: existingPackage.external_tracking_code,
            recipient_name: existingPackage.recipient_name,
            destination_address: existingPackage.destination_address,
            created_at: existingPackage.created_at
          }
        });
      }
    }

    // 2. Validar unicidad del código de seguimiento interno
    if (!tracking_code) {
      tracking_code = await generateUniqueTrackingCode();
    } else {
      const existingInternal = await Package.findOne({ where: { tracking_code } });
      if (existingInternal) {
        await t.rollback();
        return res.status(409).json({ error: "El código de seguimiento interno ya existe" });
      }
    }

    // 3. Validar existencia de cliente y recolección
    const client = await Client.findByPk(packageData.client_id);
    if (!client) {
      await t.rollback();
      return res.status(400).json({ error: "Cliente no encontrado" });
    }
    const pickup = await Pickup.findByPk(packageData.pickup_id);
    if (!pickup) {
      await t.rollback();
      return res.status(400).json({ error: "Recolección no encontrada" });
    }

    // --- FIN DE LA CORRECCIÓN ---

    const newPackageData = {
      package_id: uuidv4(),
      tracking_code,
      external_tracking_code: external_tracking_code || null,
      pickup_id: packageData.pickup_id,
      client_id: packageData.client_id,
      status: packageData.status || 'RECOLECTADO_EN_ORIGEN',
      is_cod: packageData.is_cod || false,
      cod_amount: packageData.cod_amount || 0,
      is_change: packageData.is_change || false,
      client_price: packageData.client_price,
      delivery_cost: packageData.delivery_cost,
      scanned_at_origin_datetime: packageData.scanned_at_origin_datetime,
      destination_address: packageData.destination_address,
      recipient_name: packageData.recipient_name,
      recipient_phone: packageData.recipient_phone,
    };

    const newPackage = await Package.create(newPackageData, { transaction: t });

    // ... (tu lógica para crear los costos asociados se mantiene igual)

    await logAudit(req.user.user_id, 'CREATE_PACKAGE', { package_id: newPackage.package_id, tracking_code });
    await t.commit();
    const finalPackage = await Package.findByPk(newPackage.package_id, { include: ['client', 'packageCosts'] });
    res.status(201).json(finalPackage);

  } catch (error) {
    await t.rollback();
    console.error("Error al crear paquete:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// PUT /packages/:id - Actualizar paquete y costos asociados con auditoría
router.put("/:id", authenticateToken, validatePackage, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await t.rollback();
      return res.status(400).json({ errors: errors.array() });
    }

    const packageInstance = await Package.findByPk(req.params.id, { transaction: t });
    if (!packageInstance) {
      await t.rollback();
      return res.status(404).json({ error: "Paquete no encontrado" });
    }

    const oldData = { ...packageInstance.get({ plain: true }) };

    const { costs, ...packageDataFromRequest } = req.body;

    if (packageDataFromRequest.tracking_code && packageDataFromRequest.tracking_code !== packageInstance.tracking_code) {
      const existing = await Package.findOne({ where: { tracking_code: packageDataFromRequest.tracking_code } });
      if (existing) {
        await t.rollback();
        return res.status(409).json({ error: "Código de seguimiento ya existe" });
      }
    }

    // --- CORRECCIÓN DE SEGURIDAD: Evitamos Mass Assignment ---
    // Creamos un objeto con solo los campos que permitimos actualizar.
    const allowedUpdates = {
      tracking_code: packageDataFromRequest.tracking_code,
      pickup_id: packageDataFromRequest.pickup_id,
      client_id: packageDataFromRequest.client_id,
      status: packageDataFromRequest.status,
      is_cod: packageDataFromRequest.is_cod,
      cod_amount: packageDataFromRequest.cod_amount,
      client_price: packageDataFromRequest.client_price,
      delivery_cost: packageDataFromRequest.delivery_cost,
      is_delivery_cost_manual: packageDataFromRequest.is_delivery_cost_manual !== undefined ? packageDataFromRequest.is_delivery_cost_manual : packageInstance.is_delivery_cost_manual,
      is_change: packageDataFromRequest.is_change,
      scanned_at_origin_datetime: packageDataFromRequest.scanned_at_origin_datetime,
      received_at_warehouse_datetime: packageDataFromRequest.received_at_warehouse_datetime,
      assigned_to_route_datetime: packageDataFromRequest.assigned_to_route_datetime,
      delivered_datetime: packageDataFromRequest.delivered_datetime,
      returned_datetime: packageDataFromRequest.returned_datetime,
      destination_address: packageDataFromRequest.destination_address,
      recipient_name: packageDataFromRequest.recipient_name,
      recipient_phone: packageDataFromRequest.recipient_phone,
      has_multiple_labels: packageDataFromRequest.has_multiple_labels,
      sales_codes: packageDataFromRequest.sales_codes,
    };

    // --- VALIDACIÓN DE SEGURIDAD: No permitir cambiar estado a ENTREGADO directamente ---
    if (allowedUpdates.status === 'ENTREGADO' && oldData.status !== 'ENTREGADO') {
      await t.rollback();
      return res.status(403).json({
        error: "No se puede marcar un paquete como entregado directamente. Use el endpoint de intentos de entrega."
      });
    }

    // Filtramos los campos que no vienen en la petición para no actualizarlos a `undefined`
    Object.keys(allowedUpdates).forEach(key => allowedUpdates[key] === undefined && delete allowedUpdates[key]);

    await packageInstance.update(allowedUpdates, { transaction: t });

    // Estrategia de actualización de costos: "eliminar y recrear".
    if (Array.isArray(costs)) {
      await PackageCost.destroy({ where: { package_id: packageInstance.package_id }, transaction: t });
      if (costs.length > 0) {
        const costPromises = costs.map(cost => PackageCost.create({
          package_cost_id: uuidv4(),
          package_id: packageInstance.package_id,
          cost_id: cost.cost_id,
          applied_value: cost.applied_value
        }, { transaction: t }));
        await Promise.all(costPromises);
      }
    }

    await logAudit(req.user.user_id, 'UPDATE_PACKAGE', { package_id: packageInstance.package_id, allowedUpdates });
    await t.commit();
    const finalPackage = await Package.findByPk(packageInstance.package_id, { include: ['client', 'packageCosts'] });
    res.json(finalPackage);

  } catch (error) {
    await t.rollback();
    console.error("Error al actualizar paquete:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// DELETE /packages/:id - Eliminar paquete con auditoría
router.delete("/:id", authenticateToken, roleValidator(["ADMIN"]), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const packageInstance = await Package.findByPk(req.params.id, { transaction: t });
    if (!packageInstance) {
      await t.rollback();
      return res.status(404).json({ error: "Paquete no encontrado" });
    }

    const trackingCode = packageInstance.tracking_code;
    const packageId = packageInstance.package_id;

    // Eliminar dependencias manualmente para evitar violaciones de clave foránea
    await OcrProcessingQueue.destroy({ where: { package_id: packageId }, transaction: t });
    
    const deliveries = await Delivery.findAll({ where: { package_id: packageId }, transaction: t });
    for (const d of deliveries) {
      await DeliveryPhoto.destroy({ where: { delivery_id: d.delivery_id }, transaction: t });
    }
    
    await Delivery.destroy({ where: { package_id: packageId }, transaction: t });
    await RoutePackage.destroy({ where: { package_id: packageId }, transaction: t });
    await PackageCost.destroy({ where: { package_id: packageId }, transaction: t });

    await packageInstance.destroy({ transaction: t });
    await logAudit(req.user.user_id, "DELETE_PACKAGE", { package_id: packageId, tracking_code: trackingCode });
    await t.commit();
    res.json({ message: "Paquete eliminado exitosamente" });
  } catch (error) {
    await t.rollback();
    console.error("Error al eliminar paquete:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// GET /packages/:id - Obtener un paquete por su ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const packageId = req.params.id;

    // Find deliveries for this package
    const deliveries = await Delivery.findAll({
      where: {
        package_id: packageId
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['full_name']
        },
        {
          model: DeliveryPhoto,
          as: 'deliveryPhotos', // Use the correct alias defined in your association
          attributes: ['photo_id', 'photo_url']
        }
      ],
      order: [
        ['attempted_at', 'DESC']
      ]
    });

    // Find the package with related data
    const packageInstance = await Package.findByPk(packageId, {
      include: [
        { model: Client, as: 'client', attributes: ['client_id', 'client_name'] },
        { model: PackageCost, as: 'packageCosts' }
      ]
    });

    if (!packageInstance) {
      return res.status(404).json({ error: 'Paquete no encontrado' });
    }

    // Convert package instance to plain object and add deliveries
    const packageData = packageInstance.toJSON();
    packageData.deliveries = deliveries.map(delivery => {
      const deliveryJson = delivery.toJSON();
      // Log para verificar que las coordenadas están presentes
      if (deliveryJson.gps_latitude && deliveryJson.gps_longitude) {
        console.log(`📍 [PACKAGE] Entrega ${deliveryJson.delivery_id} tiene coordenadas: ${deliveryJson.gps_latitude}, ${deliveryJson.gps_longitude}`);
      } else {
        console.log(`⚠️ [PACKAGE] Entrega ${deliveryJson.delivery_id} NO tiene coordenadas GPS`);
      }
      return deliveryJson;
    });

    // ✅ NUEVO: Buscar la imagen de la etiqueta OCR si existe
    const ocrImage = await OcrProcessingQueue.findOne({
      where: { package_id: packageId },
      attributes: ['image_path', 'filename', 'parser_used', 'overall_confidence', 'created_at'],
      order: [['created_at', 'DESC']] // Obtener la más reciente si hay múltiples
    });

    if (ocrImage) {
      packageData.label_image = {
        image_path: ocrImage.image_path,
        filename: ocrImage.filename,
        parser_used: ocrImage.parser_used,
        confidence: ocrImage.overall_confidence,
        scanned_at: ocrImage.created_at
      };
    } else {
      packageData.label_image = null;
    }

    res.json(packageData);

  } catch (error) {
    console.error("Error al obtener el paquete por ID:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});


// GET /packages/:id/deliveries - Obtener todos los intentos de entrega de un paquete
router.get('/:id/deliveries', authenticateToken, async (req, res) => {
  try {
    const packageId = req.params.id;

    // Primero, verificamos que el paquete exista para dar un error 404 claro.
    const pkg = await Package.findByPk(packageId);
    if (!pkg) {
      return res.status(404).json({ error: 'Paquete no encontrado.' });
    }

    // Buscamos todos los registros de entrega asociados a este package_id
    const deliveries = await Delivery.findAll({
      where: {
        package_id: packageId
      },
      include: [
        {
          model: User,
          as: 'user', // Asegúrate de que el alias 'user' esté definido en tu modelo Delivery
          attributes: ['full_name'] // Traemos el nombre del repartidor
        },
        {
          model: DeliveryPhoto,
          as: 'photos', // Alias para las fotos, ajústalo si es diferente en tu modelo
          attributes: ['photo_id', 'photo_url']
        }
      ],
      order: [
        ['attempted_at', 'DESC'] // Ordenamos del más reciente al más antiguo
      ]
    });

    // Devolvemos la lista de entregas (puede ser un array vacío si no hay ninguna)
    res.status(200).json(deliveries);

  } catch (error) {
    console.error('Error al obtener los intentos de entrega:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});


// PUT /api/packages/:id/verify - Endpoint para que Admin/Staff verifique y añada datos financieros
router.put(
  '/:id/verify',
  authenticateToken,
  roleValidator(['ADMIN', 'WAREHOUSE_STAFF']),
  validateVerification,
  async (req, res) => {
    const t = await sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await t.rollback();
        return res.status(400).json({ errors: errors.array() });
      }

      const packageId = req.params.id;
      const {
        is_cod,
        cod_amount,
        is_change,
        client_price,
        delivery_cost,
        is_delivery_cost_manual,
        costs,
        has_multiple_labels,
        sales_codes
      } = req.body;

      const pkg = await Package.findByPk(packageId, { transaction: t });
      if (!pkg) {
        await t.rollback();
        return res.status(404).json({ error: 'Paquete no encontrado.' });
      }

      // Solo se pueden verificar paquetes que han llegado al almacén o ya han sido verificados
      if (pkg.status !== 'RECOLECTADO_EN_ORIGEN' && pkg.status !== 'RECIBIDO_EN_ALMACEN') {
        await t.rollback();
        return res.status(409).json({ error: `No se puede verificar un paquete en estado '${pkg.status}'.` });
      }

      // Actualiza los campos financieros y adicionales
      pkg.is_cod = is_cod;
      pkg.cod_amount = is_cod ? cod_amount : 0;
      pkg.is_change = is_change || false;
      pkg.has_multiple_labels = has_multiple_labels || false;
      pkg.sales_codes = has_multiple_labels ? (sales_codes || null) : null;
      pkg.client_price = client_price;
      pkg.delivery_cost = delivery_cost;
      if (is_delivery_cost_manual !== undefined) {
        pkg.is_delivery_cost_manual = is_delivery_cost_manual;
      }

      // Cambia el estado a verificado y listo para despacho
      pkg.status = 'RECIBIDO_EN_ALMACEN';
      pkg.received_at_warehouse_datetime = new Date();

      await pkg.save({ transaction: t });

      // Actualiza los costos adicionales (eliminar y recrear para simplicidad)
      if (Array.isArray(costs)) {
        await PackageCost.destroy({ where: { package_id: packageId }, transaction: t });
        if (costs.length > 0) {
          const costPromises = costs.map(cost => PackageCost.create({
            package_cost_id: uuidv4(),
            package_id: packageId,
            cost_id: cost.cost_id,
            applied_value: cost.applied_value,
            cost_type: cost.cost_type,
          }, { transaction: t }));
          await Promise.all(costPromises);
        }
      }

      await t.commit();

      const finalPackage = await Package.findByPk(packageId, {
        include: [
          'client',
          'packageCosts',
          { model: User, as: 'changeReceivedByUser', attributes: ['user_id', 'full_name'], required: false }
        ]
      });
      res.json({ message: 'Paquete verificado y actualizado exitosamente.', package: finalPackage });

    } catch (error) {
      await t.rollback();
      console.error("Error al verificar el paquete:", error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

// GET /api/packages/by-code/:trackingCode - Busca un paquete por su código de seguimiento
router.get('/by-code/:trackingCode', authenticateToken, async (req, res) => {
  try {
    const { trackingCode } = req.params;
    const pkg = await Package.findOne({
      where: { tracking_code: trackingCode },
      include: ['client', 'packageCosts'] // Incluimos datos relevantes
    });

    if (!pkg) {
      return res.status(404).json({ error: 'Paquete no encontrado con ese código de seguimiento.' });
    }

    res.json(pkg);
  } catch (error) {
    console.error("Error al buscar paquete por código:", error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});


// PUT /api/packages/:id/receive-at-warehouse - Confirmar que el paquete volvió físicamente al almacén
router.put('/:id/receive-at-warehouse', authenticateToken, roleValidator(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const packageId = req.params.id;
    const pkg = await Package.findByPk(packageId, { transaction: t });
    if (!pkg) {
      await t.rollback();
      return res.status(404).json({ error: 'Paquete no encontrado.' });
    }

    // 1. Limpiar marca de pendiente por devolver y actualizar estado
    await pkg.update({
      status: 'RECIBIDO_EN_ALMACEN',
      pending_return_user_id: null,
      received_at_warehouse_datetime: new Date()
    }, { transaction: t });

    await t.commit();
    res.json({ message: 'Recepción en almacén confirmada.', package: pkg });
  } catch (error) {
    if (t) await t.rollback();
    console.error('Error al confirmar recepción:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// PATCH /api/packages/:id/tracking - Actualizar código externo de un paquete (solo ADMIN)
router.patch('/:id/tracking', authenticateToken, roleValidator(['ADMIN']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const packageId = req.params.id;
    const { external_tracking_code } = req.body;

    if (external_tracking_code === undefined) {
      await t.rollback();
      return res.status(400).json({ error: 'Se requiere el campo external_tracking_code' });
    }

    const pkg = await Package.findByPk(packageId, { transaction: t });
    if (!pkg) {
      await t.rollback();
      return res.status(404).json({ error: 'Paquete no encontrado' });
    }

    // Validar que el paquete no esté en estados avanzados
    const blockedStatuses = ['ASIGNADO_A_RUTA', 'EN_RUTA_ENTREGA', 'ENTREGADO'];
    if (blockedStatuses.includes(pkg.status)) {
      await t.rollback();
      return res.status(409).json({
        error: 'No permitido',
        message: `No se puede modificar el código externo de un paquete en estado '${pkg.status.replace(/_/g, ' ')}'. El paquete ya fue asignado a ruta o entregado.`
      });
    }

    // Validar que el nuevo código no esté duplicado (si se proporcionó uno)
    if (external_tracking_code && external_tracking_code.trim() !== '') {
      const trimmedCode = external_tracking_code.trim();
      const existing = await Package.findOne({
        where: {
          external_tracking_code: trimmedCode,
          package_id: { [Op.ne]: packageId } // Excluir el paquete actual
        },
        transaction: t
      });

      if (existing) {
        await t.rollback();
        return res.status(409).json({
          error: 'Código externo duplicado',
          message: `Ya existe otro paquete (${existing.tracking_code}) con el código externo '${trimmedCode}'.`
        });
      }
    }

    const oldCode = pkg.external_tracking_code;
    const newCode = external_tracking_code ? external_tracking_code.trim() : null;

    await pkg.update({ external_tracking_code: newCode }, { transaction: t });

    await logAudit(req.user.user_id, 'UPDATE_PACKAGE_TRACKING', {
      package_id: packageId,
      tracking_code: pkg.tracking_code,
      old_external_tracking_code: oldCode,
      new_external_tracking_code: newCode
    });

    await t.commit();

    console.log(`✅ [TRACKING UPDATE] Paquete ${pkg.tracking_code}: "${oldCode}" → "${newCode}" (por ${req.user.user_id})`);

    res.json({
      success: true,
      message: 'Código externo actualizado exitosamente',
      package: {
        package_id: pkg.package_id,
        tracking_code: pkg.tracking_code,
        external_tracking_code: newCode,
        status: pkg.status
      }
    });

  } catch (error) {
    await t.rollback();
    console.error('Error al actualizar código externo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;