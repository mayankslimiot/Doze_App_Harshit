import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface RespirationNotificationSettings {
  enabled: boolean;
  highThreshold: number; // RPM - alert when exceeded
  lowThreshold: number; // RPM - alert when below
  cooldownMinutes: number; // Minutes to wait between notifications
}

const SETTINGS_KEY = 'respiration_notification_settings';
const NOTIFICATION_STATE_KEY = 'respiration_notification_state';

// Default settings
const DEFAULT_SETTINGS: RespirationNotificationSettings = {
  enabled: false,
  highThreshold: 20,
  lowThreshold: 3,
  cooldownMinutes: 10,
};

// Track notification state to avoid duplicate notifications
interface NotificationState {
  lastHighNotification?: number; // Timestamp of last high threshold notification
  lastLowNotification?: number; // Timestamp of last low threshold notification
  wasAboveHigh?: boolean; // Was last reading above high threshold?
  wasBelowLow?: boolean; // Was last reading below low threshold?
}

/**
 * Get respiration notification settings from storage
 */
export async function getRespirationNotificationSettings(): Promise<RespirationNotificationSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('[RespirationNotifications] Error loading settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save respiration notification settings to storage
 */
export async function saveRespirationNotificationSettings(
  settings: RespirationNotificationSettings
): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('[RespirationNotifications] Error saving settings:', error);
    throw error;
  }
}

/**
 * Get notification state from storage
 */
async function getNotificationState(): Promise<NotificationState> {
  try {
    const stored = await AsyncStorage.getItem(NOTIFICATION_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return {};
  } catch (error) {
    console.error('[RespirationNotifications] Error loading notification state:', error);
    return {};
  }
}

/**
 * Save notification state to storage
 */
async function saveNotificationState(state: NotificationState): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[RespirationNotifications] Error saving notification state:', error);
  }
}

/**
 * Ensure Android notification channel is set up
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('respiration_alerts', {
    name: 'Breathing Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [200, 100, 200, 100, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    description: 'Alerts when estimated breathing exceeds or falls below thresholds',
  });
}

/**
 * Send a respiration notification
 */
async function sendRespirationNotification(
  title: string,
  body: string,
  type: 'high' | 'low'
): Promise<void> {
  try {
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data: { type: 'respiration_alert', alertType: type },
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Immediate
    });
  } catch (error) {
    console.error('[RespirationNotifications] Error sending notification:', error);
  }
}

/**
 * Check if enough time has passed since last notification (cooldown)
 */
function isCooldownExpired(
  lastNotificationTime: number | undefined,
  cooldownMinutes: number
): boolean {
  if (!lastNotificationTime) return true;
  const cooldownMs = cooldownMinutes * 60 * 1000;
  return Date.now() - lastNotificationTime >= cooldownMs;
}

/**
 * Process respiration reading and send notifications if thresholds are exceeded
 * This should be called whenever new respiration data is received
 * 
 * @param respiration Current respiration rate in RPM
 * @param deviceId Optional device ID for logging
 */
export async function processRespirationReading(
  respiration: number,
  deviceId?: string
): Promise<void> {
  try {
    // Load settings
    const settings = await getRespirationNotificationSettings();
    
    // If notifications are disabled, do nothing
    if (!settings.enabled) {
      return;
    }

    // Validate respiration value
    if (!Number.isFinite(respiration) || respiration <= 0 || respiration >= 50) {
      return;
    }

    // Load notification state
    const state = await getNotificationState();
    const now = Date.now();

    // Check high threshold
    if (respiration > settings.highThreshold) {
      // Only notify if:
      // 1. We weren't already above threshold (to avoid spam)
      // 2. Cooldown has expired
      if (!state.wasAboveHigh && isCooldownExpired(state.lastHighNotification, settings.cooldownMinutes)) {
        await sendRespirationNotification(
          'High Estimated Breathing Alert',
          `Your estimated breathing is ${Math.round(respiration * 10) / 10} RPM, which is above your threshold of ${settings.highThreshold} RPM.`,
          'high'
        );
        
        // Update state
        state.lastHighNotification = now;
        state.wasAboveHigh = true;
        await saveNotificationState(state);
        
        console.log(`[RespirationNotifications] High threshold alert: ${respiration} RPM > ${settings.highThreshold} RPM`);
      }
    } else {
      // Reset high threshold state when we're back in normal range
      if (state.wasAboveHigh) {
        state.wasAboveHigh = false;
        await saveNotificationState(state);
      }
    }

    // Check low threshold
    if (respiration < settings.lowThreshold) {
      // Only notify if:
      // 1. We weren't already below threshold (to avoid spam)
      // 2. Cooldown has expired
      if (!state.wasBelowLow && isCooldownExpired(state.lastLowNotification, settings.cooldownMinutes)) {
        await sendRespirationNotification(
          'Low Estimated Breathing Alert',
          `Your estimated breathing is ${Math.round(respiration * 10) / 10} RPM, which is below your threshold of ${settings.lowThreshold} RPM.`,
          'low'
        );
        
        // Update state
        state.lastLowNotification = now;
        state.wasBelowLow = true;
        await saveNotificationState(state);
        
        console.log(`[RespirationNotifications] Low threshold alert: ${respiration} RPM < ${settings.lowThreshold} RPM`);
      }
    } else {
      // Reset low threshold state when we're back in normal range
      if (state.wasBelowLow) {
        state.wasBelowLow = false;
        await saveNotificationState(state);
      }
    }
  } catch (error) {
    console.error('[RespirationNotifications] Error processing respiration reading:', error);
  }
}

/**
 * Reset notification state (useful for testing or when settings change)
 */
export async function resetRespirationNotificationState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(NOTIFICATION_STATE_KEY);
  } catch (error) {
    console.error('[RespirationNotifications] Error resetting notification state:', error);
  }
}
