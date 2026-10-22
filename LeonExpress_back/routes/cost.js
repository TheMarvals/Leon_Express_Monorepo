'use strict';

const router = require('express').Router();
const { Cost } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');
const roleValidator = require('../middlewares/roleValidator');

router.get('/', authenticateToken, roleValidator(['ADMIN', 'WAREHOUSE_STAFF']), async (req, res) => {
  try {
    res.json(await Cost.findAll({ order: [['cost_name', 'ASC']] }));
  } catch (error) {
    console.error('Error al consultar costos:', error.message);
    res.status(500).json({ error: 'No se pudieron consultar los costos adicionales.' });
  }
});

module.exports = router;
