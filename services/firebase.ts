/**
 * Firebase initialization for iOS and Android
 * This file initializes Firebase when the app starts
 */

import { Platform } from 'react-native';

// Firebase is automatically initialized when the app starts
// The GoogleService-Info.plist (iOS) and google-services.json (Android) files
// are automatically read by the native Firebase SDK

let firebaseApp: any = null;
let firebaseMessaging: any = null;

try {
  const firebase = require('@react-native-firebase/app').default;
  const messaging = require('@react-native-firebase/messaging').default;
  
  // Export Firebase app instance
  firebaseApp = firebase.app();
  
  // Export messaging instance for push notifications
  firebaseMessaging = messaging();
  
  console.log('[Firebase] Firebase modules loaded successfully');
} catch (error) {
  console.warn('[Firebase] Firebase modules not available:', error);
  // Firebase might not be properly configured yet - this is okay during development
}

export { firebaseApp, firebaseMessaging };

// Request notification permissions (iOS)
export const requestNotificationPermission = async () => {
  if (!firebaseMessaging) {
    console.warn('[Firebase] Messaging not available');
    return false;
  }
  
  if (Platform.OS === 'ios') {
    try {
      const messaging = require('@react-native-firebase/messaging').default;
      const authStatus = await messaging().requestPermission();
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
    // Android permissions are handled automatically
    return true;
  }
};

// Get FCM token for push notifications
export const getFCMToken = async () => {
  if (!firebaseMessaging) {
    console.warn('[Firebase] Messaging not available');
    return null;
  }
  
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    const token = await messaging().getToken();
    console.log('[Firebase] FCM Token:', token);
    return token;
  } catch (error) {
    console.error('[Firebase] Error getting FCM token:', error);
    return null;
  }
};

// Set up background message handler
if (firebaseMessaging) {
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
      console.log('[Firebase] Message handled in the background!', remoteMessage);
    });

    // Set up foreground message handler
    messaging().onMessage(async (remoteMessage: any) => {
      console.log('[Firebase] A new FCM message arrived!', JSON.stringify(remoteMessage));
      // You can show a local notification here if needed
    });

    // Handle notification when app is opened from quit state
    messaging()
      .getInitialNotification()
      .then((remoteMessage: any) => {
        if (remoteMessage) {
          console.log('[Firebase] Notification caused app to open from quit state:', remoteMessage);
        }
      });

    // Handle notification when app is opened from background
    messaging().onNotificationOpenedApp((remoteMessage: any) => {
      console.log('[Firebase] Notification caused app to open from background state:', remoteMessage);
    });
  } catch (error) {
    console.warn('[Firebase] Error setting up message handlers:', error);
  }
}

console.log('[Firebase] Firebase initialization complete');
