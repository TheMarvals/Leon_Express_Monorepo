'use strict';
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');
const { createClientPackageService } = require('../services/clientPackageService');
const service = createClientPackageService(require('../models'));
router.use(authenticateToken, roleValidator(['CLIENT']));
router.put('/:id', async (req, res, next) => {
  try { res.json(await service.update(req.user, req.params.id, req.body)); } catch (error) { next(error); }
});
router.delete('/:id', async (req, res, next) => {
  try { res.json(await service.remove(req.user, req.params.id)); } catch (error) { next(error); }
});
router.use((error, req, res, next) => {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error('Error al modificar envío del cliente:', error.message);
  res.status(500).json({ error: 'No se pudo modificar el envío. Intenta nuevamente.' });
});
module.exports = router;
