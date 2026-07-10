import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface TemperatureNotificationSettings {
  enabled: boolean;
  highThreshold: number; // Temperature in Celsius - alert when exceeded
  lowThreshold: number; // Temperature in Celsius - alert when below
  cooldownMinutes: number; // Minutes to wait between notifications
}

const SETTINGS_KEY = 'temperature_notification_settings';
const NOTIFICATION_STATE_KEY = 'temperature_notification_state';

// Default settings
const DEFAULT_SETTINGS: TemperatureNotificationSettings = {
  enabled: false,
  highThreshold: 30,
  lowThreshold: 15,
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
 * Get temperature notification settings from storage
 */
export async function getTemperatureNotificationSettings(): Promise<TemperatureNotificationSettings> {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('[TemperatureNotifications] Error loading settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save temperature notification settings to storage
 */
export async function saveTemperatureNotificationSettings(
  settings: TemperatureNotificationSettings
): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('[TemperatureNotifications] Error saving settings:', error);
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
    console.error('[TemperatureNotifications] Error loading notification state:', error);
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
    console.error('[TemperatureNotifications] Error saving notification state:', error);
  }
}

/**
 * Ensure Android notification channel is set up
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('temperature_alerts', {
    name: 'Temperature Updates',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [200, 100, 200, 100, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    description: 'Notifications when temperature exceeds or falls below thresholds',
  });
}

/**
 * Send a temperature notification
 */
async function sendTemperatureNotification(
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
        data: { type: 'temperature_alert', alertType: type },
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Immediate
    });
  } catch (error) {
    console.error('[TemperatureNotifications] Error sending notification:', error);
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
 * Process temperature reading and send notifications if thresholds are exceeded
 * This should be called whenever new temperature data is received
 * 
 * @param temperature Current temperature in Celsius
 * @param deviceId Optional device ID for logging
 */
export async function processTemperatureReading(
  temperature: number,
  deviceId?: string
): Promise<void> {
  try {
    // Load settings
    const settings = await getTemperatureNotificationSettings();
    
    // If notifications are disabled, do nothing
    if (!settings.enabled) {
      return;
    }

    // Validate temperature value (reasonable range: -10 to 50°C)
    if (!Number.isFinite(temperature) || temperature < -10 || temperature > 50) {
      return;
    }

    // Load notification state
    const state = await getNotificationState();
    const now = Date.now();

    // Check high threshold
    if (temperature > settings.highThreshold) {
      // Only notify if:
      // 1. We weren't already above threshold (to avoid spam)
      // 2. Cooldown has expired
      if (!state.wasAboveHigh && isCooldownExpired(state.lastHighNotification, settings.cooldownMinutes)) {
        await sendTemperatureNotification(
          'Temperature Update',
          `Room temperature is ${Math.round(temperature * 10) / 10}°C, which is above your set threshold of ${settings.highThreshold}°C.`,
          'high'
        );
        
        // Update state
        state.lastHighNotification = now;
        state.wasAboveHigh = true;
        await saveNotificationState(state);
        
        console.log(`[TemperatureNotifications] High threshold alert: ${temperature}°C > ${settings.highThreshold}°C`);
      }
    } else {
      // Reset high threshold state when we're back in normal range
      if (state.wasAboveHigh) {
        state.wasAboveHigh = false;
        await saveNotificationState(state);
      }
    }

    // Check low threshold
    if (temperature < settings.lowThreshold) {
      // Only notify if:
      // 1. We weren't already below threshold (to avoid spam)
      // 2. Cooldown has expired
      if (!state.wasBelowLow && isCooldownExpired(state.lastLowNotification, settings.cooldownMinutes)) {
        await sendTemperatureNotification(
          'Temperature Update',
          `Room temperature is ${Math.round(temperature * 10) / 10}°C, which is below your set threshold of ${settings.lowThreshold}°C.`,
          'low'
        );
        
        // Update state
        state.lastLowNotification = now;
        state.wasBelowLow = true;
        await saveNotificationState(state);
        
        console.log(`[TemperatureNotifications] Low threshold alert: ${temperature}°C < ${settings.lowThreshold}°C`);
      }
    } else {
      // Reset low threshold state when we're back in normal range
      if (state.wasBelowLow) {
        state.wasBelowLow = false;
        await saveNotificationState(state);
      }
    }
  } catch (error) {
    console.error('[TemperatureNotifications] Error processing temperature reading:', error);
  }
}

/**
 * Reset notification state (useful for testing or when settings change)
 */
export async function resetTemperatureNotificationState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(NOTIFICATION_STATE_KEY);
  } catch (error) {
    console.error('[TemperatureNotifications] Error resetting notification state:', error);
  }
}
