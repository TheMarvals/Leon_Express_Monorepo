// Contenido completo y final para routes/auth.js
'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { User, Role, Client, ClientOtp, ClientPricing, ClientInvitation, sequelize } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const rateLimit = require('express-rate-limit');
const { logAudit } = require('../utils/audit');
const emailService = require('../services/emailService');

// Asegura que la variable de entorno JWT_SECRET esté definida
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

// Middleware para limitar intentos de login
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutos
	max: 10,
	message: { error: 'Demasiados intentos de login desde esta IP. Por favor, intente de nuevo en 15 minutos.' },
	standardHeaders: true,
	legacyHeaders: false, 
});

// Validaciones para el login
const validateLogin = [
  body('username').trim().toLowerCase().isLength({ min: 3 }).withMessage('El nombre de usuario debe tener al menos 3 caracteres'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
];

const validatePasswordChange = [
  body('currentPassword')
    .trim()
    .notEmpty()
    .withMessage('La contraseña actual es obligatoria'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('La nueva contraseña debe tener al menos 8 caracteres')
    .bail()
    .matches(/^(?=.*[A-Za-z])(?=.*\d).+$/)
    .withMessage('La nueva contraseña debe contener letras y números'),
  body('confirmNewPassword')
    .optional()
    .custom((value, { req }) => !value || value === req.body.newPassword)
    .withMessage('La confirmación no coincide con la nueva contraseña'),
];

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Iniciar sesión de usuario
 *     description: Autentica a un usuario y devuelve un token JWT.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 example: tu_contraseña_segura
 *     responses:
 *       '200':
 *         description: Login exitoso.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *       '400':
 *         description: Error de validación.
 *       '401':
 *         description: Credenciales inválidas.
 */
// router.post('/login', loginLimiter, validateLogin, async (req, res) => {
router.post('/login', validateLogin, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { username, password } = req.body;
    const user = await User.findOne({
      where: { username: username.toLowerCase() },
      include: [
        { model: Role, as: 'role', attributes: ['role_id', 'role_name'] },
        { model: Client, as: 'client', attributes: ['client_id', 'client_name', 'address', 'phone', 'email'] }
      ],
      attributes: ['user_id', 'username', 'password_hash', 'full_name', 'is_active', 'client_id']
    });
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'La cuenta de usuario está desactivada.' });
    }
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const token = jwt.sign(
      { 
        user_id: user.user_id, 
        username: user.username, 
        role: user.role ? user.role.role_name : null,
        client_id: user.client_id || null
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Log del login exitoso
    await logAudit(user.user_id, 'LOGIN', { 
      username: user.username, 
      full_name: user.full_name,
      role: user.role ? user.role.role_name : null,
      client_id: user.client_id || null,
      ip: req.ip || req.connection.remoteAddress
    });

    res.json({
      token,
      user: { 
        user_id: user.user_id, 
        username: user.username, 
        full_name: user.full_name, 
        role: user.role ? user.role.role_name : null,
        client_id: user.client_id || null,
        client: user.client || null
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    
    // Detectar errores de conexión a la base de datos
    if (error.name === 'SequelizeConnectionError' || error.name === 'ConnectionError') {
      console.error('❌ Error de conexión a la base de datos:', error.message);
      return res.status(503).json({ 
        error: 'Servicio temporalmente no disponible. No se puede conectar a la base de datos.',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Por favor, intente nuevamente en unos momentos.'
      });
    }
    
    // Otros errores de Sequelize
    if (error.name && error.name.startsWith('Sequelize')) {
      console.error('❌ Error de base de datos:', error.message);
      return res.status(500).json({ 
        error: 'Error al procesar la solicitud',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    res.status(500).json({ 
      error: 'Error en el servidor', 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});

// Rate limiter para solicitudes de OTP
const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiadas solicitudes de código OTP. Por favor, intente de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @openapi
 * /auth/otp/request:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Solicitar código OTP para clientes
 *     description: Genera un código OTP de 6 dígitos y lo envía al correo del cliente.
 */
router.post('/otp/request', otpRequestLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Debe ingresar un correo electrónico válido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = req.body.email.toLowerCase().trim();

    // 1. Buscar si existe un User con ese email
    let user = await User.findOne({
      where: { email },
      include: [
        { model: Role, as: 'role', attributes: ['role_id', 'role_name'] },
        { model: Client, as: 'client' }
      ]
    });

    // 2. Si no existe User, buscar si existe un Client registrado con ese email
    if (!user) {
      const client = await Client.findOne({ where: { email } });
      if (!client) {
        return res.status(404).json({ 
          error: 'No se encontró ninguna cuenta asociada a este correo electrónico. Por favor contacte al administrador.' 
        });
      }

      if (!client.is_active) {
        return res.status(403).json({ 
          error: 'Su cuenta de cliente está inactiva o pendiente de activación. Por favor contacte al administrador.' 
        });
      }

      // Obtener o crear el rol CLIENT
      let clientRole = await Role.findOne({ where: { role_name: 'CLIENT' } });
      if (!clientRole) {
        clientRole = await Role.create({
          role_id: uuidv4(),
          role_name: 'CLIENT'
        });
      }

      // Provisionar usuario para este cliente
      const randomPass = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(randomPass, 10);

      user = await User.create({
        user_id: uuidv4(),
        username: email,
        password_hash: passwordHash,
        role_id: clientRole.role_id,
        client_id: client.client_id,
        warehouse_id: null,
        full_name: client.client_name,
        email: client.email,
        phone: client.phone || null,
        is_active: true
      });

      user.role = clientRole;
      user.client = client;
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'La cuenta está desactivada. Contacte al administrador.' });
    }

    // 3. Generar código OTP de 6 dígitos
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Invalida OTPs activos anteriores para este email
    await ClientOtp.update(
      { is_used: true },
      { where: { email, is_used: false } }
    );

    // Guardar nuevo OTP
    await ClientOtp.create({
      otp_id: uuidv4(),
      email,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      is_used: false
    });

    // Enviar código por correo electrónico vía Resend
    const recipientName = user.full_name || (user.client ? user.client.client_name : '');
    await emailService.sendOtpEmail({
      to: email,
      code: otpCode,
      clientName: recipientName
    });

    // Log visible para desarrollo y monitoreo
    console.log(`\n======================================================`);
    console.log(`🔑 [OTP CLIENTE] Código para ${email}: [ ${otpCode} ] (expira en 15 min)`);
    console.log(`======================================================\n`);

    res.json({
      success: true,
      message: 'Código de acceso enviado exitosamente a tu correo.',
      email,
      dev_code: process.env.NODE_ENV === 'development' ? otpCode : undefined
    });
  } catch (error) {
    console.error('Error al solicitar OTP:', error);
    res.status(500).json({ error: 'Error al procesar la solicitud de código de acceso', details: error.message });
  }
});

/**
 * @openapi
 * /auth/otp/verify:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Verificar código OTP para clientes
 *     description: Verifica el código OTP o PIN permanente y retorna el token JWT de acceso.
 */
router.post('/otp/verify', [
  body('email').isEmail().normalizeEmail().withMessage('Correo electrónico inválido'),
  body('code').trim().isLength({ min: 6, max: 6 }).withMessage('El código debe ser de 6 dígitos')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const email = req.body.email.toLowerCase().trim();
    const code = String(req.body.code).trim();

    // 1. Intentar validar con OTP dinámico activo
    const otpRecord = await ClientOtp.findOne({
      where: {
        email,
        is_used: false,
        expires_at: { [Op.gt]: new Date() }
      },
      order: [['created_at', 'DESC']]
    });

    let isValid = false;

    if (otpRecord) {
      if (otpRecord.attempts >= 5) {
        await otpRecord.update({ is_used: true });
        return res.status(429).json({ error: 'Demasiados intentos fallidos. Por favor solicite un nuevo código.' });
      }

      isValid = await bcrypt.compare(code, otpRecord.code_hash);
      if (isValid) {
        await otpRecord.update({ is_used: true });
      } else {
        await otpRecord.increment('attempts');
      }
    }

    // 2. Si no es válido mediante ClientOtp temporal, verificar si coincide con el PIN permanente del cliente
    if (!isValid) {
      const clientRecord = await Client.findOne({ where: { email } });
      if (clientRecord && clientRecord.verification_code && String(clientRecord.verification_code).trim() === code) {
        isValid = true;
      }
    }

    if (!isValid) {
      return res.status(400).json({ error: 'Código incorrecto o expirado. Verifique e intente nuevamente.' });
    }

    // Obtener usuario completo
    const user = await User.findOne({
      where: { email },
      include: [
        { model: Role, as: 'role', attributes: ['role_id', 'role_name'] },
        { model: Client, as: 'client', attributes: ['client_id', 'client_name', 'address', 'phone', 'email'] }
      ]
    });

    if (!user || !user.is_active) {
      return res.status(403).json({ error: 'La cuenta de usuario está desactivada o no existe.' });
    }

    const token = jwt.sign(
      { 
        user_id: user.user_id, 
        username: user.username, 
        role: user.role ? user.role.role_name : 'CLIENT',
        client_id: user.client_id || (user.client ? user.client.client_id : null)
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Auditoría
    await logAudit(user.user_id, 'LOGIN_OTP', {
      email,
      role: user.role?.role_name,
      client_id: user.client_id,
      ip: req.ip || req.connection.remoteAddress
    });

    res.json({
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role ? user.role.role_name : 'CLIENT',
        client_id: user.client_id || (user.client ? user.client.client_id : null),
        client: user.client || null
      }
    });
  } catch (error) {
    console.error('Error al verificar OTP:', error);
    res.status(500).json({ error: 'Error al verificar código de acceso', details: error.message });
  }
});

/**
 * @openapi
 * /auth/invitation/:token:
 *   get:
 *     tags:
 *       - Autenticación
 *     summary: Validar token de invitación para nuevo cliente
 */
router.get('/invitation/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) {
      return res.status(400).json({ error: 'Token de invitación inválido.' });
    }

    const invitation = await ClientInvitation.findOne({
      where: {
        token,
        is_used: false,
        expires_at: { [Op.gt]: new Date() }
      }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'El enlace de invitación es inválido, ya fue utilizado o ha expirado.' });
    }

    res.json({
      success: true,
      invitation: {
        client_name: invitation.client_name,
        email: invitation.email,
        base_price: invitation.base_price,
        has_free_pickups: invitation.has_free_pickups,
        expires_at: invitation.expires_at
      }
    });
  } catch (error) {
    console.error('Error al consultar invitación:', error);
    res.status(500).json({ error: 'Error al consultar la invitación' });
  }
});

/**
 * @openapi
 * /auth/invitation/accept:
 *   post:
 *     tags:
 *       - Autenticación
 *     summary: Completar registro de nuevo cliente con token de invitación
 */
router.post('/invitation/accept', [
  body('token').trim().notEmpty().withMessage('El token es obligatorio'),
  body('phone').trim().notEmpty().withMessage('El teléfono de contacto es obligatorio'),
  body('address').trim().notEmpty().withMessage('La dirección de retiro es obligatoria'),
  body('commune').optional().trim()
], async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await t.rollback();
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, phone, address, commune } = req.body;

    const invitation = await ClientInvitation.findOne({
      where: {
        token,
        is_used: false,
        expires_at: { [Op.gt]: new Date() }
      },
      transaction: t
    });

    if (!invitation) {
      await t.rollback();
      return res.status(404).json({ error: 'El enlace de invitación es inválido o ha expirado.' });
    }

    const fullAddress = commune ? `${address.trim()}, ${commune.trim()}` : address.trim();
    const normalizedEmail = invitation.email.toLowerCase().trim();

    // 1. Verificar si ya existe el cliente o crearlo
    let client = await Client.findOne({ where: { email: normalizedEmail }, transaction: t });
    let verification_code = client?.verification_code;

    if (!client) {
      verification_code = crypto.randomInt(100000, 999999).toString();
      client = await Client.create({
        client_id: uuidv4(),
        client_name: invitation.client_name,
        email: normalizedEmail,
        phone: phone.trim(),
        address: fullAddress,
        verification_code,
        is_active: true,
        has_free_pickups: invitation.has_free_pickups
      }, { transaction: t });
    } else {
      await client.update({
        phone: phone.trim(),
        address: fullAddress,
        is_active: true,
        has_free_pickups: invitation.has_free_pickups
      }, { transaction: t });
    }

    // 2. Asignar política de precios ClientPricing
    await ClientPricing.create({
      pricing_id: uuidv4(),
      client_id: client.client_id,
      base_price: invitation.base_price,
      valid_from: new Date(),
      valid_to: null
    }, { transaction: t });

    // 3. Crear usuario con rol CLIENT
    let clientRole = await Role.findOne({ where: { role_name: 'CLIENT' }, transaction: t });
    if (!clientRole) {
      clientRole = await Role.create({ role_id: uuidv4(), role_name: 'CLIENT' }, { transaction: t });
    }

    let user = await User.findOne({ where: { email: normalizedEmail }, transaction: t });
    if (!user) {
      const randomPass = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(randomPass, 10);

      user = await User.create({
        user_id: uuidv4(),
        username: normalizedEmail,
        password_hash: passwordHash,
        role_id: clientRole.role_id,
        client_id: client.client_id,
        full_name: client.client_name,
        email: normalizedEmail,
        phone: client.phone,
        is_active: true
      }, { transaction: t });
    } else {
      await user.update({
        client_id: client.client_id,
        role_id: clientRole.role_id,
        is_active: true
      }, { transaction: t });
    }

    // 4. Marcar invitación como utilizada
    await invitation.update({
      is_used: true,
      used_at: new Date(),
      client_id: client.client_id
    }, { transaction: t });

    await t.commit();

    // 5. Generar token de sesión inmediato
    const jwtToken = jwt.sign(
      {
        user_id: user.user_id,
        username: user.username,
        role: 'CLIENT',
        client_id: client.client_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    await logAudit(user.user_id, 'ACCEPT_CLIENT_INVITATION', {
      client_id: client.client_id,
      email: normalizedEmail,
      client_name: client.client_name,
      base_price: invitation.base_price
    });

    res.status(201).json({
      message: 'Registro completado exitosamente. ¡Bienvenido a León Express!',
      token: jwtToken,
      user: {
        user_id: user.user_id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: 'CLIENT',
        client_id: client.client_id,
        client: {
          client_id: client.client_id,
          client_name: client.client_name,
          email: client.email,
          phone: client.phone,
          address: client.address,
          verification_code: client.verification_code
        }
      }
    });
  } catch (error) {
    await t.rollback();
    console.error('Error al aceptar invitación de cliente:', error);
    res.status(500).json({ error: 'Error al procesar el registro de cliente', details: error.message });
  }
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags:
 *       - Autenticación
 *     summary: Obtener datos del usuario actual
 *     description: Devuelve la información del usuario autenticado a través del token JWT.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Datos del usuario.
 *       '401':
 *         description: Token no proporcionado o inválido.
 *       '403':
 *         description: Usuario desactivado.
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.user_id, {
      include: [
        { model: Role, as: 'role', attributes: ['role_name'] },
        { model: Client, as: 'client', attributes: ['client_id', 'client_name', 'address', 'phone', 'email'] }
      ],
      attributes: ['user_id', 'username', 'full_name', 'email', 'phone', 'is_active', 'client_id']
    });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'La cuenta de usuario está desactivada.' });
    }
    res.json({ 
      user_id: user.user_id, 
      username: user.username, 
      full_name: user.full_name, 
      email: user.email, 
      phone: user.phone, 
      role: user.role ? user.role.role_name : null,
      client_id: user.client_id || (user.client ? user.client.client_id : null),
      client: user.client || null
    });
  } catch (error) {
    console.error('Error al obtener datos de usuario:', error);
    res.status(500).json({ error: 'Error al obtener datos de usuario', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

/**
 * @openapi
 * /auth/password:
 *   patch:
 *     tags:
 *       - Autenticación
 *     summary: Actualizar la contraseña del usuario autenticado
 *     description: Permite al usuario cambiar su contraseña proporcionando la contraseña actual y la nueva.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *               confirmNewPassword:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Contraseña actualizada correctamente.
 *       '400':
 *         description: Error de validación o contraseña nueva inválida.
 *       '401':
 *         description: Contraseña actual incorrecta.
 *       '404':
 *         description: Usuario no encontrado.
 */
router.patch('/password', authenticateToken, validatePasswordChange, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    const user = await User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la actual' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    user.password_hash = newPasswordHash;
    await user.save();

    return res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error al actualizar la contraseña:', error);
    return res.status(500).json({ error: 'Error al actualizar la contraseña', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

module.exports = router;