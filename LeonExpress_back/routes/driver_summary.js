const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const sequelize = require('../config/database');

router.get('/', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const { DriverPayout, PayoutItem, Package, Delivery, Pickup, PackageCost } = require('../models');

    // Get payouts for user (para estadísticas totales)
    const payouts = await DriverPayout.findAll({ where: { user_id: userId }, attributes: ['payout_id', 'payout_date'], raw: true });
    const payoutIds = payouts.map(p => p.payout_id);

    let totalEarnings = 0;
    let packagesDelivered = 0;
    let pickups = 0;
    let monthly = [];

    if (payoutIds.length > 0) {
      const items = await PayoutItem.findAll({ where: { payout_id: payoutIds }, attributes: ['amount', 'package_id', 'pickup_id', 'payout_id'], raw: true });
      totalEarnings = items.reduce((s, it) => s + Number(it.amount || 0), 0);
      packagesDelivered = items.filter(it => it.package_id).length;
      pickups = items.filter(it => it.pickup_id).length;

      // monthly breakdown (group by payout_date from payouts list)
      const itemsWithDate = items.map(it => {
        const p = payouts.find(pp => pp.payout_id === it.payout_id);
        return { ...it, payout_date: p ? p.payout_date : null };
      }).filter(it => it.payout_date);
      const monthlyMap = {};
      for (const it of itemsWithDate) {
        const month = new Date(it.payout_date).toLocaleString('en-US', { month: 'short' });
        monthlyMap[month] = (monthlyMap[month] || 0) + Number(it.amount || 0);
      }
      monthly = Object.entries(monthlyMap).map(([month, earning]) => ({ month, earning }));
    }

    // Calcular ganancias diarias basadas en entregas y recolecciones reales
    // Obtener las últimas 30 días de ganancias diarias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Ganancias por entregas (delivery_cost de paquetes entregados)
    const deliveriesQuery = `
      SELECT 
        DATE(d.attempted_at) as date,
        COALESCE(SUM(p.delivery_cost), 0) as delivery_earnings,
        COUNT(DISTINCT p.package_id) as deliveries_count
      FROM deliveries d
      INNER JOIN packages p ON d.package_id = p.package_id
      WHERE d.user_id = :userId
        AND d.status_at_delivery = 'ENTREGADO'
        AND DATE(d.attempted_at) >= :startDate
      GROUP BY DATE(d.attempted_at)
      ORDER BY DATE(d.attempted_at) DESC
    `;

    const deliveriesResults = await sequelize.query(deliveriesQuery, {
      replacements: { userId, startDate: thirtyDaysAgo.toISOString().split('T')[0] },
      type: sequelize.QueryTypes.SELECT
    });

    // Ganancias por recolecciones (pickup_cost de recolecciones verificadas)
    const pickupsQuery = `
      SELECT 
        DATE(p.verified_at_warehouse_at) as date,
        COALESCE(SUM(p.pickup_cost), 0) as pickup_earnings,
        COUNT(DISTINCT p.pickup_id) as pickups_count
      FROM pickups p
      WHERE p.user_id = :userId
        AND p.status = 'VERIFICADO_EN_ALMACEN'
        AND p.verified_at_warehouse_at IS NOT NULL
        AND DATE(p.verified_at_warehouse_at) >= :startDate
      GROUP BY DATE(p.verified_at_warehouse_at)
      ORDER BY DATE(p.verified_at_warehouse_at) DESC
    `;

    const pickupsResults = await sequelize.query(pickupsQuery, {
      replacements: { userId, startDate: thirtyDaysAgo.toISOString().split('T')[0] },
      type: sequelize.QueryTypes.SELECT
    });

    // Ganancias por créditos al conductor (package_costs con cost_type = 'DRIVER_CREDIT')
    const creditsQuery = `
      SELECT 
        DATE(d.attempted_at) as date,
        COALESCE(SUM(pc.applied_value), 0) as credit_earnings
      FROM package_costs pc
      INNER JOIN packages p ON pc.package_id = p.package_id
      INNER JOIN deliveries d ON p.package_id = d.package_id
      WHERE d.user_id = :userId
        AND pc.cost_type = 'DRIVER_CREDIT'
        AND d.status_at_delivery = 'ENTREGADO'
        AND DATE(d.attempted_at) >= :startDate
      GROUP BY DATE(d.attempted_at)
      ORDER BY DATE(d.attempted_at) DESC
    `;

    const creditsResults = await sequelize.query(creditsQuery, {
      replacements: { userId, startDate: thirtyDaysAgo.toISOString().split('T')[0] },
      type: sequelize.QueryTypes.SELECT
    });

    // Combinar todas las ganancias diarias
    const dailyEarningsMap = {};

    // Agregar entregas
    deliveriesResults.forEach((row) => {
      const date = row.date;
      if (!dailyEarningsMap[date]) {
        dailyEarningsMap[date] = {
          date,
          total_earnings: 0,
          delivery_earnings: 0,
          pickup_earnings: 0,
          credit_earnings: 0,
          deliveries_count: 0,
          pickups_count: 0
        };
      }
      dailyEarningsMap[date].delivery_earnings = Number(row.delivery_earnings || 0);
      dailyEarningsMap[date].deliveries_count = Number(row.deliveries_count || 0);
    });

    // Agregar recolecciones
    pickupsResults.forEach((row) => {
      const date = row.date;
      if (!dailyEarningsMap[date]) {
        dailyEarningsMap[date] = {
          date,
          total_earnings: 0,
          delivery_earnings: 0,
          pickup_earnings: 0,
          credit_earnings: 0,
          deliveries_count: 0,
          pickups_count: 0
        };
      }
      dailyEarningsMap[date].pickup_earnings = Number(row.pickup_earnings || 0);
      dailyEarningsMap[date].pickups_count = Number(row.pickups_count || 0);
    });

    // Agregar créditos
    creditsResults.forEach((row) => {
      const date = row.date;
      if (!dailyEarningsMap[date]) {
        dailyEarningsMap[date] = {
          date,
          total_earnings: 0,
          delivery_earnings: 0,
          pickup_earnings: 0,
          credit_earnings: 0,
          deliveries_count: 0,
          pickups_count: 0
        };
      }
      dailyEarningsMap[date].credit_earnings = Number(row.credit_earnings || 0);
    });

    // Calcular total diario y convertir a array
    const dailyEarnings = Object.values(dailyEarningsMap).map((day) => {
      day.total_earnings = day.delivery_earnings + day.pickup_earnings + day.credit_earnings;
      return day;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      total_earnings: totalEarnings,
      packages_delivered: packagesDelivered,
      pickups,
      monthly,
      daily_earnings: dailyEarnings
    });
  } catch (error) {
    console.error('Error in driver summary:', error);
    res.status(500).json({ error: 'internal' });
  }
});

module.exports = router;
