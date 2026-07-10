import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/services/api';

export default function LogoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { auth, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutType, setLogoutType] = useState<'single' | 'all' | null>(null);

  const user = auth.user;
  const userEmail = user?.email || '';
  const userName = user?.name || '';

  const handleLogout = async (type: 'single' | 'all') => {
    if (isLoggingOut) return;
    
    setIsLoggingOut(true);
    setLogoutType(type);

    try {
      if (type === 'all') {
        // Logout from all devices
        const token = auth.token;
        if (token) {
          try {
            const url = apiUrl('/api/auth/logout-all');
            await fetch(url, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            });
          } catch (error) {
            console.warn('Logout-all API call failed:', error);
            // Continue with logout even if API call fails
          }
        }
      }

      // Perform logout
      await logout();

      // Small delay for smooth transition
      await new Promise(resolve => setTimeout(resolve, 500));

      // Redirect to login screen
      router.replace('/(authentication)/signin');
    } catch (error) {
      console.error('Logout error:', error);
      // Even if there's an error, try to logout locally
      await logout();
      router.replace('/(authentication)/signin');
    } finally {
      setIsLoggingOut(false);
      setLogoutType(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} disabled={isLoggingOut}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sign Out</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView 
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} 
        showsVerticalScrollIndicator={false}
      >
        {/* User Info Card */}
        <BlurView intensity={25} tint="dark" style={styles.userCard}>
          <View style={styles.avatarWrap}>
            <LinearGradient colors={['#6E5BFA', '#4B7BFF']} style={styles.avatarRing} />
            <BlurView intensity={30} tint="dark" style={styles.avatarInner}>
              <Ionicons name="person" size={48} color="#C7B9FF" />
            </BlurView>
          </View>
          <Text style={styles.userName} numberOfLines={2} ellipsizeMode="tail">{userName || 'User'}</Text>
          <Text style={styles.userEmail} numberOfLines={2} ellipsizeMode="middle">{userEmail || 'No email'}</Text>
        </BlurView>

        {/* Information Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={20} color="#8F96C2" />
            <Text style={styles.infoText}>Choose how you want to sign out</Text>
          </View>
        </View>

        {/* Logout Options */}
        <View style={styles.optionsContainer}>
          {/* Single Device Logout */}
          <TouchableOpacity
            style={[styles.optionCard, isLoggingOut && styles.optionCardDisabled]}
            onPress={() => handleLogout('single')}
            disabled={isLoggingOut}
            activeOpacity={0.8}
          >
            <View style={styles.optionHeader}>
              <View style={styles.optionIconContainer}>
                <Ionicons name="phone-portrait-outline" size={24} color="#4A90E2" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Logout from this device</Text>
                <Text style={styles.optionDescription}>
                  Sign out from this device only. You'll remain signed in on other devices.
                </Text>
              </View>
            </View>
            {isLoggingOut && logoutType === 'single' && (
              <ActivityIndicator size="small" color="#4A90E2" style={styles.loadingIndicator} />
            )}
            {!isLoggingOut && (
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* All Devices Logout */}
          <TouchableOpacity
            style={[styles.optionCard, isLoggingOut && styles.optionCardDisabled]}
            onPress={() => handleLogout('all')}
            disabled={isLoggingOut}
            activeOpacity={0.8}
          >
            <View style={styles.optionHeader}>
              <View style={[styles.optionIconContainer, styles.optionIconContainerDanger]}>
                <Ionicons name="devices-outline" size={24} color="#FF6B6B" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Logout from all devices</Text>
                <Text style={styles.optionDescription}>
                  Sign out from all devices where you're currently logged in. You'll need to sign in again on all devices.
                </Text>
              </View>
            </View>
            {isLoggingOut && logoutType === 'all' && (
              <ActivityIndicator size="small" color="#FF6B6B" style={styles.loadingIndicator} />
            )}
            {!isLoggingOut && (
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
            )}
          </TouchableOpacity>
        </View>

        {/* What Happens Section */}
        <BlurView intensity={20} tint="dark" style={styles.whatHappensCard}>
          <View style={styles.whatHappensHeader}>
            <Ionicons name="help-circle-outline" size={20} color="#C7B9FF" />
            <Text style={styles.whatHappensTitle}>What happens when you sign out?</Text>
          </View>
          <View style={styles.whatHappensList}>
            <View style={styles.whatHappensItem}>
              <Ionicons name="checkmark-circle" size={16} color="#4A90E2" />
              <Text style={styles.whatHappensText}>Your local data will be cleared</Text>
            </View>
            <View style={styles.whatHappensItem}>
              <Ionicons name="checkmark-circle" size={16} color="#4A90E2" />
              <Text style={styles.whatHappensText}>You'll need to sign in again to access your account</Text>
            </View>
            <View style={styles.whatHappensItem}>
              <Ionicons name="checkmark-circle" size={16} color="#4A90E2" />
              <Text style={styles.whatHappensText}>Your sleep data and reports remain safe on our servers</Text>
            </View>
            {logoutType === 'all' && (
              <View style={styles.whatHappensItem}>
                <Ionicons name="warning" size={16} color="#FF6B6B" />
                <Text style={[styles.whatHappensText, styles.warningText]}>
                  All active sessions will be terminated
                </Text>
              </View>
            )}
          </View>
        </BlurView>

        {/* Cancel Button */}
        {!isLoggingOut && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
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
  backButton: {
    padding: 4,
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
  userCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
    width: '100%',
  },
  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  avatarRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    opacity: 0.35,
  },
  avatarInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
    maxWidth: '100%',
  },
  userEmail: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: '100%',
    paddingHorizontal: 8,
  },
  infoSection: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: '#8F96C2',
    fontSize: 13,
    flex: 1,
  },
  optionsContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'transparent',
  },
  optionCardDisabled: {
    opacity: 0.6,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionIconContainerDanger: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionDescription: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
  },
  loadingIndicator: {
    marginRight: 8,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: 76,
  },
  whatHappensCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  whatHappensHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  whatHappensTitle: {
    color: '#C7B9FF',
    fontSize: 15,
    fontWeight: '700',
  },
  whatHappensList: {
    gap: 10,
  },
  whatHappensItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  whatHappensText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
  warningText: {
    color: '#FF6B6B',
  },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

