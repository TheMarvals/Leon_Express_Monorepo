'use strict';

const express = require('express');
const { DriverPayout, PayoutItem, User, BillingPeriod, Package, Pickup } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const { Op } = require('sequelize');

const router = express.Router();

/**
 * @openapi
 * tags:
 *   name: Pagos a Conductores
 *   description: Gestión de los pagos (payouts) a los conductores.
 */

/**
 * @openapi
 * /driver-payouts:
 *   get:
 *     tags: [Pagos a Conductores]
 *     summary: Obtener lista de pagos a conductores.
 *     description: Los administradores obtienen todos los pagos. Los conductores obtienen solo sus propios pagos.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: userId
 *         schema: { type: string, format: uuid }
 *         description: (Admin only) Filtrar pagos por un conductor específico.
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: ['PENDIENTE', 'PAGADO', 'CANCELADO'] }
 *         description: Filtrar pagos por estado.
 *     responses:
 *       '200':
 *         description: Lista de pagos.
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { user_id, role } = req.user;
        const { page = 1, pageSize = 10, userId: queryUserId, status, startDate, endDate } = req.query;

        const whereClause = {};

        if (role === 'DRIVER') {
            whereClause.user_id = user_id;
        } else if (role === 'ADMIN' && queryUserId) {
            whereClause.user_id = queryUserId;
        }

        const normalizedStatus = typeof status === 'string' && status.trim()
            ? status.trim().toUpperCase()
            : undefined;

        if (normalizedStatus) {
            const allowedStatuses = DriverPayout.rawAttributes?.status?.values || [];
            if (allowedStatuses.includes(normalizedStatus)) {
                whereClause.status = normalizedStatus;
            }
        }

        // Filtro por fecha (startDate y endDate)
        if (startDate && endDate) {
            whereClause.payout_date = {
                [Op.between]: [startDate, endDate]
            };
        } else if (startDate) {
            whereClause.payout_date = {
                [Op.gte]: startDate
            };
        } else if (endDate) {
            whereClause.payout_date = {
                [Op.lte]: endDate
            };
        }

        const { count, rows } = await DriverPayout.findAndCountAll({
            where: whereClause,
            include: [
                { model: User, as: 'user', attributes: ['user_id', 'full_name'] },
                { model: BillingPeriod, as: 'billingPeriod' }
            ],
            limit: parseInt(pageSize),
            offset: (parseInt(page) - 1) * parseInt(pageSize),
            order: [['payout_date', 'DESC'], ['created_at', 'DESC']], // Ordenar por fecha de pago y luego creación
        });

        res.json({ total: count, payouts: rows });
    } catch (error) {
        console.error('Error fetching driver payouts:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

/**
 * @openapi
 * /driver-payouts/{id}:
 *   get:
 *     tags: [Pagos a Conductores]
 *     summary: Obtener el detalle de un pago a conductor.
 *     description: Obtiene un pago específico con todos sus ítems. Los conductores solo pueden ver sus propios pagos.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       '200':
 *         description: Detalle del pago.
 *       '403':
 *         description: Acceso denegado.
 *       '404':
 *         description: Pago no encontrado.
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, role } = req.user;

        const payout = await DriverPayout.findByPk(id, {
            include: [
                { model: User, as: 'user', attributes: ['user_id', 'full_name'] },
                { model: BillingPeriod, as: 'billingPeriod' },
                {
                    model: PayoutItem,
                    as: 'payoutItems',
                    order: [['created_at', 'ASC']],
                    include: [
                        { model: Package, as: 'package', attributes: ['tracking_code'] },
                        { model: Pickup, as: 'pickup', include: [{ model: User, as: 'client', attributes: ['client_name'] }] }
                    ]
                }
            ]
        });

        if (!payout) {
            return res.status(404).json({ error: 'Pago no encontrado.' });
        }

        if (role === 'DRIVER' && payout.user_id !== user_id) {
            return res.status(403).json({ error: 'Acceso denegado.' });
        }

        // Ordenar los ítems cronológicamente por la fecha real del evento (Entrega o Recolección)
        // PayoutItem created_at es cuando se generó el pago, no cuando ocurrió el servicio.
        const sortedItems = payout.payoutItems.sort((a, b) => {
            // Obtener fecha A
            let dateA = a.created_at; // Fallback
            if (a.package && a.package.deliveries && a.package.deliveries.length > 0) {
                // Buscar la entrega exitosa o la última
                const delivery = a.package.deliveries.find(d => d.status_at_delivery === 'ENTREGADO') || a.package.deliveries[0];
                if (delivery && delivery.attempted_at) dateA = new Date(delivery.attempted_at);
            } else if (a.pickup && a.pickup.verified_at_warehouse_at) {
                dateA = new Date(a.pickup.verified_at_warehouse_at);
            }

            // Obtener fecha B
            let dateB = b.created_at; // Fallback
            if (b.package && b.package.deliveries && b.package.deliveries.length > 0) {
                const delivery = b.package.deliveries.find(d => d.status_at_delivery === 'ENTREGADO') || b.package.deliveries[0];
                if (delivery && delivery.attempted_at) dateB = new Date(delivery.attempted_at);
            } else if (b.pickup && b.pickup.verified_at_warehouse_at) {
                dateB = new Date(b.pickup.verified_at_warehouse_at);
            }

            return dateB - dateA; // Descendente (más reciente primero) -> O tal vez usuario quiere Ascendente?
            // "La secuencia de fechas se siguen viendo desordenadas". Generalmente en estados de cuenta es Descendente.
            // Pero si es una nómina semanal, tal vez prefiera Ascendente (Lunes a Viernes).
            // Voy a dejarlo Descendente por consistencia con el listado general, o Ascendente si es detalle.
            // Mejor Ascendente (De Lunes a Domingo) para que sea un relato de la semana.
            return dateA - dateB;
        });

        // Reasignar items ordenados (aunque es un objeto Sequelize, toJSON() lo arreglará al responder)
        payout.dataValues.payoutItems = sortedItems;

        res.json(payout);
    } catch (error) {
        console.error('Error fetching payout details:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

module.exports = router;