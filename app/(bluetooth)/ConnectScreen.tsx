import CustomAlert from '@/components/CustomAlert';
import { useProvisioning } from "@/contexts/ProvisioningContext";
import { getBleManager } from '@/hooks/useBluetooth';
import { Ionicons } from '@expo/vector-icons';
import { Buffer } from "buffer";
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Platform, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Subscription } from 'react-native-ble-plx';
import { getWiFiStatus, autoRegisterDevice } from '@/services/deviceData';
import { 
  connectToWiFiProvisioningMQTT, 
  disconnectWiFiProvisioningMQTT,
  isWiFiProvisioningMQTTConnected 
} from '@/services/mqttService';
import { sendDeviceRegisteredNotification } from '@/services/Notifications';
import { useDevice } from '@/contexts/DeviceContext';

// Status codes from the device (matching prov_status_t enum)
enum ProvisioningStatus {
  IDLE = 0x00,
  CONNECTING = 0x01,
  REGISTERING = 0x05, // New status for device registration
  SUCCESS = 0x02,
  FAILED = 0x03,
  SSID_NOT_FOUND = 0x04,
}

// Status display configuration
const STATUS_CONFIG = {
  [ProvisioningStatus.IDLE]: {
    text: 'Waiting...',
    icon: 'time-outline' as const,
    color: '#FFA500',
    description: 'Preparing to send credentials'
  },
  [ProvisioningStatus.CONNECTING]: {
    text: 'Connecting to WiFi',
    icon: 'wifi-outline' as const,
    color: '#4A90E2',
    description: 'Device is connecting to your WiFi network'
  },
  [ProvisioningStatus.SUCCESS]: {
    text: 'Connected Successfully',
    icon: 'checkmark-circle' as const,
    color: '#4CAF50',
    description: 'Your device is now connected to WiFi'
  },
  [ProvisioningStatus.FAILED]: {
    text: 'Connection Failed',
    icon: 'close-circle' as const,
    color: '#FF6B6B',
    description: 'Wrong password or connection error'
  },
  [ProvisioningStatus.SSID_NOT_FOUND]: {
    text: 'Network Not Found',
    icon: 'alert-circle' as const,
    color: '#FF6B6B',
    description: 'WiFi network is not available or out of range'
  },
  [ProvisioningStatus.REGISTERING]: {
    text: 'Registering Device',
    icon: 'cloud-upload-outline' as const,
    color: '#4A90E2',
    description: 'Registering device to your account'
  },
};

export default function ConnectScreen() {
  const { selectedDeviceId, wifiSSID, wifiPassword, sendWifiCredentials, setWifiProvisioningSuccess, serialNumber, setSerialNumber } = useProvisioning();
  const router = useRouter();
  const { refreshDevices, setActiveDevice } = useDevice();

  const [currentStatus, setCurrentStatus] = useState<ProvisioningStatus>(ProvisioningStatus.IDLE);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(true);
  const [showAlert, setShowAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', buttons: [] as any[] });
  // Track the last error key reported by device (e.g., wrong_password, ssid_not_found, weak_signal, connect_failed)
  const [lastErrorKey, setLastErrorKey] = useState<string | null>(null);
  // Retry count for WiFi provisioning (0-3)
  const [retryCount, setRetryCount] = useState(0);
  // Checklist states: 'pending' | 'loading' | 'success' | 'failed'
  const [step1WiFiStatus, setStep1WiFiStatus] = useState<'pending' | 'loading' | 'success' | 'failed'>('pending');
  const [step2RegisterStatus, setStep2RegisterStatus] = useState<'pending' | 'loading' | 'success' | 'failed'>('pending');
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // Timeout ref to cancel when success is received (20 seconds for CONNECTED message)
  const mqttTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Success animation ref
  const successScaleAnim = useRef(new Animated.Value(0)).current;
  // API polling interval ref
  const apiPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Serial number ref to access latest value in polling closure
  const serialNumberRef = useRef<string | null>(null);
  // Guard to ensure handleMQTTConnected is only called once
  const mqttConnectedHandledRef = useRef<boolean>(false);
  // Retry count ref to avoid stale closures
  const retryCountRef = useRef<number>(0);

  // Service and characteristic UUIDs (matching Nordic UART Service)
  const PROVISION_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
  const STATUS_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";  // TX characteristic for status updates

  // Pulse animation for loading indicator
  useEffect(() => {
    if (currentStatus === ProvisioningStatus.CONNECTING) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [currentStatus]);

  // Fade in animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // REMOVED: statusRef useEffect - no longer needed, BLE is write-only

  // Update serial number ref when serialNumber changes
  useEffect(() => {
    serialNumberRef.current = serialNumber;
  }, [serialNumber]);

  // Update retry count ref when retryCount changes
  useEffect(() => {
    retryCountRef.current = retryCount;
  }, [retryCount]);

  // Read serial number from device when component mounts
  useEffect(() => {
    const readSerialNumber = async () => {
      if (!selectedDeviceId || serialNumber) {
        // Already have serial number or no device selected
        return;
      }

      try {
        console.log('📋 Reading serial number from Device Information Service...');
        const bleManager = getBleManager();
        
        // Device Information Service UUIDs
        const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
        const SERIAL_NUMBER_CHAR_UUID = '00002a25-0000-1000-8000-00805f9b34fb';
        
        const char = await bleManager.readCharacteristicForDevice(
          selectedDeviceId,
          DEVICE_INFO_SERVICE_UUID,
          SERIAL_NUMBER_CHAR_UUID
        );
        
        if (char?.value) {
          const decoded = Buffer.from(char.value, 'base64').toString('utf-8');
          console.log(`✅ Serial Number read: ${decoded}`);
          setSerialNumber(decoded);
        } else {
          console.warn('⚠️ Serial number not available');
        }
      } catch (error) {
        console.error('❌ Error reading serial number:', error);
      }
    };

    readSerialNumber();
  }, [selectedDeviceId, serialNumber, setSerialNumber]);

  // BLE is write-only - no status notifications or parsing
  // MQTT is the single source of truth for provisioning status
  // All BLE notification handling code has been removed

  // Handle MQTT "connected" message - Step 1 Complete (WiFi Connected)
  // ONE-TIME HANDLING: This callback should only fire once due to cleanup in MQTT service
  const handleMQTTConnected = async () => {
    // Safety guard: Prevent duplicate execution
    if (mqttConnectedHandledRef.current) {
      console.log('[WiFi Provisioning] ⚠️ handleMQTTConnected already executed, ignoring duplicate call');
      return;
    }
    
    // Mark as handled immediately
    mqttConnectedHandledRef.current = true;
    
    console.log('═══════════════════════════════════════');
    console.log('[WiFi Provisioning] ✅ ✅ ✅ "connected" MESSAGE RECEIVED! ✅ ✅ ✅');
    console.log('[WiFi Provisioning] Step 1: WiFi Connection SUCCESS');
    console.log('═══════════════════════════════════════');
    
    // IMMEDIATE CLEANUP: Stop all services before processing
    // Cancel MQTT timeout
    if (mqttTimeoutRef.current) {
      console.log('[WiFi Provisioning] ⏹️ Cancelling MQTT timeout...');
      clearTimeout(mqttTimeoutRef.current);
      mqttTimeoutRef.current = null;
    }
    
    // Stop API polling if running
    if (apiPollIntervalRef.current) {
      console.log('[WiFi Provisioning] ⏹️ Stopping API polling...');
      clearInterval(apiPollIntervalRef.current);
      apiPollIntervalRef.current = null;
    }
    
    // Disconnect MQTT immediately to prevent any further messages
    console.log('[WiFi Provisioning] 🔌 Disconnecting MQTT client...');
    disconnectWiFiProvisioningMQTT();
    
    // Mark Step 1 as success
    setStep1WiFiStatus('success');
    
    // Get serial number for registration
    const serialForRegistration = serialNumberRef.current || serialNumber;
    if (!serialForRegistration) {
      console.error('[WiFi Provisioning] ❌ Serial number not available for registration');
      setStep1WiFiStatus('failed');
      setCurrentStatus(ProvisioningStatus.FAILED);
      setStatusMessage('Device connected but serial number not available');
      setIsProcessing(false);
      return;
    }

    // Wait a moment before starting Step 2
    await new Promise(resolve => setTimeout(resolve, 500));

    // Start Step 2: Register Device
    console.log('[WiFi Provisioning] 📝 Starting Step 2: Device Registration...');
    setStep2RegisterStatus('loading');
    setCurrentStatus(ProvisioningStatus.REGISTERING);
    setIsProcessing(true);

    try {
      // Call auto-register API (ONLY ONCE)
      console.log(`[WiFi Provisioning] 📡 Calling auto-register API for serial: ${serialForRegistration}, bleMac: ${selectedDeviceId || 'none'}`);
      const registrationResult = await autoRegisterDevice(serialForRegistration, selectedDeviceId || undefined);

      if (registrationResult.success) {
        console.log('[WiFi Provisioning] ✅ Device registered successfully!');
        console.log(`[WiFi Provisioning]    Device ID: ${registrationResult.device?.deviceId}`);
        console.log(`[WiFi Provisioning]    Was Reassigned: ${registrationResult.wasReassigned || false}`);
        
        // Mark Step 2 as success
        setStep2RegisterStatus('success');
        
        // SINGLE SUCCESS STATE: Set final provisioning status
        setCurrentStatus(ProvisioningStatus.SUCCESS);
        setStatusMessage('Device registered successfully');
        setLastErrorKey(null);
        setIsProcessing(false);
        setWifiProvisioningSuccess(true);
        
        // Reset retry count on success
        setRetryCount(0);
        retryCountRef.current = 0;
        
        // Send notification
        try {
          await sendDeviceRegisteredNotification(serialForRegistration);
          console.log('[WiFi Provisioning] ✅ Notification sent');
        } catch (notifError) {
          console.error('[WiFi Provisioning] ⚠️ Failed to send notification:', notifError);
        }
        
        // Refresh device list so it appears on dashboard
        try {
          console.log('[WiFi Provisioning] 🔄 Refreshing device list...');
          await refreshDevices();
          console.log('[WiFi Provisioning] ✅ Device list refreshed');
          
          // AUTO-ACTIVATION: Explicitly set the new device as active
          // This ensures the user immediately sees data for the device they just added
          if (registrationResult.device) {
            console.log('[WiFi Provisioning] 🎯 Auto-activating new device:', registrationResult.device.deviceId);
            await setActiveDevice(registrationResult.device);
          }
        } catch (refreshError) {
          console.error('[WiFi Provisioning] ⚠️ Failed to refresh or activate device:', refreshError);
        }

        // Save BLE id → backend deviceId so Scan screen can show custom name for "Previously Connected"
        const backendDeviceId = registrationResult.device?.deviceId?.trim().toUpperCase();
        if (selectedDeviceId && backendDeviceId) {
          try {
            const key = '@slimiot_ble_to_backend_device_id';
            const raw = await AsyncStorage.getItem(key);
            const map: Record<string, string> = raw ? JSON.parse(raw) : {};
            map[selectedDeviceId] = backendDeviceId;
            await AsyncStorage.setItem(key, JSON.stringify(map));
            // Backfill "Previously Connected" entry so custom name shows without re-scan
            const prevKey = '@slimiot_previous_doze_devices';
            const prevRaw = await AsyncStorage.getItem(prevKey);
            if (prevRaw) {
              const prevList: Array<{ id: string; name: string | null; backendDeviceId?: string }> = JSON.parse(prevRaw);
              const updated = prevList.map((d) =>
                d.id === selectedDeviceId ? { ...d, backendDeviceId } : d
              );
              await AsyncStorage.setItem(prevKey, JSON.stringify(updated));
            }
          } catch (_) {}
        }
        
        // Trigger success animation
        Animated.spring(successScaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }).start();
        
        console.log('[WiFi Provisioning] ✅ ✅ ✅ REGISTRATION COMPLETE! ✅ ✅ ✅');
        console.log('[WiFi Provisioning] 🎯 Final State: SUCCESS - Dashboard button should be visible');
      } else {
        // Registration failed
        console.error('[WiFi Provisioning] ❌ Registration failed:', registrationResult.message);
        setStep2RegisterStatus('failed');
        
        if (registrationResult.error === 'AUTH_REQUIRED') {
          setCurrentStatus(ProvisioningStatus.FAILED);
          setStatusMessage('Please log in to register device');
        } else {
          setCurrentStatus(ProvisioningStatus.FAILED);
          setStatusMessage(registrationResult.message || 'Registration failed. Please try again.');
        }
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('[WiFi Provisioning] ❌ Error during registration:', error);
      setStep2RegisterStatus('failed');
      setCurrentStatus(ProvisioningStatus.FAILED);
      setStatusMessage(error instanceof Error ? error.message : 'Registration failed. Please try again.');
      setIsProcessing(false);
    }
    // Note: MQTT already disconnected above, no need for finally block
  };

  // Handle MQTT timeout (20 seconds) - Step 1 Failed
  const handleMQTTTimeout = () => {
    console.log('═══════════════════════════════════════');
    console.log('[WiFi Provisioning] ⏱️ ⏱️ ⏱️ MQTT TIMEOUT (20 seconds) ⏱️ ⏱️ ⏱️');
    console.log('[WiFi Provisioning] Step 1: WiFi Connection FAILED');
    console.log('═══════════════════════════════════════');
    
    // Mark Step 1 as failed
    setStep1WiFiStatus('failed');
    
    // Disconnect MQTT
    disconnectWiFiProvisioningMQTT();
    
    // Stop API polling if running
    if (apiPollIntervalRef.current) {
      clearInterval(apiPollIntervalRef.current);
      apiPollIntervalRef.current = null;
    }
    
    const currentRetryCount = retryCountRef.current;
    console.log(`[WiFi Provisioning] Current retry count: ${currentRetryCount}/3`);
    
    if (currentRetryCount < 3) {
      // Show retry button
      console.log('[WiFi Provisioning] Showing retry button...');
      setCurrentStatus(ProvisioningStatus.FAILED);
      setIsProcessing(false);
      // Don't show alert, show retry button in UI
    } else {
      // Max retries reached - auto navigate to Scan screen
      console.log('[WiFi Provisioning] ❌ Max retries reached (3/3)');
      console.log('[WiFi Provisioning] Auto-navigating to Scan screen...');
      setRetryCount(0);
      retryCountRef.current = 0;
      setStep1WiFiStatus('pending');
      setStep2RegisterStatus('pending');
      
      // Auto navigate after short delay
      setTimeout(() => {
        cleanupBleConnection();
        router.replace('/(bluetooth)/ScanScreen');
      }, 2000);
    }
    
    mqttTimeoutRef.current = null;
  };

  // Send credentials and monitor progress
  const initiateProvisioning = async () => {
    try {
      console.log('═══════════════════════════════════════');
      console.log('🚀 STARTING WIFI PROVISIONING');
      console.log(`   SSID: ${wifiSSID}`);
      console.log(`   Password: ${wifiPassword ? '***' + wifiPassword.slice(-4) : 'empty'}`);
      console.log(`   Device: ${selectedDeviceId}`);
      console.log(`   Serial Number: ${serialNumber || 'Not available yet'}`);
      console.log(`   Retry Count: ${retryCountRef.current}/3`);
      console.log('═══════════════════════════════════════');

      // Check if serial number is available
      const currentSerialNumber = serialNumberRef.current || serialNumber;
      if (!currentSerialNumber) {
        console.warn('[WiFi Provisioning] ⚠️ Serial number not available yet, waiting...');
        // Wait a bit for serial number to be read
        await new Promise(resolve => setTimeout(resolve, 2000));
        const serialAfterWait = serialNumberRef.current || serialNumber;
        if (!serialAfterWait) {
          throw new Error('Serial number is required for MQTT subscription. Please ensure device is connected.');
        }
      }

      // BLE is write-only - no status subscriptions needed
      // Send credentials via BLE
      console.log('═══════════════════════════════════════');
      console.log('📤 Step 2: Sending WiFi credentials to device');
      console.log('═══════════════════════════════════════');
      const success = await sendWifiCredentials();

      if (!success) {
        throw new Error('Failed to send WiFi credentials');
      }

      console.log('✅ Credentials sent successfully!');
      
      // Get serial number for MQTT topic
      const serialForMQTT = serialNumberRef.current || serialNumber;
      if (!serialForMQTT) {
        throw new Error('Serial number is required for MQTT subscription');
      }

      // Reset MQTT connected handler guard for fresh attempt
      mqttConnectedHandledRef.current = false;

      // Connect to MQTT and subscribe to WiFi status topic
      // SINGLE SOURCE OF TRUTH: device/{serialNumber}/status with "connected" message
      console.log('═══════════════════════════════════════');
      console.log('📡 Step 3: Connecting to MQTT for WiFi status');
      console.log(`   Topic: device/${serialForMQTT}/status`);
      console.log(`   Expected Message: "connected" (lowercase)`);
      console.log('═══════════════════════════════════════');
      
      const mqttClient = connectToWiFiProvisioningMQTT(serialForMQTT, handleMQTTConnected);
      
      if (!mqttClient) {
        console.error('[WiFi Provisioning] ❌ Failed to connect to MQTT');
        throw new Error('Failed to connect to MQTT broker');
      }

      // Set status to CONNECTING and mark Step 1 as loading
      setCurrentStatus(ProvisioningStatus.CONNECTING);
      setStep1WiFiStatus('loading');
      setStep2RegisterStatus('pending'); // Reset Step 2 - don't show until Step 1 succeeds
      setIsProcessing(true);
      setLastErrorKey(null); // Clear any previous errors

      // Set 20 second timeout for "connected" message
      console.log('[WiFi Provisioning] ⏱️ Starting 20 second timeout for "connected" message...');
      mqttTimeoutRef.current = setTimeout(() => {
        handleMQTTTimeout();
      }, 20000); // 20 seconds

      console.log('═══════════════════════════════════════');
      console.log('[WiFi Provisioning] ✅ Setup complete!');
      console.log('[WiFi Provisioning] ⏳ Waiting for "connected" message from device...');
      console.log('[WiFi Provisioning] ⏱️ Timeout: 20 seconds');
      console.log('[WiFi Provisioning] 📋 Topic: device/' + serialForMQTT + '/status');
      console.log('═══════════════════════════════════════');

    } catch (error) {
      console.error('❌ Provisioning error:', error);
      
      // Cleanup on error
      if (mqttTimeoutRef.current) {
        clearTimeout(mqttTimeoutRef.current);
        mqttTimeoutRef.current = null;
      }
      disconnectWiFiProvisioningMQTT();
      
      // Mark Step 1 as failed
      setStep1WiFiStatus('failed');
      setCurrentStatus(ProvisioningStatus.FAILED);
      setStatusMessage(error instanceof Error ? error.message : 'Failed to send credentials');
      setIsProcessing(false);
      
      // Check retry count
      if (retryCountRef.current >= 3) {
        // Auto navigate after delay
        setTimeout(() => {
          cleanupBleConnection();
          router.replace('/(bluetooth)/ScanScreen');
        }, 2000);
      }
    }
  };

  // Cleanup BLE connection
  const cleanupBleConnection = async () => {
    try {
      console.log('🧹 Cleaning up BLE connection...');
      
      // Cancel MQTT timeout timer if still running
      if (mqttTimeoutRef.current) {
        console.log('⏹️ Clearing MQTT timeout timer');
        clearTimeout(mqttTimeoutRef.current);
        mqttTimeoutRef.current = null;
      }
      
      // Disconnect MQTT
      disconnectWiFiProvisioningMQTT();
      
      // Stop API polling
      if (apiPollIntervalRef.current) {
        console.log('⏹️ Stopping API polling...');
        clearInterval(apiPollIntervalRef.current);
        apiPollIntervalRef.current = null;
      }
      
      // BLE is write-only - no subscriptions to clean up

      if (selectedDeviceId) {
        const bleManager = getBleManager();
        
        // Check if device is still connected
        const isConnected = await bleManager.isDeviceConnected(selectedDeviceId);
        
        if (isConnected) {
          console.log('🔌 Disconnecting from device...');
          await bleManager.cancelDeviceConnection(selectedDeviceId);
          console.log('✅ Device disconnected');
        } else {
          console.log('ℹ️ Device already disconnected');
        }
      }
      
      console.log('✅ BLE cleanup complete');
    } catch (error) {
      console.error('❌ Error during BLE cleanup:', error);
    }
  };

  // Handle status changes
  useEffect(() => {
    console.log('═══════════════════════════════════════');
    console.log(`[WiFi Provisioning] 🔄 Status Changed Effect Triggered`);
    console.log(`[WiFi Provisioning]    New Status: ${ProvisioningStatus[currentStatus]} (${currentStatus})`);
    console.log(`[WiFi Provisioning]    Is Processing: ${isProcessing}`);
    console.log('═══════════════════════════════════════');
    
    if (currentStatus === ProvisioningStatus.SUCCESS) {
      console.log('✅ ✅ ✅ SUCCESS status received - stopping processing ✅ ✅ ✅');
      setIsProcessing(false);
      // Don't auto-navigate, wait for user to click Continue
    } else if (currentStatus === ProvisioningStatus.FAILED || currentStatus === ProvisioningStatus.SSID_NOT_FOUND) {
      console.log('❌ FAILED status received - stopping processing');
      setIsProcessing(false);
    } else if (currentStatus === ProvisioningStatus.CONNECTING) {
      console.log('🔄 CONNECTING status - keep processing');
      setIsProcessing(true);
    }
  }, [currentStatus]);

  // Start provisioning on mount
  useEffect(() => {
    if (!selectedDeviceId) {
      console.error('No device selected, going back');
      router.back();
      return;
    }

    initiateProvisioning();

    // Cleanup on unmount
    return () => {
      console.log('🧹 Component unmounting - cleaning up');
      cleanupBleConnection();
    };
  }, []);

  const config = STATUS_CONFIG[currentStatus];
  const isError = currentStatus === ProvisioningStatus.FAILED || currentStatus === ProvisioningStatus.SSID_NOT_FOUND;
  const isSuccess = currentStatus === ProvisioningStatus.SUCCESS;

  const handleRetry = async () => {
    const currentRetryCount = retryCountRef.current;
    if (currentRetryCount >= 3) {
      // Max retries - navigate to scan screen
      await cleanupBleConnection();
      router.replace('/(bluetooth)/ScanScreen');
      return;
    }
    
    console.log(`🔄 Retry button pressed - Attempt ${currentRetryCount + 1}/3`);
    
      // Reset states
      setRetryCount(currentRetryCount + 1);
      setStep1WiFiStatus('pending');
      setStep2RegisterStatus('pending');
      setCurrentStatus(ProvisioningStatus.IDLE);
      setIsProcessing(true);
      
      // Reset MQTT connected handler guard for retry
      mqttConnectedHandledRef.current = false;
      
      // Retry provisioning
      setTimeout(() => initiateProvisioning(), 500);
  };

  const handleGoToDashboard = async () => {
    console.log('✅ Go to Dashboard button pressed');
    
    // Ensure success flag is set before cleanup
    setWifiProvisioningSuccess(true);
    
    // Cleanup BLE connection
    await cleanupBleConnection();
    
    // Navigate directly to home/dashboard
    router.replace('/(tabs)/home');
  };

  const handleCancel = async () => {
    console.log('❌ Cancel button pressed - cleaning up');
    
    // Cleanup BLE connection
    await cleanupBleConnection();
    
    // Go back
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.headerIconContainer}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Setting Up Dozemate</Text>
        <View style={styles.headerIconContainer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {/* Success Icon - Only show on final success */}
          {isSuccess && step2RegisterStatus === 'success' && (
            <Animated.View style={[styles.iconContainer, { transform: [{ scale: successScaleAnim }], marginBottom: 30 }]}>
              <View style={[styles.iconCircle, { backgroundColor: '#4CAF5020' }]}>
                <Animated.View style={{ transform: [{ scale: successScaleAnim }] }}>
                  <Ionicons name="checkmark-circle" size={100} color="#4CAF50" />
                </Animated.View>
              </View>
            </Animated.View>
          )}

          {/* Checklist Container */}
          <View style={styles.checklistContainer}>
            {/* Step 1: Connecting WiFi */}
            <View style={styles.checklistItemCard}>
              <View style={styles.checklistItemContent}>
                <View style={styles.checklistIconContainer}>
                  {step1WiFiStatus === 'success' ? (
                    <View style={[styles.checklistIcon, styles.checklistIconSuccess]}>
                      <Ionicons name="checkmark" size={20} color="#FFF" />
                    </View>
                  ) : step1WiFiStatus === 'failed' ? (
                    <View style={[styles.checklistIcon, styles.checklistIconFailed]}>
                      <Ionicons name="close" size={20} color="#FFF" />
                    </View>
                  ) : step1WiFiStatus === 'loading' ? (
                    <View style={[styles.checklistIcon, styles.checklistIconLoading]}>
                      <ActivityIndicator size="small" color="#4A90E2" />
                    </View>
                  ) : (
                    <View style={[styles.checklistIcon, styles.checklistIconPending]}>
                      <Ionicons name="ellipse-outline" size={20} color="rgba(255, 255, 255, 0.4)" />
                    </View>
                  )}
                </View>
                <View style={styles.checklistContent}>
                  <Text style={styles.checklistTitle}>Connecting WiFi</Text>
                  <Text style={styles.checklistDescription}>
                    {step1WiFiStatus === 'success' 
                      ? 'WiFi connected successfully' 
                      : step1WiFiStatus === 'failed'
                      ? 'WiFi connection failed'
                      : step1WiFiStatus === 'loading'
                      ? 'Connecting to WiFi network...'
                      : 'Waiting to connect...'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Step 2: Register Device - Only show if Step 1 succeeded */}
            {step1WiFiStatus === 'success' && (
              <View style={styles.checklistItemCard}>
                <View style={styles.checklistItemContent}>
                  <View style={styles.checklistIconContainer}>
                    {step2RegisterStatus === 'success' ? (
                      <View style={[styles.checklistIcon, styles.checklistIconSuccess]}>
                        <Ionicons name="checkmark" size={20} color="#FFF" />
                      </View>
                    ) : step2RegisterStatus === 'failed' ? (
                      <View style={[styles.checklistIcon, styles.checklistIconFailed]}>
                        <Ionicons name="close" size={20} color="#FFF" />
                      </View>
                    ) : step2RegisterStatus === 'loading' ? (
                      <View style={[styles.checklistIcon, styles.checklistIconLoading]}>
                        <ActivityIndicator size="small" color="#4A90E2" />
                      </View>
                    ) : (
                      <View style={[styles.checklistIcon, styles.checklistIconPending]}>
                        <Ionicons name="ellipse-outline" size={20} color="rgba(255, 255, 255, 0.4)" />
                      </View>
                    )}
                  </View>
                  <View style={styles.checklistContent}>
                    <Text style={styles.checklistTitle}>Register Device</Text>
                    <Text style={styles.checklistDescription}>
                      {step2RegisterStatus === 'success'
                        ? 'Device registered successfully'
                        : step2RegisterStatus === 'failed'
                        ? statusMessage || 'Registration failed'
                        : step2RegisterStatus === 'loading'
                        ? 'Registering device to your account...'
                        : 'Waiting to register...'}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

        {/* Error Message - Show if Step 1 failed */}
        {step1WiFiStatus === 'failed' && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#FF6B6B" />
            <Text style={styles.errorText}>
              {retryCountRef.current >= 3 
                ? 'Failed after 3 attempts. Please check your WiFi credentials.'
                : `Connection failed. Attempt ${retryCountRef.current + 1} of 3`}
            </Text>
          </View>
        )}

        {/* Retry Button - Only show if Step 1 failed and retries < 3 */}
        {step1WiFiStatus === 'failed' && retryCountRef.current < 3 && (
          <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
            <Ionicons name="refresh" size={20} color="#FFF" />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}

          {/* Success Button - Simplified: Show when provisioning status is SUCCESS */}
          {/* SINGLE SOURCE OF TRUTH: Button visibility depends only on final provisioning status */}
          {currentStatus === ProvisioningStatus.SUCCESS && (
            <TouchableOpacity onPress={handleGoToDashboard} style={styles.dashboardButton}>
              <Ionicons name="home" size={20} color="#1D244D" />
              <Text style={styles.dashboardButtonText}>Go to Dashboard</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </ScrollView>

      {/* Custom Alert */}
      <CustomAlert
        visible={showAlert}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setShowAlert(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02041A',
  },
  gradientBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'android' ? 50 : 0,
    paddingBottom: 10,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: 'bold',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 20,
    minHeight: '100%',
  },
  iconContainer: {
    marginBottom: 30,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    position: 'relative',
  },
  networkName: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
    flex: 1,
  },
  successBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  successInfoCard: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 15,
    padding: 15,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  successInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 5,
  },
  successInfoText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    marginLeft: 10,
    fontWeight: '500',
  },
  statusText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  statusDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 20,
  },
  loader: {
    marginVertical: 20,
  },
  messageContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 15,
    padding: 15,
    marginTop: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  messageLabel: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  messageText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 30,
    gap: 15,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    gap: 8,
  },

  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  successButton: {
    backgroundColor: '#4CAF50',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successNote: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    marginTop: 20,
    fontStyle: 'italic',
  },
  // Checklist Styles - Modern Design
  checklistContainer: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    alignItems: 'center',
  },
  checklistItemCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    marginBottom: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  checklistItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  checklistIconContainer: {
    marginRight: 16,
  },
  checklistIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistIconSuccess: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  checklistIconFailed: {
    backgroundColor: '#FF6B6B',
    shadowColor: '#FF6B6B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  checklistIconLoading: {
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
    borderWidth: 2,
    borderColor: '#4A90E2',
  },
  checklistIconPending: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  checklistContent: {
    flex: 1,
    alignItems: 'center',
  },
  checklistTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  checklistDescription: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.4)',
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    marginLeft: 10,
    flex: 1,
    fontWeight: '500',
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90E2',
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 28,
    marginTop: 24,
    gap: 10,
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dashboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 28,
    marginTop: 32,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
  },
  dashboardButtonText: {
    color: '#1D244D',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
