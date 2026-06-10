'use strict';

const express = require("express");
const { body, validationResult } = require("express-validator");
const { v4: uuidv4 } = require("uuid");
const { Vehicle, User, VehicleType, sequelize } = require("../models");
const { logAudit } = require("../utils/audit");
const authenticateToken = require("../middlewares/authenticateToken");
const roleValidator = require('../middlewares/roleValidator');
const { Op } = require("sequelize");

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Vehicle:
 *       type: object
 *       properties:
 *         vehicle_id:
 *           type: string
 *           format: uuid
 *           description: ID único del vehículo
 *         license_plate:
 *           type: string
 *           maxLength: 20
 *           description: Placa del vehículo
 *         user_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: ID del usuario/conductor asignado
 *         type_id:
 *           type: string
 *           format: uuid
 *           description: ID del tipo de vehículo
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     VehicleResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/Vehicle'
 *         - type: object
 *           properties:
 *             user:
 *               $ref: '#/components/schemas/User'
 *             vehicleType:
 *               $ref: '#/components/schemas/VehicleType'
 *     VehicleListResponse:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           description: Total de vehículos
 *         vehicles:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VehicleResponse'
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Descripción del error
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// --- Validaciones Simplificadas (sin consultas a la BD) ---
const validateVehicle = [
  body("license_plate").isString().trim().notEmpty().isLength({ max: 20 }).withMessage("La placa es requerida (máx 20 caracteres)"),
  body("user_id").optional({ nullable: true }).isUUID(4).withMessage("El ID de usuario debe ser un UUID válido si se proporciona"),
  body("type_id").isUUID(4).withMessage("El ID de tipo de vehículo es requerido y debe ser un UUID"),
];

// --- Rutas ---

/**
 * @swagger
 * /vehicles:
 *   get:
 *     summary: Lista todos los vehículos con paginación
 *     tags: [Vehicles]
 *     security:
 *       - BearerAuth: []
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
 *         description: Texto para buscar en placas
 *       - in: query
 *         name: type_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del tipo de vehículo para filtrar
 *     responses:
 *       200:
 *         description: Lista de vehículos paginada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VehicleListResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search, type_id } = req.query;
    const whereClause = {};
    
    if (search) {
      whereClause.license_plate = { [Op.like]: `%${search}%` };
    }
    if (type_id) {
      whereClause.type_id = type_id;
    }

    const { count, rows: vehicles } = await Vehicle.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: "user", attributes: ["user_id", "full_name"] },
        { model: VehicleType, as: "vehicleType", attributes: ["type_id", "type_name"] }
      ],
      order: [['created_at', 'DESC']],
      offset: (parseInt(page) - 1) * parseInt(pageSize),
      limit: parseInt(pageSize)
    });

    res.json({ total: count, vehicles });
  } catch (error) {
    console.error("Error al obtener vehículos:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

/**
 * @swagger
 * /vehicles/{id}:
 *   get:
 *     summary: Obtiene un vehículo por su ID
 *     tags: [Vehicles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del vehículo
 *     responses:
 *       200:
 *         description: Detalles del vehículo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VehicleResponse'
 *       404:
 *         description: Vehículo no encontrado
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const vehicle = await Vehicle.findByPk(req.params.id, {
      include: ["user", "vehicleType"]
    });
    if (!vehicle) return res.status(404).json({ error: "Vehículo no encontrado" });
    res.json(vehicle);
  } catch (error) {
    console.error("Error al obtener vehículo:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

/**
 * @swagger
 * /vehicles:
 *   post:
 *     summary: Crea un nuevo vehículo (solo ADMIN)
 *     tags: [Vehicles]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - license_plate
 *               - type_id
 *             properties:
 *               license_plate:
 *                 type: string
 *                 maxLength: 20
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               type_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Vehículo creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Vehicle'
 *       400:
 *         description: Datos de entrada inválidos
 *       409:
 *         description: Conflicto (placa ya existe)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", authenticateToken, roleValidator(['ADMIN']), validateVehicle, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const t = await sequelize.transaction();
  try {
    const { license_plate, user_id, type_id } = req.body;

    const vehicleType = await VehicleType.findByPk(type_id, { transaction: t });
    if (!vehicleType) {
        await t.rollback();
        return res.status(400).json({ error: "Tipo de vehículo no encontrado" });
    }
    if (user_id) {
        const user = await User.findByPk(user_id, { transaction: t });
        if (!user) {
            await t.rollback();
            return res.status(400).json({ error: "Usuario (conductor) no encontrado" });
        }
    }

    const newVehicleData = {
      vehicle_id: uuidv4(),
      license_plate,
      user_id: user_id || null,
      type_id
    };

    const newVehicle = await Vehicle.create(newVehicleData, { transaction: t });
    await logAudit(req.user.user_id, 'CREATE_VEHICLE', { vehicle_id: newVehicle.vehicle_id, license_plate });
    await t.commit();
    res.status(201).json(newVehicle);

  } catch (error) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'La placa ya está registrada.' });
    }
    console.error("Error al crear vehículo:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

/**
 * @swagger
 * /vehicles/{id}:
 *   put:
 *     summary: Actualiza un vehículo existente (solo ADMIN)
 *     tags: [Vehicles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del vehículo a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - license_plate
 *               - type_id
 *             properties:
 *               license_plate:
 *                 type: string
 *                 maxLength: 20
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               type_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Vehículo actualizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Vehicle'
 *       400:
 *         description: Datos de entrada inválidos o referencias no encontradas
 *       404:
 *         description: Vehículo no encontrado
 *       409:
 *         description: Conflicto (placa ya existe)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/:id", authenticateToken, roleValidator(['ADMIN']), validateVehicle, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const t = await sequelize.transaction();
  try {
    const { license_plate, user_id, type_id } = req.body;
    
    const vehicle = await Vehicle.findByPk(req.params.id, { transaction: t });
    if (!vehicle) {
      await t.rollback();
      return res.status(404).json({ error: "Vehículo no encontrado" });
    }

  await vehicle.update({
    license_plate,
    user_id: user_id || null,
    type_id
  }, { transaction: t });
  await logAudit(req.user.user_id, 'UPDATE_VEHICLE', { vehicle_id: vehicle.vehicle_id, license_plate, user_id, type_id });
  await t.commit();
  res.json(vehicle);

  } catch (error) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'La placa ya está registrada para otro vehículo.' });
    } else if (error.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(400).json({ error: 'El usuario o tipo de vehículo especificado no existe.' });
    }
    console.error("Error al actualizar vehículo:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

/**
 * @swagger
 * /vehicles/{id}:
 *   delete:
 *     summary: Elimina un vehículo (solo ADMIN)
 *     tags: [Vehicles]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del vehículo a eliminar
 *     responses:
 *       200:
 *         description: Vehículo eliminado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       404:
 *         description: Vehículo no encontrado
 *       409:
 *         description: Conflicto (vehículo en uso)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", authenticateToken, roleValidator(['ADMIN']), async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const vehicle = await Vehicle.findByPk(req.params.id, { transaction: t });
    if (!vehicle) {
      await t.rollback();
      return res.status(404).json({ error: "Vehículo no encontrado" });
    }

  await vehicle.destroy({ transaction: t });
  await logAudit(req.user.user_id, 'DELETE_VEHICLE', { vehicle_id: vehicle.vehicle_id, license_plate: vehicle.license_plate });
  await t.commit();
  res.json({ message: "Vehículo eliminado exitosamente" });

  } catch (error) {
    await t.rollback();
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(409).json({
        error: "Conflicto al eliminar",
        message: "No se puede eliminar el vehículo porque está asignado a una o más rutas."
      });
    }
    console.error("Error al eliminar vehículo:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

module.exports = router;