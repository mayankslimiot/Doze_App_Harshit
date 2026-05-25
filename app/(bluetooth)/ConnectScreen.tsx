import CustomAlert from '@/components/CustomAlert';
import { useProvisioning } from "@/contexts/ProvisioningContext";
import { getBleManager } from '@/hooks/useBluetooth';
import { Ionicons } from '@expo/vector-icons';
import { Buffer } from "buffer";
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Platform, SafeAreaView, ScrollView, StyleSheet, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { Subscription } from 'react-native-ble-plx';
import { getWiFiStatus, autoRegisterDevice } from '@/services/deviceData';
import { 
  connectToWiFiProvisioningMQTT, 
  disconnectWiFiProvisioningMQTT,
  isWiFiProvisioningMQTTConnected 
} from '@/services/mqttService';
import { sendDeviceRegisteredNotification } from '@/services/Notifications';
import { useDevice } from '@/contexts/DeviceContext';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  const { isLightTheme } = useTheme();
  const { refreshDevices, setActiveDevice } = useDevice();

  const [currentStatus, setCurrentStatus] = useState<ProvisioningStatus>(ProvisioningStatus.IDLE);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(true);
  const [showAlert, setShowAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '', buttons: [] as any[] });
  const [lastErrorKey, setLastErrorKey] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  const [step1WiFiStatus, setStep1WiFiStatus] = useState<'pending' | 'loading' | 'success' | 'failed'>('pending');
  const [step2RegisterStatus, setStep2RegisterStatus] = useState<'pending' | 'loading' | 'success' | 'failed'>('pending');
  
  // Visual states to synchronize UI (text and checkmarks) with animations
  const [visualStep1Status, setVisualStep1Status] = useState<'pending' | 'loading' | 'success' | 'failed'>('pending');
  const [visualStep2Status, setVisualStep2Status] = useState<'pending' | 'loading' | 'success' | 'failed'>('pending');

  const [showSuccessState, setShowSuccessState] = useState(false);
  const [hasConnectorFinished, setHasConnectorFinished] = useState(false);
  
  // Animation Refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const step1Anim = useRef(new Animated.Value(0)).current;
  const connectorAnim = useRef(new Animated.Value(0)).current;
  const step2Anim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;
  const buttonSlideAnim = useRef(new Animated.Value(50)).current;
  const buttonOpacityAnim = useRef(new Animated.Value(0)).current;

  const mqttTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const serialNumberRef = useRef<string | null>(null);
  const mqttConnectedHandledRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);

  const PROVISION_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
  const STATUS_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";

  // Circle animation constants
  const CIRCLE_RADIUS = 22;
  const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

  // Fade in animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // Step 1 Ring Animation
  useEffect(() => {
    if (step1WiFiStatus === 'loading') {
      setVisualStep1Status('loading');
      Animated.timing(step1Anim, {
        toValue: 0.9,
        duration: 8000,
        useNativeDriver: true,
      }).start();
    } else if (step1WiFiStatus === 'success') {
      setVisualStep1Status('loading'); // Keep showing loading until animation completes
      Animated.timing(step1Anim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setVisualStep1Status('success');
          Animated.timing(connectorAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }).start(({ finished: connectorFinished }) => {
            if (connectorFinished) {
              setHasConnectorFinished(true);
            }
          });
        }
      });
    } else if (step1WiFiStatus === 'pending') {
      setVisualStep1Status('pending');
      step1Anim.setValue(0);
      connectorAnim.setValue(0);
    } else if (step1WiFiStatus === 'failed') {
      setVisualStep1Status('failed');
    }
  }, [step1WiFiStatus]);

  // Step 2 Ring Animation
  useEffect(() => {
    if (!hasConnectorFinished && step2RegisterStatus !== 'pending') {
      return; // Wait for the connector line to finish before starting Step 2 animations
    }

    if (step2RegisterStatus === 'loading') {
      setVisualStep2Status('loading');
      Animated.timing(step2Anim, {
        toValue: 0.9,
        duration: 6000,
        useNativeDriver: true,
      }).start();
    } else if (step2RegisterStatus === 'success') {
      setVisualStep2Status('loading'); // Keep showing loading until animation completes
      Animated.timing(step2Anim, {
        toValue: 1,
        duration: 2000, // Enforces at least 2 seconds before finishing
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setVisualStep2Status('success');
          setShowSuccessState(true);
          Animated.parallel([
            Animated.timing(buttonSlideAnim, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(buttonOpacityAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            })
          ]).start();
        }
      });
    } else if (step2RegisterStatus === 'pending') {
      setVisualStep2Status('pending');
      step2Anim.setValue(0);
    } else if (step2RegisterStatus === 'failed') {
      setVisualStep2Status('failed');
    }
  }, [step2RegisterStatus, hasConnectorFinished]);

  useEffect(() => {
    serialNumberRef.current = serialNumber;
  }, [serialNumber]);

  useEffect(() => {
    retryCountRef.current = retryCount;
  }, [retryCount]);

  useEffect(() => {
    const readSerialNumber = async () => {
      if (!selectedDeviceId || serialNumber) return;

      try {
        const bleManager = getBleManager();
        const DEVICE_INFO_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
        const SERIAL_NUMBER_CHAR_UUID = '00002a25-0000-1000-8000-00805f9b34fb';
        
        const char = await bleManager.readCharacteristicForDevice(
          selectedDeviceId,
          DEVICE_INFO_SERVICE_UUID,
          SERIAL_NUMBER_CHAR_UUID
        );
        
        if (char?.value) {
          const decoded = Buffer.from(char.value, 'base64').toString('utf-8');
          setSerialNumber(decoded);
        }
      } catch (error) {
        console.error('❌ Error reading serial number:', error);
      }
    };

    readSerialNumber();
  }, [selectedDeviceId, serialNumber, setSerialNumber]);

  const handleMQTTConnected = async () => {
    if (mqttConnectedHandledRef.current) return;
    mqttConnectedHandledRef.current = true;
    
    if (mqttTimeoutRef.current) {
      clearTimeout(mqttTimeoutRef.current);
      mqttTimeoutRef.current = null;
    }
    
    if (apiPollIntervalRef.current) {
      clearInterval(apiPollIntervalRef.current);
      apiPollIntervalRef.current = null;
    }
    
    disconnectWiFiProvisioningMQTT();
    setStep1WiFiStatus('success');
    
    const serialForRegistration = serialNumberRef.current || serialNumber || selectedDeviceId;
    if (!serialForRegistration) {
      setStep1WiFiStatus('failed');
      setCurrentStatus(ProvisioningStatus.FAILED);
      setStatusMessage('Device connected but no identifier available for registration');
      setIsProcessing(false);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 900));

    setStep2RegisterStatus('loading');
    setCurrentStatus(ProvisioningStatus.REGISTERING);
    setIsProcessing(true);

    try {
      const registrationResult = await autoRegisterDevice(serialForRegistration, selectedDeviceId || undefined);

      if (registrationResult.success) {
        setStep2RegisterStatus('success');
        setCurrentStatus(ProvisioningStatus.SUCCESS);
        setStatusMessage('Device registered successfully');
        setLastErrorKey(null);
        setIsProcessing(false);
        setWifiProvisioningSuccess(true);
        setRetryCount(0);
        retryCountRef.current = 0;
        
        try {
          await sendDeviceRegisteredNotification(serialForRegistration);
        } catch (notifError) {}
        
        try {
          await refreshDevices();
          if (registrationResult.device) {
            await setActiveDevice(registrationResult.device);
          }
        } catch (refreshError) {}

        const backendDeviceId = registrationResult.device?.deviceId?.trim().toUpperCase();
        if (selectedDeviceId && backendDeviceId) {
          try {
            const key = '@slimiot_ble_to_backend_device_id';
            const raw = await AsyncStorage.getItem(key);
            const map: Record<string, string> = raw ? JSON.parse(raw) : {};
            map[selectedDeviceId] = backendDeviceId;
            await AsyncStorage.setItem(key, JSON.stringify(map));
            
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
      } else {
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
      setStep2RegisterStatus('failed');
      setCurrentStatus(ProvisioningStatus.FAILED);
      setStatusMessage(error instanceof Error ? error.message : 'Registration failed. Please try again.');
      setIsProcessing(false);
    }
  };

  const handleMQTTTimeout = () => {
    setStep1WiFiStatus('failed');
    disconnectWiFiProvisioningMQTT();
    
    if (apiPollIntervalRef.current) {
      clearInterval(apiPollIntervalRef.current);
      apiPollIntervalRef.current = null;
    }
    
    const currentRetryCount = retryCountRef.current;
    
    if (currentRetryCount < 3) {
      setCurrentStatus(ProvisioningStatus.FAILED);
      setIsProcessing(false);
    } else {
      setRetryCount(0);
      retryCountRef.current = 0;
      setStep1WiFiStatus('pending');
      setStep2RegisterStatus('pending');
      setTimeout(() => {
        cleanupBleConnection();
        router.replace('/(bluetooth)/ScanScreen');
      }, 2000);
    }
    mqttTimeoutRef.current = null;
  };

  const initiateProvisioning = async () => {
    try {
      let currentSerialNumber = serialNumberRef.current || serialNumber;
      if (!currentSerialNumber) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        currentSerialNumber = serialNumberRef.current || serialNumber;
        if (!currentSerialNumber) {
          const fallbackId = selectedDeviceId || '';
          if (fallbackId) {
            setSerialNumber(fallbackId);
          }
        }
      }

      const success = await sendWifiCredentials();
      if (!success) {
        throw new Error('Failed to send WiFi credentials');
      }
      
      const serialForMQTT = serialNumberRef.current || serialNumber || selectedDeviceId;
      mqttConnectedHandledRef.current = false;
      
      const mqttClient = connectToWiFiProvisioningMQTT(serialForMQTT as string, handleMQTTConnected);
      
      if (!mqttClient) {
        throw new Error('Failed to connect to MQTT broker');
      }

      setCurrentStatus(ProvisioningStatus.CONNECTING);
      setStep1WiFiStatus('loading');
      setStep2RegisterStatus('pending');
      setIsProcessing(true);
      setLastErrorKey(null);

      mqttTimeoutRef.current = setTimeout(() => {
        handleMQTTTimeout();
      }, 20000);

    } catch (error) {
      if (mqttTimeoutRef.current) {
        clearTimeout(mqttTimeoutRef.current);
        mqttTimeoutRef.current = null;
      }
      disconnectWiFiProvisioningMQTT();
      
      setStep1WiFiStatus('failed');
      setCurrentStatus(ProvisioningStatus.FAILED);
      setStatusMessage(error instanceof Error ? error.message : 'Failed to send credentials');
      setIsProcessing(false);
      
      if (retryCountRef.current >= 3) {
        setTimeout(() => {
          cleanupBleConnection();
          router.replace('/(bluetooth)/ScanScreen');
        }, 2000);
      }
    }
  };

  const cleanupBleConnection = async (disconnectBle = true) => {
    try {
      if (mqttTimeoutRef.current) {
        clearTimeout(mqttTimeoutRef.current);
        mqttTimeoutRef.current = null;
      }
      disconnectWiFiProvisioningMQTT();
      if (apiPollIntervalRef.current) {
        clearInterval(apiPollIntervalRef.current);
        apiPollIntervalRef.current = null;
      }
      if (disconnectBle && selectedDeviceId) {
        const bleManager = getBleManager();
        const isConnected = await bleManager.isDeviceConnected(selectedDeviceId);
        if (isConnected) {
          await bleManager.cancelDeviceConnection(selectedDeviceId);
        }
      }
    } catch (error) {}
  };

  useEffect(() => {
    if (currentStatus === ProvisioningStatus.SUCCESS) {
      setIsProcessing(false);
    } else if (currentStatus === ProvisioningStatus.FAILED || currentStatus === ProvisioningStatus.SSID_NOT_FOUND) {
      setIsProcessing(false);
    } else if (currentStatus === ProvisioningStatus.CONNECTING) {
      setIsProcessing(true);
    }
  }, [currentStatus]);

  useEffect(() => {
    if (!selectedDeviceId) {
      router.back();
      return;
    }
    initiateProvisioning();
    return () => {
      cleanupBleConnection(false); // Component unmount shouldn't force BLE drop if user just hit back
    };
  }, []);

  const handleRetry = async () => {
    const currentRetryCount = retryCountRef.current;
    if (currentRetryCount >= 3) {
      await cleanupBleConnection();
      router.replace('/(bluetooth)/ScanScreen');
      return;
    }
    setRetryCount(currentRetryCount + 1);
    setStep1WiFiStatus('pending');
    setStep2RegisterStatus('pending');
    setCurrentStatus(ProvisioningStatus.IDLE);
    setIsProcessing(true);
    mqttConnectedHandledRef.current = false;
    
    // Reset animations
    step1Anim.setValue(0);
    connectorAnim.setValue(0);
    step2Anim.setValue(0);
    successAnim.setValue(0);
    buttonSlideAnim.setValue(50);
    buttonOpacityAnim.setValue(0);
    setVisualStep1Status('pending');
    setVisualStep2Status('pending');
    setShowSuccessState(false);
    setHasConnectorFinished(false);

    setTimeout(() => initiateProvisioning(), 500);
  };

  const handleGoToDashboard = async () => {
    setWifiProvisioningSuccess(true);
    await cleanupBleConnection();
    router.replace('/(tabs)/home');
  };

  const handleCancel = async () => {
    await cleanupBleConnection(false); // Don't disconnect BLE so the previous screen stays connected
    router.back();
  };

  // Helper styles based on status
  const getStepColor = (status: string) => {
    if (status === 'success') return '#22c97a';
    if (status === 'loading') return '#3b7ef8';
    if (status === 'failed') return '#FF6B6B';
    return '#1e3464';
  };

  const getStepText = (stepNum: number, status: string, errorMsg: string) => {
    if (status === 'success') {
      return stepNum === 1 ? 'WiFi connected successfully' : 'Device registered successfully';
    }
    if (status === 'loading') {
      return stepNum === 1 ? 'Connecting to WiFi network...' : 'Registering your device...';
    }
    if (status === 'failed') {
      return stepNum === 1 ? 'WiFi connection failed' : (errorMsg || 'Registration failed');
    }
    return 'Waiting...';
  };

  const step1StrokeDashoffset = step1Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0]
  });

  const step2StrokeDashoffset = step2Anim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0]
  });

  const connectorHeight = connectorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%']
  });

  const successScale = successAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1]
  });

  // Force dark theme background color (#0c1a3a) as per request
  return (
    <SafeAreaView style={[styles.container, isLightTheme && styles.containerLight]}>
      <StatusBar barStyle={isLightTheme ? "dark-content" : "light-content"} backgroundColor={isLightTheme ? "#F8F9FA" : "#0c1a3a"} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.headerIconContainer}>
          <Ionicons name="arrow-back" size={24} color={isLightTheme ? "#111111" : "#FFF"} />
        </TouchableOpacity>
        <Text style={[styles.headerText, isLightTheme && styles.headerTextLight]}>Setting Up Dozemate</Text>
        <View style={styles.headerIconContainer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          
          {/* Stepper Container */}
          <View style={styles.stepperContainer}>
              <View style={styles.stepperInner}>
                
                {/* Connector Line Container */}
                <View style={styles.connectorContainer}>
                  <View style={[styles.connectorBg, isLightTheme && styles.connectorBgLight]} />
                  <Animated.View style={[styles.connectorFg, { height: connectorHeight }]} />
                </View>

                {/* Step 1 */}
                <View style={styles.stepRow}>
                <View style={styles.ringContainer}>
                  <Svg width={52} height={52} viewBox="0 0 52 52">
                    <Circle cx="26" cy="26" r={CIRCLE_RADIUS} stroke={isLightTheme ? "#E5E7EB" : "#1e3464"} strokeWidth="4" fill={isLightTheme ? "#F8F9FA" : "#0c1a3a"} />
                    <AnimatedCircle 
                      cx="26" cy="26" r={CIRCLE_RADIUS} 
                      stroke={getStepColor(visualStep1Status)} 
                      strokeWidth="4" fill="none"
                      strokeDasharray={`${CIRCUMFERENCE}`}
                      strokeDashoffset={step1StrokeDashoffset}
                      strokeLinecap="round"
                      rotation={-90}
                      originX="26" 
                      originY="26"
                    />
                  </Svg>
                  <View style={styles.ringInnerContent}>
                    {visualStep1Status === 'success' ? (
                      <Ionicons name="checkmark" size={20} color="#22c97a" />
                    ) : visualStep1Status === 'failed' ? (
                      <Ionicons name="close" size={20} color="#FF6B6B" />
                    ) : visualStep1Status === 'loading' ? (
                      <ActivityIndicator size="small" color="#3b7ef8" />
                    ) : (
                      <Text style={[styles.ringText, isLightTheme && styles.ringTextLight]}>1</Text>
                    )}
                  </View>
                </View>
                
                <View style={styles.stepCard}>
                  <Text style={[styles.stepCardTitle, isLightTheme && styles.stepCardTitleLight]} numberOfLines={1} ellipsizeMode="tail">Connecting WiFi</Text>
                  <Text style={[styles.stepCardSubtitle, isLightTheme && styles.stepCardSubtitleLight]} numberOfLines={1} ellipsizeMode="tail">
                    {getStepText(1, visualStep1Status, statusMessage)}
                  </Text>
                </View>
              </View>

              {/* Spacer for connector line length */}
              <View style={styles.stepSpacer} />

              {/* Step 2 */}
              <View style={styles.stepRow}>
                <View style={styles.ringContainer}>
                  <Svg width={52} height={52} viewBox="0 0 52 52">
                    <Circle cx="26" cy="26" r={CIRCLE_RADIUS} stroke={isLightTheme ? "#E5E7EB" : "#1e3464"} strokeWidth="4" fill={isLightTheme ? "#F8F9FA" : "#0c1a3a"} />
                    <AnimatedCircle 
                      cx="26" cy="26" r={CIRCLE_RADIUS} 
                      stroke={getStepColor(visualStep2Status)} 
                      strokeWidth="4" fill="none"
                      strokeDasharray={`${CIRCUMFERENCE}`}
                      strokeDashoffset={step2StrokeDashoffset}
                      strokeLinecap="round"
                      rotation={-90}
                      originX="26" 
                      originY="26"
                    />
                  </Svg>
                  <View style={styles.ringInnerContent}>
                    {visualStep2Status === 'success' ? (
                      <Ionicons name="checkmark" size={20} color="#22c97a" />
                    ) : visualStep2Status === 'failed' ? (
                      <Ionicons name="close" size={20} color="#FF6B6B" />
                    ) : visualStep2Status === 'loading' ? (
                      <ActivityIndicator size="small" color="#3b7ef8" />
                    ) : (
                      <Text style={[styles.ringText, isLightTheme && styles.ringTextLight]}>2</Text>
                    )}
                  </View>
                </View>
                
                <View style={styles.stepCard}>
                  <Text style={[styles.stepCardTitle, isLightTheme && styles.stepCardTitleLight]} numberOfLines={1} ellipsizeMode="tail">Register Device</Text>
                  <Text style={[styles.stepCardSubtitle, isLightTheme && styles.stepCardSubtitleLight]} numberOfLines={1} ellipsizeMode="tail">
                    {getStepText(2, visualStep2Status, statusMessage)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Fixed-height Action Container to prevent UI shift */}
          <View style={{ minHeight: 160, width: '100%', alignItems: 'center', justifyContent: 'flex-start', marginTop: 10 }}>
            {/* Error Retry Info */}
            {!showSuccessState && (visualStep1Status === 'failed' || visualStep2Status === 'failed') && retryCountRef.current < 3 && (
               <TouchableOpacity
               onPress={handleRetry}
               style={styles.retryButton}
             >
               <Ionicons name="refresh" size={20} color="#FFF" />
               <Text style={styles.retryButtonText}>Retry</Text>
             </TouchableOpacity>
            )}

            {/* Success Dashboard Button */}
            {showSuccessState && (
              <Animated.View style={{ 
                opacity: buttonOpacityAnim, 
                transform: [{ translateY: buttonSlideAnim }], 
                width: '100%', 
                alignItems: 'center',
                marginTop: 20
              }}>
                <TouchableOpacity
                  onPress={handleGoToDashboard}
                  style={[styles.dashboardButton, isLightTheme && styles.dashboardButtonLight]}
                >
                  <Ionicons name="home" size={20} color="#FFF" />
                  <Text style={styles.dashboardButtonText}>Go to Dashboard</Text>
                </TouchableOpacity>
              </Animated.View>
            )}

          </View>

        </Animated.View>
      </ScrollView>

      {/* Custom Alert */}
      <CustomAlert
        visible={showAlert}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        isLight={isLightTheme}
        onClose={() => setShowAlert(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c1a3a', // Dark deep navy
  },
  containerLight: {
    backgroundColor: '#F8F9FA',
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
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerTextLight: {
    color: '#111111',
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
    paddingHorizontal: 24,
    paddingVertical: 20,
    minHeight: '100%',
  },
  stepperContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
  },
  stepperInner: {
    position: 'relative',
    width: 280, // Reduced width so the visual weight feels more centered, less pushed to the left
  },
  connectorContainer: {
    position: 'absolute',
    left: 25, // Centered behind the 52px circle (26 - half width)
    top: 58, // Bottom edge of 1st circle (32 center + 26 radius)
    bottom: 58, // Top edge of 2nd circle
    width: 2,
    zIndex: 0,
  },
  connectorBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1e3464',
  },
  connectorBgLight: {
    backgroundColor: '#E5E7EB',
  },
  connectorFg: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    backgroundColor: '#22c97a',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64, // Fixed height to strictly prevent layout shifts when text changes/wraps
    zIndex: 2,
  },
  stepSpacer: {
    height: 40, // Height of the connector line between steps
    width: '100%',
  },
  ringContainer: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringInnerContent: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringText: {
    color: '#1e3464',
    fontSize: 18,
    fontWeight: 'bold',
  },
  ringTextLight: {
    color: '#666666',
  },
  stepCard: {
    flex: 1,
    marginLeft: 20,
    justifyContent: 'center',
  },
  stepCardTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  stepCardTitleLight: {
    color: '#111111',
  },
  stepCardSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
  },
  stepCardSubtitleLight: {
    color: '#666666',
  },
  successCheckContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  successCheckCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(34, 201, 122, 0.1)',
    borderWidth: 2,
    borderColor: '#22c97a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b7ef8',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 28,
    gap: 10,
    shadowColor: '#3b7ef8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    width: '100%',
  },
  dashboardButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  dashboardButtonLight: {
    backgroundColor: '#0061A4',
    shadowColor: '#0061A4',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b7ef8',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 24,
    marginTop: 40,
    gap: 10,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
