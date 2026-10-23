'use strict';
const express = require('express');
const multer = require('multer');
const { Client, User, ClientLabelBranding } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const { MAX_LOGO_BYTES, normalizeLabelLogo } = require('../services/labelLogoService');

const router = express.Router();
router.use(authenticateToken, roleValidator(['CLIENT']));
// El cliente se obtiene de la sesión, nunca de los datos enviados por el navegador.
router.use(async (req, res, next) => {
  try {
    const [user, client] = await Promise.all([
      User.findByPk(req.user.user_id), Client.findByPk(req.user.client_id),
    ]);
    if (!user?.is_active || user.archived_at || !client?.is_active || String(user.client_id) !== String(client.client_id)) {
      return res.status(403).json({ error: 'Tu cuenta no tiene acceso a esta configuración.' });
    }
    next();
  } catch (error) { next(error); }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 0 } });
router.get('/', async (req, res, next) => {
  try {
    const branding = await ClientLabelBranding.findByPk(req.user.client_id);
    res.json({ logo_data_url: branding?.logo_data_url || null });
  } catch (error) { next(error); }
});
router.put('/', upload.single('logo'), async (req, res, next) => {
  try {
    const logo_data_url = await normalizeLabelLogo(req.file);
    await ClientLabelBranding.upsert({ client_id: req.user.client_id, logo_data_url });
    res.json({ logo_data_url });
  } catch (error) { next(error); }
});
router.delete('/', async (req, res, next) => {
  try {
    await ClientLabelBranding.destroy({ where: { client_id: req.user.client_id } });
    res.json({ logo_data_url: null });
  } catch (error) { next(error); }
});
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: 'Sube un único logo PNG, JPG o WebP de hasta 2 MB.' });
  }
  if (error.status === 400) return res.status(400).json({ error: error.message });
  console.error('Error al guardar el logo de etiquetas:', error.message);
  res.status(500).json({ error: 'No se pudo cargar o guardar el logo. Intenta nuevamente.' });
});
module.exports = router;
