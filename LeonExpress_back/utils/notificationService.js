'use strict';

const { v4: uuidv4 } = require('uuid');
const webpush = require('web-push');
const { Notification, PushSubscription, User, Role } = require('../models');
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = require('../config/push');

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (!vapidConfigured && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
}

async function persistNotification({ userId, title, message, link }) {
  return Notification.create({
    notification_id: uuidv4(),
    user_id: userId,
    title,
    message,
    link,
  });
}

async function sendPushNotification(userId, payload) {
  ensureVapidConfigured();
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return;
  }

  const subscriptions = await PushSubscription.findAll({ where: { user_id: userId } });
  if (!subscriptions.length) {
    return;
  }

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payloadString,
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await subscription.destroy();
        } else {
          console.error(`Error enviando notificación push al usuario ${userId}:`, error);
        }
      }
    }),
  );
}

async function dispatchNotification({ userId, title, message, link = null, pushPayload, shouldSendPush = true }) {
  console.log(`💾 DISPATCH: Persisting notification in DB for user ${userId}`);
  const notification = await persistNotification({ userId, title, message, link });
  console.log(`✅ DISPATCH: Notification persisted with ID ${notification.notification_id}`);

  if (shouldSendPush) {
    console.log(`📤 DISPATCH: Preparing to send push notification to user ${userId}`);
    const payload =
      pushPayload || {
        title,
        body: message,
        data: {
          url: link,
        },
      };

    console.log(`📱 DISPATCH: Sending push with payload:`, JSON.stringify(payload, null, 2));
    await sendPushNotification(userId, payload);
    console.log(`🎯 DISPATCH: Push notification sent for user ${userId}`);
  } else {
    console.log(`⏭️  DISPATCH: Skipping push notification (shouldSendPush=false) for user ${userId}`);
  }

  return notification;
}

function queueNotification(params, { transaction } = {}) {
  console.log(`📨 QUEUE: Queuing notification for user ${params.userId}, title: "${params.title}"`);
  console.log(`📨 QUEUE: Transaction mode: ${transaction ? 'YES (afterCommit)' : 'NO (immediate)'}`);
  
  const execute = async () => {
    try {
      console.log(`🚀 EXECUTE: Starting notification dispatch for user ${params.userId}`);
      await dispatchNotification(params);
      console.log(`✅ EXECUTE: Notification dispatched successfully for user ${params.userId}`);
    } catch (error) {
      console.error(`❌ EXECUTE: Error despachando notificación para user ${params.userId}:`, error);
    }
  };

  if (transaction) {
    console.log(`⏳ QUEUE: Registering afterCommit callback for user ${params.userId}`);
    transaction.afterCommit(() => {
      console.log(`🔄 COMMIT: Transaction committed, executing notification for user ${params.userId}`);
      execute();
    });
    return;
  }

  console.log(`⚡ QUEUE: Executing immediately for user ${params.userId}`);
  return execute();
}

async function queueNotificationForUsers(userIds, params, options = {}) {
  if (!Array.isArray(userIds) || !userIds.length) {
    return;
  }
  return Promise.all(userIds.map((userId) => queueNotification({ ...params, userId }, options)));
}

async function getUserIdsByRole(roleName) {
  const users = await User.findAll({
    include: [
      {
        model: Role,
        as: 'role',
        where: { role_name: roleName },
        attributes: [],
      },
    ],
    attributes: ['user_id'],
  });

  return users.map((user) => user.user_id);
}

async function queueNotificationForRole(roleName, params, options = {}) {
  const userIds = await getUserIdsByRole(roleName);
  if (!userIds.length) {
    return;
  }
  return queueNotificationForUsers(userIds, params, options);
}

module.exports = {
  queueNotification,
  queueNotificationForUsers,
  queueNotificationForRole,
};
