import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Switch, StatusBar, TouchableOpacity, ActivityIndicator, Modal, Platform, TouchableWithoutFeedback, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import CustomAlert from '@/components/CustomAlert';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { apiUrl } from '@/services/api';
import { BlurView } from 'expo-blur';

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

function SectionHeader({ label, isLight }: { label: string; isLight?: boolean }) {
  return (
    <Text style={[styles.sectionHeader, isLight && { color: '#666666' }]}>{label}</Text>
  );
}

function Row({ title, subtitle, icon, iconColor, valueText, showToggle, toggleValue, onToggle, toggleDisabled, onPress, isLoading, isLight }: RowProps & { isLight?: boolean }) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} style={styles.row} disabled={isLoading}>
      <View style={styles.rowIconContainer}>
        {icon && (
          <View style={[styles.iconBox, { backgroundColor: iconColor || (isLight ? 'rgba(0, 97, 164, 0.06)' : 'rgba(255,255,255,0.08)') }]}>
            <Ionicons name={icon} size={20} color={isLight ? '#0061A4' : '#FFFFFF'} />
          </View>
        )}
        <View style={styles.rowTextContainer}>
          <Text style={[styles.rowTitle, isLight && { color: '#111111' }]}>{title}</Text>
          {!!subtitle && <Text style={[styles.rowSubtitle, isLight && { color: '#666666' }]}>{subtitle}</Text>}
        </View>
      </View>
      {showToggle ? (
        <Switch
          value={!!toggleValue}
          onValueChange={onToggle}
          disabled={!!toggleDisabled}
          trackColor={{ false: isLight ? '#E4E6EB' : '#3A3F65', true: '#0061A4' }}
          thumbColor={'#FFFFFF'}
        />
      ) : isLoading ? (
        <ActivityIndicator size="small" color={isLight ? '#0061A4' : "#4A90E2"} />
      ) : valueText ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[styles.valueText, isLight && { color: '#0061A4' }]}>{valueText}</Text>
          <Ionicons name="chevron-forward" size={18} color={isLight ? 'rgba(0,0,0,0.3)' : "rgba(255,255,255,0.3)"} style={{ marginLeft: 6 }} />
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={isLight ? 'rgba(0,0,0,0.3)' : "rgba(255,255,255,0.3)"} />
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
  const { theme, isLightTheme, setAppTheme } = useTheme();
  const [showThemeModal, setShowThemeModal] = useState(false);

  const handleSelectTheme = async (newTheme: 'system' | 'light' | 'dark') => {
    await setAppTheme(newTheme);
    setShowThemeModal(false);
  };

  const getThemeLabel = (t: 'system' | 'light' | 'dark') => {
    switch (t) {
      case 'system': return 'System';
      case 'light': return 'Light';
      case 'dark': return 'Dark';
      default: return 'System';
    }
  };

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
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar 
        barStyle={isLightTheme ? 'dark-content' : 'light-content'} 
        backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} 
      />
      {isLightTheme ? null : (
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      )}

      {/* Header (match History style) */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}> 
        <Text style={[styles.headerTitle, isLightTheme && { color: '#111111' }]}>Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: 100 }]} 
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* DATA & ALERTS */}
        <SectionHeader label="DATA & ALERTS" isLight={isLightTheme} />
        <View style={styles.card}>
          <Row 
            title="Export Data" 
            subtitle="Download history CSV"
            icon="cloud-download-outline"
            iconColor="rgba(74, 144, 226, 0.2)"
            onPress={() => router.push('/reports/export')} 
            isLight={isLightTheme}
          />
          <View style={[styles.divider, isLightTheme && { backgroundColor: 'rgba(0, 0, 0, 0.06)' }]} />
          <Row
            title="Notifications"
            subtitle="Manage HR trends"
            icon="notifications-outline"
            iconColor="rgba(255, 165, 0, 0.2)"
            onPress={() => router.push('/notification-settings')}
            isLight={isLightTheme}
          />
        </View>

        {/* PREFERENCES */}
        <SectionHeader label="PREFERENCES" isLight={isLightTheme} />
        <View style={styles.card}>
          <Row 
            title="Theme" 
            subtitle="Choose light, dark, or system theme"
            icon="contrast-outline"
            iconColor="rgba(100, 210, 255, 0.2)"
            valueText={getThemeLabel(theme)}
            onPress={() => setShowThemeModal(true)}
            isLight={isLightTheme}
          />
        </View>

        {/* ACCOUNT */}
        <SectionHeader label="ACCOUNT" isLight={isLightTheme} />
        <View style={styles.card}>
          <Row 
            title="Caretaker" 
            subtitle="Manage shared access"
            icon="people-outline"
            iconColor="rgba(199, 185, 255, 0.2)"
            onPress={() => router.push('/caretaker')} 
            isLight={isLightTheme}
          />
          <View style={[styles.divider, isLightTheme && { backgroundColor: 'rgba(0, 0, 0, 0.06)' }]} />
          <Row 
            title="Delete Account" 
            subtitle="Permanently remove your account"
            icon="trash-outline"
            iconColor="rgba(255, 82, 82, 0.2)"
            onPress={() => setShowDeleteAlert(true)}
            isLoading={isDeleting}
            isLight={isLightTheme}
          />
        </View>

        {/* SUPPORT */}
        <SectionHeader label="SUPPORT" isLight={isLightTheme} />
        <View style={styles.card}>
          <Row 
            title="Contact Support" 
            subtitle="Talk to us"
            icon="help-buoy-outline"
            iconColor="rgba(76, 175, 80, 0.2)"
            onPress={() => router.push('/contact-support')}
            isLight={isLightTheme}
          />
          <View style={[styles.divider, isLightTheme && { backgroundColor: 'rgba(0, 0, 0, 0.06)' }]} />
          <Row 
            title="Health Disclaimer & References" 
            subtitle="Wellness info & resources"
            icon="information-circle-outline"
            iconColor="rgba(74, 144, 226, 0.2)"
            onPress={() => router.push('/health-disclaimer')}
            isLight={isLightTheme}
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
            isLight={isLightTheme}
          />
        </View>
        
        <View style={{ height: 40 }} />

        {/* Bottom footer with App Version, Terms, and Privacy - Scrolls with content */}
        <View style={[styles.bottomFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity onPress={() => {}} activeOpacity={0.7}>
            <Text style={[styles.footerText, isLightTheme && { color: '#888888' }]}>{getAppVersion()}</Text>
          </TouchableOpacity>
          <Text style={[styles.footerSeparator, isLightTheme && { color: '#888888' }]}>•</Text>
          <TouchableOpacity onPress={() => router.push('/privacy-policy')} activeOpacity={0.7}>
            <Text style={[styles.footerText, isLightTheme && { color: '#888888' }]}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={[styles.footerSeparator, isLightTheme && { color: '#888888' }]}>•</Text>
          <TouchableOpacity onPress={() => router.push('/terms-of-service')} activeOpacity={0.7}>
            <Text style={[styles.footerText, isLightTheme && { color: '#888888' }]}>Terms</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Logout Confirmation Alert */}
      <CustomAlert
        visible={showLogoutAlert}
        title="Logout"
        message="Are you sure you want to logout?"
        onClose={() => setShowLogoutAlert(false)}
        isLight={isLightTheme}
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
        isLight={isLightTheme}
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
          <View style={[styles.deletingBox, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' }]}>
            <ActivityIndicator size="large" color={isLightTheme ? '#0061A4' : '#4A90E2'} />
            <Text style={[styles.deletingText, isLightTheme && { color: '#111111' }]}>Removing Account</Text>
          </View>
        </View>
      </Modal>

      {/* Theme Selection Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showThemeModal}
        onRequestClose={() => setShowThemeModal(false)}
        statusBarTranslucent={true}
      >
        <BlurView intensity={20} tint={isLightTheme ? 'light' : 'dark'} style={styles.modalBlur}>
          <TouchableWithoutFeedback onPress={() => setShowThemeModal(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[styles.themeModalContainer, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' }]}>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.themeModalTitle, isLightTheme && { color: '#111111' }]}>App Theme</Text>
                    <TouchableOpacity onPress={() => setShowThemeModal(false)} style={styles.closeButton}>
                      <Ionicons name="close" size={24} color={isLightTheme ? '#0061A4' : 'rgba(255,255,255,0.6)'} />
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={[styles.themeModalSubtitle, isLightTheme && { color: '#666666' }]}>
                    Choose how you want the app to look. System will match your phone's current setting.
                  </Text>

                  <View style={styles.optionsList}>
                    {(['system', 'light', 'dark'] as const).map((t) => {
                      const isSelected = theme === t;
                      let iconName: keyof typeof Ionicons.glyphMap = 'contrast-outline';
                      if (t === 'light') iconName = 'sunny-outline';
                      if (t === 'dark') iconName = 'moon-outline';

                      return (
                        <TouchableOpacity
                          key={t}
                          style={[
                            styles.optionItem,
                            isLightTheme && { backgroundColor: '#F0F2F5', borderColor: 'rgba(0,0,0,0.06)' },
                            isSelected && styles.optionItemActive,
                            isSelected && isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)', borderColor: 'rgba(0, 97, 164, 0.3)' }
                          ]}
                          onPress={() => handleSelectTheme(t)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.optionLeft}>
                            <View style={[
                              styles.optionIconBox,
                              isSelected ? (isLightTheme ? { backgroundColor: '#0061A4' } : styles.optionIconBoxActive) : (isLightTheme ? { backgroundColor: 'rgba(0,97,164,0.06)' } : styles.optionIconBoxInactive)
                            ]}>
                              <Ionicons 
                                name={iconName} 
                                size={20} 
                                color={isSelected ? (isLightTheme ? '#FFFFFF' : '#1D244D') : (isLightTheme ? '#0061A4' : '#FFFFFF')} 
                              />
                            </View>
                            <Text style={[
                              styles.optionLabel,
                              isLightTheme && { color: '#111111' },
                              isSelected && styles.optionLabelActive,
                              isSelected && isLightTheme && { color: '#0061A4' }
                            ]}>
                              {getThemeLabel(t)}
                            </Text>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={22} color={isLightTheme ? '#0061A4' : '#4A90E2'} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </BlurView>
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
  card: { backgroundColor: 'transparent' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 0, paddingVertical: 14 },
  rowIconContainer: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTextContainer: { flexShrink: 1, paddingRight: 12 },
  rowTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  rowSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  valueText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '500', marginLeft: 8 },
  chevron: { color: 'rgba(255,255,255,0.5)', fontSize: 22, marginLeft: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.08)', marginLeft: 48 },
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
  modalBlur: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  themeModalContainer: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#070a2a',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  themeModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
  },
  themeModalSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 18,
    marginBottom: 20,
  },
  optionsList: {
    gap: 12,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  optionItemActive: {
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionIconBoxActive: {
    backgroundColor: '#FFFFFF',
  },
  optionIconBoxInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  optionLabelActive: {
    color: '#FFFFFF',
  },
});

