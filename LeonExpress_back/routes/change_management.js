const express = require('express');
const router = express.Router();
const { Package, User } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const { logAudit } = require('../utils/audit');
const { body, validationResult } = require('express-validator');

/**
 * @openapi
 * /packages/{id}/mark-change-received:
 *   put:
 *     tags:
 *       - Gestión de Cambios
 *     summary: Marcar un cambio como recibido
 *     description: Permite al admin marcar que un cambio fue recibido del conductor
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Notas adicionales sobre la recepción del cambio
 *     responses:
 *       '200':
 *         description: Cambio marcado como recibido exitosamente
 *       '400':
 *         description: El paquete no es un cambio
 *       '404':
 *         description: Paquete no encontrado
 *       '500':
 *         description: Error del servidor
 */
router.put(
    '/:id/mark-change-received',
    authenticateToken,
    roleValidator(['ADMIN', 'WAREHOUSE_STAFF']),
    [
        body('notes').optional().isString().withMessage('Las notas deben ser texto')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const packageId = req.params.id;
            const { notes } = req.body;

            // Buscar el paquete
            const pkg = await Package.findByPk(packageId, {
                include: [
                    { model: User, as: 'changeReceivedByUser', attributes: ['user_id', 'full_name'] }
                ]
            });

            if (!pkg) {
                return res.status(404).json({ error: 'Paquete no encontrado' });
            }

            // Verificar que sea un cambio
            if (!pkg.is_change) {
                return res.status(400).json({ error: 'Este paquete no está marcado como cambio' });
            }

            // Verificar si ya fue recibido
            if (pkg.change_received) {
                return res.status(400).json({
                    error: 'Este cambio ya fue marcado como recibido',
                    received_at: pkg.change_received_at,
                    received_by: pkg.changeReceivedByUser?.full_name
                });
            }

            // Marcar como recibido
            await pkg.update({
                change_received: true,
                change_received_at: new Date(),
                change_received_by: req.user.user_id,
                change_notes: notes || pkg.change_notes
            });

            // Registrar en auditoría
            await logAudit(req.user.user_id, 'MARK_CHANGE_RECEIVED', {
                package_id: pkg.package_id,
                tracking_code: pkg.tracking_code,
                notes
            });

            // Recargar con datos completos
            const updatedPackage = await Package.findByPk(packageId, {
                include: [
                    { model: User, as: 'changeReceivedByUser', attributes: ['user_id', 'full_name'] }
                ]
            });

            res.json({
                message: 'Cambio marcado como recibido exitosamente',
                package: updatedPackage
            });

        } catch (error) {
            console.error('Error al marcar cambio como recibido:', error);
            res.status(500).json({ error: 'Error del servidor' });
        }
    }
);

/**
 * @openapi
 * /packages/pending-changes:
 *   get:
 *     tags:
 *       - Gestión de Cambios
 *     summary: Obtener lista de cambios pendientes de recibir
 *     description: Retorna todos los paquetes marcados como cambio que aún no han sido recibidos
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Lista de cambios pendientes
 *       '500':
 *         description: Error del servidor
 */
router.get(
    '/pending-changes',
    authenticateToken,
    roleValidator(['ADMIN', 'WAREHOUSE_STAFF']),
    async (req, res) => {
        try {
            const pendingChanges = await Package.findAll({
                where: {
                    is_change: true,
                    change_received: false
                },
                include: [
                    { model: User, as: 'changeReceivedByUser', attributes: ['user_id', 'full_name'] }
                ],
                order: [['created_at', 'DESC']]
            });

            res.json({
                total: pendingChanges.length,
                changes: pendingChanges
            });

        } catch (error) {
            console.error('Error al obtener cambios pendientes:', error);
            res.status(500).json({ error: 'Error del servidor' });
        }
    }
);

module.exports = router;
