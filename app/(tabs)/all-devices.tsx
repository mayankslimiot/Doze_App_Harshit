import React, { useEffect, useState } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDevice } from '@/contexts/DeviceContext';
import { isWebSocketConnected, connectWebSocket, disconnectWebSocket, unsubscribeFromDevice, subscribeToDevice } from '@/services/websocketService';
import { activateDevice, updateDeviceName } from '@/services/deviceData';

export default function AllDevicesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { devices, activeDevice, isLoading, refreshDevices, setActiveDevice } = useDevice();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [switchingDeviceId, setSwitchingDeviceId] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<boolean>(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Check WebSocket status for active device
  useEffect(() => {
    if (activeDevice?.deviceId) {
      const checkStatus = () => {
        const connected = isWebSocketConnected();
        setWsStatus(connected);
      };
      
      checkStatus();
      const interval = setInterval(checkStatus, 2000);
      
      return () => clearInterval(interval);
    }
  }, [activeDevice?.deviceId]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshDevices();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSwitchDevice = async (device: any) => {
    if (device.deviceId === activeDevice?.deviceId) {
      return; // Already active
    }

    Alert.alert(
      'Switch Active Device',
      `Do you want to make "${device.deviceId}" your active device? The current active device will become inactive.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            try {
              setSwitchingDeviceId(device.deviceId);
              
              const oldDeviceId = activeDevice?.deviceId;
              
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
                
                Alert.alert('Success', `Device ${device.deviceId} is now active. WebSocket will reconnect automatically.`);
              } else {
                Alert.alert('Error', result.message || 'Failed to switch device');
              }
            } catch (error: any) {
              console.error('[AllDevices] Error switching device:', error);
              Alert.alert('Error', error.message || 'Failed to switch device');
            } finally {
              setSwitchingDeviceId(null);
            }
          },
        },
      ]
    );
  };

  // Helper function to get display name for device
  const getDeviceDisplayName = (device: any) => {
    return device.customName || device.deviceId;
  };

  // Handle rename device
  const handleRenameDevice = (device: any) => {
    setEditingDeviceId(device.deviceId);
    setEditingName(device.customName || '');
  };

  const handleSaveName = async () => {
    if (!editingDeviceId) return;

    const trimmedName = editingName.trim();
    
    // Validate name length
    if (trimmedName.length > 50) {
      Alert.alert('Error', 'Device name must be 50 characters or less');
      return;
    }

    try {
      setIsSavingName(true);
      const result = await updateDeviceName(editingDeviceId, trimmedName || null);
      
      if (result.success) {
        // Refresh device list to get updated names
        await refreshDevices();
        setEditingDeviceId(null);
        setEditingName('');
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
    setEditingDeviceId(null);
    setEditingName('');
  };

  // Separate active device from others
  const activeDeviceData = activeDevice ? [activeDevice] : [];
  const otherDevices = devices.filter(
    (d) => d.deviceId !== activeDevice?.deviceId
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient
        colors={['#1D244D', '#02041A', '#1A1D3E']}
        style={styles.gradientBackground}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerIconContainer}
        >
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All Devices</Text>
        <View style={styles.headerIconContainer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 20 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FFFFFF"
          />
        }
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4A90E2" />
            <Text style={styles.loadingText}>Loading devices...</Text>
          </View>
        ) : devices.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="phone-portrait-outline" size={64} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyTitle}>No Devices Found</Text>
            <Text style={styles.emptySubtitle}>
              Register a device to get started
            </Text>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => router.push('/(bluetooth)/ScanScreen')}
            >
              <Text style={styles.scanButtonText}>Scan for Devices</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Active Device Section */}
            {activeDevice && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active Device</Text>
                <View style={styles.activeDeviceCard}>
                  <View style={styles.deviceHeader}>
                    <View style={styles.deviceInfo}>
                      <View style={styles.deviceIdRow}>
                        <Ionicons name="phone-portrait" size={20} color="#4CAF50" />
                        <View style={styles.deviceNameContainer}>
                          <Text style={styles.deviceName}>{getDeviceDisplayName(activeDevice)}</Text>
                          {activeDevice.customName && (
                            <Text style={styles.deviceIdSubtext}>{activeDevice.deviceId}</Text>
                          )}
                        </View>
                        <View style={[styles.activeBadge, { backgroundColor: '#4CAF50' }]}>
                          <Text style={styles.activeBadgeText}>ACTIVE</Text>
                        </View>
                      </View>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusDot, wsStatus ? styles.statusConnected : styles.statusDisconnected]} />
                        <Text style={styles.statusText}>
                          {wsStatus ? '🟢 WebSocket Connected' : '🟡 WebSocket Disconnected'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRenameDevice(activeDevice)}
                      style={styles.editButton}
                    >
                      <Ionicons name="pencil" size={18} color="#4CAF50" />
                    </TouchableOpacity>
                  </View>
                  {activeDevice.status && (
                    <View style={styles.deviceDetails}>
                      <Text style={styles.detailText}>
                        Status: <Text style={styles.detailValue}>{activeDevice.status}</Text>
                      </Text>
                      {activeDevice.deviceType && (
                        <Text style={styles.detailText}>
                          Type: <Text style={styles.detailValue}>{activeDevice.deviceType}</Text>
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Other Devices Section */}
            {otherDevices.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Other Devices ({otherDevices.length})
                </Text>
                {otherDevices.map((device, index) => (
                  <View
                    key={device.deviceId}
                    style={[
                      styles.deviceCard,
                      index === otherDevices.length - 1 && styles.lastDeviceCard,
                    ]}
                  >
                    <View style={styles.deviceHeader}>
                      <View style={styles.deviceInfo}>
                        <View style={styles.deviceIdRow}>
                          <Ionicons name="phone-portrait-outline" size={20} color="rgba(255,255,255,0.6)" />
                          <View style={styles.deviceNameContainer}>
                            <Text style={styles.deviceId}>{getDeviceDisplayName(device)}</Text>
                            {device.customName && (
                              <Text style={styles.deviceIdSubtext}>{device.deviceId}</Text>
                            )}
                          </View>
                          {device.status === 'inactive' && (
                            <View style={[styles.activeBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                              <Text style={[styles.activeBadgeText, { color: 'rgba(255,255,255,0.6)' }]}>INACTIVE</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.statusRow}>
                          <Text style={styles.inactiveStatusText}>
                            Tap to make active
                          </Text>
                        </View>
                      </View>
                      <View style={styles.deviceActions}>
                        <TouchableOpacity
                          onPress={() => handleRenameDevice(device)}
                          style={styles.editButton}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="pencil" size={18} color="rgba(255,255,255,0.6)" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSwitchDevice(device)}
                          disabled={switchingDeviceId === device.deviceId}
                          style={styles.switchButton}
                        >
                          {switchingDeviceId === device.deviceId ? (
                            <ActivityIndicator size="small" color="#4A90E2" />
                          ) : (
                            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                    {device.status && (
                      <View style={styles.deviceDetails}>
                        <Text style={styles.detailText}>
                          Status: <Text style={styles.detailValue}>{device.status}</Text>
                        </Text>
                        {device.deviceType && (
                          <Text style={styles.detailText}>
                            Type: <Text style={styles.detailValue}>{device.deviceType}</Text>
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Rename Device Modal */}
      <Modal
        visible={editingDeviceId !== null}
        animationType="slide"
        transparent
        onRequestClose={handleCancelEdit}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rename Device</Text>
              <TouchableOpacity onPress={handleCancelEdit}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Enter a custom name for this device (optional)
            </Text>
            <Text style={styles.modalHint}>
              Leave empty to use device ID as name
            </Text>

            <TextInput
              style={styles.nameInput}
              placeholder="e.g., Bedroom Device, Living Room"
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={editingName}
              onChangeText={setEditingName}
              maxLength={50}
              autoFocus
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={handleCancelEdit}
                disabled={isSavingName}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSave, isSavingName && styles.modalButtonDisabled]}
                onPress={handleSaveName}
                disabled={isSavingName}
              >
                {isSavingName ? (
                  <ActivityIndicator size="small" color="#1D244D" />
                ) : (
                  <Text style={styles.modalButtonTextSave}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerIconContainer: {
    width: 32,
    alignItems: 'center',
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
    marginBottom: 8,
    gap: 8,
  },
  deviceNameContainer: {
    flex: 1,
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
    flex: 1,
  },
  deviceIdSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  deviceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editButton: {
    padding: 4,
  },
  switchButton: {
    padding: 4,
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
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1D244D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 4,
  },
  modalHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modalButtonSave: {
    backgroundColor: '#FFFFFF',
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalButtonTextCancel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextSave: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: '600',
  },
});

