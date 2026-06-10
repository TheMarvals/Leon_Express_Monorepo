'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { DriverPayout, DriverPayment, PayoutItem, User, Package, Pickup, sequelize } = require('../models');
const { v4: uuidv4 } = require('uuid');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const { Op } = require('sequelize');

const { queueNotification } = require('../utils/notificationService');
const router = express.Router();

// Validador para actualizar el estado
const validateStatusUpdate = [
    body('status').isIn(['PAGADO', 'CANCELADO']).withMessage("El estado solo puede ser 'PAGADO' o 'CANCELADO'.")
];

// Validador para registrar pago
const validatePayment = [
    body('amount').isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a 0.'),
    body('payment_date').isISO8601().toDate().withMessage('Fecha de pago inválida.'),
    body('payment_method').isIn(['TRANSFERENCIA', 'EFECTIVO', 'TARJETA']).withMessage('Método de pago inválido.')
];

// GET / - Listar todos los pagos a conductores
router.get('/', authenticateToken, roleValidator(['ADMIN', 'DRIVER']), async (req, res) => {
    try {
        const { page = 1, pageSize = 10, status, userId } = req.query;
        const whereClause = {};

        // Si el usuario es un DRIVER, forzar el filtro por su propio ID
        if (req.user.role === 'DRIVER') {
            whereClause.user_id = req.user.user_id;
        } else if (userId) { // Si es ADMIN, puede filtrar por cualquier userId
            whereClause.user_id = userId;
        }
        if (status) whereClause.status = status;

        const { count, rows } = await DriverPayout.findAndCountAll({
            where: whereClause,
            include: [{ model: User, as: 'user', attributes: ['user_id', 'full_name'] }],
            limit: parseInt(pageSize),
            offset: (parseInt(page) - 1) * parseInt(pageSize),
            order: [['payout_date', 'DESC']]
        });

        res.json({ total: count, payouts: rows });
    } catch (error) {
        console.error("Error al obtener pagos:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /:id - Obtener el detalle de un pago
router.get('/:id', authenticateToken, roleValidator(['ADMIN', 'DRIVER']), async (req, res) => {
    try {
        const payout = await DriverPayout.findByPk(req.params.id, {
            include: [
                { model: User, as: 'user' },
                {
                    model: PayoutItem,
                    as: 'payoutItems',
                    order: [['created_at', 'ASC']],
                    include: [
                        {
                            model: Package,
                            as: 'package',
                            required: false,
                            include: [{
                                model: require('../models').RoutePackage,
                                as: 'routePackages',
                                include: [{
                                    model: require('../models').Route,
                                    as: 'route',
                                    attributes: ['route_id', 'route_name', 'start_date']
                                }]
                            }]
                        },
                        { model: Pickup, as: 'pickup', required: false }
                    ]
                },
                {
                    model: DriverPayment,
                    as: 'payments'
                }
            ]
        });

        if (!payout) return res.status(404).json({ error: 'Pago no encontrado' });

        // Un conductor solo puede ver sus propios pagos
        if (req.user.role === 'DRIVER' && payout.user_id !== req.user.user_id) {
            return res.status(403).json({ error: 'No tienes permiso para ver este pago.' });
        }

        res.json(payout);
    } catch (error) {
        console.error("Error al obtener detalle del pago:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// POST /:id/payments - Registrar un pago (abono) al conductor
router.post('/:id/payments', authenticateToken, roleValidator(['ADMIN']), validatePayment, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const t = await sequelize.transaction();
    try {
        const payoutId = req.params.id;
        const { amount, payment_date, payment_method, transaction_reference, notes } = req.body;

        const payout = await DriverPayout.findByPk(payoutId, {
            transaction: t,
            include: [{ model: DriverPayment, as: 'payments' }]
        });

        if (!payout) {
            await t.rollback();
            return res.status(404).json({ error: 'Liquidación no encontrada' });
        }
        if (payout.status === 'CANCELADO') {
            await t.rollback();
            return res.status(409).json({ error: 'No se pueden registrar pagos en una liquidación cancelada.' });
        }

        // Crear registro de pago
        const newPayment = await DriverPayment.create({
            payment_id: uuidv4(),
            payout_id: payoutId,
            payment_date,
            amount,
            payment_method,
            transaction_reference,
            notes
        }, { transaction: t });

        // Calcular nuevo total pagado
        const previousPaid = payout.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const totalPaid = previousPaid + Number(amount);

        // Actualizar estado
        let newStatus = payout.status;
        if (totalPaid >= Number(payout.total_amount)) {
            newStatus = 'PAGADO';
        } else if (totalPaid > 0) {
            newStatus = 'PARCIALMENTE_PAGADO';
        }

        const updateData = { status: newStatus };
        if (newStatus === 'PAGADO' && payout.status !== 'PAGADO') {
            updateData.paid_at = new Date();
        }

        await payout.update(updateData, { transaction: t });

        await require('../utils/audit').logAudit(req.user.user_id, 'REGISTER_DRIVER_PAYMENT', {
            payout_id: payoutId,
            payment_id: newPayment.payment_id,
            amount
        });

        // Notificar al conductor
        const payoutDate = new Date(payout.payout_date).toLocaleDateString('es-CL');
        queueNotification({
            userId: payout.user_id,
            title: 'Pago Recibido',
            message: `Has recibido un pago de $${amount} correspondiente a la liquidación del ${payoutDate}.`,
            link: `/payouts/${payout.payout_id}`
        }, { transaction: t });

        await t.commit();
        res.status(201).json(newPayment);

    } catch (error) {
        await t.rollback();
        console.error("Error al registrar pago conductor:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// PUT /:id/status - Marcar un pago como PAGADO o CANCELADO (Legacy endpoint, still useful for quick status toggle)
router.put('/:id/status', authenticateToken, roleValidator(['ADMIN']), validateStatusUpdate, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const t = await sequelize.transaction();
    try {
        const { status } = req.body;
        const payout = await DriverPayout.findByPk(req.params.id, { transaction: t });

        if (!payout) {
            await t.rollback();
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        // Si se marca como PAGADO manualmente y no tiene pagos completos, podríamos generar un "pago automático" por el total restante?
        // Por simplicidad, este endpoint mantiene el comportamiento original de cambiar estado y paid_at.

        if (payout.status !== 'PENDIENTE' && payout.status !== 'PARCIALMENTE_PAGADO') {
            // Permitir cambio si es parcial, para cerrar
            if (status === 'PAGADO' && payout.status === 'PARCIALMENTE_PAGADO') {
                // Ok proceed
            } else {
                await t.rollback();
                return res.status(409).json({ error: `El pago ya está en estado '${payout.status}'.` });
            }
        }

        payout.status = status;
        payout.paid_at = status === 'PAGADO' ? new Date() : null;
        await payout.save({ transaction: t });
        await require('../utils/audit').logAudit(req.user.user_id, 'UPDATE_PAYOUT_STATUS', { payout_id: payout.payout_id, status });

        const payoutDate = payout.payout_date ? new Date(payout.payout_date).toLocaleDateString('es-CL') : '';
        queueNotification({
            userId: payout.user_id,
            title: status === 'PAGADO' ? 'Pago liquidado' : 'Pago cancelado',
            message: status === 'PAGADO'
                ? `Tu liquidación${payoutDate ? ` correspondiente a ${payoutDate}` : ''} fue pagada.`
                : `La liquidación${payoutDate ? ` correspondiente a ${payoutDate}` : ''} fue cancelada.`,
            link: `/payouts/${payout.payout_id}`
        }, { transaction: t });

        await t.commit();
        res.json({ message: `Estado del pago actualizado a ${status}`, payout });

    } catch (error) {
        await t.rollback();
        console.error("Error al actualizar estado del pago:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;