import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, Platform, View, UIManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDevice } from '@/contexts/DeviceContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type BannerState = 'hidden' | 'offline' | 'online';

/**
 * NetworkBanner — YouTube-style network status indicator
 * 
 * Wired to real isOnline state from DeviceContext.
 * - Goes offline → RED banner with reload icon
 * - Comes back online → GREEN banner, auto-hides after 3s
 * - Reload button triggers refreshDevices()
 */
export default function NetworkBanner() {
  const insets = useSafeAreaInsets();
  const { isOnline, refreshDevices } = useDevice();
  const [bannerState, setBannerState] = useState<BannerState>('hidden');
  const heightAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const prevOnlineRef = useRef<boolean | null>(null); // null = initial, no banner yet
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // React to real network state changes
  useEffect(() => {
    // First render: show offline banner if app starts without network
    if (prevOnlineRef.current === null) {
      prevOnlineRef.current = isOnline;
      if (!isOnline) {
        setBannerState('offline');
      }
      return;
    }

    // Only act on actual transitions
    if (isOnline === prevOnlineRef.current) return;
    prevOnlineRef.current = isOnline;

    // Clear any pending hide timer
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (!isOnline) {
      // Went offline → show red banner (stays until online)
      setBannerState('offline');
    } else {
      // Came back online → show green banner, then auto-hide after 3s
      setBannerState('online');
      hideTimerRef.current = setTimeout(() => {
        setBannerState('hidden');
      }, 3000);
    }
  }, [isOnline]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const bannerHeight = insets.top + 26;

  // Animate show/hide
  useEffect(() => {
    if (bannerState === 'hidden') {
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(heightAnim, {
          toValue: bannerHeight,
          tension: 100,
          friction: 14,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [bannerState, bannerHeight, heightAnim, opacityAnim]);

  const handleReload = () => {
    console.log('[NetworkBanner] Manual reload triggered');
    refreshDevices();
  };

  const isOffline = bannerState === 'offline';
  const bgColor = isOffline ? '#D32F2F' : '#2E7D32';
  const iconName = isOffline ? 'cloud-offline-outline' : 'checkmark-circle-outline';
  const label = isOffline ? 'No internet connection' : 'Back online';

  return (
    <>
      {/* Spacer in layout flow — pushes content down */}
      <Animated.View style={{ height: heightAnim }} />

      {/* Actual visible banner — absolute at top */}
      <Animated.View
        style={[
          styles.banner,
          {
            height: heightAnim,
            backgroundColor: bgColor,
            opacity: opacityAnim,
            paddingTop: insets.top,
          },
        ]}
        pointerEvents={bannerState === 'hidden' ? 'none' : 'auto'}
      >
        <View style={styles.content}>
          <Ionicons name={iconName as any} size={18} color="#FFFFFF" />
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  reloadButton: {
    marginLeft: 4,
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});
