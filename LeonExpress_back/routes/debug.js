const express = require('express');
const router = express.Router();
const { queueNotification } = require('../utils/notificationService');
const { PushSubscription } = require('../models');
const authenticateToken = require('../middlewares/authenticateToken');

// Endpoint para probar notificación directa a un usuario específico
router.post('/test-notification/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { title = 'Prueba Debug', message = 'Esta es una notificación de debug' } = req.body;

    console.log(`🐛 DEBUG: Enviando notificación de prueba al usuario ${userId}`);

    // Verificar si el usuario tiene suscripciones
    const subscriptions = await PushSubscription.findAll({ where: { user_id: userId } });
    console.log(`🐛 DEBUG: Usuario ${userId} tiene ${subscriptions.length} suscripciones`);

    if (subscriptions.length > 0) {
      subscriptions.forEach((sub, index) => {
        console.log(`🐛 DEBUG: Suscripción ${index + 1}: ${sub.endpoint.substring(0, 50)}...`);
      });
    }

    // Enviar notificación
    await queueNotification({
      userId,
      title,
      message,
      link: '/debug-test'
    });

    console.log(`🐛 DEBUG: Notificación enviada correctamente`);

    res.json({
      success: true,
      message: 'Notificación de debug enviada',
      userId,
      subscriptionsFound: subscriptions.length
    });

  } catch (error) {
    console.error('🐛 DEBUG ERROR:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para listar todas las suscripciones
router.get('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const subscriptions = await PushSubscription.findAll({
      attributes: ['user_id', 'endpoint', 'created_at', 'updated_at']
    });

    const formattedSubs = subscriptions.map(sub => ({
      user_id: sub.user_id,
      endpoint_preview: sub.endpoint.substring(0, 50) + '...',
      created_at: sub.created_at,
      updated_at: sub.updated_at
    }));

    res.json({ subscriptions: formattedSubs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para limpiar suscripciones duplicadas
router.post('/clean-duplicate-subscriptions', authenticateToken, async (req, res) => {
  try {
    console.log('🧹 DEBUG: Limpiando suscripciones duplicadas...');

    // Obtener todas las suscripciones agrupadas por user_id
    const allSubs = await PushSubscription.findAll({
      order: [['created_at', 'DESC']] // Las más recientes primero
    });

    const userGroups = {};
    allSubs.forEach(sub => {
      if (!userGroups[sub.user_id]) {
        userGroups[sub.user_id] = [];
      }
      userGroups[sub.user_id].push(sub);
    });

    let deletedCount = 0;

    // Para cada usuario, mantener solo la suscripción más reciente
    for (const [userId, subs] of Object.entries(userGroups)) {
      if (subs.length > 1) {
        const [keepSub, ...deleteSubs] = subs; // Mantener la primera (más reciente)

        for (const oldSub of deleteSubs) {
          await oldSub.destroy();
          deletedCount++;
        }

        console.log(`🧹 Usuario ${userId}: Mantenida 1, eliminadas ${deleteSubs.length}`);
      }
    }

    res.json({
      success: true,
      message: `Limpieza completada. ${deletedCount} suscripciones duplicadas eliminadas.`,
      deletedCount
    });

  } catch (error) {
    console.error('Error limpiando duplicados:', error);
    res.status(500).json({ error: error.message });
  }
});

// Extraemos la logica de fix_missing_period.js para poder llamarla por API
const createMissingNextPeriod = require('../migrations/fix_missing_period');

// Endpoint para arreglar el periodo faltante
// Llamar con GET http://ip/api/debug/fix-period
router.get('/fix-period', async (req, res) => {
  try {
    console.log('🛠️ Ejecutando fix-period por HTTP...');
    await createMissingNextPeriod();
    res.json({ success: true, message: 'Operación ejecutada. Revisa los logs para más detalles.' });
  } catch (error) {
    console.error('Error en fix-period:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;