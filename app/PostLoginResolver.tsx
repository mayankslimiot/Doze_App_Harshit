import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useDevice } from '@/contexts/DeviceContext';
import { useBoot } from '@/contexts/BootContext';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * PostLoginResolver - Resolves post-login navigation
 * 
 * This screen ensures:
 * 1. User is authenticated
 * 2. Devices are loaded (success or empty)
 * 3. Navigation happens ONCE based on device status
 * 
 * Navigation Rules:
 * - devices === null → stay on loader (waiting for fetch)
 * - devices.length === 0 → navigate to Setup (replace)
 * - devices.length > 0 → navigate to Dashboard (replace)
 */
export default function PostLoginResolver() {
  const router = useRouter();
  const { auth, isPostLoginResolved, setPostLoginResolved } = useAuth();
  const { devices, isLoading: devicesLoading } = useDevice();
  const { onboardingSeen, setupSeen, completeSetup } = useBoot();
  const hasNavigated = useRef(false);

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

    // Guard: Wait for devices to be loaded (not null)
    if (devices === null) {
      return;
    }

    // All guards passed - perform navigation ONCE
    hasNavigated.current = true;

    const navigate = async () => {
      try {
        // Check onboarding status from BootContext (single source of truth)
        if (!onboardingSeen) {
          router.replace('/onboarding');
          return;
        }

        // Navigation decision based on device status
        if (devices.length === 0) {
          // No devices - navigate to Setup
          if (!setupSeen) {
            await completeSetup();
          }
          router.replace('/setup');
        } else {
          // Has devices - navigate to Dashboard
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

    navigate();
  }, [auth.isLoggedIn, auth.isLoading, devices, devicesLoading, router, setPostLoginResolved]);

  // Show loader while resolving
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
  },
});

