'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { VehicleType, sequelize } = require('../models');
const { logAudit } = require('../utils/audit');
const { Op } = require('sequelize');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const router = express.Router();

router.use(authenticateToken, roleValidator(['ADMIN']));

const validateVehicleType = [
    body('type_name').trim().notEmpty().withMessage('El nombre del tipo es requerido.'),
    body('base_delivery_cost').isFloat({ gt: 0 }).withMessage('El costo base debe ser un número positivo.')
];

// GET / - Listar tipos de vehículos
router.get('/', async (req, res) => {
    try {
        let { page = 1, perPage = 10, search = "", sortBy = "type_name", sortOrder = "asc" } = req.query;
        
        const whereClause = {};
        if (search) {
            whereClause[Op.or] = [
                { type_name: { [Op.like]: `%${search}%` } }
            ];
        }

        const { count, rows: vehicleTypes } = await VehicleType.findAndCountAll({
            where: whereClause,
            offset: (parseInt(page) - 1) * parseInt(perPage),
            limit: parseInt(perPage),
            order: [[sortBy, sortOrder.toUpperCase()]],
        });

        res.json({ total: count, vehicleTypes });
    } catch (error) {
        console.error("Error al obtener tipos de vehículos:", error);
        res.status(500).json({ error: "Error del servidor" });
    }
});

// GET /:id - Obtener un tipo de vehículo por ID
router.get('/:id', async (req, res) => {
    try {
        const vehicleType = await VehicleType.findByPk(req.params.id);
        
        if (!vehicleType) {
            return res.status(404).json({ error: 'Tipo de vehículo no encontrado' });
        }
        
        res.json(vehicleType);
    } catch (error) {
        console.error("Error al obtener tipo de vehículo:", error);
        res.status(500).json({ error: "Error del servidor" });
    }
});

// POST / - Crear un tipo de vehículo
router.post('/', validateVehicleType, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const t = await sequelize.transaction();
    try {
        const { type_name, base_delivery_cost } = req.body;
        const type_id = uuidv4();

        const vehicleType = await VehicleType.create({
            type_id,
            type_name,
            base_delivery_cost
        }, { transaction: t });

        await logAudit(req.user.user_id, 'CREATE_VEHICLE_TYPE', { type_id, type_name, base_delivery_cost });
        await t.commit();
        res.status(201).json(vehicleType);
    } catch (error) {
        await t.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'El nombre del tipo de vehículo ya existe.' });
        }
        res.status(500).json({ error: 'Error al crear el tipo de vehículo' });
    }
});

// PUT /:id - Actualizar un tipo de vehículo
router.put('/:id', validateVehicleType, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    
    const t = await sequelize.transaction();
    try {
        const type = await VehicleType.findByPk(req.params.id, { transaction: t });
        if (!type) {
            await t.rollback();
            return res.status(404).json({ error: 'Tipo de vehículo no encontrado' });
        }
        const { type_name, base_delivery_cost } = req.body;
        await type.update({ type_name, base_delivery_cost }, { transaction: t });
        await logAudit(req.user.user_id, 'UPDATE_VEHICLE_TYPE', { type_id: type.type_id, type_name, base_delivery_cost });
        await t.commit();
        res.json(type);
    } catch (error) {
        await t.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'El nombre del tipo de vehículo ya existe.' });
        }
        res.status(500).json({ error: 'Error al actualizar el tipo de vehículo' });
    }
});

// DELETE /:id - Eliminar un tipo de vehículo
router.delete('/:id', async (req, res) => {
    try {
        const type = await VehicleType.findByPk(req.params.id);
        
        if (!type) {
            return res.status(404).json({ error: 'Tipo de vehículo no encontrado' });
        }

        await type.destroy();
        await logAudit(req.user.user_id, 'DELETE_VEHICLE_TYPE', { type_id: type.type_id, type_name: type.type_name });
        res.status(204).send(); 
        
    } catch (error) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            return res.status(409).json({ error: 'Conflicto: No se puede eliminar el tipo de vehículo porque está en uso.' });
        }
        console.error("Error al eliminar el tipo de vehículo:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;
