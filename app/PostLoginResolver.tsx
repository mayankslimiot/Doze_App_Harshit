import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useDevice } from '@/contexts/DeviceContext';
import { useBoot } from '@/contexts/BootContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/**
 * PostLoginResolver - Resolves post-login navigation
 * 
 * This screen ensures:
 * 1. User is authenticated
 * 2. Devices are loaded (success, empty, or from cache)
 * 3. Navigation happens ONCE based on device status
 * 
 * Navigation Rules:
 * - No network + no cache → show "No Network" screen with Retry
 * - No network + has cache → navigate using cached devices
 * - devices === null & retries exhausted → fallback to Home
 * - devices.length === 0 → navigate to Setup (replace)
 * - devices.length > 0 → navigate to Dashboard (replace)
 */
export default function PostLoginResolver() {
  const router = useRouter();
  const { auth, isPostLoginResolved, setPostLoginResolved } = useAuth();
  const { devices, isLoading: devicesLoading, isOnline, refreshDevices } = useDevice();
  const { onboardingSeen, setupSeen, completeSetup } = useBoot();
  const hasNavigated = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Guard: Only proceed if authenticated
    if (!auth.isLoggedIn || auth.isLoading) {
      return;
    }

    // Guard: Prevent multiple navigations
    if (hasNavigated.current) {
      return;
    }

    // Guard: Wait for device loading to complete
    if (devicesLoading) {
      return;
    }

    // If devices loaded (from cache or API) — navigate
    if (devices !== null) {
      performNavigation();
      return;
    }

    // devices is null and loading finished — API failed and no cache
    // If offline, show "No Network" screen (handled in render)
    // If online, set a fallback timer — if retries don't resolve within 30s, go Home anyway
    if (isOnline && !fallbackTimerRef.current) {
      fallbackTimerRef.current = setTimeout(() => {
        if (!hasNavigated.current) {
          console.log('[PostLoginResolver] Fallback timer fired — navigating to Home');
          performNavigation(true);
        }
      }, 30000); // 30 second max wait for retries
    }
  }, [auth.isLoggedIn, auth.isLoading, devices, devicesLoading, isOnline]);

  // Cleanup fallback timer
  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  const performNavigation = async (forceFallback = false) => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }

    try {
      // Check onboarding status from BootContext (single source of truth)
      if (!onboardingSeen) {
        router.replace('/onboarding');
        return;
      }

      if (forceFallback) {
        // Retries exhausted, no cache — go to Home as safe fallback
        router.replace('/(tabs)/home');
      } else if (devices && devices.length === 0) {
        // No devices - navigate to Setup
        if (!setupSeen) {
          await completeSetup();
        }
        router.replace('/setup');
      } else {
        // Has devices (or fallback) - navigate to Dashboard
        router.replace('/(tabs)/home');
      }

      // Mark as resolved
      setPostLoginResolved(true);
    } catch (error) {
      console.error('[PostLoginResolver] Navigation error:', error);
      // Fallback: navigate to dashboard on error
      router.replace('/(tabs)/home');
      setPostLoginResolved(true);
    }
  };

  const handleRetry = () => {
    console.log('[PostLoginResolver] Manual retry tapped');
    refreshDevices();
  };

  // === RENDER ===

  // Show "No Network" screen when offline AND no cached devices
  if (!isOnline && devices === null && !devicesLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradient} />
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-offline-outline" size={48} color="#C7B9FF" />
          </View>
          <Text style={styles.title}>No internet connection</Text>
          <Text style={styles.subtitle}>
            Please check your WiFi or mobile data and try again.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={20} color="#1D244D" />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Default: Show loader while resolving
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradient} />
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#C7B9FF" />
        <Text style={styles.title}>Preparing your workspace...</Text>
        <Text style={styles.subtitle}>
          {devicesLoading || devices === null 
            ? 'Loading your devices...' 
            : devices.length === 0 
            ? 'Setting up your first device...' 
            : 'Almost ready...'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(199, 185, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 24,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C7B9FF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 32,
    gap: 8,
  },
  retryButtonText: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: '700',
  },
});
