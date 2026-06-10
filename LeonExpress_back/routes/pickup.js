'use strict';

const express = require("express");
const { body, validationResult } = require("express-validator");
const { v4: uuidv4 } = require("uuid");
const { Pickup, User, Client, Package, Vehicle, VehicleType, OcrProcessingQueue, sequelize } = require("../models");
const authenticateToken = require("../middlewares/authenticateToken");
const roleValidator = require('../middlewares/roleValidator');
const { Op } = require("sequelize");
const { queueNotification, queueNotificationForRole } = require('../utils/notificationService');
const { logAudit } = require('../utils/audit');
const ocrQueue = require('../utils/ocrProcessingQueue');

const router = express.Router();

// --- Validadores ---
const validatePickupCreation = [
    body('user_id').isUUID(4).withMessage('ID del driver inválido (debe ser UUIDv4)'),
    body('client_id').isUUID(4).withMessage('ID del cliente inválido (debe ser UUIDv4)'),
    body('pickup_scheduled_date').isISO8601().toDate().withMessage('Fecha de recolección programada inválida'),
];

// Se incluyen todos los estados que un usuario puede establecer manualmente
const validateStatusUpdate = [
    body('status').isIn([
        'EN_PROCESO_RECOLECCION',
        'RECOLECCION_FINALIZADA_DRIVER',
        'ENTREGADO_EN_ALMACEN',
        'VERIFICADO_EN_ALMACEN',
        'CANCELADO'
    ]).withMessage('El estado proporcionado no es válido para una actualización.')
];


// --- Rutas ---

// GET /pickups 
router.get('/', authenticateToken, async (req, res) => {
    // ... tu código de GET /pickups se mantiene igual ...
    try {
        const { page = 1, pageSize = 10, status, search } = req.query;
        const userRole = req.user.role;
        const userId = req.user.user_id;

        const whereClause = {};
        if (status) {
            const statusList = status.split(',').map(s => s.trim());
            whereClause.status = statusList.length > 1 ? { [Op.in]: statusList } : statusList[0];
        }
        if (search) {
            const cleanSearch = search.replace(/^#/, '').trim();
            whereClause[Op.or] = [
                { pickup_id: { [Op.like]: `%${cleanSearch}%` } },
                { '$client.client_name$': { [Op.like]: `%${search}%` } },
                { '$user.full_name$': { [Op.like]: `%${search}%` } }
            ];
        }

        if (userRole === 'DRIVER') {
            whereClause.user_id = userId;
        }

        const { count, rows } = await Pickup.findAndCountAll({
            where: whereClause,
            include: [
                { model: User, as: 'user', attributes: ['user_id', 'full_name'] },
                { model: Client, as: 'client', attributes: ['client_id', 'client_name'] }
            ],
            limit: parseInt(pageSize),
            offset: (parseInt(page) - 1) * parseInt(pageSize),
            order: [['pickup_scheduled_date', 'DESC']]
        });
        res.json({ total: count, pickups: rows });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// GET /pickups/:id 
// En tu archivo routes/pickup.js

router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const pickup = await Pickup.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['user_id', 'full_name'],
                    // --- INICIO DE LA CORRECCIÓN ---
                    // Se anidan los 'includes' de forma explícita
                    include: {
                        model: Vehicle,
                        as: 'vehicles',
                        include: {
                            model: VehicleType,
                            as: 'vehicleType',
                        }
                    }
                    // --- FIN DE LA CORRECCIÓN ---
                },
                { model: Client, as: 'client', attributes: ['client_id', 'client_name'] },
                {
                    model: Package, as: 'packages', attributes: [
                        'package_id',
                        'tracking_code',
                        'external_tracking_code',
                        'client_id',
                        'pickup_id',
                        'status',
                        'is_cod',
                        'cod_amount',
                        'client_price',
                        'delivery_cost',
                        'destination_address',
                        'recipient_name',
                        'recipient_phone',
                        'scanned_at_origin_datetime',
                        'received_at_warehouse_datetime',
                        'assigned_to_route_datetime',
                        'delivered_datetime',
                        'returned_datetime',
                        'has_multiple_labels',
                        'sales_codes'
                    ]
                },
                {
                    model: OcrProcessingQueue,
                    as: 'ocrQueue',
                    required: false,
                    // Solo incluir items activos: en cola, procesando, o pendientes de revisión
                    // Excluir 'error' con reviewed_by (ya fueron descartados/revisados)
                    where: {
                        [Op.or]: [
                            { status: ['queued', 'processing', 'needs_review'] },
                            { status: 'error', reviewed_by: { [Op.is]: null } }
                        ]
                    },
                    attributes: ['id', 'filename', 'status', 'created_at', 'ocr_raw_text']
                }
            ]
        });

        if (!pickup) return res.status(404).json({ error: 'Pickup no encontrado' });

        // Leer estado de la cola OCR desde la DB (robusto frente a reinicios del contenedor)
        const allOcrForPickup = await OcrProcessingQueue.findAll({
            where: { pickup_id: pickup.pickup_id },
            attributes: ['status']
        });
        const ocrCounts = {
            total: allOcrForPickup.length,
            queued: allOcrForPickup.filter(r => r.status === 'queued').length,
            processing: allOcrForPickup.filter(r => r.status === 'processing').length,
            completed: allOcrForPickup.filter(r => ['completed', 'auto_approved'].includes(r.status)).length,
            needs_review: allOcrForPickup.filter(r => r.status === 'needs_review').length,
            error: allOcrForPickup.filter(r => r.status === 'error').length,
        };

        const pickupJson = pickup.toJSON();

        // activeBatch: sintetizado desde la DB (funciona aunque el contenedor se reinicie)
        const activeInMemory = ocrQueue.getActiveBatchForPickup(pickup.pickup_id);
        if (activeInMemory) {
            pickupJson.activeBatch = {
                batch_id: activeInMemory.batch_id,
                total: activeInMemory.total_images,
                processed: activeInMemory.processed,
                status: activeInMemory.status
            };
        } else if (ocrCounts.queued > 0 || ocrCounts.processing > 0) {
            // Fallback: reconstruir desde DB si no hay info en memoria
            pickupJson.activeBatch = {
                batch_id: 'db_fallback',
                total: ocrCounts.total,
                processed: ocrCounts.completed,
                status: 'processing'
            };
        }

        // Enviar counters al frontend para el panel de progreso
        pickupJson.ocrStats = ocrCounts;

        // Seguridad: Un conductor solo puede ver sus propios detalles
        if (req.user.role === 'DRIVER' && pickup.user_id !== req.user.user_id) {
            return res.status(403).json({ error: 'No tienes permiso para ver esta recolección.' });
        }

        res.json(pickupJson);
    } catch (error) {
        console.error('Error al obtener pickup:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


// POST /pickups
router.post('/', authenticateToken, roleValidator(['ADMIN', 'WAREHOUSE_STAFF']), validatePickupCreation, async (req, res) => {
    // ... tu código de POST /pickups se mantiene igual ...
    const t = await sequelize.transaction();
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            await t.rollback();
            return res.status(400).json({ errors: errors.array() });
        }
        const { user_id, client_id, pickup_scheduled_date, notes } = req.body;
        const user = await User.findByPk(user_id, { transaction: t });
        if (!user) {
            await t.rollback();
            return res.status(404).json({ error: 'Driver no encontrado' });
        }
        const client = await Client.findByPk(client_id, { transaction: t });
        if (!client) {
            await t.rollback();
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // --- VALIDACIÓN DE VEHÍCULO ---
        const vehicle = await Vehicle.findOne({ where: { user_id: user_id }, transaction: t });
        if (!vehicle) {
            await t.rollback();
            return res.status(409).json({
                error: 'Conductor sin vehículo',
                message: `El conductor ${user.full_name} no tiene un vehículo asignado. Por favor, asigne un vehículo a este conductor antes de crear la recolección.`
            });
        }
        // -----------------------------
        const newPickup = await Pickup.create({
            pickup_id: uuidv4(),
            user_id,
            client_id,
            pickup_scheduled_date,
            notes,
            status: 'ASIGNADO_A_RECOLECTOR'
        }, { transaction: t });

        const scheduledAt = pickup_scheduled_date ? new Date(pickup_scheduled_date).toLocaleString('es-CL') : '';

        console.log(`🎯 DEBUG PICKUP: Enviando notificación a driver ${user_id} para cliente ${client.client_name}`);
        console.log(`🎯 DEBUG PICKUP: Transaction ID: ${t ? 'SÍ' : 'NO'}`);

        queueNotification({
            userId: user_id,
            title: 'Nueva recolección asignada',
            message: `Tienes una nueva recolección para ${client.client_name}${scheduledAt ? ` programada para ${scheduledAt}` : ''}.`,
            link: `/pickups/${newPickup.pickup_id}`
        }, { transaction: t });

        console.log(`🎯 DEBUG PICKUP: queueNotification llamado correctamente`);

        // Log de auditoría
        await logAudit(req.user.user_id, 'CREATE_PICKUP', {
            pickup_id: newPickup.pickup_id,
            client_name: client.client_name,
            driver_id: user_id,
            scheduled_date: pickup_scheduled_date
        });

        await t.commit();
        res.status(201).json({ message: 'Tarea de pickup creada exitosamente', pickup: newPickup });
    } catch (error) {
        await t.rollback();
        res.status(500).json({ error: 'Error del servidor' });
    }
});


// PUT /pickups/:id - Actualizar datos generales de la recolección
router.put('/:id', authenticateToken, roleValidator(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res) => {
    try {
        const { user_id, client_id, pickup_scheduled_date, notes } = req.body;
        const pickup = await Pickup.findByPk(req.params.id);
        if (!pickup) return res.status(404).json({ error: 'Recolección no encontrada' });

        await pickup.update({
            user_id: user_id || pickup.user_id,
            client_id: client_id || pickup.client_id,
            pickup_scheduled_date: pickup_scheduled_date || pickup.pickup_scheduled_date,
            notes: notes !== undefined ? notes : pickup.notes
        });

        res.json(pickup);
    } catch (error) {
        console.error('Error al actualizar recolección:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// --- RUTA PATCH /pickups/:id/status (CORREGIDA Y COMPLETADA) ---
router.patch('/:id/status', authenticateToken, async (req, res) => {
    const pickupId = req.params.id;
    const { status: newStatus } = req.body;
    const userRole = req.user.role;
    const t = await sequelize.transaction(); // Inicia la transacción

    try {
        const pickup = await Pickup.findByPk(pickupId, { transaction: t });
        if (!pickup) {
            await t.rollback();
            return res.status(404).json({ error: 'Recolección no encontrada' });
        }

        // --- VALIDACIÓN DE TRANSICIÓN DE ESTADO ---
        // Evitar saltarse el paso 'ENTREGADO_EN_ALMACEN' (Excepto para Admins/Staff)
        if (newStatus === 'VERIFICADO_EN_ALMACEN' && pickup.status !== 'ENTREGADO_EN_ALMACEN') {
            const isPrivileged = ['ADMIN', 'WAREHOUSE_STAFF'].includes(userRole);
            if (!isPrivileged) {
                await t.rollback();
                return res.status(409).json({
                    error: 'Acción no permitida',
                    message: `La recolección debe ser marcada como 'ENTREGADO EN ALMACÉN' (por el conductor) antes de poder ser Verificada. Estado actual: ${pickup.status}`
                });
            }
            // Si es admin, permitimos el salto pero logueamos
            console.log(`⚠️ Usuario ${userRole} forzando verificación desde estado ${pickup.status}`);
        }
        // Evitar que el conductor cancele recolecciones
        if (newStatus === 'CANCELADO' && userRole === 'DRIVER') {
            await t.rollback();
            return res.status(403).json({
                error: 'Acción no permitida',
                message: 'Los conductores no tienen permiso para cancelar recolecciones. Por favor, contacte a un administrador.'
            });
        }
        // -----------------------------------------

        // Validaciones de lógica de negocio (REQUIREMENTS)
        const statusesRequiringPackages = [
            'RECOLECCION_FINALIZADA_DRIVER',
            'ENTREGADO_EN_ALMACEN',
            'VERIFICADO_EN_ALMACEN'
        ];

        if (statusesRequiringPackages.includes(newStatus)) {
            const packageCount = await Package.count({
                where: { pickup_id: pickupId },
                transaction: t
            });

            if (packageCount === 0) {
                await t.rollback();
                return res.status(400).json({ error: 'No se puede cambiar a este estado porque la recolección no tiene paquetes asociados.' });
            }
        }

        // --- VALIDACIÓN DE INTEGRIDAD DE PAQUETES (CANDADO) ---
        // Si hay paquetes que ya avanzaron en el flujo (asignados, en ruta, entregados...), 
        // BLOQUEAMOS retroceder el estado de la recolección.
        const advancedPackagesCount = await Package.count({
            where: {
                pickup_id: pickupId,
                status: {
                    [Op.in]: [
                        'ASIGNADO_A_RUTA',
                        'EN_TRANSITO',
                        'EN_RUTA',
                        'ENTREGADO',
                        'REPROGRAMADO',
                        'INCIDENCIA_ENTREGA',
                        'DEVUELTO_ALMACEN'
                    ]
                }
            },
            transaction: t
        });

        if (advancedPackagesCount > 0) {
            // Solo permitimos cambiar a VERIFICADO_EN_ALMACEN (por si se necesita corregir inconsistencia actual)
            // Pero prohibimos volver a estados anteriores como RECOLECCION_FINALIZADA.
            if (newStatus !== 'VERIFICADO_EN_ALMACEN') {
                await t.rollback();
                return res.status(409).json({
                    error: 'Bloqueo por integridad',
                    message: `No se puede cambiar el estado a '${newStatus}' porque existen ${advancedPackagesCount} paquetes que ya han sido procesados o están en ruta. La recolección debe permanecer como VERIFICADO_EN_ALMACEN.`
                });
            }
        }
        // -----------------------------------------------------

        // 1. Actualiza el estado de la recolección
        const oldStatus = pickup.status;
        pickup.status = newStatus;
        // Si la recolección se completa, registra la fecha
        if (newStatus === 'RECOLECCION_FINALIZADA_DRIVER') {
            pickup.pickup_completed_by_driver_at = new Date();
        }
        // Si se verifica en almacén, registra la fecha
        if (newStatus === 'VERIFICADO_EN_ALMACEN') {
            pickup.verified_at_warehouse_at = new Date();
        }
        await pickup.save({ transaction: t });

        // Log de auditoría
        await logAudit(req.user.user_id, 'UPDATE_PICKUP', {
            pickup_id: pickup.pickup_id,
            old_status: oldStatus,
            new_status: newStatus,
            action_type: 'status_change'
        });

        // 2. LÓGICA ADICIONAL: Si se verifica en almacén...
        if (newStatus === 'VERIFICADO_EN_ALMACEN') {
            // ...actualiza todos los paquetes de esa recolección.
            const [updatedCount] = await Package.update(
                { status: 'RECIBIDO_EN_ALMACEN' }, // Nuevo estado para los paquetes
                { where: { pickup_id: pickupId }, transaction: t }
            );
            console.log(`Actualizados ${updatedCount} paquetes a RECIBIDO_EN_ALMACEN.`);
        }

        const client = await Client.findByPk(pickup.client_id, { transaction: t });
        const driver = await User.findByPk(pickup.user_id, { transaction: t });
        const baseLink = `/pickups/details/${pickup.pickup_id}`;

        if (newStatus === 'EN_PROCESO_RECOLECCION') {
            queueNotificationForRole('ADMIN', {
                title: 'Recolección iniciada',
                message: `El driver ${driver ? driver.full_name : 'asignado'} inició la recolección del cliente ${client ? client.client_name : ''}.`,
                link: baseLink
            }, { transaction: t });
        }

        if (newStatus === 'CANCELADO') {
            queueNotification({
                userId: pickup.user_id,
                title: 'Recolección cancelada',
                message: `La recolección del cliente ${client ? client.client_name : ''} ha sido cancelada.`,
                link: baseLink
            }, { transaction: t });
        }

        if (newStatus === 'ENTREGADO_EN_ALMACEN') {
            queueNotificationForRole('WAREHOUSE_STAFF', {
                title: 'Recolección entregada en almacén',
                message: `La recolección del cliente ${client ? client.client_name : ''} ya está en el almacén y espera verificación.`,
                link: baseLink
            }, { transaction: t });
        }

        if (newStatus === 'VERIFICADO_EN_ALMACEN') {
            queueNotification({
                userId: pickup.user_id,
                title: 'Recolección verificada en almacén',
                message: `La recolección del cliente ${client ? client.client_name : ''} fue verificada exitosamente en el almacén.`,
                link: baseLink
            }, { transaction: t });
        }

        if (newStatus === 'RECOLECCION_FINALIZADA_DRIVER') {
            queueNotificationForRole('ADMIN', {
                title: 'Recolección finalizada',
                message: `El driver ${driver ? driver.full_name : 'asignado'} completó la recolección del cliente ${client ? client.client_name : ''}.`,
                link: baseLink
            }, { transaction: t });
        }

        await t.commit(); // Confirma todos los cambios si no hubo errores
        res.status(200).json(pickup);

    } catch (error) {
        await t.rollback(); // Revierte todos los cambios en caso de error
        console.error('Error al actualizar el estado de la recolección:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// DELETE /pickups/:id - Eliminar recolección si es admin, está en EN_PROCESO_RECOLECCION y no tiene paquetes
router.delete('/:id', authenticateToken, roleValidator(['ADMIN']), async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const pickup = await Pickup.findByPk(req.params.id, { transaction: t });

        if (!pickup) {
            await t.rollback();
            return res.status(404).json({ error: 'Recolección no encontrada' });
        }

        // Se permite borrar cualquier recolección siempre que no tenga paquetes.
        // req.user.role ya es filtrado por roleValidator(['ADMIN']) oben.
        // No restringimos por status, pero validamos paquetes.

        const packagesCount = await Package.count({
            where: { pickup_id: pickup.pickup_id },
            transaction: t
        });

        if (packagesCount > 0) {
            await t.rollback();
            return res.status(400).json({ error: 'No se puede eliminar una recolección que ya tiene paquetes escaneados o validados' });
        }

        await logAudit(req.user.user_id, 'DELETE_PICKUP', { pickup_id: pickup.pickup_id }, { transaction: t });

        await pickup.destroy({ transaction: t });

        await t.commit();
        res.status(200).json({ message: 'Recolección eliminada con éxito' });
    } catch (error) {
        await t.rollback();
        console.error('Error al eliminar recolección:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;