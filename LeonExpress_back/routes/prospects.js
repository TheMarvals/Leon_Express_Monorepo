'use strict';
const express = require('express');
const { createHash, randomUUID } = require('node:crypto');
const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { Prospect, SystemConfig, User, Role } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const { queueNotification } = require('../utils/notificationService');
const { logAudit } = require('../utils/audit');
const emailService = require('../services/emailService');
const router = express.Router();
const RECIPIENT_KEY = 'PROSPECT_NOTIFICATION_ADMIN';
const VOLUMES = ['Menos de 10', '10 a 50', '51 a 100', 'Más de 100', 'Estoy comenzando'];
const accepted = { message: 'Recibimos tu solicitud. Nuestro equipo se pondrá en contacto contigo.' };
const adminQuery = () => ({ where: { is_active: true, archived_at: null }, include: [{ model: Role, as: 'role', where: { role_name: 'ADMIN' }, attributes: [] }], attributes: ['user_id', 'full_name', 'email'], order: [['full_name', 'ASC']] });

router.post('/', rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Has enviado varias solicitudes. Intenta nuevamente más tarde.' } }),
  // Campo invisible para personas, descartado antes de enviar avisos o guardar datos.
  (req, res, next) => req.body.website ? res.status(202).json(accepted) : next(),
  body('company').isString().trim().isLength({ min: 2, max: 120 }),
  body('contact_name').isString().trim().isLength({ min: 2, max: 100 }),
  body('email').isString().trim().isLength({ max: 100 }).isEmail().customSanitizer(v => v.toLowerCase()),
  body('phone').isString().trim().matches(/^\+?[\d ()-]{8,20}$/),
  body('commune').isString().trim().isLength({ min: 2, max: 100 }),
  body('volume').isIn(VOLUMES),
  body('message').optional().isString().trim().isLength({ max: 2000 }),
  body('consent').equals('true'),
  async (req, res) => {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Revisa los datos de contacto y acepta que te contactemos.' });
    try {
      const { company, contact_name, email, phone, commune, volume, message = '' } = req.body;
      // Evita avisos duplicados por reintentos, incluso entre instancias del backend.
      const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      const dedupe_key = createHash('sha256').update(`${email}:${day}`).digest('hex');
      let prospect;
      try {
        prospect = await Prospect.create({ prospect_id: randomUUID(), dedupe_key, company, contact_name, email, phone, commune, volume, message });
      } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') return res.status(202).json(accepted);
        throw error;
      }
      // La solicitud ya está guardada. Un fallo del proveedor nunca provoca su pérdida.
      try {
        const admins = await User.findAll(adminQuery());
        await Promise.allSettled(admins.map(admin => queueNotification({ userId: admin.user_id, title: 'Nueva solicitud comercial', message: `${company} quiere trabajar con León Express.`, link: '/prospects' })));
        const config = await SystemConfig.findByPk(RECIPIENT_KEY);
        const recipient = admins.find(admin => admin.user_id === config?.config_value && admin.email);
        let email_status = 'NOT_CONFIGURED';
        if (recipient) {
          const result = await emailService.sendProspectNotification({ to: recipient.email, prospect });
          email_status = result.success && !result.simulated ? 'SENT' : 'FAILED';
        }
        await prospect.update({ email_status });
      } catch (error) {
        console.error('No se pudo notificar la solicitud comercial:', error.message);
        await prospect.update({ email_status: 'FAILED' }).catch(() => {});
      }
      return res.status(202).json(accepted);
    } catch (error) {
      console.error('Error guardando solicitud comercial:', error.message);
      return res.status(500).json({ error: 'No pudimos guardar tu solicitud. Intenta nuevamente.' });
    }
  });

router.use(authenticateToken, roleValidator(['ADMIN']));
// También valida el estado vigente de la cuenta, aunque el JWT aún no haya expirado.
router.use(async (req, res, next) => {
  try {
    const admin = await User.findOne({ ...adminQuery(), where: { ...adminQuery().where, user_id: req.user.user_id } });
    if (!admin) return res.status(403).json({ error: 'Se requiere una cuenta administradora activa.' });
    next();
  } catch { res.status(500).json({ error: 'No se pudieron verificar los permisos.' }); }
});

router.get('/settings', async (req, res) => {
  try {
    const [admins, config, pending] = await Promise.all([User.findAll(adminQuery()), SystemConfig.findByPk(RECIPIENT_KEY), Prospect.count({ where: { status: 'NEW' } })]);
    res.json({ recipient_user_id: config?.config_value || '', admins, pending });
  } catch { res.status(500).json({ error: 'No se pudo cargar la configuración de avisos.' }); }
});
router.put('/settings', async (req, res) => {
  try {
    const admins = await User.findAll(adminQuery());
    const recipient = admins.find(admin => admin.user_id === req.body.recipient_user_id && admin.email);
    if (!recipient) return res.status(400).json({ error: 'Selecciona un administrador activo con correo registrado.' });
    await SystemConfig.upsert({ config_key: RECIPIENT_KEY, config_value: recipient.user_id, description: 'Administrador receptor de solicitudes comerciales de la landing' });
    await logAudit(req.user.user_id, 'UPDATE_PROSPECT_RECIPIENT', { recipient_user_id: recipient.user_id });
    res.json({ recipient_user_id: recipient.user_id });
  } catch { res.status(500).json({ error: 'No se pudo guardar el receptor de avisos.' }); }
});
router.get('/', async (req, res) => {
  const status = req.query.status;
  if (status && !['NEW', 'CONTACTED', 'CLOSED'].includes(status)) return res.status(400).json({ error: 'Estado inválido.' });
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const limit = 20;
  const where = status ? { status } : {};
  if (req.query.search) {
    const search = String(req.query.search).slice(0, 100);
    where[Op.or] = ['company', 'contact_name', 'email'].map(key => ({ [key]: { [Op.like]: `%${search}%` } }));
  }
  try {
    const result = await Prospect.findAndCountAll({ where, limit, offset: (page - 1) * limit, order: [['created_at', 'DESC'], ['prospect_id', 'DESC']] });
    res.json({ items: result.rows, total: result.count, page, page_size: limit });
  } catch { res.status(500).json({ error: 'No se pudieron cargar las solicitudes.' }); }
});
router.patch('/:id', async (req, res) => {
  if (!['NEW', 'CONTACTED', 'CLOSED'].includes(req.body.status)) return res.status(400).json({ error: 'Estado inválido.' });
  try {
    const prospect = await Prospect.findByPk(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Solicitud no encontrada.' });
    await prospect.update({ status: req.body.status });
    await logAudit(req.user.user_id, 'UPDATE_PROSPECT_STATUS', { prospect_id: prospect.prospect_id, status: prospect.status });
    res.json(prospect);
  } catch { res.status(500).json({ error: 'No se pudo actualizar la solicitud.' }); }
});
module.exports = router;
