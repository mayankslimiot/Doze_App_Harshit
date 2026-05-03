import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface HeartRateNotificationSettings {
  enabled: boolean;
  highThreshold: number; // BPM - alert when exceeded
  lowThreshold: number; // BPM - alert when below
  cooldownMinutes: number; // Minutes to wait between notifications
}

const SETTINGS_KEY = 'heart_rate_notification_settings';
const LAST_NOTIFICATION_KEY = 'heart_rate_last_notification';
const NOTIFICATION_STATE_KEY = 'heart_rate_notification_state';

// Default settings
const DEFAULT_SETTINGS: HeartRateNotificationSettings = {
  enabled: false,
  highThreshold: 120,
  lowThreshold: 60,
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
 * Get heart rate notification settings from storage
 */
export async function getHeartRateNotificationSettings(): Promise<HeartRateNotificationSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('[HeartRateNotifications] Error loading settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save heart rate notification settings to storage
 */
export async function saveHeartRateNotificationSettings(
  settings: HeartRateNotificationSettings
): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('[HeartRateNotifications] Error saving settings:', error);
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
    console.error('[HeartRateNotifications] Error loading notification state:', error);
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
    console.error('[HeartRateNotifications] Error saving notification state:', error);
  }
}

/**
 * Ensure Android notification channel is set up
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('heart_rate_alerts', {
    name: 'Wellness Notifications',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [200, 100, 200, 100, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    description: 'Notifications when estimated HR exceeds or falls below thresholds',
  });
}

/**
 * Send a heart rate notification
 */
async function sendHeartRateNotification(
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
        data: { type: 'heart_rate_alert', alertType: type },
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Immediate
    });
  } catch (error) {
    console.error('[HeartRateNotifications] Error sending notification:', error);
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
 * Process heart rate reading and send notifications if thresholds are exceeded
 * This should be called whenever new heart rate data is received
 * 
 * @param heartRate Current heart rate in BPM
 * @param deviceId Optional device ID for logging
 */
export async function processHeartRateReading(
  heartRate: number,
  deviceId?: string
): Promise<void> {
  try {
    // Load settings
    const settings = await getHeartRateNotificationSettings();
    
    // If notifications are disabled, do nothing
    if (!settings.enabled) {
      return;
    }

    // Validate heart rate value
    if (!Number.isFinite(heartRate) || heartRate <= 0 || heartRate >= 250) {
      return;
    }

    // Load notification state
    const state = await getNotificationState();
    const now = Date.now();

    // Check high threshold
    if (heartRate > settings.highThreshold) {
      // Only notify if:
      // 1. We weren't already above threshold (to avoid spam)
      // 2. Cooldown has expired
      if (!state.wasAboveHigh && isCooldownExpired(state.lastHighNotification, settings.cooldownMinutes)) {
        await sendHeartRateNotification(
          'Heart Rate Trend Update',
          `Your estimated HR is ${Math.round(heartRate)} BPM, which is above your set threshold of ${settings.highThreshold} BPM.`,
          'high'
        );
        
        // Update state
        state.lastHighNotification = now;
        state.wasAboveHigh = true;
        await saveNotificationState(state);
        
        console.log(`[HeartRateNotifications] High threshold alert: ${heartRate} BPM > ${settings.highThreshold} BPM`);
      }
    } else {
      // Reset high threshold state when we're back in normal range
      if (state.wasAboveHigh) {
        state.wasAboveHigh = false;
        await saveNotificationState(state);
      }
    }

    // Check low threshold
    if (heartRate < settings.lowThreshold) {
      // Only notify if:
      // 1. We weren't already below threshold (to avoid spam)
      // 2. Cooldown has expired
      if (!state.wasBelowLow && isCooldownExpired(state.lastLowNotification, settings.cooldownMinutes)) {
        await sendHeartRateNotification(
          'Heart Rate Trend Update',
          `Your estimated HR is ${Math.round(heartRate)} BPM, which is below your set threshold of ${settings.lowThreshold} BPM.`,
          'low'
        );
        
        // Update state
        state.lastLowNotification = now;
        state.wasBelowLow = true;
        await saveNotificationState(state);
        
        console.log(`[HeartRateNotifications] Low threshold alert: ${heartRate} BPM < ${settings.lowThreshold} BPM`);
      }
    } else {
      // Reset low threshold state when we're back in normal range
      if (state.wasBelowLow) {
        state.wasBelowLow = false;
        await saveNotificationState(state);
      }
    }
  } catch (error) {
    console.error('[HeartRateNotifications] Error processing heart rate reading:', error);
  }
}

/**
 * Reset notification state (useful for testing or when settings change)
 */
export async function resetNotificationState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(NOTIFICATION_STATE_KEY);
  } catch (error) {
    console.error('[HeartRateNotifications] Error resetting notification state:', error);
  }
}
