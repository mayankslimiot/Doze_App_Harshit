import React, { useEffect, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBoot } from '@/contexts/BootContext';

/**
 * NavigationGuard - Navigation protection using BootContext
 * 
 * Uses BootContext as single source of truth for onboarding/setup flags.
 * Prevents race conditions from multiple AsyncStorage reads.
 * 
 * Navigation flow:
 * 1. Wait for bootReady (handled by BootProvider in _layout.tsx)
 * 2. Check onboarding (from BootContext)
 * 3. Check authentication
 * 4. Route to PostLoginResolver if logged in
 */
export default function NavigationGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { auth } = useAuth();
  const { bootReady, onboardingSeen } = useBoot();
  
  const hasNavigated = useRef(false);

  // Main navigation logic
  useEffect(() => {
    // CRITICAL: Don't navigate until boot is ready
    // BootProvider blocks rendering until bootReady, but guard here too
    if (!bootReady || auth.isLoading) {
      return;
    }

    // Prevent multiple navigations on same state
    if (hasNavigated.current) {
      return;
    }

    const currentRoute = segments[0];
    
    // Skip navigation if already on protected routes
    // Allow manual navigation within these flows
    if (
      currentRoute === '(tabs)' || 
      currentRoute === 'setup' || 
      currentRoute === 'onboarding' ||
      currentRoute === '(authentication)' ||
      currentRoute === '(bluetooth)' ||
      currentRoute === '(wifi)' ||
      currentRoute === 'PostLoginResolver' ||
      currentRoute === 'index'
    ) {
      return;
    }

    // Perform navigation
    hasNavigated.current = true;

    try {
      // Step 1: Check if onboarding is needed
      if (!onboardingSeen) {
        router.replace('/onboarding');
        return;
      }

      // Step 2: Check authentication
      if (!auth.isLoggedIn) {
        // User not logged in - navigate to index (login/signup screen)
        router.replace('/');
        return;
      }

      // Step 3: User is logged in - route to PostLoginResolver
      // PostLoginResolver will handle device check and navigation
      router.replace('/PostLoginResolver');
    } catch (error) {
      console.error('[NavigationGuard] Navigation error:', error);
      // On error, default based on auth state
      if (auth.isLoggedIn) {
        router.replace('/PostLoginResolver');
      } else {
        router.replace('/');
      }
    }
  }, [
    bootReady,
    auth.isLoading,
    auth.isLoggedIn,
    onboardingSeen,
    segments,
    router,
  ]);

  // NOTE: Removed hasNavigated reset on auth change
  // This was causing redirects after device attach when auth state updated
  // Navigation should only happen once per route change, not on every auth update

  return <>{children}</>;
}


