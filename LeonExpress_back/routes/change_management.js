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

// PUT /change-management/:id/confirm-change-client - Acuse de recibo de cambio retornado a tienda
router.put(
    '/:id/confirm-change-client',
    authenticateToken,
    roleValidator(['CLIENT', 'ADMIN']),
    async (req, res) => {
        try {
            const packageId = req.params.id;
            const pkg = await Package.findByPk(packageId);
            if (!pkg) {
                return res.status(404).json({ error: 'Paquete no encontrado.' });
            }

            if (req.user.role === 'CLIENT' && String(pkg.client_id) !== String(req.user.client_id)) {
                return res.status(403).json({ error: 'No tienes permiso para confirmar este cambio.' });
            }

            if (!pkg.is_change) {
                return res.status(400).json({ error: 'Este paquete no está marcado como cambio.' });
            }

            if (!pkg.change_received) {
                return res.status(400).json({ error: 'El producto de cambio aún no ha sido recibido físicamente por León Express.' });
            }

            if (pkg.client_change_confirmed_at) {
                return res.status(409).json({ error: 'Este cambio ya fue confirmado previamente.' });
            }

            const notes = typeof req.body.notes === 'string' ? req.body.notes.trim().slice(0, 500) : null;
            const now = new Date();
            await pkg.update({
                client_change_confirmed_at: now,
                client_change_confirmed_by: req.user.user_id,
                client_change_notes: notes,
            });

            await logAudit(req.user.user_id, 'CLIENT_CONFIRM_CHANGE_RECEIVED', {
                package_id: packageId,
                tracking_code: pkg.tracking_code,
                client_id: pkg.client_id,
                notes: notes || null,
            });

            res.json({ message: 'Cambio confirmado exitosamente.', package: pkg });
        } catch (error) {
            console.error('Error al confirmar cambio por cliente:', error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }
);

// POST /change-management/batch-confirm-client - Confirmar múltiples cambios recibidos
router.post(
    '/batch-confirm-client',
    authenticateToken,
    roleValidator(['CLIENT', 'ADMIN']),
    async (req, res) => {
        try {
            const { package_ids, notes } = req.body;
            if (!Array.isArray(package_ids) || package_ids.length === 0) {
                return res.status(400).json({ error: 'Debe proporcionar al menos un ID de paquete.' });
            }

            const whereClause = {
                package_id: { [require('sequelize').Op.in]: package_ids },
                is_change: true,
                change_received: true,
                client_change_confirmed_at: null,
            };

            if (req.user.role === 'CLIENT') {
                whereClause.client_id = req.user.client_id;
            }

            const pkgs = await Package.findAll({ where: whereClause });
            if (pkgs.length === 0) {
                return res.status(404).json({ error: 'No se encontraron cambios pendientes de confirmar.' });
            }

            const now = new Date();
            const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : null;

            await Package.update(
                {
                    client_change_confirmed_at: now,
                    client_change_confirmed_by: req.user.user_id,
                    client_change_notes: trimmedNotes,
                },
                { where: whereClause }
            );

            for (const pkg of pkgs) {
                await logAudit(req.user.user_id, 'CLIENT_CONFIRM_CHANGE_RECEIVED', {
                    package_id: pkg.package_id,
                    tracking_code: pkg.tracking_code,
                    client_id: pkg.client_id,
                    notes: trimmedNotes || null,
                });
            }

            res.json({ message: `${pkgs.length} cambio(s) confirmados exitosamente.`, confirmed_count: pkgs.length });
        } catch (error) {
            console.error('Error al confirmar cambios en lote:', error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }
);

module.exports = router;
