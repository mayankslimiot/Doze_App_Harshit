import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useDevice } from '@/contexts/DeviceContext';
import { useTheme } from '@/contexts/ThemeContext';
import { shareDevice, removeCaretaker } from '@/services/deviceData';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getDeviceDisplayName(d: { customName?: string | null; deviceId: string }) {
  return d.customName || d.deviceId;
}

export default function CaretakerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLightTheme } = useTheme();
  const { ownedDevices, refreshDevices } = useDevice();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [email, setEmail] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [removingCaretakerId, setRemovingCaretakerId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const cardStyle = [styles.card, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' }];
  const labelStyle = [styles.label, isLightTheme && { color: '#666666' }];
  const dropdownTriggerStyle = [styles.dropdownTrigger, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.03)', borderColor: 'rgba(0,0,0,0.08)' }];
  const dropdownTriggerTextStyle = [styles.dropdownTriggerText, isLightTheme && { color: '#111111' }];
  const dropdownPlaceholderStyle = [styles.dropdownPlaceholder, isLightTheme && { color: 'rgba(0,0,0,0.4)' }];
  
  const dropdownListOverlayStyle = [styles.dropdownListOverlay, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0, 97, 164, 0.15)', shadowOpacity: 0.08, shadowRadius: 12 }];
  const dropdownItemStyle = [styles.dropdownItem, isLightTheme && { borderBottomColor: 'rgba(0,0,0,0.05)' }];
  const dropdownItemTextStyle = [styles.dropdownItemText, isLightTheme && { color: '#111111' }];
  
  const inputStyle = [styles.input, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.03)', color: '#111111', borderColor: 'rgba(0,0,0,0.08)' }];
  const shareButtonStyle = [styles.shareButton, isLightTheme && { backgroundColor: '#0061A4' }];
  
  const emptyTextStyle = [styles.emptyText, isLightTheme && { color: '#666666' }];
  const deviceNameStyle = [styles.deviceName, isLightTheme && { color: '#111111' }];
  const noCaretakersStyle = [styles.noCaretakers, isLightTheme && { color: 'rgba(0,0,0,0.4)' }];
  const caretakerRowStyle = [styles.caretakerRow, isLightTheme && { borderTopColor: 'rgba(0,0,0,0.05)' }];
  const caretakerEmailStyle = [styles.caretakerEmail, isLightTheme && { color: '#111111' }];

  const owned = ownedDevices ?? [];
  const selectedDevice = owned.find((d) => d.deviceId === selectedDeviceId);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshDevices();
    setRefreshing(false);
  };

  const handleShare = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter caretaker email');
      return;
    }
    if (!EMAIL_RX.test(trimmedEmail)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (!selectedDeviceId) {
      Alert.alert('Error', 'Please select a device to share');
      return;
    }
    setIsSharing(true);
    try {
      const result = await shareDevice(selectedDeviceId, trimmedEmail);
      if (result.success) {
        setEmail('');
        await refreshDevices();
        Alert.alert('Success', result.message ?? 'Device shared successfully');
      } else {
        Alert.alert('Error', result.message ?? 'Failed to share device');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Something went wrong');
    } finally {
      setIsSharing(false);
    }
  };

  const handleRemoveCaretaker = (deviceId: string, caretakerId: string, caretakerEmail: string) => {
    Alert.alert(
      'Remove access',
      `Remove ${caretakerEmail} from this device? They will no longer see this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingCaretakerId(caretakerId);
            try {
              const result = await removeCaretaker(deviceId, String(caretakerId));
              if (result.success) {
                await refreshDevices();
              } else {
                Alert.alert('Error', result.message ?? 'Failed to remove caretaker');
              }
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Something went wrong');
            } finally {
              setRemovingCaretakerId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} />
      {isLightTheme ? null : (
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      )}

      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={isLightTheme ? '#333333' : '#FFF'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isLightTheme && { color: '#111111' }]}>Caretaker</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isLightTheme ? '#0061A4' : '#FFF'} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionHeader, isLightTheme && { color: '#666666' }]}>SHARE A DEVICE</Text>
        <View style={cardStyle}>
          <View style={styles.dropdownWrapper}>
            <Text style={labelStyle}>Device</Text>
            <TouchableOpacity
              style={dropdownTriggerStyle}
              onPress={() => owned.length > 0 && setDropdownOpen((prev) => !prev)}
              disabled={owned.length === 0}
              activeOpacity={0.7}
            >
              <Text
                style={[dropdownTriggerTextStyle, !selectedDeviceId && dropdownPlaceholderStyle]}
                numberOfLines={1}
              >
                {owned.length === 0
                  ? 'No owned devices'
                  : selectedDevice
                    ? getDeviceDisplayName(selectedDevice)
                    : 'Select a device'}
              </Text>
              {owned.length > 0 && (
                <Ionicons
                  name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={isLightTheme ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)'}
                />
              )}
            </TouchableOpacity>

            {dropdownOpen && owned.length > 0 && (
              <View style={dropdownListOverlayStyle}>
                <ScrollView
                  style={styles.dropdownListScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                >
                  {owned.map((item) => (
                    <TouchableOpacity
                      key={item.deviceId}
                      style={[
                        dropdownItemStyle,
                        selectedDeviceId === item.deviceId && (isLightTheme ? { backgroundColor: 'rgba(0, 97, 164, 0.08)' } : styles.dropdownItemSelected),
                      ]}
                      onPress={() => {
                        setSelectedDeviceId(item.deviceId);
                        setDropdownOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={dropdownItemTextStyle} numberOfLines={1}>
                        {getDeviceDisplayName(item)}
                      </Text>
                      {selectedDeviceId === item.deviceId && (
                        <Ionicons name="checkmark" size={20} color={isLightTheme ? '#0061A4' : '#4A90E2'} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <Text style={labelStyle}>Caretaker email</Text>
          <TextInput
            style={inputStyle}
            placeholder="caretaker@example.com"
            placeholderTextColor={isLightTheme ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity
            style={[shareButtonStyle, (!selectedDeviceId || !email.trim() || isSharing) && styles.shareButtonDisabled]}
            onPress={handleShare}
            disabled={!selectedDeviceId || !email.trim() || isSharing}
          >
            {isSharing ? (
              <ActivityIndicator size="small" color={isLightTheme ? '#FFFFFF' : '#1D244D'} />
            ) : (
              <Text style={styles.shareButtonText}>Share device</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionHeader, isLightTheme && { color: '#666666' }]}>WHO HAS ACCESS</Text>
        {owned.length === 0 ? (
          <View style={cardStyle}>
            <Text style={emptyTextStyle}>You have no owned devices. Add a device first to share it.</Text>
          </View>
        ) : (() => {
          const devicesWithAccess = owned.filter((device) => {
            const caretakers = (device.sharedWith || []).filter((e: any) => e.userId && e.email);
            return caretakers.length > 0;
          });
          if (devicesWithAccess.length === 0) {
            return (
              <View style={cardStyle}>
                <Text style={noCaretakersStyle}>No one has access yet. Share a device above to give access.</Text>
              </View>
            );
          }
          return devicesWithAccess.map((device) => {
            const caretakers = (device.sharedWith || []).filter((e: any) => e.userId && e.email);
            return (
              <View key={device.deviceId} style={cardStyle}>
                <View style={styles.deviceRow}>
                  <Ionicons name="phone-portrait-outline" size={20} color={isLightTheme ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)'} />
                  <Text style={deviceNameStyle} numberOfLines={1}>
                    {device.customName || device.deviceId}
                  </Text>
                </View>
                {caretakers.map((c: any) => (
                  <View key={c.userId} style={caretakerRowStyle}>
                    <Text style={caretakerEmailStyle} numberOfLines={1}>
                      {c.email || c.userId}
                    </Text>
                    <TouchableOpacity
                      style={styles.removeCaretakerBtn}
                      onPress={() => handleRemoveCaretaker(device.deviceId, c.userId, c.email)}
                      disabled={removingCaretakerId === c.userId}
                    >
                      {removingCaretakerId === c.userId ? (
                        <ActivityIndicator size="small" color="#FF3B30" />
                      ) : (
                        <Text style={styles.removeCaretakerText}>Remove</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            );
          });
        })()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: { width: 32, alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  sectionHeader: {
    color: '#8F96C2',
    fontSize: 12,
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 8,
    fontWeight: '600',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'visible',
  },
  dropdownWrapper: {
    position: 'relative',
    marginBottom: 16,
  },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginBottom: 8, fontWeight: '600' },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  dropdownTriggerText: { color: '#FFF', fontSize: 16, flex: 1, marginRight: 8 },
  dropdownPlaceholder: { color: 'rgba(255,255,255,0.5)' },
  dropdownListOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    marginTop: 4,
    maxHeight: 220,
    backgroundColor: '#1D244D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    zIndex: 1000,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  dropdownListScroll: {
    maxHeight: 220,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  dropdownItemSelected: { backgroundColor: 'rgba(74, 144, 226, 0.2)' },
  dropdownItemText: { color: '#FFF', fontSize: 16, flex: 1, marginRight: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFF',
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  shareButton: {
    backgroundColor: '#4A90E2',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  shareButtonDisabled: { opacity: 0.5 },
  shareButtonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  emptyText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  deviceName: { color: '#FFF', fontSize: 16, fontWeight: '600', flex: 1 },
  noCaretakers: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  caretakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  caretakerEmail: { color: 'rgba(255,255,255,0.9)', fontSize: 14, flex: 1, marginRight: 12 },
  removeCaretakerBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  removeCaretakerText: { color: '#FF3B30', fontWeight: '600', fontSize: 14 },
});
