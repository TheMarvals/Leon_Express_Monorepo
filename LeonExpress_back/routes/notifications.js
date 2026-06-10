'use strict';

const express = require('express');
const { Notification } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');

const router = express.Router();

/**
 * @openapi
 * tags:
 *   name: Notificaciones
 *   description: Gestión de notificaciones para usuarios
 */

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags:
 *       - Notificaciones
 *     summary: Obtener notificaciones del usuario
 *     description: Devuelve las notificaciones para el usuario autenticado, con opción de filtrar por leídas/no leídas.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Número de notificaciones a devolver.
 *       - in: query
 *         name: unread
 *         schema:
 *           type: boolean
 *         description: Si es true, devuelve solo las no leídas.
 *     responses:
 *       '200':
 *         description: Lista de notificaciones y contador de no leídas.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notification'
 *                 unreadCount:
 *                   type: integer
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error del servidor.
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { user_id } = req.user;
        const { limit = 10, unread } = req.query;

        const whereClause = { user_id };
        if (unread === 'true') {
            whereClause.is_read = false;
        }

        const notifications = await Notification.findAll({
            where: whereClause,
            limit: parseInt(limit, 10),
            order: [['created_at', 'DESC']],
        });

        const unreadCount = await Notification.count({
            where: { user_id, is_read: false },
        });

        res.json({ notifications, unreadCount });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

/**
 * @openapi
 * /notifications/mark-all-as-read:
 *   post:
 *     tags:
 *       - Notificaciones
 *     summary: Marcar todas las notificaciones como leídas
 *     description: Marca todas las notificaciones del usuario autenticado como leídas.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Notificaciones marcadas como leídas.
 *       '401':
 *         description: No autorizado.
 *       '500':
 *         description: Error del servidor.
 */
router.post('/mark-all-as-read', authenticateToken, async (req, res) => {
    try {
        const { user_id } = req.user;
        await Notification.update({ is_read: true }, {
            where: { user_id, is_read: false },
        });
        res.status(200).json({ message: 'Todas las notificaciones han sido marcadas como leídas.' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

/**
 * @openapi
 * /notifications/{id}/mark-as-read:
 *   post:
 *     tags:
 *       - Notificaciones
 *     summary: Marcar una notificación específica como leída
 *     description: Marca una notificación específica como leída para el usuario autenticado.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la notificación a marcar como leída.
 *     responses:
 *       '200':
 *         description: Notificación marcada como leída exitosamente.
 *       '404':
 *         description: Notificación no encontrada.
 *       '500':
 *         description: Error del servidor.
 */
router.post('/:id/mark-as-read', authenticateToken, async (req, res) => {
    try {
        const { user_id } = req.user;
        const { id: notification_id } = req.params;
        
        const notification = await Notification.findOne({
            where: { notification_id, user_id }
        });
        
        if (!notification) {
            return res.status(404).json({ error: 'Notificación no encontrada.' });
        }
        
        await notification.update({ is_read: true });
        
        res.status(200).json({ message: 'Notificación marcada como leída.' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

module.exports = router;

/**
 * @openapi
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         notification_id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         link:
 *           type: string
 *           nullable: true
 *         is_read:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 */