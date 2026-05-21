import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
  RefreshControl,
  TextInput,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBluetooth } from '@/contexts/BluetoothProvider';
import { useDevice } from '@/contexts/DeviceContext';
import { useProvisioning } from '@/contexts/ProvisioningContext';
import { isWebSocketConnected, disconnectWebSocket, unsubscribeFromDevice } from '@/services/websocketService';
import { useTheme } from '@/contexts/ThemeContext';
import { activateDevice, updateDeviceName, deleteDevice, removeSharedDevice, cleanupLocalBleStores } from '@/services/deviceData';

const BLE_TO_BACKEND_DEVICE_ID_KEY = '@slimiot_ble_to_backend_device_id';

/** Normalize BLE id to 12-char hex for MAC comparison (strip colons/dashes, uppercase) */
function normalizeBleIdToMac(bleId: string): string {
  if (!bleId) return '';
  const cleaned = bleId.replace(/[:\-]/g, '').toUpperCase();
  return cleaned.length >= 12 ? cleaned.slice(-12) : cleaned;
}

/** Extract 12-char MAC from backend deviceId format "NNNN-XXXXXXXXXXXX" or "XXXXXXXXXXXX" */
function macFromBackendDeviceId(deviceId: string): string {
  const s = (deviceId || '').replace(/:/g, '').toUpperCase();
  const match = s.match(/([0-9A-F]{12})$/);
  return match ? match[1] : s.slice(-12);
}

export default function AllDevicesScreen() {
  const insets = useSafeAreaInsets();
  const { isLightTheme } = useTheme();
  const router = useRouter();
  const { devices, ownedDevices, sharedDevices, activeDevice, refreshDevices, setActiveDevice } = useDevice();
  const { connectedDevice, connectionStatus, startScan, stopScan, scannedDevices, connectToDevice } = useBluetooth();
  const { setSelectedDevice } = useProvisioning();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCheckingWifiDevice, setIsCheckingWifiDevice] = useState(false);
  const [isConnectingToWifiDevice, setIsConnectingToWifiDevice] = useState(false);
  const wifiCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isDeletingDevice, setIsDeletingDevice] = useState(false);
  const [nameError, setNameError] = useState<string>('');
  const [switchingDeviceId, setSwitchingDeviceId] = useState<string | null>(null);
  const radioAnimations = useRef<{ [key: string]: Animated.Value }>({});

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshDevices();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initialize animation values for devices
  useEffect(() => {
    if (devices) {
      devices.forEach((device) => {
        if (!radioAnimations.current[device.deviceId]) {
          const isActive = device.deviceId === activeDevice?.deviceId;
          radioAnimations.current[device.deviceId] = new Animated.Value(isActive ? 1 : 0);
        } else {
          // Update existing animation value if device becomes active/inactive
          const isActive = device.deviceId === activeDevice?.deviceId;
          const currentValue = radioAnimations.current[device.deviceId];
          if (currentValue) {
            currentValue.setValue(isActive ? 1 : 0);
          }
        }
      });
    }
  }, [devices, activeDevice]);

  // Update animations when active device changes (only for passive updates, not during manual switch)
  useEffect(() => {
    if (devices && activeDevice && !switchingDeviceId) {
      devices.forEach((device) => {
        const animValue = radioAnimations.current[device.deviceId];
        if (animValue) {
          const isActive = device.deviceId === activeDevice.deviceId;
          Animated.timing(animValue, {
            toValue: isActive ? 1 : 0,
            duration: 300,
            useNativeDriver: false,
          }).start();
        }
      });
    }
  }, [activeDevice, devices, switchingDeviceId]);

  const handleSwitchDevice = async (device: any) => {
    if (device.deviceId === activeDevice?.deviceId) {
      return; // Already active
    }

    setSwitchingDeviceId(device.deviceId);

    try {
      const oldDeviceId = activeDevice?.deviceId;
      
      // Animate radio button selection
      const oldAnimValue = oldDeviceId ? radioAnimations.current[oldDeviceId] : null;
      const newAnimValue = radioAnimations.current[device.deviceId];
      
      // Start animation immediately for visual feedback
      if (oldAnimValue) {
        Animated.timing(oldAnimValue, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }).start();
      }
      
      if (newAnimValue) {
        Animated.timing(newAnimValue, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }).start();
      }
      
      console.log(`[AllDevices] Switching from device ${oldDeviceId} to ${device.deviceId}`);
      
      // Unsubscribe from old device if WebSocket is connected
      if (oldDeviceId && isWebSocketConnected()) {
        console.log(`[AllDevices] Unsubscribing from old device: ${oldDeviceId}`);
        unsubscribeFromDevice(oldDeviceId);
      }
      
      // Disconnect current WebSocket completely
      console.log('[AllDevices] Disconnecting WebSocket...');
      disconnectWebSocket();
      
      // Call backend API to activate device
      console.log(`[AllDevices] Activating device on backend: ${device.deviceId}`);
      const result = await activateDevice(device.deviceId);
      
      if (result.success) {
        console.log('[AllDevices] Backend activation successful');
        
        // Update active device in context
        await setActiveDevice(device);
        console.log('[AllDevices] Active device updated in context');
        
        // Refresh device list
        await refreshDevices();
        console.log('[AllDevices] Device list refreshed');
        
        // Note: WebSocket will be reconnected automatically by home screen's useEffect
        // when activeDevice changes. We don't need to connect here as the home screen
        // will handle it dynamically.
        console.log('[AllDevices] WebSocket will reconnect automatically on home screen');
      } else {
        console.error('[AllDevices] Failed to switch device:', result.message);
        // Revert animation on failure
        if (oldAnimValue) {
          Animated.timing(oldAnimValue, {
            toValue: 1,
            duration: 300,
            useNativeDriver: false,
          }).start();
        }
        if (newAnimValue) {
          Animated.timing(newAnimValue, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
          }).start();
        }
      }
    } catch (error: any) {
      console.error('[AllDevices] Error switching device:', error);
      // Revert animation on error
      const oldDeviceId = activeDevice?.deviceId;
      const oldAnimValue = oldDeviceId ? radioAnimations.current[oldDeviceId] : null;
      const newAnimValue = radioAnimations.current[device.deviceId];
      if (oldAnimValue) {
        Animated.timing(oldAnimValue, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }).start();
      }
      if (newAnimValue) {
        Animated.timing(newAnimValue, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }).start();
      }
    } finally {
      setSwitchingDeviceId(null);
    }
  };

  // Helper function to get display name for device
  const getDeviceDisplayName = (device: any) => {
    return device.customName || device.defaultName || device.deviceId;
  };

  // Handle rename device
  const handleRenameDevice = (device: any) => {
    setEditingDeviceId(device.deviceId);
    setEditingName(device.customName || '');
    setNameError('');
  };

  const handleRemoveShared = (deviceId: string) => {
    Alert.alert(
      'Remove shared device',
      'Remove this device from your account? You will no longer see its data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await removeSharedDevice(deviceId);
              if (result.success) await refreshDevices();
              else Alert.alert('Error', result.message ?? 'Failed to remove');
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Something went wrong');
            }
          },
        },
      ]
    );
  };

  // Validate device name for duplicates
  const validateDeviceName = (name: string): boolean => {
    if (!name || !name.trim()) {
      setNameError('');
      return true; // Empty name is allowed (uses device ID)
    }

    const trimmedName = name.trim();
    
    // Get current device's existing name
    const currentDevice = devices?.find(d => d.deviceId === editingDeviceId);
    const currentDeviceName = currentDevice?.customName?.toLowerCase() || '';
    
    // Check if name already exists for another device (excluding current device)
    const nameExists = devices?.some(device => 
      device.deviceId !== editingDeviceId && 
      device.customName && 
      device.customName.toLowerCase() === trimmedName.toLowerCase()
    );

    // Allow if it's the same as current device's name
    if (trimmedName.toLowerCase() === currentDeviceName) {
      setNameError('');
      return true;
    }

    if (nameExists) {
      setNameError('Already exist please use different name');
      return false;
    }

    setNameError('');
    return true;
  };

  // Handle name input change with validation
  const handleNameChange = (text: string) => {
    setEditingName(text);
    if (text.trim()) {
      validateDeviceName(text);
    } else {
      setNameError('');
    }
  };

  const handleSaveName = async () => {
    if (!editingDeviceId) return;

    const trimmedName = editingName.trim();
    
    // Validate name length
    if (trimmedName.length > 50) {
      Alert.alert('Error', 'Device name must be 50 characters or less');
      return;
    }

    // Validate for duplicates
    if (!validateDeviceName(trimmedName)) {
      return; // Error message already set
    }

    try {
      setIsSavingName(true);
      const result = await updateDeviceName(editingDeviceId, trimmedName || null);
      
      if (result.success) {
        // Refresh device list to get updated names
        await refreshDevices();
        setEditingDeviceId(null);
        setEditingName('');
        setNameError('');
        Alert.alert('Success', result.message || 'Device name updated');
      } else {
        Alert.alert('Error', result.message || 'Failed to update device name');
      }
    } catch (error: any) {
      console.error('Error saving device name:', error);
      Alert.alert('Error', error.message || 'Failed to update device name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelEdit = () => {
    if (wifiCheckTimeoutRef.current) {
      clearTimeout(wifiCheckTimeoutRef.current);
      wifiCheckTimeoutRef.current = null;
    }
    if (isCheckingWifiDevice) {
      stopScan();
      setIsCheckingWifiDevice(false);
    }
    setIsConnectingToWifiDevice(false);
    setEditingDeviceId(null);
    setEditingName('');
    setNameError('');
  };

  const showDeviceNotConnectedAlert = () => {
    const backendDeviceId = editingDeviceId;
    const deviceName = backendDeviceId ? (devices?.find((d) => d.deviceId === backendDeviceId)?.customName || backendDeviceId) : 'device';
    Alert.alert(
      'Dozemate Not Found',
      `Could not find "${deviceName}" nearby.\n\nPlease ensure:\n• The device is turned on\n• Bluetooth is enabled on your phone\n• The device is within range\n\nThen try again or go to Scan to connect.`,
      [
        { text: 'OK', style: 'cancel' },
        {
          text: 'Scan for Device',
          onPress: () => {
            handleCancelEdit();
            router.push('/(bluetooth)/ScanScreen');
          },
        },
      ]
    );
  };

  // Cleanup wifi check on unmount
  useEffect(() => {
    return () => {
      if (wifiCheckTimeoutRef.current) {
        clearTimeout(wifiCheckTimeoutRef.current);
        wifiCheckTimeoutRef.current = null;
      }
      if (isCheckingWifiDevice) {
        stopScan();
      }
    };
  }, []);

  // When scanning for Change WiFi: watch scannedDevices for a matching device
  useEffect(() => {
    if (!isCheckingWifiDevice || !editingDeviceId || scannedDevices.length === 0) return;

    const targetBackendId = editingDeviceId.trim().toUpperCase();

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BLE_TO_BACKEND_DEVICE_ID_KEY);
        const bleIdToBackendDeviceId: Record<string, string> = raw ? JSON.parse(raw) : {};

        const targetDevice = devices?.find((d) => d.deviceId === editingDeviceId);
        const targetBleMac = (targetDevice?.bleMac ?? '')?.replace(/[:\-]/g, '').toUpperCase().slice(-12);
        const targetMac = targetBleMac || macFromBackendDeviceId(targetBackendId);
        const matchingDevice = scannedDevices.find((d) => {
          const dNorm = normalizeBleIdToMac(d.id);
          if (!dNorm || dNorm.length !== 12) return false;
          if (targetBleMac && targetBleMac.length === 12 && dNorm === targetBleMac) return true;
          const mappedBackendId = (bleIdToBackendDeviceId[d.id] ?? '')?.trim().toUpperCase();
          if (mappedBackendId === targetBackendId) return true;
          const mapKeysForTarget = Object.entries(bleIdToBackendDeviceId)
            .filter(([, v]) => (v ?? '').trim().toUpperCase() === targetBackendId)
            .map(([k]) => k);
          if (mapKeysForTarget.some((k) => normalizeBleIdToMac(k) === dNorm)) return true;
          if (targetMac && targetMac.length === 12 && dNorm === targetMac) return true;
          return false;
        });

        if (matchingDevice) {
          if (wifiCheckTimeoutRef.current) {
            clearTimeout(wifiCheckTimeoutRef.current);
            wifiCheckTimeoutRef.current = null;
          }
          stopScan();
          setIsConnectingToWifiDevice(true);
          try {
            await connectToDevice(matchingDevice);
            setSelectedDevice(matchingDevice);
            handleCancelEdit();
            router.push('/(bluetooth)/WiFiSetupScreen');
          } catch (connErr) {
            console.error('[AllDevices] connectToDevice failed:', connErr);
            setIsCheckingWifiDevice(false);
            setIsConnectingToWifiDevice(false);
            showDeviceNotConnectedAlert();
          }
        }
      } catch (_) {}
    })();
  }, [isCheckingWifiDevice, editingDeviceId, scannedDevices, devices]);

  const handleChangeWifi = async () => {
    const backendDeviceId = editingDeviceId;
    if (!backendDeviceId) return;

    if (isCheckingWifiDevice) return;

    try {
      const raw = await AsyncStorage.getItem(BLE_TO_BACKEND_DEVICE_ID_KEY);
      const bleIdToBackendDeviceId: Record<string, string> = raw ? JSON.parse(raw) : {};
      const targetBackendId = backendDeviceId.trim().toUpperCase();

      // 1. If already connected and matches, go directly to WiFi setup
      const isBleConnected = connectionStatus === 'connected' && connectedDevice;
      const connectedBleId = connectedDevice?.id;
      const mappedBackendId = connectedBleId
        ? (bleIdToBackendDeviceId[connectedBleId] ?? '')?.trim().toUpperCase()
        : '';
      const targetDevice = devices?.find((d) => d.deviceId === backendDeviceId);
      const targetBleMac = (targetDevice?.bleMac ?? '')?.replace(/[:\-]/g, '').toUpperCase().slice(-12);
      const targetMac = targetBleMac || macFromBackendDeviceId(targetBackendId);
      const connectedBleMac = connectedBleId ? normalizeBleIdToMac(connectedBleId) : '';
      const isSameDevice =
        mappedBackendId === targetBackendId ||
        (targetMac.length === 12 && connectedBleMac.length === 12 && connectedBleMac === targetMac);

      if (isBleConnected && isSameDevice && connectedDevice) {
        setSelectedDevice(connectedDevice);
        handleCancelEdit();
        router.push('/(bluetooth)/WiFiSetupScreen');
        return;
      }

      // 2. Otherwise: show loading, scan for device
      setIsCheckingWifiDevice(true);
      startScan();

      wifiCheckTimeoutRef.current = setTimeout(() => {
        wifiCheckTimeoutRef.current = null;
        stopScan();
        setIsCheckingWifiDevice(false);
        showDeviceNotConnectedAlert();
      }, 8000);
    } catch (e) {
      console.error('[AllDevices] handleChangeWifi error:', e);
      setIsCheckingWifiDevice(false);
      stopScan();
      if (wifiCheckTimeoutRef.current) {
        clearTimeout(wifiCheckTimeoutRef.current);
        wifiCheckTimeoutRef.current = null;
      }
      showDeviceNotConnectedAlert();
    }
  };

  const handleDeleteDevice = (deviceId?: string) => {
    const deviceIdToDelete = deviceId || editingDeviceId;
    if (!deviceIdToDelete) return;

    Alert.alert(
      'Remove Device',
      'Remove this device from your account? You will no longer see it or its data.',
      [
        {
          text: 'No',
          style: 'cancel',
          onPress: () => {
            // Do nothing, just close the confirmation
          },
        },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeletingDevice(true);
              const result = await deleteDevice(deviceIdToDelete);
              
              if (result.success) {
                await cleanupLocalBleStores(deviceIdToDelete);
                if (editingDeviceId === deviceIdToDelete) {
                  setEditingDeviceId(null);
                  setEditingName('');
                }
                await refreshDevices();
              } else {
                Alert.alert('Error', result.message || 'Failed to remove device');
              }
            } catch (error: any) {
              console.error('Error removing device:', error);
              Alert.alert('Error', error.message || 'Failed to remove device');
            } finally {
              setIsDeletingDevice(false);
            }
          },
        },
      ]
    );
  };

  // Separate active device from others
  const currentDevices = devices || [];
  const activeDeviceData = activeDevice ? [activeDevice] : [];
  const otherDevices = currentDevices.filter(
    (d) => d.deviceId !== activeDevice?.deviceId
  );

  return (
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar barStyle={isLightTheme ? "dark-content" : "light-content"} backgroundColor={isLightTheme ? "#F8F9FA" : "#02041A"} />
      <LinearGradient
        colors={isLightTheme ? ['#F8F9FA', '#F8F9FA', '#F8F9FA'] : ['#1D244D', '#02041A', '#1A1D3E']}
        style={styles.gradientBackground}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Text style={[styles.headerTitle, isLightTheme && { color: '#111111' }]}>All Devices</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.push('/(bluetooth)/ScanScreen')}
            style={[styles.headerAddButton, isLightTheme && { backgroundColor: 'rgba(0,97,164,0.06)', borderColor: 'rgba(0,97,164,0.12)', borderWidth: 1 }]}
          >
            <Ionicons name="add-circle-outline" size={18} color={isLightTheme ? "#0061A4" : "#C7B9FF"} />
            <Text style={[styles.headerAddButtonText, isLightTheme && { color: '#0061A4' }]}>Add Device</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.headerIconBtn, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }]}
          >
            <Text style={[styles.headerIconText, isLightTheme && { color: '#666666' }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={isLightTheme ? '#0061A4' : '#FFFFFF'}
          />
        }
      >
        {!devices || devices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="phone-portrait-outline" size={64} color={isLightTheme ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.3)"} />
            <Text style={[styles.emptyTitle, isLightTheme && { color: '#111111' }]}>No Devices Found</Text>
            <Text style={[styles.emptySubtitle, isLightTheme && { color: '#666666' }]}>
              Register a device to get started
            </Text>
            <TouchableOpacity
              style={[styles.scanButton, isLightTheme && { backgroundColor: '#0061A4' }]}
              onPress={() => router.push('/(bluetooth)/ScanScreen')}
            >
              <Text style={styles.scanButtonText}>Scan for Devices</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            {/* Active Device Section */}
            {activeDevice && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isLightTheme && { color: '#666666' }]}>Active Device</Text>
                <View style={[styles.activeDeviceCard, isLightTheme && { backgroundColor: 'rgba(76, 175, 80, 0.08)' }]}>
                  <View style={styles.deviceHeader}>
                    <View style={styles.deviceInfo}>
                      <View style={styles.deviceIdRow}>
                        <Ionicons name="phone-portrait" size={20} color="#4CAF50" />
                        <View style={styles.deviceNameContainer}>
                          <View style={styles.deviceNameRow}>
                            <Text style={[styles.deviceName, isLightTheme && { color: '#111111' }]}>{getDeviceDisplayName(activeDevice)}</Text>
                            {(activeDevice as any).isShared && (
                              <View style={[styles.sharedBadge, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)' }]}>
                                <Text style={[styles.sharedBadgeText, isLightTheme && { color: '#0061A4' }]}>Shared</Text>
                              </View>
                            )}
                            {!(activeDevice as any).isShared && (
                              <TouchableOpacity
                                onPress={() => handleRenameDevice(activeDevice)}
                                style={[styles.editButtonInline, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }]}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                              >
                                <Text style={styles.editButtonText}>Edit</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <Text style={[styles.deviceIdSubtext, isLightTheme && { color: 'rgba(0,0,0,0.4)' }]}>
                            {activeDevice.customName || activeDevice.defaultName ? activeDevice.deviceId : ''}
                          </Text>
                        </View>
                        <View style={styles.badgeAndDeleteContainer}>
                          {(activeDevice as any).isShared ? (
                            <TouchableOpacity
                              onPress={() => handleRemoveShared(activeDevice.deviceId)}
                              style={styles.deleteIconButton}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <Text style={styles.removeSharedText}>Remove</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              onPress={() => handleDeleteDevice(activeDevice.deviceId)}
                              style={styles.deleteIconButton}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    </View>
                    <View style={styles.deviceActions}>
                      <View style={styles.radioButtonContainer}>
                        {(() => {
                          if (!radioAnimations.current[activeDevice.deviceId]) {
                            radioAnimations.current[activeDevice.deviceId] = new Animated.Value(1);
                          }
                          const animValue = radioAnimations.current[activeDevice.deviceId];
                          const borderColor = animValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: [isLightTheme ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)', '#4CAF50'],
                          });
                          const scale = animValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 1],
                          });
                          return (
                            <Animated.View style={[styles.radioButton, { borderColor }]}>
                              <Animated.View style={[styles.radioButtonInner, { transform: [{ scale }] }]} />
                            </Animated.View>
                          );
                        })()}
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Other Devices Section */}
            {otherDevices.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isLightTheme && { color: '#666666' }]}>
                  Other Devices ({otherDevices.length})
                </Text>
                {otherDevices.map((device, index) => {
                  const isShared = !!(device as any).isShared;
                  return (
                    <View
                      key={device.deviceId}
                      style={[
                        styles.deviceCard,
                        index === otherDevices.length - 1 && styles.lastDeviceCard,
                        isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }
                      ]}
                    >
                      <View style={styles.deviceHeader}>
                        <View style={styles.deviceInfo}>
                          <View style={styles.deviceIdRow}>
                            <Ionicons name="phone-portrait-outline" size={20} color={isLightTheme ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.6)"} />
                            <View style={styles.deviceNameContainer}>
                              <View style={styles.deviceNameRow}>
                                <Text style={[styles.deviceId, isLightTheme && { color: '#111111' }]}>{getDeviceDisplayName(device)}</Text>
                                {isShared && (
                                  <View style={[styles.sharedBadge, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)' }]}>
                                    <Text style={[styles.sharedBadgeText, isLightTheme && { color: '#0061A4' }]}>Shared</Text>
                                  </View>
                                )}
                                {!isShared && (
                                  <TouchableOpacity
                                    onPress={() => handleRenameDevice(device)}
                                    style={[styles.editButtonInline, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }]}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  >
                                    <Text style={[styles.editButtonTextInactive, isLightTheme && { color: '#666666' }]}>Edit</Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                              <Text style={[styles.deviceIdSubtext, isLightTheme && { color: 'rgba(0,0,0,0.4)' }]}>
                                {device.customName || device.defaultName ? device.deviceId : ''}
                              </Text>
                            </View>
                            <View style={styles.badgeAndDeleteContainer}>
                              {isShared ? (
                                <TouchableOpacity
                                  onPress={() => handleRemoveShared(device.deviceId)}
                                  style={styles.deleteIconButton}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                  <Text style={styles.removeSharedText}>Remove</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity
                                  onPress={() => handleDeleteDevice(device.deviceId)}
                                  style={styles.deleteIconButton}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                  <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        </View>
                        <View style={styles.deviceActions}>
                          <TouchableOpacity
                            onPress={() => handleSwitchDevice(device)}
                            style={styles.radioButtonContainer}
                            activeOpacity={0.7}
                            disabled={switchingDeviceId !== null}
                          >
                            {(() => {
                              if (!radioAnimations.current[device.deviceId]) {
                                radioAnimations.current[device.deviceId] = new Animated.Value(0);
                              }
                              const animValue = radioAnimations.current[device.deviceId];
                              const borderColor = animValue.interpolate({
                                inputRange: [0, 1],
                                outputRange: [isLightTheme ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)', '#4CAF50'],
                              });
                              const scale = animValue.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 1],
                              });
                              const isSwitching = switchingDeviceId === device.deviceId;
                              return (
                                <Animated.View style={[styles.radioButton, { borderColor, opacity: isSwitching ? 0.6 : 1 }]}>
                                  <Animated.View style={[styles.radioButtonInner, { transform: [{ scale }] }]} />
                                  {isSwitching && (
                                    <View style={styles.radioButtonLoading}>
                                      <ActivityIndicator size="small" color="#4CAF50" />
                                    </View>
                                  )}
                                </Animated.View>
                              );
                            })()}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Rename Device Popup */}
      {editingDeviceId !== null && (
        <View style={styles.popupBackdrop}>
          <TouchableOpacity
            style={styles.popupBackdropTouch}
            activeOpacity={1}
            onPress={handleCancelEdit}
          />
          <View style={styles.popupContentWrapper}>
            <View style={[styles.popupContent, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' }]}>
              <View style={styles.popupHeader}>
                <Text style={[styles.popupTitle, isLightTheme && { color: '#111111' }]}>Rename Device</Text>
                <TouchableOpacity onPress={handleCancelEdit}>
                  <Ionicons name="close" size={24} color={isLightTheme ? "#333333" : "#FFF"} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.popupSubtitle, isLightTheme && { color: '#333333' }]}>
                Enter a custom name for this device (optional)
              </Text>
              <Text style={[styles.popupHint, isLightTheme && { color: '#666666' }]}>
                Leave empty to use device ID as name
              </Text>

              <TextInput
                style={[
                  styles.nameInput,
                  nameError && styles.nameInputError,
                  isLightTheme && { backgroundColor: 'rgba(0,0,0,0.03)', color: '#111111', borderColor: 'rgba(0,0,0,0.1)' }
                ]}
                placeholder="e.g., Bedroom Device, Living Room"
                placeholderTextColor={isLightTheme ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)"}
                value={editingName}
                onChangeText={handleNameChange}
                maxLength={50}
                autoFocus
              />
              {nameError ? (
                <Text style={styles.nameErrorText}>{nameError}</Text>
              ) : null}

              <View style={styles.popupButtons}>
                <TouchableOpacity
                  style={[styles.popupButton, styles.popupButtonCancel, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.05)' }]}
                  onPress={handleCancelEdit}
                  disabled={isSavingName || isDeletingDevice}
                >
                  <Text style={[styles.popupButtonTextCancel, isLightTheme && { color: '#666666' }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.popupButton, styles.popupButtonSave, (isSavingName || nameError) && styles.popupButtonDisabled, isLightTheme && { backgroundColor: '#0061A4' }]}
                  onPress={handleSaveName}
                  disabled={isSavingName || isDeletingDevice || !!nameError}
                >
                  {isSavingName ? (
                    <ActivityIndicator size="small" color={isLightTheme ? "#FFFFFF" : "#1D244D"} />
                  ) : (
                    <Text style={[styles.popupButtonTextSave, isLightTheme && { color: '#FFFFFF' }]}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.popupButtonWifi, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.06)', borderColor: 'rgba(0, 97, 164, 0.15)' }]}
                onPress={handleChangeWifi}
                disabled={isSavingName || isDeletingDevice || isCheckingWifiDevice || isConnectingToWifiDevice}
              >
                {isConnectingToWifiDevice ? (
                  <>
                    <ActivityIndicator size="small" color={isLightTheme ? "#0061A4" : "#C7B9FF"} />
                    <Text style={[styles.popupButtonWifiText, isLightTheme && { color: '#0061A4' }]}>Connecting to device...</Text>
                  </>
                ) : isCheckingWifiDevice ? (
                  <>
                    <ActivityIndicator size="small" color={isLightTheme ? "#0061A4" : "#C7B9FF"} />
                    <Text style={[styles.popupButtonWifiText, isLightTheme && { color: '#0061A4' }]}>Checking if Dozemate is live...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="wifi-outline" size={18} color={isLightTheme ? "#0061A4" : "#C7B9FF"} />
                    <Text style={[styles.popupButtonWifiText, isLightTheme && { color: '#0061A4' }]}>Change WiFi Network</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02041A',
  },
  gradientBackground: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  header: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
    gap: 6,
  },
  headerAddButtonText: {
    color: '#C7B9FF',
    fontWeight: '800',
    fontSize: 14,
  },
  headerIconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerIconText: {
    color: '#C7B9FF',
    fontWeight: '800',
    fontSize: 14,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  scanButton: {
    backgroundColor: '#4A90E2',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  scanButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#8F96C2',
    fontSize: 12,
    letterSpacing: 0.6,
    marginBottom: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  activeDeviceCard: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  deviceCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  lastDeviceCard: {
    marginBottom: 0,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  deviceNameContainer: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    maxWidth: '100%',
  },
  deviceName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceId: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceIdSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  sharedBadge: {
    backgroundColor: 'rgba(199, 185, 255, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sharedBadgeText: { color: '#C7B9FF', fontSize: 10, fontWeight: '700' },
  removeSharedText: { color: '#FF9F43', fontSize: 12, fontWeight: '600' },
  deviceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editButton: {
    padding: 4,
  },
  editButtonInline: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  editButtonText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  editButtonTextInactive: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '600',
  },
  switchButton: {
    padding: 4,
  },
  radioButtonContainer: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  radioButtonSelected: {
    borderColor: '#4CAF50',
  },
  radioButtonInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
  },
  radioButtonLoading: {
    position: 'absolute',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeAndDeleteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  deleteIconButton: {
    padding: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDisconnected: {
    backgroundColor: '#FFA500',
  },
  statusText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  inactiveStatusText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontStyle: 'italic',
  },
  deviceDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  detailText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  // Popup styles
  popupBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  popupBackdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  popupContentWrapper: {
    width: '85%',
    maxWidth: 400,
    zIndex: 1001,
  },
  popupContent: {
    backgroundColor: '#1D244D',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  popupTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  popupSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 8,
  },
  popupHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  nameInputError: {
    borderColor: '#FF3B30',
    borderWidth: 2,
  },
  nameErrorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginBottom: 24,
    marginTop: 4,
  },
  popupButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  popupButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  popupButtonCancel: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  popupButtonSave: {
    backgroundColor: '#FFFFFF',
  },
  popupButtonDisabled: {
    opacity: 0.5,
  },
  popupButtonTextCancel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  popupButtonTextSave: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: '600',
  },
  popupButtonWifi: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(199, 185, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(199, 185, 255, 0.3)',
  },
  popupButtonWifiText: {
    color: '#C7B9FF',
    fontSize: 15,
    fontWeight: '600',
  },
});

