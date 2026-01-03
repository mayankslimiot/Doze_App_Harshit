import CustomAlert from '@/components/CustomAlert';
import { useBluetooth } from "@/contexts/BluetoothProvider";
import { useProvisioning } from "@/contexts/ProvisioningContext";
import { getBleManager } from '@/hooks/useBluetooth';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getForegroundPermissionsAsync,
  getProviderStatusAsync,
  requestForegroundPermissionsAsync
} from 'expo-location';
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  LayoutAnimation,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View
} from 'react-native';
import { Device } from 'react-native-ble-plx';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PREVIOUS_DEVICES_KEY = '@slimiot_previous_doze_devices';

export default function ScanScreen() {
  const router = useRouter();
  const { scannedDevices, isScanning, startScan, stopScan, requestPermissions, connectToDevice, connectionStatus } = useBluetooth();
  const { setSelectedDevice, setWifiProvisioningSuccess } = useProvisioning();
  
  const [previousDevices, setPreviousDevices] = useState<{id: string, name: string | null}[]>([]);
  const [hasPermission, setHasPermission] = useState(false);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [showConnectionAlert, setShowConnectionAlert] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertButtons, setAlertButtons] = useState<Array<{text: string, onPress: () => void}>>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [currentDevice, setCurrentDevice] = useState<Device | null>(null);
  const [bluetoothState, setBluetoothState] = useState<string>('Unknown');
  const [isCheckingBluetooth, setIsCheckingBluetooth] = useState(true);
  const [connectionStartTime, setConnectionStartTime] = useState<number | null>(null);

  const rotation = useRef(new Animated.Value(0)).current;
  const retryTimeoutRef = useRef<any>(null);
  const connectionTimeoutRef = useRef<any>(null);
  const appState = useRef(AppState.currentState);

  // Filter devices containing "doze" (case-insensitive)
  // COMMENTED OUT: Now showing all devices instead of filtering by "doze"
  // const filteredDevices = useMemo(() => {
  //   return scannedDevices.filter(d => d.name && d.name.toLowerCase().includes("doze"));
  // }, [scannedDevices]);
  
  // Show all scanned devices without filtering
  const filteredDevices = useMemo(() => {
    return scannedDevices;
  }, [scannedDevices]);

  // Get available device IDs
  const availableDeviceIds = useMemo(() => {
    return new Set(filteredDevices.map(d => d.id));
  }, [filteredDevices]);

  // Map previous devices with availability status
  const previousDevicesWithStatus = useMemo(() => {
    return previousDevices.map(d => ({
      ...d,
      isAvailable: availableDeviceIds.has(d.id)
    }));
  }, [previousDevices, availableDeviceIds]);

  // Available devices (excluding previous ones)
  const availableDevices = useMemo(() => {
    const previousDeviceIds = new Set(previousDevices.map(d => d.id));
    return filteredDevices.filter(d => !previousDeviceIds.has(d.id));
  }, [filteredDevices, previousDevices]);

  // Load previous devices from AsyncStorage
  useEffect(() => {
    const loadPreviousDevices = async () => {
      try {
        const jsonValue = await AsyncStorage.getItem(PREVIOUS_DEVICES_KEY);
        if (jsonValue != null) {
          setPreviousDevices(JSON.parse(jsonValue));
        }
      } catch (e) {
        console.error("Failed to load previous devices.", e);
      }
    };
    loadPreviousDevices();
  }, []);

  // Handle app state changes (for when user returns from settings)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to foreground, recheck permissions and Bluetooth
        console.log('App returned to foreground, rechecking...');
        await initializeBluetoothCheck();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Show alerts for different issues
  const showAlert = (type: 'bluetoothPermission' | 'locationPermission' | 'locationService' | 'bluetoothOff') => {
    switch (type) {
      case 'bluetoothPermission':
        setAlertTitle('Bluetooth Permission Required');
        setAlertMessage(
          'This app needs Bluetooth permissions to scan for and connect to Dozemate devices.\n\n' +
          'Please grant Bluetooth permissions in Settings.'
        );
        setAlertButtons([
          {
            text: 'Cancel',
            onPress: () => {
              setShowConnectionAlert(false);
              router.back();
            }
          },
          {
            text: 'Open Settings',
            onPress: () => {
              setShowConnectionAlert(false);
              Linking.openSettings();
            }
          }
        ]);
        break;

      case 'locationPermission':
        setAlertTitle('Location Permission Required');
        setAlertMessage(
          'Bluetooth scanning requires location permission on Android.\n\n' +
          'Please grant location permissions in Settings.'
        );
        setAlertButtons([
          {
            text: 'Cancel',
            onPress: () => {
              setShowConnectionAlert(false);
              router.back();
            }
          },
          {
            text: 'Open Settings',
            onPress: () => {
              setShowConnectionAlert(false);
              Linking.openSettings();
            }
          }
        ]);
        break;

      case 'locationService':
        setAlertTitle('Location Services Disabled');
        setAlertMessage(
          'Please enable Location Services to scan for Bluetooth devices.\n\n' +
          'Location Services are required for Bluetooth scanning on Android.'
        );
        setAlertButtons([
          {
            text: 'Cancel',
            onPress: () => {
              setShowConnectionAlert(false);
              router.back();
            }
          },
          {
            text: 'Open Settings',
            onPress: () => {
              setShowConnectionAlert(false);
              if (Platform.OS === 'android') {
                Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
              } else {
                Linking.openSettings();
              }
            }
          }
        ]);
        break;

      case 'bluetoothOff':
        setAlertTitle('Bluetooth is Off');
        setAlertMessage(
          'Please turn on Bluetooth to scan for Dozemate devices.\n\n' +
          'You can enable Bluetooth in your device settings.'
        );
        setAlertButtons([
          {
            text: 'Cancel',
            onPress: () => {
              setShowConnectionAlert(false);
              router.back();
            }
          },
          {
            text: 'Open Settings',
            onPress: () => {
              setShowConnectionAlert(false);
              if (Platform.OS === 'ios') {
                Linking.openURL('App-Prefs:Bluetooth');
              } else {
                Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
              }
            }
          }
        ]);
        break;
    }
    setShowConnectionAlert(true);
  };



  // Check location permission (required for BLE on Android)
  const checkLocationPermission = async (): Promise<boolean> => {
    try {
      console.log('📍 Checking location permission...');
      const { status } = await getForegroundPermissionsAsync();
      console.log(`📍 Location permission status: ${status}`);
      
      if (status !== 'granted') {
        console.log('📍 Requesting location permission...');
        const { status: newStatus } = await requestForegroundPermissionsAsync();
        console.log(`📍 New location permission status: ${newStatus}`);
        return newStatus === 'granted';
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error checking location permission:', error);
      return false;
    }
  };

  // Check if location services are enabled
  const checkLocationServices = async (): Promise<boolean> => {
    try {
      console.log('📍 Checking location services...');
      const providerStatus = await getProviderStatusAsync();
      console.log('📍 Location provider status:', providerStatus);
      
      if (!providerStatus.locationServicesEnabled) {
        console.log('⚠️ Location services are disabled');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error checking location services:', error);
      return false;
    }
  };

  // Check if Bluetooth is enabled
  const checkBluetoothState = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      const bleManager = getBleManager();
      
      // Subscribe to state changes to get current state
      const subscription = bleManager.onStateChange((state: string) => {
        console.log(`🔵 Current Bluetooth state: ${state}`);
        subscription.remove(); // Remove subscription after getting state
        
        if (state === 'PoweredOn') {
          resolve(true);
        } else {
          resolve(false);
        }
      }, true); // true = emit current state immediately
    });
  };

  // Initialize Bluetooth check with all validations
  const initializeBluetoothCheck = async () => {
    setIsCheckingBluetooth(true);
    
    // Step 1: Check Bluetooth permissions
    console.log('Step 1: Checking Bluetooth permissions...');
    const bluetoothGranted = await requestPermissions();
    setHasPermission(bluetoothGranted);
    
    if (!bluetoothGranted) {
      console.log('❌ Bluetooth permissions not granted');
      setIsCheckingBluetooth(false);
      showAlert('bluetoothPermission');
      return;
    }
    console.log('✅ Bluetooth permissions granted');
    
    // Step 2: Check location permission (required for BLE on Android)
    if (Platform.OS === 'android') {
      console.log('Step 2: Checking location permission...');
      const locationGranted = await checkLocationPermission();
      
      if (!locationGranted) {
        console.log('❌ Location permission not granted');
        setIsCheckingBluetooth(false);
        showAlert('locationPermission');
        return;
      }
      console.log('✅ Location permission granted');
      
      // Step 3: Check if location services are enabled
      console.log('Step 3: Checking location services...');
      const locationServicesEnabled = await checkLocationServices();
      
      if (!locationServicesEnabled) {
        console.log('❌ Location services are disabled');
        setIsCheckingBluetooth(false);
        showAlert('locationService');
        return;
      }
      console.log('✅ Location services enabled');
    }
    
    // Step 4: Check if Bluetooth is enabled
    console.log('Step 4: Checking Bluetooth state...');
    const isBluetoothOn = await checkBluetoothState();
    
    if (!isBluetoothOn) {
      console.log('❌ Bluetooth is off');
      setIsCheckingBluetooth(false);
      showAlert('bluetoothOff');
      return;
    }
    console.log('✅ Bluetooth is on');
    
    // Step 5: All checks passed, start scan
    console.log('Step 5: All checks passed, starting scan...');
    setIsCheckingBluetooth(false);
    startScan();
  };

  // Initial check on mount
  useEffect(() => {
    initializeBluetoothCheck();
    
    return () => {
      // Cleanup on unmount
      stopScan();
    };
  }, []);

  // Control rotation animation
  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    );

    if (isScanning) {
      animation.start();
    } else {
      animation.stop();
      rotation.setValue(0);
    }

    return () => animation.stop();
  }, [isScanning, rotation]);

  const handleRescan = async () => {
    if (isScanning) {
      // Already scanning, do nothing
      return;
    }
    
    console.log('🔄 Rescanning for devices...');
    
    // Re-run all checks before scanning
    await initializeBluetoothCheck();
  };

  const saveDevice = async (device: { id: string; name: string | null }) => {
    try {
      console.log(`Saving device to AsyncStorage: ${device.name} (${device.id})`);
      const newPreviousDevices = [device, ...previousDevices.filter(d => d.id !== device.id)];
      const jsonValue = JSON.stringify(newPreviousDevices);
      await AsyncStorage.setItem(PREVIOUS_DEVICES_KEY, jsonValue);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPreviousDevices(newPreviousDevices);
    } catch (e) {
      console.error("Failed to save device.", e);
    }
  };

  const handleConnect = async (device: Device, isAvailable: boolean) => {
    if (!isAvailable) {
      console.log('Device not available, cannot connect');
      return;
    }
    
    console.log(`Connecting to ${device.name} (${device.id})`);
    
    // Reset WiFi provisioning success flag for new device
    setWifiProvisioningSuccess(false);
    console.log('🔄 Reset WiFi provisioning success flag for new device');
    
    stopScan();
    setConnectingDeviceId(device.id);
    setCurrentDevice(device);
    setRetryCount(0);
    setConnectionStartTime(Date.now()); // Track connection start time
    
    // Save device to previous list
    await saveDevice({ id: device.id, name: device.name });
    
    // Attempt connection with retry logic
    attemptConnection(device, 0);
  };

  const attemptConnection = async (device: Device, attempt: number) => {
    try {
      console.log(`Connection attempt ${attempt + 1} for ${device.name}`);
      
      // Set timeout for this connection attempt (5 seconds per attempt)
      connectionTimeoutRef.current = setTimeout(() => {
        handleConnectionTimeout(device, attempt);
      }, 5000);

      await connectToDevice(device);
      
      // Clear timeout if connection succeeds
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      // Connection successful
      console.log(`Successfully connected to ${device.name}`);
      setSelectedDevice(device);
      
      // Calculate time elapsed since connection started
      const elapsedTime = connectionStartTime ? Date.now() - connectionStartTime : 0;
      const minimumDisplayTime = 2000; // 2 seconds minimum
      const remainingTime = Math.max(0, minimumDisplayTime - elapsedTime);
      
      // Wait for remaining time before navigating
      setTimeout(() => {
        setConnectingDeviceId(null);
        setConnectionStartTime(null);
        router.push("/(bluetooth)/WiFiSetupScreen");
      }, remainingTime);
      
    } catch (error) {
      console.error(`Connection attempt ${attempt + 1} failed:`, error);
      
      // Clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }

      handleConnectionTimeout(device, attempt);
    }
  };

  const handleConnectionTimeout = (device: Device, attempt: number) => {
    const maxAttempts = 6; // 6 attempts × 5 seconds = 30 seconds total
    
    if (attempt < maxAttempts - 1) {
      // Retry after 1 second
      console.log(`Retrying connection (${attempt + 2}/${maxAttempts})...`);
      setRetryCount(attempt + 1);
      
      retryTimeoutRef.current = setTimeout(() => {
        attemptConnection(device, attempt + 1);
      }, 1000);
    } else {
      // All attempts failed - reset states and show error
      console.log(`All connection attempts failed for ${device.name}`);
      setConnectingDeviceId(null);
      setConnectionStartTime(null);
      setRetryCount(0);
      setCurrentDevice(null);
      
      // Show error alert - stay on scan screen
      setAlertTitle('Connection Failed');
      setAlertMessage(
        `Unable to connect to ${device.name || 'device'}.\n\n` +
        'Please ensure:\n' +
        '• The device is powered on\n' +
        '• The device is in range\n' +
        '• The device is not connected to another phone'
      );
      setAlertButtons([
        {
          text: 'OK',
          onPress: () => {
            setShowConnectionAlert(false);
            // Stay on scan screen, optionally restart scanning
            if (!isScanning) {
              handleRescan();
            }
          }
        }
      ]);
      setShowConnectionAlert(true);
    }
  };

  const handleAlertClose = () => {
    setShowConnectionAlert(false);
    
    // Clear any pending timeouts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  };

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, []);

  const handleForget = async (deviceId: string) => {
    console.log(`Forgetting device: ${deviceId}`);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const newDevices = previousDevices.filter(d => d.id !== deviceId);
    setPreviousDevices(newDevices);
    try {
      const jsonValue = JSON.stringify(newDevices);
      await AsyncStorage.setItem(PREVIOUS_DEVICES_KEY, jsonValue);
    } catch (e) {
      console.error("Failed to save after forgetting device.", e);
    }
  };

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const renderDeviceItem = ({ item, section }: { item: any, section: { title: string } }) => {
    const isPrevious = section.title === 'Previously Connected';
    const isAvailable = isPrevious ? item.isAvailable : true;
    const device = isPrevious ? filteredDevices.find(d => d.id === item.id) : item;
    const isConnecting = connectingDeviceId === item.id;
    
    return (
      <BlurView intensity={25} tint="dark" style={styles.deviceItemContainer}>
        <View style={styles.deviceInfo}>
          <View style={styles.deviceIconContainer}>
            <Ionicons name="hardware-chip-outline" size={24} color="rgba(255, 255, 255, 0.8)" />
            <View style={[styles.statusDot, isAvailable ? styles.statusDotOnline : styles.statusDotOffline]} />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.deviceName} numberOfLines={1}>{item.name || 'Unknown Device'}</Text>
          </ScrollView>
        </View>
        <View style={styles.deviceActions}>
          {isConnecting ? (
            <View style={styles.connectingContainer}>
              <ActivityIndicator size="small" color="#4A90E2" />
              <Text style={styles.connectingText}>
                {retryCount > 0 ? `Retry ${retryCount}/6` : 'Connecting...'}
              </Text>
            </View>
          ) : (
            <>
              {isPrevious && (
                <TouchableOpacity onPress={() => handleForget(item.id)} style={styles.forgetButton}>
                  <Ionicons name="close-circle-outline" size={24} color="rgba(255, 255, 255, 0.6)" />
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                onPress={() => device && handleConnect(device, isAvailable)} 
                style={[
                  styles.connectButton,
                  !isAvailable && styles.connectButtonDisabled
                ]}
                disabled={connectingDeviceId !== null || !isAvailable}
              >
                <Text style={[
                  styles.connectButtonText,
                  !isAvailable && styles.connectButtonTextDisabled
                ]}>
                  Connect
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </BlurView>
    );
  };

  const sections = [
    ...(previousDevicesWithStatus.length > 0 ? [{ title: 'Previously Connected', data: previousDevicesWithStatus }] : []),
    { title: 'Available Devices', data: availableDevices },
  ];

  // Show loading state while checking Bluetooth
  if (isCheckingBluetooth) {
    return (
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>Checking Bluetooth...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconContainer}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Scan for Devices</Text>
        <View style={styles.headerIconContainer} />
      </View>



      <SectionList
        sections={sections}
        keyExtractor={(item, index) => item.id + index}
        renderItem={renderDeviceItem}
        renderSectionHeader={({ section: { title, data } }) => {
          const isAvailableDevices = title === 'Available Devices';
          const isPreviousDevices = title === 'Previously Connected';
          const showHeader = (isPreviousDevices && data.length > 0) || isAvailableDevices;

          if (!showHeader) return null;

          return (
            <View style={[styles.availableHeader, isAvailableDevices && previousDevicesWithStatus.length > 0 && { marginTop: 20 }]}>
              <Text style={styles.listHeader}>{title}</Text>
              {isAvailableDevices && (
                <View style={styles.scanControls}>
                  {isScanning && (
                    <TouchableOpacity 
                      onPress={stopScan} 
                      style={styles.stopScanButton}
                    >
                      <Ionicons name="close" size={22} color="#FF6B6B" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                    onPress={handleRescan} 
                    disabled={isScanning || connectingDeviceId !== null} 
                    style={styles.rescanIconContainer}
                  >
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <Ionicons 
                        name="refresh" 
                        size={22} 
                        color="#4A90E2"
                      />
                    </Animated.View>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.scanningContainer}>
            <Text style={styles.scanningText}>
              {isScanning ? 'Scanning for Dozemate devices...' : 'No devices found. Tap refresh to scan again.'}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContainer}
      />

      {/* Custom Alert for all notifications */}
      <CustomAlert
        visible={showConnectionAlert}
        title={alertTitle}
        message={alertMessage}
        buttons={alertButtons}
        onClose={handleAlertClose}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: Platform.OS === 'android' ? 50 : 0, paddingBottom: 10 },
  headerIconContainer: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerText: { color: '#FFF', fontSize: 26, fontWeight: 'bold' },
  listContainer: { paddingHorizontal: 20, paddingBottom: 20, flexGrow: 1 },
  listHeader: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 16, fontWeight: '600', marginBottom: 15 },
  availableHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deviceItemContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderRadius: 20, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  deviceInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 10, overflow: 'hidden' },
  deviceIconContainer: {
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#070a2aff',
  },
  statusDotOnline: {
    backgroundColor: '#4CAF50',
  },
  statusDotOffline: {
    backgroundColor: '#F44336',
  },
  scrollContent: { alignItems: 'center' },
  deviceName: { color: '#FFF', fontSize: 16, marginLeft: 15 },
  deviceActions: { flexDirection: 'row', alignItems: 'center' },
  connectButton: { backgroundColor: 'rgba(255, 255, 255, 0.9)', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 15 },
  connectButtonDisabled: { 
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  connectButtonText: { color: '#1D244D', fontWeight: 'bold' },
  connectButtonTextDisabled: {
    color: 'rgba(29, 36, 77, 0.4)',
  },
  forgetButton: { marginRight: 10 },
  scanningContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 },
  scanningText: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 16, textAlign: 'center' },
  scanControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopScanButton: {
    padding: 5,
    marginRight: 10,
  },
  rescanIconContainer: {
    padding: 5,
  },
  connectingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  connectingText: {
    color: '#4A90E2',
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '600',
  },
  retryText: {
    color: '#4A90E2',
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    marginTop: 15,
  },
});