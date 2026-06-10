'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { Invoice, InvoiceItem, Payment, Client, Package, sequelize } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const { Op } = require('sequelize');
const { queueNotificationForRole } = require('../utils/notificationService');

const router = express.Router();

// --- Validadores ---
const validatePayment = [
    body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser un número positivo'),
    body('payment_date').isISO8601().toDate().withMessage('Fecha de pago inválida'),
    body('payment_method').isIn(['TRANSFERENCIA', 'EFECTIVO', 'TARJETA']).withMessage('Método de pago inválido')
];


// PATCH /invoices/:id/status - Actualizar el estado de una factura
router.patch('/:id/status', authenticateToken, roleValidator(['ADMIN']), async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['PENDIENTE', 'PAGADA', 'VENCIDA', 'CANCELADA'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Estado de factura no válido.' });
    }
    try {
        const invoice = await Invoice.findByPk(req.params.id);
        if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
        if (invoice.status === 'PAGADA' || invoice.status === 'CANCELADA') {
            return res.status(409).json({ error: `La factura ya está en estado '${invoice.status}'.` });
        }
        invoice.status = status;
        await invoice.save();
        await require('../utils/audit').logAudit(req.user.user_id, 'UPDATE_INVOICE_STATUS', { invoice_id: invoice.invoice_id, status });

        const client = await Client.findByPk(invoice.client_id, { attributes: ['client_name'] });
        const invoiceLink = `/invoices/${invoice.invoice_id}`;
        await queueNotificationForRole('ADMIN', {
            title: `Factura ${status.toLowerCase()}`,
            message: `La factura ${invoice.invoice_id}${client ? ` del cliente ${client.client_name}` : ''} ahora está en estado ${status}.`,
            link: invoiceLink
        });
        res.json({ message: 'Estado de factura actualizado', status: invoice.status });
    } catch (error) {
        console.error('Error al actualizar estado de factura:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/**
 * @openapi
 * tags:
 *   name: Facturas
 *   description: Gestión de facturas y pagos
 */

/**
 * @openapi
 * /invoices:
 *   get:
 *     tags:
 *       - Facturas
 *     summary: Listar facturas
 *     description: Obtiene una lista paginada de facturas con filtros opcionales
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDIENTE, PAGADA, CANCELADA]
 *         description: Filtrar por estado de factura
 *       - in: query
 *         name: clientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filtrar por ID de cliente
 *     responses:
 *       '200':
 *         description: Lista de facturas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total de facturas que coinciden con los filtros
 *                 invoices:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/InvoiceWithClient'
 *       '401':
 *         description: No autorizado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /invoices/{id}:
 *   get:
 *     tags:
 *       - Facturas
 *     summary: Obtener detalle de factura
 *     description: Obtiene el detalle completo de una factura incluyendo cliente, items y pagos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la factura
 *     responses:
 *       '200':
 *         description: Detalle de factura
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InvoiceDetail'
 *       '401':
 *         description: No autorizado
 *       '404':
 *         description: Factura no encontrada
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /invoices/{id}/payments:
 *   post:
 *     tags:
 *       - Facturas
 *     summary: Registrar pago
 *     description: Registra un pago para una factura y actualiza su estado si queda pagada completamente
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID de la factura
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentRequest'
 *     responses:
 *       '201':
 *         description: Pago registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Pago registrado exitosamente
 *                 payment:
 *                   $ref: '#/components/schemas/Payment'
 *                 invoice_status:
 *                   type: string
 *                   description: Nuevo estado de la factura
 *                   example: PAGADA
 *       '400':
 *         description: Error de validación
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos (debe ser administrador)
 *       '404':
 *         description: Factura no encontrada
 *       '409':
 *         description: La factura ya está pagada o cancelada
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     InvoiceWithClient:
 *       type: object
 *       properties:
 *         invoice_id:
 *           type: string
 *           format: uuid
 *         invoice_number:
 *           type: string
 *         invoice_date:
 *           type: string
 *           format: date-time
 *         due_date:
 *           type: string
 *           format: date-time
 *         total_amount:
 *           type: number
 *           format: float
 *         status:
 *           type: string
 *           enum: [PENDIENTE, PAGADA, CANCELADA]
 *         client:
 *           $ref: '#/components/schemas/ClientBasic'
 * 
 *     InvoiceDetail:
 *       type: object
 *       properties:
 *         invoice_id:
 *           type: string
 *           format: uuid
 *         invoice_number:
 *           type: string
 *         invoice_date:
 *           type: string
 *           format: date-time
 *         due_date:
 *           type: string
 *           format: date-time
 *         total_amount:
 *           type: number
 *           format: float
 *         status:
 *           type: string
 *         client:
 *           $ref: '#/components/schemas/Client'
 *         payments:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Payment'
 *         invoiceItems:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/InvoiceItemWithPackage'
 * 
 *     ClientBasic:
 *       type: object
 *       properties:
 *         client_id:
 *           type: string
 *           format: uuid
 *         client_name:
 *           type: string
 * 
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
 * 
 *     PaymentRequest:
 *       type: object
 *       required:
 *         - amount
 *         - payment_date
 *         - payment_method
 *       properties:
 *         amount:
 *           type: number
 *           format: float
 *           minimum: 0
 *           exclusiveMinimum: true
 *           example: 1500.50
 *         payment_date:
 *           type: string
 *           format: date-time
 *           example: "2023-06-15T00:00:00Z"
 *         payment_method:
 *           type: string
 *           enum: [TRANSFERENCIA, EFECTIVO, TARJETA]
 *           example: TRANSFERENCIA
 *         transaction_reference:
 *           type: string
 *           nullable: true
 *           example: "TRX-123456"
 *         notes:
 *           type: string
 *           nullable: true
 *           example: "Pago parcial"
 * 
 *     Payment:
 *       type: object
 *       properties:
 *         payment_id:
 *           type: string
 *           format: uuid
 *         invoice_id:
 *           type: string
 *           format: uuid
 *         amount:
 *           type: number
 *           format: float
 *         payment_date:
 *           type: string
 *           format: date-time
 *         payment_method:
 *           type: string
 *         transaction_reference:
 *           type: string
 *           nullable: true
 *         notes:
 *           type: string
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 * 
 *     InvoiceItemWithPackage:
 *       type: object
 *       properties:
 *         item_id:
 *           type: string
 *           format: uuid
 *         invoice_id:
 *           type: string
 *           format: uuid
 *         description:
 *           type: string
 *         quantity:
 *           type: number
 *           format: float
 *         unit_price:
 *           type: number
 *           format: float
 *         amount:
 *           type: number
 *           format: float
 *         package:
 *           type: object
 *           properties:
 *             tracking_code:
 *               type: string
 */

// GET / - Listar todas las facturas
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, pageSize = 10, status, clientId, userId } = req.query;
        const whereClause = {};

        // LOG para depuración: ver qué llega en la query y cómo se construye el whereClause
        console.log('GET /invoices req.query:', req.query);

        if (status) whereClause.status = status.toUpperCase();
        if (clientId) whereClause.client_id = clientId;

        // Si viene userId, filtrar por facturas asociadas a paquetes entregados por ese driver
        if (userId) {
            // Buscar facturas que tengan al menos un InvoiceItem asociado a un paquete entregado por el driver
            const { Package, InvoiceItem } = require('../models');
            // Buscar los package_id entregados por el driver
            const deliveredPackages = await Package.findAll({
                where: { status: 'ENTREGADO' },
                include: [{ model: require('../models').Delivery, as: 'deliveries', where: { user_id: userId } }],
                attributes: ['package_id']
            });
            const deliveredPackageIds = deliveredPackages.map(p => p.package_id);
            if (deliveredPackageIds.length > 0) {
                // Buscar los invoice_id que tengan al menos un item con esos package_id
                const invoiceItems = await InvoiceItem.findAll({
                    where: { package_id: deliveredPackageIds },
                    attributes: ['invoice_id']
                });
                const invoiceIds = invoiceItems.map(ii => ii.invoice_id);
                if (invoiceIds.length > 0) {
                    whereClause.invoice_id = invoiceIds;
                } else {
                    // Si no hay facturas, devolver vacío
                    return res.json({ total: 0, invoices: [] });
                }
            } else {
                // Si no hay paquetes entregados, devolver vacío
                return res.json({ total: 0, invoices: [] });
            }
        }

        console.log('GET /invoices whereClause:', whereClause);

        const { count, rows } = await Invoice.findAndCountAll({
            where: whereClause,
            include: [{ model: Client, as: 'client', attributes: ['client_id', 'client_name'] }],
            limit: parseInt(pageSize),
            offset: (parseInt(page) - 1) * parseInt(pageSize),
            order: [['invoice_date', 'DESC'], ['created_at', 'DESC']]
        });

        res.json({ total: count, invoices: rows });
    } catch (error) {
        console.error("Error al obtener facturas:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /:id - Obtener el detalle de una factura
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const invoice = await Invoice.findByPk(req.params.id, {
            include: [
                { model: Client, as: 'client' },
                { model: Payment, as: 'payments' },
                {
                    model: InvoiceItem,
                    as: 'invoiceItems',
                    order: [['created_at', 'ASC']], // Ordenar items por creación para que sigan una secuencia lógica
                    include: [{
                        model: Package,
                        as: 'package',
                        attributes: ['tracking_code', 'external_tracking_code'],
                        include: [{ model: require('../models').Pickup, as: 'pickup', attributes: ['pickup_id', 'pickup_scheduled_date'] }]
                    }]
                }
            ]
        });

        if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

        // Mapear los items a la estructura esperada por el frontend
        const mappedInvoice = {
            invoice_id: invoice.invoice_id,
            invoice_number: invoice.invoice_id, // Si tienes un campo específico, cámbialo aquí
            invoice_date: invoice.invoice_date,
            due_date: invoice.due_date,
            total_amount: Number(invoice.total_amount),
            status: invoice.status,
            client: invoice.client ? {
                client_id: invoice.client.client_id,
                client_name: invoice.client.client_name,
                email: invoice.client.email,
                phone: invoice.client.phone,
                address: invoice.client.address
            } : null,
            payments: invoice.payments ? invoice.payments.map(p => ({
                payment_id: p.payment_id,
                payment_date: p.payment_date,
                amount: Number(p.amount),
                payment_method: p.payment_method,
                transaction_reference: p.transaction_reference,
                notes: p.notes
            })) : [],
            invoiceItems: invoice.invoiceItems ? invoice.invoiceItems.map(item => ({
                item_id: item.invoice_item_id,
                description: item.item_description,
                quantity: (item.package_id && !item.item_description.includes('Envío')) ? 0 : 1, // Si es un ítem extra de un paquete (COD, cargo) es 0, de lo contrario 1
                unit_price: Number(item.amount), // No hay campo en BD, igual a amount
                amount: Number(item.amount),
                package: item.package ? {
                    tracking_code: item.package.tracking_code,
                    external_tracking_code: item.package.external_tracking_code,
                    pickup: item.package.pickup ? {
                        pickup_id: item.package.pickup.pickup_id,
                        pickup_scheduled_date: item.package.pickup.pickup_scheduled_date
                    } : null
                } : null
            })) : []
        };

        res.json(mappedInvoice);
    } catch (error) {
        console.error("Error al obtener factura:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// POST /:id/payments - Registrar un pago a una factura
router.post('/:id/payments', authenticateToken, roleValidator(['ADMIN']), validatePayment, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const t = await sequelize.transaction();
    try {
        const invoiceId = req.params.id;
        const { amount, payment_date, payment_method, transaction_reference, notes } = req.body;

        const invoice = await Invoice.findByPk(invoiceId, {
            include: [{ model: Payment, as: 'payments' }],
            transaction: t
        });

        if (!invoice) {
            await t.rollback();
            return res.status(404).json({ error: 'Factura no encontrada' });
        }
        if (invoice.status === 'PAGADA' || invoice.status === 'CANCELADA') {
            await t.rollback();
            return res.status(409).json({ error: `La factura ya está en estado '${invoice.status}'.` });
        }

        const newPayment = await Payment.create({
            payment_id: uuidv4(),
            invoice_id: invoiceId,
            amount,
            payment_date,
            payment_method,
            transaction_reference,
            notes
        }, { transaction: t });

        await require('../utils/audit').logAudit(req.user.user_id, 'CREATE_PAYMENT', { invoice_id: invoiceId, payment_id: newPayment.payment_id, amount });

        // Verificar si la factura está completamente pagada
        const totalPaid = invoice.payments.reduce((sum, p) => sum + parseFloat(p.amount), 0) + parseFloat(amount);

        if (totalPaid >= parseFloat(invoice.total_amount)) {
            invoice.status = 'PAGADA';
            invoice.paid_at = new Date();
            await invoice.save({ transaction: t });
        }

        const client = await Client.findByPk(invoice.client_id, { transaction: t, attributes: ['client_name'] });
        const invoiceLink = `/invoices/${invoice.invoice_id}`;

        const formattedAmount = Number.parseFloat(amount).toFixed(2);
        if (invoice.status === 'PAGADA') {
            queueNotificationForRole('ADMIN', {
                title: 'Factura pagada',
                message: `La factura ${invoice.invoice_id}${client ? ` del cliente ${client.client_name}` : ''} fue pagada en su totalidad.`,
                link: invoiceLink
            }, { transaction: t });
        } else {
            queueNotificationForRole('ADMIN', {
                title: 'Pago registrado en factura',
                message: `Se registró un pago de $${formattedAmount} en la factura ${invoice.invoice_id}${client ? ` del cliente ${client.client_name}` : ''}.`,
                link: invoiceLink
            }, { transaction: t });
        }

        await t.commit();
        res.status(201).json({ message: 'Pago registrado exitosamente', payment: newPayment, invoice_status: invoice.status });

    } catch (error) {
        await t.rollback();
        console.error("Error al registrar el pago:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


module.exports = router;