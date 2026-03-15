import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface StressNotificationSettings {
  enabled: boolean;
  highThreshold: number; // Stress level (0-100) - alert when exceeded
  lowThreshold: number; // Stress level (0-100) - alert when below
  cooldownMinutes: number; // Minutes to wait between notifications
}

const SETTINGS_KEY = 'stress_notification_settings';
const NOTIFICATION_STATE_KEY = 'stress_notification_state';

// Default settings
const DEFAULT_SETTINGS: StressNotificationSettings = {
  enabled: false,
  highThreshold: 80,
  lowThreshold: 20,
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
 * Get stress notification settings from storage
 */
export async function getStressNotificationSettings(): Promise<StressNotificationSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('[StressNotifications] Error loading settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save stress notification settings to storage
 */
export async function saveStressNotificationSettings(
  settings: StressNotificationSettings
): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('[StressNotifications] Error saving settings:', error);
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
    console.error('[StressNotifications] Error loading notification state:', error);
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
    console.error('[StressNotifications] Error saving notification state:', error);
  }
}

/**
 * Ensure Android notification channel is set up
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('stress_alerts', {
    name: 'Stress Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [200, 100, 200, 100, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    description: 'Alerts when stress level exceeds or falls below thresholds',
  });
}

/**
 * Send a stress notification
 */
async function sendStressNotification(
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
        data: { type: 'stress_alert', alertType: type },
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Immediate
    });
  } catch (error) {
    console.error('[StressNotifications] Error sending notification:', error);
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
 * Process stress reading and send notifications if thresholds are exceeded
 * This should be called whenever new stress data is received
 * 
 * @param stressLevel Current stress level (0-100)
 * @param deviceId Optional device ID for logging
 */
export async function processStressReading(
  stressLevel: number,
  deviceId?: string
): Promise<void> {
  try {
    // Load settings
    const settings = await getStressNotificationSettings();
    
    // If notifications are disabled, do nothing
    if (!settings.enabled) {
      return;
    }

    // Validate stress value (0-100)
    if (!Number.isFinite(stressLevel) || stressLevel < 0 || stressLevel > 100) {
      return;
    }

    // Load notification state
    const state = await getNotificationState();
    const now = Date.now();

    // Check high threshold
    if (stressLevel > settings.highThreshold) {
      // Only notify if:
      // 1. We weren't already above threshold (to avoid spam)
      // 2. Cooldown has expired
      if (!state.wasAboveHigh && isCooldownExpired(state.lastHighNotification, settings.cooldownMinutes)) {
        await sendStressNotification(
          'High Stress Level Alert',
          `Your stress level is ${Math.round(stressLevel)}, which is above your threshold of ${settings.highThreshold}.`,
          'high'
        );
        
        // Update state
        state.lastHighNotification = now;
        state.wasAboveHigh = true;
        await saveNotificationState(state);
        
        console.log(`[StressNotifications] High threshold alert: ${stressLevel} > ${settings.highThreshold}`);
      }
    } else {
      // Reset high threshold state when we're back in normal range
      if (state.wasAboveHigh) {
        state.wasAboveHigh = false;
        await saveNotificationState(state);
      }
    }

    // Check low threshold
    if (stressLevel < settings.lowThreshold) {
      // Only notify if:
      // 1. We weren't already below threshold (to avoid spam)
      // 2. Cooldown has expired
      if (!state.wasBelowLow && isCooldownExpired(state.lastLowNotification, settings.cooldownMinutes)) {
        await sendStressNotification(
          'Low Stress Level Alert',
          `Your stress level is ${Math.round(stressLevel)}, which is below your threshold of ${settings.lowThreshold}.`,
          'low'
        );
        
        // Update state
        state.lastLowNotification = now;
        state.wasBelowLow = true;
        await saveNotificationState(state);
        
        console.log(`[StressNotifications] Low threshold alert: ${stressLevel} < ${settings.lowThreshold}`);
      }
    } else {
      // Reset low threshold state when we're back in normal range
      if (state.wasBelowLow) {
        state.wasBelowLow = false;
        await saveNotificationState(state);
      }
    }
  } catch (error) {
    console.error('[StressNotifications] Error processing stress reading:', error);
  }
}

/**
 * Reset notification state (useful for testing or when settings change)
 */
export async function resetStressNotificationState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(NOTIFICATION_STATE_KEY);
  } catch (error) {
    console.error('[StressNotifications] Error resetting notification state:', error);
  }
}
