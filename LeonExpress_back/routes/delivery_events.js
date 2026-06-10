'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { Package, Delivery, DeliveryPhoto, Cancellation, Return, User, Route, RoutePackage, sequelize } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const multer = require('multer');
const path = require('path');
const { Op } = require('sequelize');
const { queueNotificationForRole } = require('../utils/notificationService');
const { logAudit } = require('../utils/audit');

const router = express.Router();

// --- Configuración de Multer para la subida de fotos ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/delivery-photos/'); // Asegúrate de que esta carpeta exista
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 200 * 1024 * 1024 } // 200MB - Coincide con Express y nginx para imágenes de alta calidad
});

// --- Validadores ---
const validateDeliveryAttempt = [
    body('status_at_delivery').isIn(['ENTREGADO', 'NO_HAY_NADIE', 'DIRECCION_INCORRECTA', 'RECHAZADO_POR_CLIENTE', 'REPROGRAMADO_POR_CLIENTE', 'OTRA_INCIDENCIA']).withMessage('Estado de entrega inválido'),
    body('observation').optional().isString().trim(),
    body('receiver_name').optional({ nullable: true }).isString().trim(),
    body('collected_amount').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Monto cobrado debe ser un número positivo')
];

const validateCancellation = [
    body('reason').isIn(['SOLICITUD_CLIENTE', 'FALTA_STOCK', 'ERROR_SISTEMA', 'OTRO']).withMessage('Razón de cancelación inválida'),
    body('notes').optional().isString().trim()
];

const validateReturn = [
    body('reason').isIn(['RECHAZADO_DESTINATARIO', 'DIRECCION_INCORRECTA', 'NO_RECLAMADO', 'OTRO']).withMessage('Razón de devolución inválida'),
    body('notes').optional().isString().trim()
];

/**
 * @openapi
 * tags:
 *   name: Eventos de Entrega
 *   description: Gestión de eventos relacionados con entregas de paquetes (intentos de entrega, fotos, cancelaciones y devoluciones)
 */

/**
 * @openapi
 * /packages/{id}/deliveries:
 *   post:
 *     tags:
 *       - Eventos de Entrega
 *     summary: Registrar un intento de entrega
 *     description: Permite a un repartidor registrar un intento de entrega para un paquete
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeliveryAttempt'
 *     responses:
 *       '201':
 *         description: Intento de entrega registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Intento de entrega registrado exitosamente
 *                 delivery:
 *                   $ref: '#/components/schemas/Delivery'
 *       '400':
 *         description: Error de validación
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos (debe ser repartidor)
 *       '404':
 *         description: Paquete no encontrado
 *       '409':
 *         description: Estado del paquete no permite esta operación
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /deliveries/{id}/photos:
 *   post:
 *     tags:
 *       - Eventos de Entrega
 *     summary: Subir foto de entrega
 *     description: Permite a un repartidor subir una foto como evidencia de un intento de entrega
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del registro de entrega
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               delivery_photo:
 *                 type: string
 *                 format: binary
 *                 description: Archivo de imagen de la entrega
 *     responses:
 *       '201':
 *         description: Foto subida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Foto de entrega subida exitosamente
 *                 photo:
 *                   $ref: '#/components/schemas/DeliveryPhoto'
 *       '400':
 *         description: No se ha subido ningún archivo
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos (debe ser repartidor)
 *       '404':
 *         description: Registro de entrega no encontrado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /packages/{id}/cancellations:
 *   post:
 *     tags:
 *       - Eventos de Entrega
 *     summary: Cancelar un paquete
 *     description: Permite a un administrador cancelar un paquete (con posibles reembolsos)
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CancellationRequest'
 *     responses:
 *       '201':
 *         description: Paquete cancelado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Paquete cancelado exitosamente
 *                 cancellation:
 *                   $ref: '#/components/schemas/Cancellation'
 *       '400':
 *         description: Error de validación
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos (debe ser administrador)
 *       '404':
 *         description: Paquete no encontrado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /packages/{id}/returns:
 *   post:
 *     tags:
 *       - Eventos de Entrega
 *     summary: Iniciar devolución de paquete
 *     description: Permite a un administrador iniciar el proceso de devolución de un paquete con incidencia
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReturnRequest'
 *     responses:
 *       '201':
 *         description: Proceso de devolución iniciado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Proceso de devolución iniciado
 *                 return:
 *                   $ref: '#/components/schemas/Return'
 *       '400':
 *         description: Error de validación
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos (debe ser administrador)
 *       '404':
 *         description: Paquete no encontrado
 *       '409':
 *         description: Estado del paquete no permite esta operación
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     DeliveryAttempt:
 *       type: object
 *       required:
 *         - status_at_delivery
 *       properties:
 *         status_at_delivery:
 *           type: string
 *           enum: [ENTREGADO, ENTREGADO_COD_PENDIENTE, NO_HAY_NADIE, DIRECCION_INCORRECTA, RECHAZADO_POR_CLIENTE, REPROGRAMADO_POR_CLIENTE, OTRA_INCIDENCIA]
 *           description: Estado del paquete al momento del intento de entrega
 *           example: ENTREGADO
 *         observation:
 *           type: string
 *           nullable: true
 *           description: Observaciones adicionales
 *           example: El paquete fue dejado con el conserje
 *         receiver_name:
 *           type: string
 *           nullable: true
 *           description: Nombre de quien recibió el paquete
 *           example: Juan Pérez
 *         collected_amount:
 *           type: number
 *           format: float
 *           nullable: true
 *           description: Monto cobrado (para envíos contra reembolso)
 *           example: 1500.50
 * 
 *     Delivery:
 *       type: object
 *       properties:
 *         delivery_id:
 *           type: string
 *           format: uuid
 *         package_id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *         status_at_delivery:
 *           type: string
 *         observation:
 *           type: string
 *           nullable: true
 *         receiver_name:
 *           type: string
 *           nullable: true
 *         collected_amount:
 *           type: number
 *           format: float
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 * 
 *     DeliveryPhoto:
 *       type: object
 *       properties:
 *         photo_id:
 *           type: string
 *           format: uuid
 *         delivery_id:
 *           type: string
 *           format: uuid
 *         photo_url:
 *           type: string
 *           description: Ruta del archivo de la foto
 *         created_at:
 *           type: string
 *           format: date-time
 * 
 *     CancellationRequest:
 *       type: object
 *       required:
 *         - reason
 *       properties:
 *         reason:
 *           type: string
 *           enum: [SOLICITUD_CLIENTE, FALTA_STOCK, ERROR_SISTEMA, OTRO]
 *           description: Razón de la cancelación
 *           example: SOLICITUD_CLIENTE
 *         notes:
 *           type: string
 *           nullable: true
 *           description: Notas adicionales
 *           example: El cliente canceló por cambio de domicilio
 *         refund_amount:
 *           type: number
 *           format: float
 *           nullable: true
 *           description: Monto a reembolsar
 *           example: 2000.00
 * 
 *     Cancellation:
 *       type: object
 *       properties:
 *         cancellation_id:
 *           type: string
 *           format: uuid
 *         package_id:
 *           type: string
 *           format: uuid
 *         reason:
 *           type: string
 *         notes:
 *           type: string
 *           nullable: true
 *         refund_amount:
 *           type: number
 *           format: float
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 * 
 *     ReturnRequest:
 *       type: object
 *       required:
 *         - reason
 *       properties:
 *         reason:
 *           type: string
 *           enum: [RECHAZADO_DESTINATARIO, DIRECCION_INCORRECTA, NO_RECLAMADO, OTRO]
 *           description: Razón de la devolución
 *           example: RECHAZADO_DESTINATARIO
 *         notes:
 *           type: string
 *           nullable: true
 *           description: Notas adicionales
 *           example: El destinatario no aceptó el paquete
 * 
 *     Return:
 *       type: object
 *       properties:
 *         return_id:
 *           type: string
 *           format: uuid
 *         package_id:
 *           type: string
 *           format: uuid
 *         reason:
 *           type: string
 *         notes:
 *           type: string
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 */

// --- Rutas ---

// POST /packages/:id/deliveries - Registrar un intento de entrega
// Asegúrate de tener express-validator instalado: npm install express-validator

// Constantes para evitar errores de tipeo
const DELIVERY_STATUS = {
    SUCCESS: 'ENTREGADO',
};

router.post(
    '/packages/:id/deliveries',
    authenticateToken,
    roleValidator(['DRIVER']), // <-- CORRECCIÓN 1: Middleware de rol añadido
    upload.array('photos', 7), // Permitir hasta 7 fotos
    body('status_at_delivery').notEmpty().withMessage('El estado de la entrega es obligatorio.'),
    body('receiver_name')
        .if(body('status_at_delivery').equals(DELIVERY_STATUS.SUCCESS))
        .notEmpty().withMessage('El nombre del receptor es obligatorio para entregas exitosas.'),
    body('receiver_rut')
        .if(body('status_at_delivery').equals(DELIVERY_STATUS.SUCCESS))
        .notEmpty().withMessage('El RUT del receptor es obligatorio para entregas exitosas.')
        .matches(/^[0-9]{7,8}[0-9K]$/).withMessage('El RUT debe tener entre 8 y 9 caracteres en total incluyendo el dígito verificador (ej: 12345678K o 123456789).'),
    body('collected_amount')
        .optional()
        .isFloat({ min: 0 }).withMessage('El monto cobrado debe ser un número válido.'),

    async (req, res) => {

        console.log('📦 [DELIVERY] Datos recibidos en request:')
        console.log('  - Body:', req.body)
        console.log('  - Files:', req.files ? req.files.length + ' archivo(s)' : 'ninguno')

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const t = await sequelize.transaction();
        try {
            const { id: packageId } = req.params;
            const { user_id: driverId } = req.user;
            const {
                status_at_delivery,
                receiver_name,
                receiver_rut,
                observation,
                payment_type,
                collected_amount,
                gps_latitude,
                gps_longitude
            } = req.body;

            // Log de coordenadas GPS recibidas
            console.log('📍 [DELIVERY] Coordenadas GPS recibidas:')
            console.log(`  - gps_latitude: ${gps_latitude} (tipo: ${typeof gps_latitude})`)
            console.log(`  - gps_longitude: ${gps_longitude} (tipo: ${typeof gps_longitude})`)

            if (gps_latitude && gps_longitude) {
                console.log(`✅ [DELIVERY] Coordenadas GPS válidas: ${gps_latitude}, ${gps_longitude}`)
            } else {
                console.warn('⚠️ [DELIVERY] No se recibieron coordenadas GPS (o son null/undefined)')
            }

            const pkg = await Package.findByPk(packageId, {
                transaction: t,
                lock: t.LOCK.UPDATE // Bloquea la fila para evitar que otros procesos la modifiquen hasta que termine esta transacción
            });
            if (!pkg) {
                await t.rollback();
                return res.status(404).json({ error: 'Paquete no encontrado.' });
            }
            // Validar que el paquete esté en un estado que permita registrar una entrega
            const validSourceStatuses = ['EN_RUTA_ENTREGA', 'REPROGRAMADO', 'INCIDENCIA_ENTREGA', 'ASIGNADO_A_RUTA'];
            if (!validSourceStatuses.includes(pkg.status)) {
                await t.rollback();
                return res.status(409).json({ error: `El paquete no puede ser procesado porque su estado actual es '${pkg.status}'. Debe estar en ruta o tener una incidencia previa.` });
            }

            // Convertir coordenadas a números si vienen como strings
            let parsedLatitude = null;
            let parsedLongitude = null;

            if (gps_latitude !== undefined && gps_latitude !== null && gps_latitude !== '') {
                parsedLatitude = typeof gps_latitude === 'string' ? parseFloat(gps_latitude) : gps_latitude;
                if (isNaN(parsedLatitude)) {
                    console.warn(`⚠️ [DELIVERY] Latitud inválida recibida: ${gps_latitude}, usando null`)
                    parsedLatitude = null;
                }
            }

            if (gps_longitude !== undefined && gps_longitude !== null && gps_longitude !== '') {
                parsedLongitude = typeof gps_longitude === 'string' ? parseFloat(gps_longitude) : gps_longitude;
                if (isNaN(parsedLongitude)) {
                    console.warn(`⚠️ [DELIVERY] Longitud inválida recibida: ${gps_longitude}, usando null`)
                    parsedLongitude = null;
                }
            }

            console.log(`📍 [DELIVERY] Coordenadas procesadas para guardar:`)
            console.log(`  - gps_latitude: ${parsedLatitude} (${parsedLatitude !== null ? 'válido' : 'null'})`)
            console.log(`  - gps_longitude: ${parsedLongitude} (${parsedLongitude !== null ? 'válido' : 'null'})`)

            const deliveryPayload = {
                delivery_id: uuidv4(),
                package_id: packageId,
                user_id: driverId,
                status_at_delivery: status_at_delivery,
                observation: observation || null,
                gps_latitude: parsedLatitude,
                gps_longitude: parsedLongitude,
            };

            const isSuccess = [DELIVERY_STATUS.SUCCESS].includes(status_at_delivery);

            if (isSuccess) {
                deliveryPayload.receiver_name = receiver_name;
                deliveryPayload.receiver_rut = receiver_rut;

                if (pkg.is_cod) {
                    deliveryPayload.payment_type = payment_type;
                    deliveryPayload.collected_amount = parseFloat(collected_amount) || 0;
                }
            }

            const newDelivery = await Delivery.create(deliveryPayload, { transaction: t });

            // Verificar que las coordenadas se guardaron correctamente
            console.log('✅ [DELIVERY] Entrega creada exitosamente:')
            console.log(`  - delivery_id: ${newDelivery.delivery_id}`)
            console.log(`  - gps_latitude guardado: ${newDelivery.gps_latitude}`)
            console.log(`  - gps_longitude guardado: ${newDelivery.gps_longitude}`)

            // --- MEJORA 2: Actualización del estado del paquete y limpieza de retornos pendientes ---
            let nextPackageStatus;
            const updateFields = {};

            if (isSuccess) {
                nextPackageStatus = 'ENTREGADO';
                updateFields.pending_return_user_id = null; // Ya no está pendiente de devolución
            } else if (status_at_delivery === 'REPROGRAMADO_POR_CLIENTE') {
                nextPackageStatus = 'REPROGRAMADO';
                // Si falla pero el conductor se lo queda, mantenemos el pending_return_user_id si ya existía
                // o lo asignamos si el admin cierra la ruta luego.
            } else {
                nextPackageStatus = 'INCIDENCIA_ENTREGA';
            }

            updateFields.status = nextPackageStatus;
            await pkg.update(updateFields, { transaction: t });
            // --- FIN DE LA MEJORA ---

            // Crear registros de fotos si se subieron
            if (req.files && req.files.length > 0) {
                const photoPromises = req.files.map(file =>
                    DeliveryPhoto.create({
                        photo_id: uuidv4(),
                        delivery_id: newDelivery.delivery_id,
                        photo_url: file.path.replace(/^.*\/uploads\//, 'uploads/')
                    }, { transaction: t })
                );
                await Promise.all(photoPromises);
            }

            const driver = await User.findByPk(driverId, { transaction: t, attributes: ['full_name'] });
            const driverName = driver ? driver.full_name : 'El conductor';
            const packageLink = `/packages/${pkg.package_id}`;

            if (status_at_delivery === DELIVERY_STATUS.SUCCESS) {
                if (pkg.is_cod) {
                    const message = `${driverName} entregó el paquete ${pkg.tracking_code} con pago COD de $${collected_amount} (${payment_type || 'sin pago registrado'}).`;
                    ['ADMIN', 'WAREHOUSE_STAFF'].forEach((roleName) => {
                        queueNotificationForRole(roleName, {
                            title: 'Entrega COD registrada',
                            message,
                            link: packageLink,
                        }, { transaction: t });
                    });
                } else {
                    queueNotificationForRole('ADMIN', {
                        title: 'Paquete entregado',
                        message: `${driverName} entregó el paquete ${pkg.tracking_code}.`,
                        link: packageLink,
                    }, { transaction: t });
                }
            } else if (status_at_delivery === 'REPROGRAMADO_POR_CLIENTE') {
                queueNotificationForRole('ADMIN', {
                    title: 'Entrega reprogramada',
                    message: `${driverName} reprogramó la entrega del paquete ${pkg.tracking_code}.`,
                    link: packageLink,
                }, { transaction: t });
            } else {
                const incidentMessage = `${driverName} reportó '${status_at_delivery}' para el paquete ${pkg.tracking_code}${observation ? `: ${observation}` : ''}.`;
                queueNotificationForRole('ADMIN', {
                    title: 'Incidencia en entrega',
                    message: incidentMessage,
                    link: packageLink,
                }, { transaction: t });
            }

            // Log de auditoría
            await logAudit(driverId, 'CREATE_DELIVERY', {
                delivery_id: newDelivery.delivery_id,
                package_id: packageId,
                tracking_code: pkg.tracking_code,
                status_at_delivery: status_at_delivery,
                new_package_status: nextPackageStatus,
                receiver_name: receiver_name || null,
                has_photo: !!req.file
            });

            // Obtener el route_id del paquete para redirigir en el frontend
            const routePackage = await RoutePackage.findOne({
                where: { package_id: packageId },
                include: [{
                    model: Route,
                    as: 'route'
                    // Quitamos el filtro de estado para que encuentre la ruta aunque esté FINALIZADA
                }],
                order: [['created_at', 'DESC']],
                transaction: t
            });

            const route_id = routePackage?.route_id || null;

            await t.commit();
            res.status(201).json({
                message: 'Intento de entrega registrado exitosamente.',
                delivery: newDelivery,
                route_id: route_id // Retornar route_id para redirección
            });

        } catch (error) {
            await t.rollback();
            console.error('Error al registrar intento de entrega:', error);
            res.status(500).json({ error: 'Error interno del servidor.' });
        }
    }
);
// POST /deliveries/:id/photos - Subir una foto para una entrega
router.post('/deliveries/:id/photos', authenticateToken, roleValidator(['DRIVER']), upload.single('delivery_photo'), async (req, res) => {
    console.log('Received FormData fields:', req.body);
    console.log('Received file:', req.file ? req.file : 'No file uploaded');
    if (!req.file) {
        return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    }

    try {
        const deliveryId = req.params.id;
        const delivery = await Delivery.findByPk(deliveryId);
        if (!delivery) {
            return res.status(404).json({ error: 'Registro de entrega no encontrado.' });
        }

        const newPhoto = await DeliveryPhoto.create({
            photo_id: uuidv4(),
            delivery_id: deliveryId,
            photo_url: req.file.path.replace(/^.*\/uploads\//, 'uploads/') // Guarda solo la ruta relativa
        });

        res.status(201).json({ message: 'Foto de entrega subida exitosamente.', photo: newPhoto });

    } catch (error) {
        console.error('Error al subir la foto:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /packages/:id/cancellations - Registrar una cancelación
router.post('/packages/:id/cancellations', authenticateToken, roleValidator(['ADMIN']), validateCancellation, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const t = await sequelize.transaction();
    try {
        const packageId = req.params.id;
        const { reason, notes, refund_amount } = req.body;

        const pkg = await Package.findByPk(packageId, { transaction: t });
        if (!pkg) {
            await t.rollback();
            return res.status(404).json({ error: 'Paquete no encontrado.' });
        }

        const newCancellation = await Cancellation.create({
            cancellation_id: uuidv4(),
            package_id: packageId,
            reason,
            notes,
            refund_amount
        }, { transaction: t });

        // El trigger 'trg_after_cancellation_insert' actualizará el estado del paquete.
        await t.commit();
        res.status(201).json({ message: 'Paquete cancelado exitosamente.', cancellation: newCancellation });

    } catch (error) {
        await t.rollback();
        console.error('Error al cancelar el paquete:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /packages/:id/returns - Registrar una devolución
router.post('/packages/:id/returns', authenticateToken, roleValidator(['ADMIN']), validateReturn, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const t = await sequelize.transaction();
    try {
        const packageId = req.params.id;
        const { reason, notes } = req.body;

        const pkg = await Package.findByPk(packageId, { transaction: t });
        if (!pkg) {
            await t.rollback();
            return res.status(404).json({ error: 'Paquete no encontrado.' });
        }
        if (pkg.status !== 'INCIDENCIA_ENTREGA') {
            await t.rollback();
            return res.status(409).json({ error: `Solo se puede iniciar una devolución para paquetes con estado 'INCIDENCIA_ENTREGA'.` });
        }

        const newReturn = await Return.create({
            return_id: uuidv4(),
            package_id: packageId,
            reason,
            notes
        }, { transaction: t });

        // El trigger 'trg_after_return_insert' actualizará el estado a 'DEVUELTO_ALMACEN'.
        await t.commit();
        res.status(201).json({ message: 'Proceso de devolución iniciado.', return: newReturn });

    } catch (error) {
        await t.rollback();
        console.error('Error al iniciar la devolución:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, perPage = 10, search } = req.query;

        const whereClause = {};
        // Solo permitir ver sus propias entregas si es conductor
        if (req.user.role === 'DRIVER') {
            whereClause.user_id = req.user.user_id;
        }

        const includeClause = [
            {
                model: Package,
                as: 'package',
                attributes: ['tracking_code', 'recipient_name', 'external_tracking_code']
            },
            {
                model: User,
                as: 'user', // Este es el conductor que realizó la entrega
                attributes: ['user_id', 'full_name']
            }
        ];

        // Si hay un término de búsqueda, modificamos la cláusula de inclusión del paquete
        if (search) {
            includeClause[0].where = {
                [Op.or]: [
                    { tracking_code: { [Op.like]: `%${search}%` } },
                    { recipient_name: { [Op.like]: `%${search}%` } }
                ]
            };
        }

        const { count, rows: deliveries } = await Delivery.findAndCountAll({
            where: whereClause,
            include: includeClause,
            limit: parseInt(perPage),
            offset: (parseInt(page) - 1) * parseInt(perPage),
            order: [['attempted_at', 'DESC']]
        });

        res.json({ deliveries, total: count });

    } catch (error) {
        console.error("Error al obtener los registros de entrega:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});




module.exports = router;