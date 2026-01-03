import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Switch, StatusBar, TouchableOpacity, Alert, ActivityIndicator, Linking, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotifications } from 'react-native-permissions';
import { sendTestNotification } from '@/services/Notifications';
import { useAuth } from '@/contexts/AuthContext';
import { useBluetooth } from '@/contexts/BluetoothProvider';
import { useProvisioning } from '@/contexts/ProvisioningContext';
import { useDevice } from '@/contexts/DeviceContext';

type RowProps = {
  title: string;
  subtitle?: string;
  valueText?: string;
  showToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (next: boolean) => void;
  toggleDisabled?: boolean;
  onPress?: () => void;
  isLoading?: boolean;
};

function SectionHeader({ label }: { label: string }) {
  return (
    <Text style={styles.sectionHeader}>{label}</Text>
  );
}

function Row({ title, subtitle, valueText, showToggle, toggleValue, onToggle, toggleDisabled, onPress, isLoading }: RowProps) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} style={styles.row} disabled={isLoading}>
      <View style={styles.rowTextContainer}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {showToggle ? (
        <Switch
          value={!!toggleValue}
          onValueChange={onToggle}
          disabled={!!toggleDisabled}
          trackColor={{ false: '#3A3F65', true: '#4A90E2' }}
          thumbColor={'#FFFFFF'}
        />
      ) : isLoading ? (
        <ActivityIndicator size="small" color="#4A90E2" />
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { fetchProfile, auth } = useAuth();
  const { connectedDevice, connectionStatus } = useBluetooth();
  const { selectedDevice } = useProvisioning();
  const { devices, activeDevice, isLoading: isLoadingDevices } = useDevice();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isLoadingNotificationsPref, setIsLoadingNotificationsPref] = useState(true);
  const [isRefreshingProfile, setIsRefreshingProfile] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('notifications_enabled');
        setNotificationsEnabled(saved === 'true');
      } catch {}
      setIsLoadingNotificationsPref(false);
    })();
  }, []);

  const handleToggleNotifications = async (next: boolean) => {
    if (next) {
      try {
        const { status } = await requestNotifications(['alert', 'badge', 'sound']);
        const granted = status === 'granted' || status === 'limited';
        if (!granted) {
          Alert.alert('Permission required', 'Enable notifications in Settings to receive alerts.');
          setNotificationsEnabled(false);
          await AsyncStorage.setItem('notifications_enabled', 'false');
          return;
        }
        setNotificationsEnabled(true);
        await AsyncStorage.setItem('notifications_enabled', 'true');
        // Fire a test local notification to verify configuration
        await sendTestNotification('Hello, how was your sleep?');
      } catch (e) {
        Alert.alert('Error', 'Could not request notification permission.');
        setNotificationsEnabled(false);
        await AsyncStorage.setItem('notifications_enabled', 'false');
      }
    } else {
      setNotificationsEnabled(false);
      await AsyncStorage.setItem('notifications_enabled', 'false');
    }
  };

  const handleRefreshProfile = async () => {
    if (isRefreshingProfile || !auth.isLoggedIn) {
      if (!auth.isLoggedIn) {
        Alert.alert('Error', 'You must be logged in to refresh your profile.');
      }
      return;
    }
    
    setIsRefreshingProfile(true);
    try {
      await fetchProfile();
      // Show success message after a brief delay to allow state update
      setTimeout(() => {
        Alert.alert('Success', 'Profile refreshed successfully');
      }, 300);
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to refresh profile. Please check your internet connection and try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setTimeout(() => {
        setIsRefreshingProfile(false);
      }, 500);
    }
  };
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />

      {/* Header (match History style) */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}> 
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]} showsVerticalScrollIndicator={false}>
        {/* Account */}
        <SectionHeader label="Account" />
        <View style={styles.card}>
          <Row 
            title="Refresh profile" 
            subtitle={isRefreshingProfile ? "Refreshing..." : "Sync latest profile data"}
            onPress={handleRefreshProfile}
            isLoading={isRefreshingProfile}
          />
          <View style={styles.divider} />
          <Row 
            title="All Devices" 
            subtitle={devices.length > 0 ? `${devices.length} device(s) registered` : "View and manage your devices"}
            onPress={() => router.push('/(tabs)/all-devices')}
            isLoading={isLoadingDevices}
          />
          <View style={styles.divider} />
          <Row title="Sign out" onPress={() => router.push('/(tabs)/logout')} />
        </View>

        {/* Reports & Export */}
        <SectionHeader label="Reports & Export" />
        <View style={styles.card}>
          <Row title="View reports" onPress={() => router.push('/reports')} />
          <View style={styles.divider} />
          <Row title="Export data" onPress={() => router.push('/reports/export')} />
        </View>

        {/* Devices & Connections */}
        <SectionHeader label="Devices & Connections" />
        <View style={styles.card}>
          <Row 
            title="Manage Bluetooth devices" 
            subtitle="View and manage previously connected devices"
            onPress={() => router.push('/(bluetooth)/ManageDevicesScreen')}
          />
          <View style={styles.divider} />
          <Row 
            title="Scan / connect to device" 
            subtitle="Search for nearby Dozemate devices"
            onPress={() => router.push('/(bluetooth)/ScanScreen')}
          />
          <View style={styles.divider} />
          <Row 
            title="Device Wi‑Fi setup" 
            subtitle={connectionStatus === 'connected' || selectedDevice ? "Configure device WiFi connection" : "Connect to a device first"}
            onPress={() => {
              if (connectionStatus === 'connected' || selectedDevice) {
                router.push('/(bluetooth)/WiFiSetupScreen');
              } else {
                Alert.alert(
                  'No Device Connected',
                  'Please connect to a device first before setting up WiFi.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Scan for Devices', onPress: () => router.push('/(bluetooth)/ScanScreen') }
                  ]
                );
              }
            }}
          />
          <View style={styles.divider} />
          <Row 
            title="Device AP IP (advanced)" 
            subtitle="Configure device access point IP address"
            onPress={() => {
              Alert.alert(
                'Device AP IP Configuration',
                'This is for advanced users who need to configure the device access point IP address manually.\n\nDefault: 192.168.4.1\n\nThis feature is typically used with the legacy WiFi provisioning method.',
                [
                  { text: 'OK', style: 'default' }
                ]
              );
            }}
          />
        </View>

        {/* Permissions & Privacy */}
        <SectionHeader label="Permissions & Privacy" />
        <View style={styles.card}>
          <Row
            title="Notifications"
            subtitle="Enable app alerts and updates"
            showToggle
            toggleValue={notificationsEnabled}
            toggleDisabled={isLoadingNotificationsPref}
            onToggle={handleToggleNotifications}
          />
          <View style={styles.divider} />
          <Row 
            title="App permissions" 
            subtitle="Manage Bluetooth, Location, and other permissions"
            onPress={() => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            }}
          />
          <View style={styles.divider} />
          <Row 
            title="Privacy Policy" 
            onPress={() => router.push('/privacy-policy')}
          />
          <View style={styles.divider} />
          <Row 
            title="Terms of Service" 
            onPress={() => router.push('/terms-of-service')}
          />
        </View>

        {/* Units & Preferences */}
        <SectionHeader label="Units & Preferences" />
        <View style={styles.card}>
          <Row title="Height unit" valueText="cm / inch" />
          <View style={styles.divider} />
          <Row title="Weight unit" valueText="kg / lb" />
          <View style={styles.divider} />
          <Row title="Waist unit" valueText="cm / inch" />
          <View style={styles.divider} />
          <Row title="Start of the week" valueText="Sunday" />
        </View>

        {/* Diagnostics */}
        <SectionHeader label="Diagnostics" />
        <View style={styles.card}>
          <Row title="Configure diagnostics" subtitle="Reports include usage details" />
          <View style={styles.divider} />
          <Row title="Share logs / Wi‑Fi test" />
        </View>

        {/* Data & Storage */}
        <SectionHeader label="Data & Storage" />
        <View style={styles.card}>
          <Row title="Clear cached profile" />
          <View style={styles.divider} />
          <Row title="Clear device history" />
        </View>

        {/* About */}
        <SectionHeader label="About" />
        <View style={styles.card}>
          <Row title="App version / Build" />
          <View style={styles.divider} />
          <Row title="Contact support" />
        </View>
        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', width: '100%', height: '100%' },
  header: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  sectionHeader: { color: '#8F96C2', fontSize: 12, letterSpacing: 0.6, marginTop: 16, marginBottom: 8, fontWeight: '600' },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  rowTextContainer: { flexShrink: 1, paddingRight: 12 },
  rowTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  chevron: { color: 'rgba(255,255,255,0.5)', fontSize: 22, marginLeft: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 16 },
});

