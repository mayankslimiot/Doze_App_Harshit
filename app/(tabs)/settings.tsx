import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Switch, StatusBar, TouchableOpacity, ActivityIndicator, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
import CustomAlert from '@/components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { apiUrl } from '@/services/api';

type RowProps = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
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

function Row({ title, subtitle, icon, iconColor, valueText, showToggle, toggleValue, onToggle, toggleDisabled, onPress, isLoading }: RowProps) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} style={styles.row} disabled={isLoading}>
      <View style={styles.rowIconContainer}>
        {icon && (
          <View style={[styles.iconBox, { backgroundColor: iconColor || 'rgba(255,255,255,0.08)' }]}>
            <Ionicons name={icon} size={20} color="#FFFFFF" />
          </View>
        )}
        <View style={styles.rowTextContainer}>
          <Text style={styles.rowTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
        </View>
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
      ) : valueText ? (
        <Text style={styles.valueText}>{valueText}</Text>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { auth, logout } = useAuth();
  const [showLogoutAlert, setShowLogoutAlert] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get app version for footer
  const getAppVersion = () => {
    const version = Constants.expoConfig?.version || Constants.manifest2?.extra?.expoClient?.version || '1.0.0';
    return `v${version}`;
  };

  const handleLogout = async () => {
    setShowLogoutAlert(false);
    await logout();
    try { router.replace('/(authentication)/signin'); } catch {}
  };

  const handleDeleteAccount = async () => {
    setShowDeleteAlert(false);
    setIsDeleting(true);
    try {
      const token = auth.token || (await AsyncStorage.getItem('auth_token'));
      if (!token) {
        setIsDeleting(false);
        return;
      }
      const res = await fetch(apiUrl('/api/user/profile'), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.status === 'success') {
        try {
          await GoogleSignin.signOut();
        } catch (_) {}
        await logout();
        router.replace('/(authentication)/signin');
      } else {
        setIsDeleting(false);
      }
    } catch (_) {
      setIsDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />

      {/* Header (match History style) */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}> 
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: 100 }]} 
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* DATA & ALERTS */}
        <SectionHeader label="DATA & ALERTS" />
        <View style={styles.card}>
          <Row 
            title="Export Data" 
            subtitle="Download history CSV"
            icon="cloud-download-outline"
            iconColor="rgba(74, 144, 226, 0.2)"
            onPress={() => router.push('/reports/export')} 
          />
          <View style={styles.divider} />
          <Row
            title="Notifications"
            subtitle="Manage HR trends"
            icon="notifications-outline"
            iconColor="rgba(255, 165, 0, 0.2)"
            onPress={() => router.push('/notification-settings')}
          />
        </View>

        {/* ACCOUNT */}
        <SectionHeader label="ACCOUNT" />
        <View style={styles.card}>
          <Row 
            title="Caretaker" 
            subtitle="Manage shared access"
            icon="people-outline"
            iconColor="rgba(199, 185, 255, 0.2)"
            onPress={() => router.push('/caretaker')} 
          />
          <View style={styles.divider} />
          <Row 
            title="Delete Account" 
            subtitle="Permanently remove your account"
            icon="trash-outline"
            iconColor="rgba(255, 82, 82, 0.2)"
            onPress={() => setShowDeleteAlert(true)}
            isLoading={isDeleting}
          />
        </View>

        {/* SUPPORT */}
        <SectionHeader label="SUPPORT" />
        <View style={styles.card}>
          <Row 
            title="Contact Support" 
            subtitle="Talk to us"
            icon="help-buoy-outline"
            iconColor="rgba(76, 175, 80, 0.2)"
            onPress={() => router.push('/contact-support')}
          />
          <View style={styles.divider} />
          <Row 
            title="Health Disclaimer & References" 
            subtitle="Wellness info & resources"
            icon="information-circle-outline"
            iconColor="rgba(74, 144, 226, 0.2)"
            onPress={() => router.push('/health-disclaimer')}
          />
        </View>

        <View style={{ height: 32 }} />

        {/* LOGOUT */}
        <View style={styles.card}>
          <Row 
            title="Logout" 
            subtitle="Sign out of your account"
            icon="log-out-outline"
            iconColor="rgba(255, 82, 82, 0.2)"
            onPress={() => setShowLogoutAlert(true)}
          />
        </View>
        
        <View style={{ height: 40 }} />

        {/* Bottom footer with App Version, Terms, and Privacy - Scrolls with content */}
        <View style={[styles.bottomFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity onPress={() => {}} activeOpacity={0.7}>
            <Text style={styles.footerText}>{getAppVersion()}</Text>
          </TouchableOpacity>
          <Text style={styles.footerSeparator}>•</Text>
          <TouchableOpacity onPress={() => router.push('/privacy-policy')} activeOpacity={0.7}>
            <Text style={styles.footerText}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.footerSeparator}>•</Text>
          <TouchableOpacity onPress={() => router.push('/terms-of-service')} activeOpacity={0.7}>
            <Text style={styles.footerText}>Terms</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Logout Confirmation Alert */}
      <CustomAlert
        visible={showLogoutAlert}
        title="Logout"
        message="Are you sure you want to logout?"
        onClose={() => setShowLogoutAlert(false)}
        buttons={[
          {
            text: 'No',
            onPress: () => setShowLogoutAlert(false),
            style: 'default',
          },
          {
            text: 'Yes',
            onPress: handleLogout,
            style: 'primary',
          },
        ]}
      />

      {/* Delete Account Confirmation Alert */}
      <CustomAlert
        visible={showDeleteAlert}
        title="Delete Account"
        message="Are you sure you want to permanently delete your account? Your device data will be preserved."
        onClose={() => !isDeleting && setShowDeleteAlert(false)}
        buttons={[
          {
            text: 'No',
            onPress: () => setShowDeleteAlert(false),
            style: 'default',
          },
          {
            text: 'Yes',
            onPress: handleDeleteAccount,
            style: 'primary',
          },
        ]}
      />

      {/* Removing Account Loading Overlay */}
      <Modal visible={isDeleting} transparent animationType="fade">
        <View style={styles.deletingOverlay}>
          <View style={styles.deletingBox}>
            <ActivityIndicator size="large" color="#4A90E2" />
            <Text style={styles.deletingText}>Removing Account</Text>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  sectionHeader: { color: '#8F96C2', fontSize: 12, letterSpacing: 0.6, marginTop: 16, marginBottom: 8, fontWeight: '600' },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.08)' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  rowIconContainer: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTextContainer: { flexShrink: 1, paddingRight: 12 },
  rowTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  valueText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '500', marginLeft: 8 },
  chevron: { color: 'rgba(255,255,255,0.5)', fontSize: 22, marginLeft: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 16 },
  bottomFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingHorizontal: 16,
    flexWrap: 'wrap',
    backgroundColor: 'transparent',
  },
  footerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '500',
  },
  footerSeparator: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    marginHorizontal: 4,
  },
  deletingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletingBox: {
    backgroundColor: 'rgba(7, 10, 42, 0.95)',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    minWidth: 200,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  deletingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
});

