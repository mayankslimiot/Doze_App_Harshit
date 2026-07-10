#!/usr/bin/env node
/**
 * Send dummy FCM push notification from backend:
 * "Your bed just texted us. It misses you. Open Dozemate and go say hi."
 *
 * Usage:
 *   1. Send to ALL users in DB who have registered FCM tokens:
 *        node scripts/sendDummyBedNotification.js
 *
 *   2. Send to a specific user by email:
 *        node scripts/sendDummyBedNotification.js user@example.com
 *
 *   3. Send directly to a specific FCM device token string:
 *        node scripts/sendDummyBedNotification.js <FCM_TOKEN_STRING>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const admin = require('../config/firebaseAdmin');
const User = require('../models/User');

const TITLE = '😴 Dozemate Reminder';
const BODY = 'Your bed just texted us. It misses you. Open Dozemate and go say hi.';

async function sendToToken(token, label = 'device', userId = null) {
  const message = {
    token,
    notification: {
      title: TITLE,
      body: BODY,
    },
    data: {
      type: 'dummy_bed_reminder',
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'default',
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1,
        },
      },
    },
  };

  try {
    const messageId = await admin.messaging().send(message);
    console.log(`   ✅ Sent to ${label} (${token.slice(0, 15)}...): Message ID -> ${messageId}`);
    return true;
  } catch (err) {
    const errorCode = err.code || err.message;
    console.error(`   ❌ Failed to send to ${label} (${token.slice(0, 15)}...):`, errorCode);

    // If token is unregistered/stale, clean it up from User doc in MongoDB
    if (
      userId &&
      ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(errorCode)
    ) {
      try {
        await User.findByIdAndUpdate(userId, { $pull: { fcmTokens: { token } } });
        console.log(`      🗑️ Removed stale token from database.`);
      } catch (cleanErr) {
        // ignore cleanup error
      }
    }

    return false;
  }
}

async function main() {
  const arg = process.argv[2];

  if (!admin.apps.length) {
    console.error('❌ Firebase Admin SDK failed to initialize. Check your service account JSON.');
    process.exit(1);
  }

  console.log('========================================================');
  console.log(`📨 FCM Dummy Notification Script`);
  console.log(`   Title : "${TITLE}"`);
  console.log(`   Body  : "${BODY}"`);
  console.log('========================================================\n');

  // Case 1: If argument passed looks like an FCM token string (long string without '@')
  if (arg && !arg.includes('@') && arg.length > 50) {
    console.log('🎯 Direct FCM Token provided as argument.');
    await sendToToken(arg, 'Direct Token');
    process.exit(0);
  }

  // Otherwise connect to MongoDB to find user(s) and their saved FCM tokens
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dozemate';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB\n');

  let users = [];

  if (arg && arg.includes('@')) {
    // Case 2: Email provided
    console.log(`🔍 Looking for user with email: ${arg}`);
    const user = await User.findOne({ email: arg.toLowerCase().trim() });
    if (!user) {
      console.error(`❌ No user found with email "${arg}"`);
      await mongoose.disconnect();
      process.exit(1);
    }
    users = [user];
  } else {
    // Case 3: No argument -> find ALL users with non-empty fcmTokens array
    console.log('🔍 Finding all users with registered FCM tokens...');
    users = await User.find({ 'fcmTokens.0': { $exists: true } });
  }

  if (users.length === 0) {
    console.log('⚠️ No users found with registered FCM tokens in database.');
    console.log('💡 Hint: Log in on the frontend app on a physical device/emulator to register an FCM token first.');
    await mongoose.disconnect();
    process.exit(0);
  }

  let totalSent = 0;
  let totalFailed = 0;

  for (const user of users) {
    console.log(`👤 User: ${user.name || user.email} (${user.email}) - Tokens: ${user.fcmTokens.length}`);
    for (const tokenObj of user.fcmTokens) {
      const success = await sendToToken(
        tokenObj.token,
        `${user.email} [${tokenObj.platform || 'device'}]`,
        user._id
      );
      if (success) totalSent++;
      else totalFailed++;
    }
  }

  console.log('\n========================================================');
  console.log(`📊 Summary: ${totalSent} successful, ${totalFailed} failed.`);
  console.log('========================================================');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
