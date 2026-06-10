const express = require('express');
const router = express.Router();
const { DriverPayout } = require('../models');
const { Op } = require('sequelize');

// GET /revenues?userId=xxx
router.get('/', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'userId es requerido' });
  }
  try {
    const { DriverPayout, PayoutItem } = require('../models');
    // Buscar todos los payouts del driver
    const payouts = await DriverPayout.findAll({
      where: { user_id: userId },
      attributes: ['payout_id', 'payout_date'],
      raw: true
    });
    const payoutIds = payouts.map(p => p.payout_id);
    if (payoutIds.length === 0) {
      return res.json([]);
    }
    // Buscar todos los payout_items asociados a esos payouts
    const items = await PayoutItem.findAll({
      where: { payout_id: payoutIds },
      attributes: ['amount', 'payout_id'],
      raw: true
    });
    // Unir payout_date a cada item
    const itemsWithDate = items.map(item => {
      const payout = payouts.find(p => p.payout_id === item.payout_id);
      return {
        ...item,
        payout_date: payout ? payout.payout_date : null
      };
    }).filter(item => item.payout_date);
    // Agrupar por mes/año y sumar
    const grouped = {};
    for (const item of itemsWithDate) {
      const date = new Date(item.payout_date);
      const year = date.getFullYear();
      const monthIndex = date.getMonth(); // 0-11
      const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`; // "YYYY-MM"

      if (!grouped[key]) {
        grouped[key] = {
          month: date.toLocaleString('es-CL', { month: 'short' }),
          year: year,
          earning: 0,
          sortKey: date.getTime()
        };
      }
      grouped[key].earning += Number(item.amount);
    }

    // Formatear y ordenar cronológicamente
    const result = Object.values(grouped)
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(item => ({
        month: `${item.month} ${item.year}`,
        earning: item.earning,
        expenses: 0
      }));

    res.json(result);
  } catch (error) {
    console.error('Error al obtener revenues:', error);
    res.status(500).json({ error: 'Error al obtener revenues' });
  }
});

module.exports = router;
