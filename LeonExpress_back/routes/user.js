const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { User, Role, Vehicle, VehicleType, Warehouse, AuditLog, sequelize } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator'); // Asegúrate de que la ruta sea correcta
const { Op } = require('sequelize');

const router = express.Router();



// Validation for creating a user
const validateUser = [
  body('username')
    .isString()
    .notEmpty()
    .trim()
    .toLowerCase()
    .isLength({ max: 50 })
    .withMessage('El nombre de usuario es requerido (máx 50 caracteres)'),
  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .normalizeEmail()
    .withMessage('Formato de email inválido'),
  body('full_name')
    .isString()
    .notEmpty()
    .trim()
    .isLength({ max: 100 })
    .withMessage('El nombre completo es requerido (máx 100 caracteres)'),
  body('password')
    .isString()
    .notEmpty()
    .isLength({ min: 6 })
    .withMessage('La contraseña es requerida (mínimo 6 caracteres)'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('El teléfono debe ser texto (máx 20 caracteres)'),
  body('role_id')
    .isString()
    .notEmpty()
    .withMessage('El ID de rol es requerido'),
  body('warehouse_id')
    .isString()
    .notEmpty()
    .withMessage('El ID de almacén es requerido'),
];

// Validation for updating a user
const validateUpdateUser = [
  body('username')
    .isString()
    .notEmpty()
    .trim()
    .toLowerCase()
    .isLength({ max: 50 })
    .withMessage('El nombre de usuario es requerido (máx 50 caracteres)'),
  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .normalizeEmail()
    .withMessage('Formato de email inválido'),
  body('full_name')
    .isString()
    .notEmpty()
    .trim()
    .isLength({ max: 100 })
    .withMessage('El nombre completo es requerido (máx 100 caracteres)'),
  body('password')
    .optional({ checkFalsy: true }) // Permite que la contraseña sea opcional para la actualización
    .isString()
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener mínimo 6 caracteres si se proporciona'),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('El teléfono debe ser texto (máx 20 caracteres)'),
  body('role_id')
    .isString()
    .notEmpty()
    .withMessage('El ID de rol es requerido'),
  body('warehouse_id')
    .isString()
    .notEmpty()
    .withMessage('El ID de almacén es requerido'),
];

// Helper function to log audit actions
const logAudit = async (userId, action, targetTable, targetId, details) => {
  try {
    await AuditLog.create({
      log_id: uuidv4(),
      user_id: userId,
      action,
      target_table: targetTable,
      target_id: targetId,
      details: JSON.stringify(details),
      created_at: new Date()
    });
  } catch (error) {
    console.error('Error al registrar en audit_log:', error);
  }
};

/**
 * @openapi
 * tags:
 *   name: Usuarios
 *   description: Gestión de usuarios del sistema
 */

/**
 * @openapi
 * /users:
 *   get:
 *     tags:
 *       - Usuarios
 *     summary: Listar usuarios
 *     description: Obtiene una lista paginada de usuarios con sus roles y almacenes asociados
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
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: full_name
 *         description: Campo por el cual ordenar
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           default: ASC
 *           enum: [ASC, DESC]
 *         description: Dirección del orden (ASC o DESC)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Término de búsqueda (nombre, username o email)
 *     responses:
 *       '200':
 *         description: Lista de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: Total de usuarios
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserWithRelations'
 *       '401':
 *         description: No autorizado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /users:
 *   post:
 *     tags:
 *       - Usuarios
 *     summary: Crear usuario
 *     description: Crea un nuevo usuario en el sistema (solo para administradores)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserCreate'
 *     responses:
 *       '201':
 *         description: Usuario creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuario creado exitosamente
 *                 user:
 *                   $ref: '#/components/schemas/UserWithRelations'
 *       '400':
 *         description: Error de validación o rol/almacén no encontrado
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos (debe ser administrador)
 *       '409':
 *         description: Username o email ya existen
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /users/{id}:
 *   put:
 *     tags:
 *       - Usuarios
 *     summary: Actualizar usuario
 *     description: Actualiza la información de un usuario existente (solo para administradores)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserUpdate'
 *     responses:
 *       '200':
 *         description: Usuario actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuario actualizado exitosamente
 *                 user:
 *                   $ref: '#/components/schemas/UserWithRelations'
 *       '400':
 *         description: Error de validación o rol/almacén no encontrado
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos (debe ser administrador)
 *       '404':
 *         description: Usuario no encontrado
 *       '409':
 *         description: Username o email ya existen
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     tags:
 *       - Usuarios
 *     summary: Desactivar usuario
 *     description: Desactiva un usuario (borrado lógico, solo para administradores)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del usuario
 *     responses:
 *       '200':
 *         description: Usuario desactivado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usuario 'Juan Pérez' desactivado exitosamente
 *                 user_id:
 *                   type: string
 *                   format: uuid
 *       '401':
 *         description: No autorizado
 *       '403':
 *         description: No tiene permisos o intenta desactivarse a sí mismo
 *       '404':
 *         description: Usuario no encontrado
 *       '409':
 *         description: Conflicto (usuario asociado a otros registros)
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * /users/roles:
 *   get:
 *     tags:
 *       - Usuarios
 *     summary: Listar roles
 *     description: Obtiene la lista de roles disponibles
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Lista de roles
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Role'
 *       '401':
 *         description: No autorizado
 *       '500':
 *         description: Error del servidor
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         user_id:
 *           type: string
 *           format: uuid
 *         username:
 *           type: string
 *         email:
 *           type: string
 *           nullable: true
 *         full_name:
 *           type: string
 *         phone:
 *           type: string
 *           nullable: true
 *         role_id:
 *           type: string
 *         warehouse_id:
 *           type: string
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 * 
 *     UserWithRelations:
 *       type: object
 *       properties:
 *         user_id:
 *           type: string
 *           format: uuid
 *         username:
 *           type: string
 *         email:
 *           type: string
 *           nullable: true
 *         full_name:
 *           type: string
 *         phone:
 *           type: string
 *           nullable: true
 *         role_id:
 *           type: string
 *         role_name:
 *           type: string
 *         warehouse_id:
 *           type: string
 *         warehouse_name:
 *           type: string
 *         is_active:
 *           type: boolean
 *         vehicles:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/UserVehicle'
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 * 
 *     UserCreate:
 *       type: object
 *       required:
 *         - username
 *         - full_name
 *         - password
 *         - role_id
 *         - warehouse_id
 *       properties:
 *         username:
 *           type: string
 *           example: "jperez"
 *           description: Nombre de usuario (único)
 *         email:
 *           type: string
 *           nullable: true
 *           example: "juan.perez@example.com"
 *           description: Email del usuario (opcional, único si se proporciona)
 *         full_name:
 *           type: string
 *           example: "Juan Pérez"
 *           description: Nombre completo
 *         password:
 *           type: string
 *           example: "passwordSeguro123"
 *           description: Contraseña (mínimo 6 caracteres)
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+56912345678"
 *           description: Teléfono (opcional)
 *         role_id:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *           description: ID del rol asignado
 *         warehouse_id:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *           description: ID del almacén asignado
 * 
 *     UserUpdate:
 *       type: object
 *       required:
 *         - username
 *         - full_name
 *         - role_id
 *         - warehouse_id
 *       properties:
 *         username:
 *           type: string
 *           example: "jperez"
 *         email:
 *           type: string
 *           nullable: true
 *           example: "juan.perez@example.com"
 *         full_name:
 *           type: string
 *           example: "Juan Pérez"
 *         password:
 *           type: string
 *           nullable: true
 *           example: "nuevaPassword123"
 *           description: Nueva contraseña (opcional, mínimo 6 caracteres si se proporciona)
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+56912345678"
 *         role_id:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         warehouse_id:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 * 
 *     UserVehicle:
 *       type: object
 *       properties:
 *         vehicle_id:
 *           type: string
 *           format: uuid
 *         license_plate:
 *           type: string
 *         type_id:
 *           type: string
 *           format: uuid
 *         vehicle_type_name:
 *           type: string
 *           nullable: true
 *         vehicle_delivery_cost:
 *           type: number
 *           format: float
 *           nullable: true
 * 
 *     Role:
 *       type: object
 *       properties:
 *         role_id:
 *           type: string
 *           format: uuid
 *         role_name:
 *           type: string
 *           example: "ADMIN"
 */

// GET /users - List users with pagination and search
// En tu archivo routes/user.js

router.get('/', authenticateToken, roleValidator(), async (req, res) => {
  try {
    // --- INICIO DE LA CORRECCIÓN ---
    // Se añade 'isActive' a la lista de variables extraídas de req.query
    const { page = 1, pageSize = 10, sortBy = 'full_name', sortOrder = 'ASC', search, isActive } = req.query;
    // --- FIN DE LA CORRECCIÓN ---

    const whereClause = {};
    if (search) {
      whereClause[Op.or] = [
        { full_name: { [Op.like]: `%${search.trim()}%` } },
        { username: { [Op.like]: `%${search.trim()}%` } },
        { email: { [Op.like]: `%${search.trim()}%` } }
      ];
    }

    // Esta lógica ahora funcionará porque 'isActive' ya está definida
    if (isActive === 'true' || isActive === 'false') {
      whereClause.is_active = (isActive === 'true');
    }

    // Filtro por Rol (ID o Nombre)
    // Se añade roleId a los query params
    const { roleId, roleName } = req.query;
    if (roleId) {
      whereClause.role_id = roleId;
    }

    const roleInclude = {
      model: Role,
      as: 'role',
      attributes: ['role_id', 'role_name']
    };

    if (roleName) {
      roleInclude.where = { role_name: roleName.toUpperCase() };
    }

    const allowedSortBy = ['full_name', 'username', 'email', 'created_at'];
    const safeSortBy = allowedSortBy.includes(sortBy) ? sortBy : 'full_name';

    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause, // Ahora el whereClause incluirá el filtro de estado si se proporciona
      // ... (el resto de tu consulta se mantiene igual)
      attributes: [
        'user_id', 'username', 'email', 'full_name', 'phone', 'role_id',
        'warehouse_id', 'is_active', 'created_at', 'updated_at'
      ],
      include: [
        roleInclude, // Usar el objeto con posible filtro
        { model: Warehouse, as: 'warehouse', attributes: ['warehouse_id', 'warehouse_name'] },
        {
          model: Vehicle,
          as: 'vehicles',
          attributes: ['vehicle_id', 'license_plate', 'type_id'],
          required: false,
          include: [
            {
              model: VehicleType,
              as: 'vehicleType',
              attributes: ['type_id', 'type_name', 'base_delivery_cost'],
              required: false
            }
          ]
        }
      ],
      order: [[safeSortBy, sortOrder.toUpperCase()]],
      offset: (Number(page) - 1) * Number(pageSize),
      limit: Number(pageSize)
    });

    // Tu mapeo de respuesta está perfecto y no necesita cambios
    const usersResponse = users.map((user) => ({
      user_id: user.user_id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      role_id: user.role_id,
      role_name: user.role?.role_name || 'Sin rol',
      warehouse_id: user.warehouse_id,
      warehouse_name: user.warehouse?.warehouse_name || 'Sin almacén',
      is_active: user.is_active,
      vehicles: user.vehicles.map((vehicle) => ({
        vehicle_id: vehicle.vehicle_id,
        license_plate: vehicle.license_plate,
        type_id: vehicle.type_id,
        vehicle_type_name: vehicle.vehicleType?.type_name || null,
        vehicle_delivery_cost: vehicle.vehicleType?.base_delivery_cost || null
      })),
      created_at: user.created_at,
      updated_at: user.updated_at
    }));

    res.json({ total: count, users: usersResponse });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener usuarios',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// POST /users - Create new user (Solo administradores)
router.post('/', validateUser, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, full_name, password, phone, role_id, warehouse_id } = req.body;

    // Verify role exists
    const role = await Role.findByPk(role_id);
    if (!role) {
      return res.status(400).json({ error: 'Rol no encontrado' });
    }

    // Verify warehouse exists
    const warehouse = await Warehouse.findByPk(warehouse_id);
    if (!warehouse) {
      return res.status(400).json({ error: 'Almacén no encontrado' });
    }

    // Check for duplicate username
    const existingUserByUsername = await User.findOne({ where: { username: username.toLowerCase() } });
    if (existingUserByUsername) {
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }

    // Check for duplicate email (if provided)
    // Check for duplicate email (if provided)
    const processedEmail = email || null;
    // Allow duplicate emails
    // if (processedEmail) {
    //   const existingUserByEmail = await User.findOne({ where: { email: processedEmail } });
    //   if (existingUserByEmail) {
    //     return res.status(409).json({ error: 'El email ya está registrado' });
    //   }
    // }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    const user_id = uuidv4();

    // Create user
    const newUser = await User.create({
      user_id: user_id,
      username: username.toLowerCase(),
      email: processedEmail,
      full_name,
      password_hash,
      phone: phone || null,
      role_id,
      warehouse_id,
      is_active: true
    });

    // // Log audit
    // await logAudit(req.user.user_id, 'CREATE_USER', 'users', newUser.user_id, {
    //   username,
    //   full_name,
    //   role_id,
    //   warehouse_id
    // });

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user: {
        user_id: newUser.user_id,
        username: newUser.username,
        email: newUser.email,
        full_name: newUser.full_name,
        phone: newUser.phone,
        role_id: newUser.role_id,
        role_name: role.role_name,
        warehouse_id: newUser.warehouse_id,
        warehouse_name: warehouse.warehouse_name,
        is_active: newUser.is_active,
        created_at: newUser.created_at,
        updated_at: newUser.updated_at
      }
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al crear el usuario',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PUT /users/:id - Update user (Solo administradores)
router.put('/:id', authenticateToken, roleValidator(['ADMIN']), validateUpdateUser, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.params.id;
    const { username, email, full_name, password, phone, role_id, warehouse_id } = req.body;

    console.log(req.body)

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Verify role
    const role = await Role.findByPk(role_id);
    if (!role) {
      return res.status(400).json({ error: 'Rol no encontrado' });
    }

    // Verify warehouse
    const warehouse = await Warehouse.findByPk(warehouse_id);
    if (!warehouse) {
      return res.status(400).json({ error: 'Almacén no encontrado' });
    }

    // Check for duplicate username
    if (username.toLowerCase() !== user.username) {
      const existingUser = await User.findOne({ where: { username: username.toLowerCase() } });
      if (existingUser) {
        return res.status(409).json({ error: 'El nombre de usuario ya existe' });
      }
    }

    // Check for duplicate email
    // Check for duplicate email
    const processedEmail = email || null;
    // Allow duplicate emails
    // if (processedEmail && processedEmail !== user.email) {
    //   const existingUser = await User.findOne({ where: { email: processedEmail } });
    //   if (existingUser) {
    //     return res.status(409).json({ error: 'El email ya está registrado' });
    //   }
    // }

    // Update fields
    user.username = username.toLowerCase();
    user.full_name = full_name;
    user.email = processedEmail;
    user.phone = phone || null;
    user.role_id = role_id;
    user.warehouse_id = warehouse_id;

    // Update password if provided and not empty
    if (password) {
      user.password_hash = await bcrypt.hash(password, 10);
    }

    await user.save();

    // Log audit
    await logAudit(req.user.user_id, 'UPDATE_USER', 'users', user.user_id, {
      username,
      full_name,
      role_id,
      warehouse_id
    });

    res.json({
      message: 'Usuario actualizado exitosamente',
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role_id: user.role_id,
        role_name: role.role_name,
        warehouse_id: user.warehouse_id,
        warehouse_name: warehouse.warehouse_name,
        is_active: user.is_active,
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al actualizar el usuario',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /users/:id - Soft delete user (Solo administradores)
router.delete('/:id', authenticateToken, roleValidator(['ADMIN']), async (req, res) => {
  try {
    const userId = req.params.id;
    const authenticatedUserId = req.user.user_id;

    if (userId === authenticatedUserId) {
      return res.status(403).json({ error: 'No puedes desactivar tu propia cuenta' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Soft delete by setting is_active to false
    user.is_active = false;
    await user.save();

    // Log audit
    await logAudit(req.user.user_id, 'DEACTIVATE_USER', 'users', user.user_id, {
      username: user.username,
      full_name: user.full_name
    });

    res.status(200).json({
      message: `Usuario '${user.full_name}' desactivado exitosamente`,
      user_id: userId
    });
  } catch (error) {
    console.error('Error al desactivar usuario:', error);
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(409).json({
        error: 'Conflicto de desactivación',
        message: 'No se puede desactivar el usuario porque está asociado a otros registros.'
      });
    }
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al desactivar el usuario',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /users/roles - List roles (Cualquier usuario autenticado puede obtener roles)
router.get('/roles', authenticateToken, roleValidator(), async (req, res) => {
  try {
    const roles = await Role.findAll({
      attributes: ['role_id', 'role_name'],
      order: [['role_name', 'ASC']]
    });

    res.json(roles);
  } catch (error) {
    console.error('Error al obtener roles:', error);
    res.status(500).json({
      error: 'Error del servidor',
      message: 'Error al obtener roles',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// PATCH /api/users/:id/activate - Reactivar un usuario
router.patch('/:id/activate', authenticateToken, roleValidator(['ADMIN']), async (req, res) => {
  // Esta línea ahora funcionará porque 'sequelize' está importado
  const t = await sequelize.transaction();
  try {
    const user = await User.findByPk(req.params.id, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    user.is_active = true;
    await user.save({ transaction: t });

    await t.commit();
    res.json({ message: 'Usuario reactivado exitosamente', user });

  } catch (error) {
    await t.rollback();
    console.error('Error al reactivar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
module.exports = router;