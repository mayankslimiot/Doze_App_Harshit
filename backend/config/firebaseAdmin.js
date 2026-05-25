/**
 * Firebase Admin SDK initialization (singleton)
 * Used for sending FCM push notifications from the backend.
 */
const admin = require('firebase-admin');
const path = require('path');
const { logger } = require('../utils/logger');

// Path to service account key (relative to backend root)
const SERVICE_ACCOUNT_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  || path.join(__dirname, '..', 'dozemate-a3574-firebase-adminsdk-fbsvc-176a469129.json');

if (!admin.apps.length) {
  try {
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    logger.info('🔥 Firebase Admin SDK initialized successfully');
  } catch (err) {
    logger.err(err, { where: 'firebaseAdmin:init' });
    // Don't crash – notifications will be unavailable but the rest of the server works
  }
}

module.exports = admin;
