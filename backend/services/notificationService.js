/**
 * FCM Push Notification Service
 *
 * Provides helpers to send push notifications via Firebase Cloud Messaging.
 * Automatically cleans up stale / unregistered tokens.
 */
const admin = require('../config/firebaseAdmin');
const User = require('../models/User');
const { logger } = require('../utils/logger');

// ─────────────────────── helpers ───────────────────────

/**
 * Remove an invalid FCM token from a user's stored tokens.
 */
async function removeStaleToken(userId, staleToken) {
  try {
    await User.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { token: staleToken } },
    });
    logger.info('🗑️ Removed stale FCM token', { userId, token: staleToken.slice(0, 12) + '…' });
  } catch (err) {
    logger.err(err, { where: 'removeStaleToken', userId });
  }
}

/**
 * Check whether an FCM error means the token should be removed.
 */
function isTokenUnregistered(errorCode) {
  return [
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument',
  ].includes(errorCode);
}

// ─────────────────────── public API ───────────────────────

/**
 * Send a push notification to a single FCM token.
 *
 * @param {string} token  - FCM registration token
 * @param {{ title: string, body: string }} notification
 * @param {object} [data] - optional key-value data payload
 * @returns {Promise<string|null>} message ID on success, null on failure
 */
async function sendToDevice(token, notification, data = {}) {
  if (!admin.apps.length) {
    logger.warn('Firebase Admin not initialised – skipping notification');
    return null;
  }

  const message = {
    token,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: data ? Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ) : undefined,
    android: {
      priority: 'high',
      notification: { channelId: 'default', sound: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  };

  try {
    const messageId = await admin.messaging().send(message);
    logger.info('📨 FCM sent', { messageId, token: token.slice(0, 12) + '…' });
    return messageId;
  } catch (err) {
    logger.err(err, { where: 'sendToDevice', token: token.slice(0, 12) + '…' });
    return null;
  }
}

/**
 * Send a push notification to ALL registered devices of a given user.
 *
 * @param {string} userId - Mongo _id of the User
 * @param {{ title: string, body: string }} notification
 * @param {object} [data]  - optional data payload
 * @returns {Promise<{ success: number, failure: number }>}
 */
async function sendToUser(userId, notification, data = {}) {
  if (!admin.apps.length) {
    logger.warn('Firebase Admin not initialised – skipping notification');
    return { success: 0, failure: 0 };
  }

  const user = await User.findById(userId).select('fcmTokens');
  if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
    logger.info('No FCM tokens for user', { userId });
    return { success: 0, failure: 0 };
  }

  const tokens = user.fcmTokens.map((t) => t.token);
  const messages = tokens.map((token) => ({
    token,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: data ? Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ) : undefined,
    android: {
      priority: 'high',
      notification: { channelId: 'default', sound: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  }));

  try {
    const response = await admin.messaging().sendEach(messages);

    // Clean up stale tokens
    response.responses.forEach((resp, idx) => {
      if (resp.error && isTokenUnregistered(resp.error.code)) {
        removeStaleToken(userId, tokens[idx]);
      }
    });

    const result = {
      success: response.successCount,
      failure: response.failureCount,
    };
    logger.info('📨 FCM sendToUser', { userId, ...result });
    return result;
  } catch (err) {
    logger.err(err, { where: 'sendToUser', userId });
    return { success: 0, failure: 0 };
  }
}

/**
 * Send a push notification to a topic (all subscribers).
 *
 * @param {string} topic   - FCM topic name
 * @param {{ title: string, body: string }} notification
 * @param {object} [data]
 */
async function sendToTopic(topic, notification, data = {}) {
  if (!admin.apps.length) {
    logger.warn('Firebase Admin not initialised – skipping notification');
    return null;
  }

  const message = {
    topic,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: data ? Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    ) : undefined,
  };

  try {
    const messageId = await admin.messaging().send(message);
    logger.info('📨 FCM topic sent', { topic, messageId });
    return messageId;
  } catch (err) {
    logger.err(err, { where: 'sendToTopic', topic });
    return null;
  }
}

module.exports = {
  sendToDevice,
  sendToUser,
  sendToTopic,
};
