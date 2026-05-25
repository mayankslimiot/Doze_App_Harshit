#!/usr/bin/env node
/**
 * Send a test FCM push notification.
 *
 * Usage:
 *   node scripts/sendTestNotification.js <FCM_TOKEN>
 *   node scripts/sendTestNotification.js <FCM_TOKEN> "Custom title" "Custom body"
 */
require('dotenv').config();
const admin = require('../config/firebaseAdmin');

async function main() {
  const token = process.argv[2];
  const title = process.argv[3] || '🔔 Dozemate Test';
  const body  = process.argv[4] || 'If you see this, FCM is working!';

  if (!token) {
    console.error('Usage: node scripts/sendTestNotification.js <FCM_TOKEN> [title] [body]');
    process.exit(1);
  }

  if (!admin.apps.length) {
    console.error('❌ Firebase Admin SDK failed to initialise. Check your service account key.');
    process.exit(1);
  }

  console.log('📨 Sending test notification …');
  console.log(`   Token : ${token.slice(0, 20)}…`);
  console.log(`   Title : ${title}`);
  console.log(`   Body  : ${body}`);

  try {
    const messageId = await admin.messaging().send({
      token,
      notification: { title, body },
      android: { priority: 'high', notification: { channelId: 'default', sound: 'default' } },
      apns:    { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    console.log(`✅ Success! Message ID: ${messageId}`);
  } catch (err) {
    console.error('❌ Failed:', err.code, err.message);
    process.exit(1);
  }
}

main();
