'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { Warehouse } = require('../models');
const { logAudit } = require('../utils/audit');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Warehouse:
 *       type: object
 *       properties:
 *         warehouse_id:
 *           type: string
 *           format: uuid
 *           description: ID único del almacén
 *         warehouse_name:
 *           type: string
 *           description: Nombre del almacén
 *         address:
 *           type: string
 *           description: Dirección física del almacén
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Mensaje de error
 *         errors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               msg:
 *                 type: string
 *               param:
 *                 type: string
 *               location:
 *                 type: string
 */

const validateWarehouse = [
    body('warehouse_name').trim().notEmpty().withMessage('El nombre del almacén es requerido.'),
    body('address').trim().notEmpty().withMessage('La dirección es requerida.')
];

// Proteger todas las rutas de este archivo para administradores
router.use(authenticateToken, roleValidator(['ADMIN']));

/**
 * @swagger
 * /warehouses:
 *   get:
 *     summary: Obtener todos los almacenes
 *     tags: [Warehouses]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de todos los almacenes ordenados por nombre
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Warehouse'
 *       401:
 *         description: No autorizado (token inválido o ausente)
 *       403:
 *         description: Prohibido (no tiene rol de ADMIN)
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', async (req, res) => {
    try {
        const warehouses = await Warehouse.findAll({ order: [['warehouse_name', 'ASC']] });
        res.json(warehouses);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los almacenes' });
    }
});

/**
 * @swagger
 * /warehouses:
 *   post:
 *     summary: Crear un nuevo almacén
 *     tags: [Warehouses]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - warehouse_name
 *               - address
 *             properties:
 *               warehouse_name:
 *                 type: string
 *                 description: Nombre del almacén
 *               address:
 *                 type: string
 *                 description: Dirección física del almacén
 *     responses:
 *       201:
 *         description: Almacén creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Warehouse'
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado (token inválido o ausente)
 *       403:
 *         description: Prohibido (no tiene rol de ADMIN)
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', validateWarehouse, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { warehouse_name, address } = req.body;
        const newWarehouse = await Warehouse.create({ 
            warehouse_id: uuidv4(), 
            warehouse_name, 
            address 
        });
        await logAudit(req.user.user_id, 'CREATE_WAREHOUSE', { warehouse_id: newWarehouse.warehouse_id, warehouse_name });
        res.status(201).json(newWarehouse);
    } catch (error) {
        res.status(500).json({ error: 'Error al crear el almacén' });
    }
});

/**
 * @swagger
 * /warehouses/{id}:
 *   put:
 *     summary: Actualizar un almacén existente
 *     tags: [Warehouses]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del almacén a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - warehouse_name
 *               - address
 *             properties:
 *               warehouse_name:
 *                 type: string
 *                 description: Nuevo nombre del almacén
 *               address:
 *                 type: string
 *                 description: Nueva dirección del almacén
 *     responses:
 *       200:
 *         description: Almacén actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Warehouse'
 *       400:
 *         description: Datos de entrada inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Almacén no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: No autorizado (token inválido o ausente)
 *       403:
 *         description: Prohibido (no tiene rol de ADMIN)
 *       500:
 *         description: Error del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/:id', validateWarehouse, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const warehouse = await Warehouse.findByPk(req.params.id);
        if (!warehouse) return res.status(404).json({ error: 'Almacén no encontrado' });
        const { warehouse_name, address } = req.body;
    await warehouse.update({ warehouse_name, address });
    await logAudit(req.user.user_id, 'UPDATE_WAREHOUSE', { warehouse_id: warehouse.warehouse_id, warehouse_name, address });
    res.json(warehouse);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el almacén' });
    }
});

module.exports = router;