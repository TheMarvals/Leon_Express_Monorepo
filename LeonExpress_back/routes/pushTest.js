const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { PushSubscription } = require('../models');
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = require('../config/push');

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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
      subs.map(sub => webpush.sendNotification(sub.data, payload))
    );

    res.json({ sent: results.filter(r => r.status === 'fulfilled').length, failed: results.filter(r => r.status === 'rejected').length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
