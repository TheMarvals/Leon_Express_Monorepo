'use strict';
const express = require('express');
const { body, validationResult } = require('express-validator');
const { SystemConfig } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const router = express.Router();

const validateConfig = [
    body('config_value').notEmpty().withMessage('El valor de la configuración es requerido.')
];

/**
 * @openapi
 * tags:
 *   name: Configuración del Sistema
 *   description: Gestión de la configuración del sistema (solo para administradores)
 */

/**
 * @openapi
 * /system-config:
 *   get:
 *     tags:
 *       - Configuración del Sistema
 *     summary: Obtener toda la configuración
 *     description: Obtiene todas las configuraciones del sistema (solo para administradores)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Lista de configuraciones del sistema
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SystemConfig'
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos (debe ser administrador)
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /system-config/{key}:
 *   put:
 *     tags:
 *       - Configuración del Sistema
 *     summary: Actualizar configuración
 *     description: Actualiza el valor de una configuración específica (solo para administradores)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Clave de la configuración
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - config_value
 *             properties:
 *               config_value:
 *                 type: string
 *                 description: Nuevo valor para la configuración
 *                 example: "nuevo_valor"
 *     responses:
 *       '200':
 *         description: Configuración actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SystemConfig'
 *       '400':
 *         description: Error de validación
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos (debe ser administrador)
 *       '404':
 *         description: Clave de configuración no encontrada
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     SystemConfig:
 *       type: object
 *       properties:
 *         config_key:
 *           type: string
 *           description: Clave única de la configuración
 *           example: "MAX_LOGIN_ATTEMPTS"
 *         config_value:
 *           type: string
 *           description: Valor de la configuración
 *           example: "5"
 *         description:
 *           type: string
 *           description: Descripción del propósito de esta configuración
 *           example: "Número máximo de intentos de login permitidos"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de creación
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Fecha de última actualización
 */

router.use(authenticateToken, roleValidator(['ADMIN']));

router.get('/', async (req, res) => {
    try {
        const configs = await SystemConfig.findAll();
        res.json(configs);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener la configuración' });
    }
});

router.put('/:key', validateConfig, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const config = await SystemConfig.findByPk(req.params.key);
        if (!config) return res.status(404).json({ error: 'Clave de configuración no encontrada' });
        
        await config.update({ config_value: req.body.config_value });
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar la configuración' });
    }
});

module.exports = router;