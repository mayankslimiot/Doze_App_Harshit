import React, { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useDevice } from '@/contexts/DeviceContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * NavigationGuard - Industry-standard navigation protection
 * 
 * Handles the complete app flow:
 * 1. Splash Screen (handled by AnimatedSplash)
 * 2. Auth Check
 * 3. Onboarding Check
 * 4. Device Check (if logged in)
 * 5. Route to appropriate screen
 */
export default function NavigationGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { auth } = useAuth();
  const { devices, isLoading: devicesLoading } = useDevice();
  
  const [isInitialized, setIsInitialized] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);
  const [setupSeen, setSetupSeen] = useState<boolean | null>(null);
  const hasNavigated = useRef(false);

  // Load onboarding and setup flags
  useEffect(() => {
    let mounted = true;
    
    const loadFlags = async () => {
      try {
        const [onboarding, setup] = await Promise.all([
          AsyncStorage.getItem('onboarding_seen_v1'),
          AsyncStorage.getItem('setup_seen_v1'),
        ]);
        
        if (!mounted) return;
        
        setOnboardingSeen(!!onboarding);
        setSetupSeen(!!setup);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to load navigation flags:', error);
        if (!mounted) return;
        setOnboardingSeen(false);
        setSetupSeen(false);
        setIsInitialized(true);
      }
    };

    loadFlags();
    return () => { mounted = false; };
  }, []);

  // Main navigation logic - runs after all checks are complete
  useEffect(() => {
    // Don't navigate if:
    // 1. Not initialized yet
    // 2. Auth is still loading
    // 3. Already navigated (prevent multiple navigations)
    if (!isInitialized || auth.isLoading || hasNavigated.current) {
      return;
    }

    const currentRoute = segments[0];
    
    // Skip navigation if already on protected routes (tabs, setup, onboarding, authentication flows)
    // Allow manual navigation within these flows
    if (
      currentRoute === '(tabs)' || 
      currentRoute === 'setup' || 
      currentRoute === 'onboarding' ||
      currentRoute === '(authentication)' ||
      currentRoute === '(bluetooth)' ||
      currentRoute === '(wifi)'
    ) {
      return;
    }

    const navigate = async () => {
      hasNavigated.current = true;

      try {
        // Step 1: Check if onboarding is needed
        if (!onboardingSeen) {
          router.replace('/onboarding');
          return;
        }

        // Step 2: Check authentication
        if (!auth.isLoggedIn) {
          // User not logged in - stay on index (login/signup screen)
          // Only navigate if we're not already there
          if (currentRoute !== 'index' && !currentRoute?.startsWith('(authentication)')) {
            router.replace('/');
          }
          return;
        }

        // Step 3: User is logged in - check for device setup
        // Wait for device loading to complete if still loading
        if (devicesLoading) {
          // Reset flag to allow navigation after devices load
          hasNavigated.current = false;
          return;
        }

        // Step 4: Check if setup screen should be shown
        if (!setupSeen) {
          // Mark setup as seen to prevent showing it again
          try {
            await AsyncStorage.setItem('setup_seen_v1', '1');
            setSetupSeen(true);
          } catch (error) {
            console.error('Failed to save setup flag:', error);
          }
          router.replace('/setup');
          return;
        }

        // Step 5: Check if user has devices
        if (devices.length === 0) {
          // No devices - redirect to setup
          router.replace('/setup');
          return;
        }

        // Step 6: All checks passed - navigate to dashboard
        router.replace('/(tabs)/home');
      } catch (error) {
        console.error('Navigation error:', error);
        // On error, default to login screen
        if (auth.isLoggedIn) {
          router.replace('/(tabs)/home');
        } else {
          router.replace('/');
        }
      }
    };

    navigate();
  }, [
    isInitialized,
    auth.isLoading,
    auth.isLoggedIn,
    onboardingSeen,
    setupSeen,
    devices.length,
    devicesLoading,
    segments,
  ]);

  // Reset navigation flag when auth state changes significantly
  useEffect(() => {
    hasNavigated.current = false;
  }, [auth.isLoggedIn]);

  // Monitor device changes and redirect if needed
  // If user is on home screen but has no devices, redirect to setup
  useEffect(() => {
    if (!isInitialized || auth.isLoading || !auth.isLoggedIn) {
      return;
    }

    const currentRoute = segments[0];
    
    // If user is on home/dashboard but has no devices, redirect to setup
    if (currentRoute === '(tabs)' && devices.length === 0 && !devicesLoading) {
      router.replace('/setup');
    }
  }, [devices.length, devicesLoading, auth.isLoggedIn, isInitialized, segments]);

  // Show loading indicator while initializing
  if (!isInitialized || auth.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#C7B9FF" />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#02041A',
  },
});

