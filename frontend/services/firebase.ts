/**
 * Firebase initialization for iOS and Android
 * This file initializes Firebase when the app starts
 */

import { Platform } from 'react-native';

// Firebase is automatically initialized when the app starts
// The GoogleService-Info.plist (iOS) and google-services.json (Android) files
// are automatically read by the native Firebase SDK

/**
 * Get Firebase Messaging instance lazily.
 * This avoids module-level initialization timing issues.
 */
function getMessagingInstance() {
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    return messaging();
  } catch (error) {
    console.warn('[Firebase] Could not get messaging instance:', error);
    return null;
  }
}

// Request notification permissions
export const requestNotificationPermission = async () => {
  const messagingInstance = getMessagingInstance();
  if (!messagingInstance) {
    console.warn('[Firebase] Messaging not available');
    return false;
  }
  
  if (Platform.OS === 'ios') {
    try {
      const messaging = require('@react-native-firebase/messaging').default;
      const authStatus = await messagingInstance.requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('[Firebase] Notification permission granted');
        return true;
      } else {
        console.log('[Firebase] Notification permission denied');
        return false;
      }
    } catch (error) {
      console.error('[Firebase] Error requesting notification permission:', error);
      return false;
    }
  } else {
    // Android 13+ requires POST_NOTIFICATIONS permission (already in AndroidManifest)
    // For FCM, we just need to check if messaging is available
    try {
      const messaging = require('@react-native-firebase/messaging').default;
      const authStatus = await messagingInstance.requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      console.log('[Firebase] Android notification permission:', enabled ? 'granted' : 'denied');
      return enabled;
    } catch (error) {
      // On older Android, permissions are granted at install time
      console.log('[Firebase] Android: assuming permission granted (pre-13 or already granted)');
      return true;
    }
  }
};

// Get FCM token for push notifications
export const getFCMToken = async () => {
  const messagingInstance = getMessagingInstance();
  if (!messagingInstance) {
    console.warn('[Firebase] Messaging not available for getToken');
    return null;
  }
  
  try {
    const token = await messagingInstance.getToken();
    console.log('[Firebase] FCM Token:', token ? token.slice(0, 20) + '…' : 'null');
    return token;
  } catch (error) {
    console.error('[Firebase] Error getting FCM token:', error);
    return null;
  }
};

// Set up background/foreground message handlers
try {
  const messaging = require('@react-native-firebase/messaging').default;
  
  messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
    console.log('[Firebase] Message handled in the background!', remoteMessage);
  });

  messaging().onMessage(async (remoteMessage: any) => {
    console.log('[Firebase] A new FCM message arrived!', JSON.stringify(remoteMessage));
  });

  messaging()
    .getInitialNotification()
    .then((remoteMessage: any) => {
      if (remoteMessage) {
        console.log('[Firebase] Notification caused app to open from quit state:', remoteMessage);
      }
    });

  messaging().onNotificationOpenedApp((remoteMessage: any) => {
    console.log('[Firebase] Notification caused app to open from background state:', remoteMessage);
  });

  console.log('[Firebase] Message handlers set up successfully');
} catch (error) {
  console.warn('[Firebase] Error setting up message handlers:', error);
}

/**
 * Register the device's FCM token with the backend.
 * Call this after the user logs in so the server can send push notifications.
 *
 * @param authToken - JWT auth token for the API call
 */
export const registerFCMToken = async (authToken: string) => {
  console.log('[Firebase] registerFCMToken called');
  try {
    // 1. Request notification permission
    console.log('[Firebase] Step 1: Requesting notification permission...');
    const permissionGranted = await requestNotificationPermission();
    console.log('[Firebase] Step 1 result: permission =', permissionGranted);
    if (!permissionGranted) {
      console.warn('[Firebase] Notification permission not granted – skipping FCM registration');
      return;
    }

    // 2. Get the FCM device token
    console.log('[Firebase] Step 2: Getting FCM token...');
    const fcmToken = await getFCMToken();
    console.log('[Firebase] Step 2 result: token =', fcmToken ? fcmToken.slice(0, 20) + '…' : 'null');
    if (!fcmToken) {
      console.warn('[Firebase] Could not get FCM token – skipping registration');
      return;
    }

    // 3. Send the token to the backend
    const { API_BASE_URL } = require('./api');
    const url = `${API_BASE_URL}/api/user/fcm-token`;
    console.log('[Firebase] Step 3: Sending token to backend:', url);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        token: fcmToken,
        platform: Platform.OS,
      }),
    });

    if (response.ok) {
      console.log('[Firebase] ✅ FCM token registered with backend successfully');
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Firebase] ❌ Failed to register FCM token:', response.status, errorData);
    }
  } catch (error) {
    console.error('[Firebase] ❌ Error registering FCM token:', error);
  }
};

console.log('[Firebase] Firebase service loaded');
