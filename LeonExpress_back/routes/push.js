const express = require('express');
const router = express.Router();
const authenticateToken = require('../middlewares/authenticateToken');
const { PushSubscription } = require('../models');
const webpush = require('web-push');
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = require('../config/push');

// Configurar VAPID
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Guardar o actualizar suscripción push
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Suscripción incompleta' });
    }
    const user_id = req.user.user_id;
    
    // Primero eliminar todas las suscripciones anteriores del usuario
    await PushSubscription.destroy({
      where: { user_id }
    });
    
    console.log(`🔄 PUSH: Limpiadas suscripciones anteriores para usuario ${user_id}`);
    
    // Crear la nueva suscripción
    await PushSubscription.create({
      user_id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth
    });
    
    console.log(`✅ PUSH: Nueva suscripción creada para usuario ${user_id}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error guardando suscripción push:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint para enviar una notificación de prueba a todas las suscripciones
router.post('/test', async (req, res) => {
  try {
    const subs = await PushSubscription.findAll();
    if (!subs.length) return res.status(404).json({ error: 'No hay suscripciones push registradas.' });

    const payload = JSON.stringify({
      title: 'Notificación de prueba',
      body: '¡Esto es una notificación push real desde Leon Express!',
      icon: '/android-chrome-192x192.png',
    });

    const results = await Promise.allSettled(
      subs.map(sub => {
        const subscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };
        return webpush.sendNotification(subscription, payload);
      })
    );

    res.json({ 
      success: true,
      sent: results.filter(r => r.status === 'fulfilled').length, 
      failed: results.filter(r => r.status === 'rejected').length 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
