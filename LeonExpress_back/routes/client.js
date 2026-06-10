'use strict';

const express = require("express");
const { body, validationResult } = require("express-validator");
const { v4: uuidv4 } = require("uuid");
const { Client, ClientPricing, sequelize } = require("../models"); // Importa sequelize para transacciones
const { logAudit } = require("../utils/audit");
const authenticateToken = require("../middlewares/authenticateToken");
const { Op } = require("sequelize");
const { isAfter } = require("date-fns");

const router = express.Router();

// --- Validadores ---
const validateClient = [
  body("client_name").isString().notEmpty().trim().withMessage("Nombre del cliente es requerido"),
  body("email").optional({ nullable: true, checkFalsy: true }).isEmail().trim().withMessage("Formato de email inválido"),
  body("phone").optional({ nullable: true, checkFalsy: true }).isString().trim().withMessage("Teléfono debe ser texto"),
  body("address").optional({ nullable: true, checkFalsy: true }).isString().trim().withMessage("Dirección debe ser texto"),
];

// Validación específica para actualizaciones parciales de cliente
const validateClientUpdate = [
  body("client_name").optional().isString().notEmpty().trim().withMessage("Nombre del cliente es requerido"),
  body("email").optional({ nullable: true, checkFalsy: true }).isEmail().trim().withMessage("Formato de email inválido"),
  body("phone").optional({ nullable: true, checkFalsy: true }).isString().trim().withMessage("Teléfono debe ser texto"),
  body("address").optional({ nullable: true, checkFalsy: true }).isString().trim().withMessage("Dirección debe ser texto"),
  body("is_active").optional().isBoolean().withMessage("Estado activo debe ser booleano"),
  body("has_free_pickups").optional().isBoolean().withMessage("Recolección gratuita debe ser booleano"),
];

const validatePricingPolicy = [
  body("base_price").isFloat({ min: 0 }).withMessage("Precio base es requerido y debe ser un número positivo"),
  body("valid_from").optional({ nullable: true, checkFalsy: true }).isISO8601().toDate().withMessage("Fecha de inicio inválida"),
  body("valid_to").optional({ nullable: true, checkFalsy: true }).isISO8601().toDate().withMessage("Fecha de fin inválida")
    .custom((value, { req }) => {
      if (req.body.valid_from && value && isAfter(new Date(req.body.valid_from), new Date(value))) {
        throw new Error("La fecha de fin debe ser posterior o igual a la fecha de inicio");
      }
      return true;
    }),
];

/**
 * @openapi
 * tags:
 *   name: Clientes
 *   description: Gestión de clientes y sus políticas de precios
 */

/**
 * @openapi
 * /clients:
 *   get:
 *     tags:
 *       - Clientes
 *     summary: Obtener lista de clientes
 *     description: Retorna una lista paginada de clientes con su política de precios actual. Por defecto solo muestra clientes activos.
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
 *         description: Término de búsqueda para filtrar clientes
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Incluir clientes inactivos en los resultados
 *     responses:
 *       '200':
 *         description: Lista de clientes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total de clientes que coinciden con los filtros
 *                 clients:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ClientWithPricing'
 *       '401':
 *         description: No autorizado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /clients:
 *   post:
 *     tags:
 *       - Clientes
 *     summary: Crear un nuevo cliente
 *     description: Crea un nuevo cliente activo con su política de precios inicial
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClientCreate'
 *     responses:
 *       '201':
 *         description: Cliente creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cliente creado exitosamente
 *                 client:
 *                   $ref: '#/components/schemas/ClientWithPricing'
 *       '400':
 *         description: Error de validación
 *       '401':
 *         description: No autorizado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /clients/{id}:
 *   put:
 *     tags:
 *       - Clientes
 *     summary: Actualizar un cliente
 *     description: Actualiza la información de un cliente existente, incluyendo su estado activo/inactivo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del cliente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ClientUpdate'
 *     responses:
 *       '200':
 *         description: Cliente actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cliente actualizado exitosamente
 *                 client:
 *                   $ref: '#/components/schemas/Client'
 *       '400':
 *         description: Error de validación
 *       '401':
 *         description: No autorizado
 *       '404':
 *         description: Cliente no encontrado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /clients/{id}:
 *   delete:
 *     tags:
 *       - Clientes
 *     summary: Desactivar un cliente
 *     description: Realiza un borrado lógico (desactiva) un cliente
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del cliente
 *     responses:
 *       '200':
 *         description: Cliente desactivado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cliente desactivado exitosamente
 *       '401':
 *         description: No autorizado
 *       '404':
 *         description: Cliente no encontrado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /clients/{id}/pricing:
 *   post:
 *     tags:
 *       - Clientes
 *     summary: Crear nueva política de precios
 *     description: Crea una nueva política de precios para el cliente y cierra la anterior
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del cliente
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PricingPolicy'
 *     responses:
 *       '201':
 *         description: Política de precios creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Política de precios creada exitosamente
 *                 pricing:
 *                   $ref: '#/components/schemas/ClientPricing'
 *       '400':
 *         description: Error de validación
 *       '401':
 *         description: No autorizado
 *       '404':
 *         description: Cliente no encontrado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /clients/{id}/history:
 *   get:
 *     tags:
 *       - Clientes
 *     summary: Obtener historial de facturación
 *     description: Retorna el historial de facturación y resumen para un cliente desde la vista materializada
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del cliente
 *     responses:
 *       '200':
 *         description: Historial de facturación
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BillingHistory'
 *       '401':
 *         description: No autorizado
 *       '404':
 *         description: Historial no encontrado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     Client:
 *       type: object
 *       properties:
 *         client_id:
 *           type: string
 *           format: uuid
 *         client_name:
 *           type: string
 *         email:
 *           type: string
 *           nullable: true
 *         phone:
 *           type: string
 *           nullable: true
 *         address:
 *           type: string
 *           nullable: true
 *         is_active:
 *           type: boolean
 *           description: Indica si el cliente está activo
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 * 
 *     ClientWithPricing:
 *       type: object
 *       properties:
 *         client_id:
 *           type: string
 *           format: uuid
 *         client_name:
 *           type: string
 *         email:
 *           type: string
 *           nullable: true
 *         phone:
 *           type: string
 *           nullable: true
 *         address:
 *           type: string
 *           nullable: true
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         current_pricing:
 *           $ref: '#/components/schemas/ClientPricing'
 * 
 *     ClientPricing:
 *       type: object
 *       properties:
 *         pricing_id:
 *           type: string
 *           format: uuid
 *         client_id:
 *           type: string
 *           format: uuid
 *         base_price:
 *           type: number
 *           format: float
 *         description:
 *           type: string
 *         valid_from:
 *           type: string
 *           format: date-time
 *         valid_to:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 * 
 *     ClientCreate:
 *       type: object
 *       required:
 *         - client_name
 *       properties:
 *         client_name:
 *           type: string
 *           example: "Empresa Ejemplo S.A."
 *         email:
 *           type: string
 *           nullable: true
 *           example: "contacto@empresa.com"
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+56912345678"
 *         address:
 *           type: string
 *           nullable: true
 *           example: "Calle Principal 123"
 *         base_price:
 *           type: number
 *           format: float
 *           nullable: true
 *           example: 1000.50
 *         valid_from:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2023-01-01T00:00:00Z"
 *         valid_to:
 *           type: string
 *           format: date-time
 *           nullable: true
 * 
 *     ClientUpdate:
 *       type: object
 *       required:
 *         - client_name
 *       properties:
 *         client_name:
 *           type: string
 *           example: "Nuevo Nombre S.A."
 *         email:
 *           type: string
 *           nullable: true
 *           example: "nuevo@email.com"
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+56987654321"
 *         address:
 *           type: string
 *           nullable: true
 *           example: "Nueva Dirección 456"
 *         is_active:
 *           type: boolean
 *           description: Estado del cliente (activo/inactivo)
 *           example: true
 * 
 *     PricingPolicy:
 *       type: object
 *       required:
 *         - base_price
 *       properties:
 *         base_price:
 *           type: number
 *           format: float
 *           example: 1500.75
 *         description:
 *           type: string
 *           nullable: true
 *           example: "Nuevo precio por volumen"
 *         valid_from:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           example: "2023-06-01T00:00:00Z"
 *         valid_to:
 *           type: string
 *           format: date-time
 *           nullable: true
 * 
 *     BillingHistory:
 *       type: object
 *       properties:
 *         client_id:
 *           type: string
 *           format: uuid
 *         total_shipments:
 *           type: integer
 *           description: Total de envíos realizados
 *         total_billed:
 *           type: number
 *           format: float
 *           description: Monto total facturado
 *         last_shipment_date:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Fecha del último envío
 *         average_shipment_value:
 *           type: number
 *           format: float
 *           description: Valor promedio de los envíos
 */

// GET /clients - Protegido y con alias corregido
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search = "" } = req.query;

    const whereClause = search ? {
      [Op.or]: [
        { client_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ]
    } : {};

    const { count, rows: clients } = await Client.findAndCountAll({
      where: whereClause,
      offset: (Number(page) - 1) * Number(pageSize),
      limit: Number(pageSize),
      include: [{
        model: ClientPricing,
        as: 'clientPricings', // Alias corregido
        where: {
          valid_from: { [Op.lte]: new Date() },
          [Op.or]: [{ valid_to: { [Op.gte]: new Date() } }, { valid_to: null }]
        },
        required: false
      }],
      order: [['client_name', 'ASC']]
    });

    res.json({
      total: count,
      clients: clients.map(client => ({
        ...client.get({ plain: true }),
        current_pricing: client.clientPricings && client.clientPricings.length > 0 ? client.clientPricings[0] : null,
      }))
    });
  } catch (error) {
    console.error("Error al obtener clientes:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// GET /clients/:id - Obtener un cliente por su ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const client = await Client.findByPk(clientId, {
      include: [{
        model: ClientPricing,
        as: 'clientPricings',
        // Opcional: Incluir solo la política de precios activa actualmente
        where: {
          valid_from: { [Op.lte]: new Date() },
          [Op.or]: [{ valid_to: { [Op.gte]: new Date() } }, { valid_to: null }]
        },
        required: false // Usar LEFT JOIN para obtener el cliente aunque no tenga precio activo
      }]
    });

    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    
    // Formatear la respuesta para que sea consistente con la lista de clientes
    const clientData = client.get({ plain: true });
    const response = {
        ...clientData,
        current_pricing: clientData.clientPricings && clientData.clientPricings.length > 0 
            ? clientData.clientPricings[0] 
            : null,
    };
    delete response.clientPricings; // Limpiar el array original de la respuesta

    res.json({ client: response });

  } catch (error) {
    console.error("Error al obtener cliente por ID:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});


// POST /clients - Creación de cliente y precio inicial dentro de una transacción
router.post("/", authenticateToken, validateClient, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // ✅ AÑADIDO: Se obtiene 'has_free_pickups' del cuerpo de la petición
    const { client_name, email, phone, address, has_free_pickups, base_price, valid_from, valid_to } = req.body;
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    const clientId = uuidv4();
    const newClient = await Client.create({
      client_id: clientId,
      client_name,
      email: email || null,
      phone: phone || null,
      address: address || null,
      verification_code: verificationCode,
      has_free_pickups: has_free_pickups || false,
    }, { transaction: t });

    let pricing = null;
    if (base_price !== undefined && base_price !== null) {
      pricing = await ClientPricing.create({
        pricing_id: uuidv4(),
        client_id: clientId,
        base_price,
        description: "Precio inicial",
        valid_from: valid_from || new Date(),
        valid_to: valid_to || null
      }, { transaction: t });
    }

    await logAudit(req.user.user_id, 'CREATE_CLIENT', { client_id: clientId, client_name });
    await t.commit();

    res.status(201).json({
      message: "Cliente creado exitosamente",
      client: { ...newClient.get(), current_pricing: pricing }
    });
  } catch (error) {
    await t.rollback();
    console.error("Error al crear cliente:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});


router.post("/verify", authenticateToken, async (req, res) => {
  try {
    const { verification_code, client_id } = req.body;

    if (!verification_code || !client_id) {
      return res.status(400).json({ error: "El código de verificación y el ID de cliente son requeridos" });
    }

    // Buscar cliente por el código único Y el client_id
    const client = await Client.findOne({ where: { verification_code, client_id } });

    if (!client) {
      return res.status(404).json({ error: "Código de verificación incorrecto o cliente no encontrado" });
    }

    // Respuesta exitosa (NO creamos nada)
    res.status(200).json({
      message: "Código válido",
      client_id: client.client_id,
      client_name: client.client_name
    });
  } catch (error) {
    console.error("Error verificando código:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});




// PUT /clients/:id - Actualización de cliente dentro de una transacción
router.put("/:id", authenticateToken, validateClientUpdate, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const clientId = req.params.id;
    const client = await Client.findByPk(clientId, { transaction: t });
    if (!client) {
      await t.rollback();
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // ✅ LÓGICA MEJORADA: Se construye un objeto solo con los campos a actualizar
    const updateData = {};
    const { client_name, email, phone, address, is_active, has_free_pickups } = req.body;

    if (client_name !== undefined) updateData.client_name = client_name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (has_free_pickups !== undefined) updateData.has_free_pickups = has_free_pickups;

  await client.update(updateData, { transaction: t });
  await logAudit(req.user.user_id, 'UPDATE_CLIENT', { client_id: clientId, updateData });
  await t.commit();
  res.json({ message: "Cliente actualizado exitosamente", client });
  } catch (error) {
    await t.rollback();
    console.error("Error al actualizar cliente:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// DELETE /clients/:id - Borrado en cascada gracias a las reglas del modelo
router.delete("/:id", authenticateToken, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const clientId = req.params.id;
    const client = await Client.findByPk(clientId, { transaction: t });

    if (!client) {
      await t.rollback();
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // En lugar de borrar, lo desactivamos
  await client.update({ is_active: false }, { transaction: t });
  await logAudit(req.user.user_id, 'DEACTIVATE_CLIENT', { client_id: clientId });
  await t.commit();
  res.json({ message: "Cliente desactivado exitosamente" });

  } catch (error) {
    await t.rollback();
    console.error("Error al eliminar cliente:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// POST /clients/:id/pricing - Crear nueva política de precios (cierra la anterior)
router.post("/:id/pricing", authenticateToken, validatePricingPolicy, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const clientId = req.params.id;
    const { base_price, valid_from, valid_to, description } = req.body;
    const validFromDate = valid_from ? new Date(valid_from) : new Date();

    const client = await Client.findByPk(clientId, { transaction: t });
    if (!client) {
      await t.rollback();
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // Cierra la política de precios activa anterior
    await ClientPricing.update(
      { valid_to: validFromDate },
      { where: { client_id: clientId, valid_to: null }, transaction: t }
    );

    // Crea la nueva política de precios
    const newPricing = await ClientPricing.create({
      pricing_id: uuidv4(), // Corregido
      client_id: clientId,
      base_price,
      description: description || "Nueva política de precios",
      valid_from: validFromDate,
      valid_to: valid_to || null
    }, { transaction: t });

    await t.commit();
    res.status(201).json({ message: "Política de precios creada exitosamente", pricing: newPricing });
  } catch (error) {
    await t.rollback();
    console.error("Error al crear política de precios:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// GET /clients/:id/history - Corregido para usar una consulta cruda sobre la vista
router.get('/:id/history', authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    
    // Usamos una consulta cruda para mayor seguridad y rendimiento con vistas
    const [record] = await sequelize.query(
      'SELECT * FROM vw_client_billing_summary WHERE client_id = :clientId',
      {
        replacements: { clientId },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (record) {
      res.json(record);
    } else {
      res.status(404).json({ message: 'Historial no encontrado para este cliente' });
    }
  } catch (error) {
    console.error("Error al obtener historial:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});


// GET /clients/:id/pricing - Obtener la política de precios activa de un cliente
router.get('/:id/pricing', authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    
    console.log('💰 [GET PRICING] Client ID:', clientId);
    console.log('💰 [GET PRICING] Fecha actual:', new Date());

    // Primero, buscar TODAS las políticas de precios de este cliente (para debugging)
    const allPricings = await ClientPricing.findAll({
      where: { client_id: clientId }
    });
    
    console.log('💰 [GET PRICING] Total políticas encontradas:', allPricings.length);
    allPricings.forEach((p, i) => {
      console.log(`💰 [GET PRICING] Política ${i + 1}:`, {
        pricing_id: p.pricing_id,
        base_price: p.base_price,
        valid_from: p.valid_from,
        valid_to: p.valid_to,
        is_valid_from: p.valid_from <= new Date(),
        is_valid_to: p.valid_to ? p.valid_to >= new Date() : true
      });
    });

    // Busca la política de precios que esté activa en este momento
    const activePricing = await ClientPricing.findOne({
      where: {
        client_id: clientId,
        valid_from: { [Op.lte]: new Date() }, // Válida desde hoy o antes
        [Op.or]: [
          { valid_to: { [Op.gte]: new Date() } }, // Válida hasta hoy o después
          { valid_to: null } // O no tiene fecha de fin
        ]
      }
    });

    console.log('💰 [GET PRICING] Política activa encontrada:', activePricing ? 'SÍ' : 'NO');
    
    if (!activePricing) {
      console.warn('⚠️ [GET PRICING] No se encontró política activa para cliente:', clientId);
      // Si no hay un precio específico, puedes devolver un 404 o un precio por defecto
      return res.status(404).json({ error: 'No se encontró una política de precios activa para este cliente.' });
    }

    console.log('✅ [GET PRICING] Devolviendo precio:', activePricing.base_price);
    res.json(activePricing);

  } catch (error) {
    console.error("❌ [GET PRICING] Error al obtener precios del cliente:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});


// GET /clients/:id/pricing/history - Obtener todo el historial de precios de un cliente
router.get('/:id/pricing/history', authenticateToken, async (req, res) => {
  try {
    const clientId = req.params.id;
    const pricingHistory = await ClientPricing.findAll({
      where: { client_id: clientId },
      order: [['valid_from', 'DESC']]
    });

    if (!pricingHistory) {
      return res.status(404).json({ error: 'No se encontró historial de precios para este cliente.' });
    }

    res.json({ pricingHistory: pricingHistory });

  } catch (error) {
    console.error("Error al obtener el historial de precios:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});



// PUT /clients/:id/pricing/:pricingId - Actualizar una política de precios específica
router.put('/:id/pricing/:pricingId', authenticateToken, validatePricingPolicy, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const t = await sequelize.transaction();
    try {
        const { pricingId } = req.params;
        const { base_price, valid_from, valid_to, description } = req.body;

        const pricingRecord = await ClientPricing.findByPk(pricingId, { transaction: t });

        if (!pricingRecord) {
            await t.rollback();
            return res.status(404).json({ error: 'Política de precios no encontrada.' });
        }

        await pricingRecord.update({
            base_price,
            valid_from,
            valid_to,
            description
        }, { transaction: t });

        await t.commit();
        res.json({ message: 'Política de precios actualizada exitosamente', pricing: pricingRecord });

    } catch (error) {
        await t.rollback();
        console.error("Error al actualizar la política de precios:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
module.exports = router;