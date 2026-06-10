const express = require('express');
const router = express.Router();
const { AuditLog, User, Role } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');

// GET /audit-log - Últimos registros de auditoría
router.get('/', authenticateToken, async (req, res) => {
  try {
    const logs = await AuditLog.findAll({
      order: [['created_at', 'DESC']],
      limit: 30,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['full_name', 'username'],
          include: [{ model: Role, as: 'role', attributes: ['role_name'] }]
        }
      ]
    });
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener logs de auditoría', details: error.message });
  }
});

module.exports = router;
