// Contenido completo y final para routes/auth.js
'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User, Role } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const rateLimit = require('express-rate-limit');
const { logAudit } = require('../utils/audit');

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
      include: [{ model: Role, as: 'role', attributes: ['role_id', 'role_name'] }],
      attributes: ['user_id', 'username', 'password_hash', 'full_name', 'is_active']
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
      { user_id: user.user_id, username: user.username, role: user.role ? user.role.role_name : null },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Log del login exitoso
    await logAudit(user.user_id, 'LOGIN', { 
      username: user.username, 
      full_name: user.full_name,
      role: user.role ? user.role.role_name : null,
      ip: req.ip || req.connection.remoteAddress
    });

    res.json({
      token,
      user: { user_id: user.user_id, username: user.username, full_name: user.full_name, role: user.role ? user.role.role_name : null }
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
      include: [{ model: Role, as: 'role', attributes: ['role_name'] }],
      attributes: ['user_id', 'username', 'full_name', 'email', 'phone', 'is_active']
    });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    if(!user.is_active) {
        return res.status(403).json({ error: 'La cuenta de usuario está desactivada.' });
    }
    res.json({ user_id: user.user_id, username: user.username, full_name: user.full_name, email: user.email, phone: user.phone, role: user.role ? user.role.role_name : null });
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