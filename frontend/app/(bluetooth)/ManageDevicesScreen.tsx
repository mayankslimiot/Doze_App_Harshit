import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  LayoutAnimation,
  Platform,
  UIManager,
  Alert,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/contexts/ThemeContext';
import { useProvisioning } from '@/contexts/ProvisioningContext';

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const PREVIOUS_DEVICES_KEY = '@slimiot_previous_doze_devices';

type PreviousDevice = {
  id: string;
  name: string | null;
};

export default function ManageDevicesScreen() {
  const router = useRouter();
  const { isLightTheme } = useTheme();
  const { setProvisionForHospitalId, setProvisionForHospitalName } = useProvisioning();
  const [previousDevices, setPreviousDevices] = useState<PreviousDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load previous devices from AsyncStorage
  useEffect(() => {
    loadPreviousDevices();
  }, []);

  const loadPreviousDevices = async () => {
    try {
      setIsLoading(true);
      const jsonValue = await AsyncStorage.getItem(PREVIOUS_DEVICES_KEY);
      if (jsonValue != null) {
        const devices = JSON.parse(jsonValue);
        setPreviousDevices(devices);
      } else {
        setPreviousDevices([]);
      }
    } catch (e) {
      console.error('Failed to load previous devices.', e);
      setPreviousDevices([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveDevice = (deviceId: string, deviceName: string | null) => {
    Alert.alert(
      'Remove Device',
      `Are you sure you want to remove "${deviceName || 'Unknown Device'}" from your saved devices?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              const newDevices = previousDevices.filter(d => d.id !== deviceId);
              setPreviousDevices(newDevices);
              
              const jsonValue = JSON.stringify(newDevices);
              await AsyncStorage.setItem(PREVIOUS_DEVICES_KEY, jsonValue);
              
              console.log(`Removed device: ${deviceName} (${deviceId})`);
            } catch (e) {
              console.error('Failed to remove device.', e);
              Alert.alert('Error', 'Failed to remove device. Please try again.');
              // Reload devices on error
              loadPreviousDevices();
            }
          },
        },
      ]
    );
  };

  const handleRemoveAll = () => {
    if (previousDevices.length === 0) return;

    Alert.alert(
      'Remove All Devices',
      `Are you sure you want to remove all ${previousDevices.length} saved device(s)?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove All',
          style: 'destructive',
          onPress: async () => {
            try {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setPreviousDevices([]);
              await AsyncStorage.removeItem(PREVIOUS_DEVICES_KEY);
              console.log('Removed all devices');
            } catch (e) {
              console.error('Failed to remove all devices.', e);
              Alert.alert('Error', 'Failed to remove all devices. Please try again.');
              loadPreviousDevices();
            }
          },
        },
      ]
    );
  };

  const ItemContainer = isLightTheme ? View : BlurView;

  const renderDeviceItem = ({ item }: { item: PreviousDevice }) => {
    return (
      <ItemContainer
        intensity={25}
        tint="dark"
        style={[
          styles.deviceItemContainer,
          isLightTheme && {
            backgroundColor: '#FFFFFF',
            borderColor: '#E5E7EB',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.03,
            shadowRadius: 8,
            elevation: 1,
          }
        ]}
      >
        <View style={styles.deviceInfo}>
          <View style={styles.deviceIconContainer}>
            <Ionicons name="hardware-chip-outline" size={24} color={isLightTheme ? "#0061A4" : "rgba(255, 255, 255, 0.8)"} />
          </View>
          <View style={styles.deviceTextContainer}>
            <Text style={[styles.deviceName, isLightTheme && { color: '#111111' }]} numberOfLines={1}>
              {item.name || 'Unknown Device'}
            </Text>
            <Text style={[styles.deviceId, isLightTheme && { color: '#666666' }]} numberOfLines={1}>
              {item.id}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => handleRemoveDevice(item.id, item.name)}
          style={[styles.removeButton, isLightTheme && { backgroundColor: 'rgba(255, 59, 48, 0.08)' }]}
        >
          <Ionicons name="trash-outline" size={20} color={isLightTheme ? "#FF3B30" : "#FF6B6B"} />
        </TouchableOpacity>
      </ItemContainer>
    );
  };

  const renderEmptyState = () => {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="bluetooth-outline" size={64} color={isLightTheme ? "rgba(0, 0, 0, 0.2)" : "rgba(255, 255, 255, 0.3)"} />
        <Text style={[styles.emptyTitle, isLightTheme && { color: '#111111' }]}>No Saved Devices</Text>
        <Text style={[styles.emptySubtitle, isLightTheme && { color: '#666666' }]}>
          Devices you connect to will appear here
        </Text>
        <TouchableOpacity
          style={[styles.scanButton, isLightTheme && { backgroundColor: '#0061A4' }]}
          onPress={() => {
            setProvisionForHospitalId(null);
            setProvisionForHospitalName(null);
            router.push('/(bluetooth)/ScanScreen');
          }}
        >
          <Ionicons name="search" size={20} color={isLightTheme ? '#FFF' : '#1D244D'} />
          <Text style={[styles.scanButtonText, isLightTheme && { color: '#FFF' }]}>Scan for Devices</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar barStyle={isLightTheme ? "dark-content" : "light-content"} backgroundColor={isLightTheme ? "#F8F9FA" : "#02041A"} />
      {isLightTheme ? null : (
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconContainer}>
          <Ionicons name="arrow-back" size={24} color={isLightTheme ? '#111111' : '#FFF'} />
        </TouchableOpacity>
        <Text style={[styles.headerText, isLightTheme && { color: '#111111' }]}>Manage Devices</Text>
        {previousDevices.length > 0 && (
          <TouchableOpacity onPress={handleRemoveAll} style={styles.headerIconContainer}>
            <Ionicons name="trash-outline" size={24} color={isLightTheme ? '#FF3B30' : '#FF6B6B'} />
          </TouchableOpacity>
        )}
        {previousDevices.length === 0 && <View style={styles.headerIconContainer} />}
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, isLightTheme && { color: '#666666' }]}>Loading devices...</Text>
        </View>
      ) : previousDevices.length === 0 ? (
        renderEmptyState()
      ) : (
        <View style={styles.content}>
          <View style={[
            styles.infoCard,
            isLightTheme && {
              backgroundColor: 'rgba(0, 97, 164, 0.06)',
              borderColor: 'rgba(0, 97, 164, 0.15)',
            }
          ]}>
            <Ionicons name="information-circle-outline" size={20} color={isLightTheme ? '#0061A4' : 'rgba(255, 255, 255, 0.7)'} />
            <Text style={[styles.infoText, isLightTheme && { color: '#333333' }]}>
              {previousDevices.length} saved device{previousDevices.length !== 1 ? 's' : ''}
            </Text>
          </View>

          <FlatList
            data={previousDevices}
            renderItem={renderDeviceItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}
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
    height: '100%',
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.2)',
  },
  infoText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
    marginLeft: 10,
  },
  listContainer: {
    paddingBottom: 20,
  },
  deviceItemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 20,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  deviceInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  deviceIconContainer: {
    marginRight: 15,
  },
  deviceTextContainer: {
    flex: 1,
  },
  deviceName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  deviceId: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  removeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  emptySubtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 15,
    gap: 10,
  },
  scanButtonText: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
  },
});


