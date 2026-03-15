import { AuthProvider } from "@/contexts/AuthContext";
import { ProvisioningProvider } from "@/contexts/ProvisioningContext";
import { SignupProvider } from "@/contexts/SignupContext";
import { DeviceProvider } from "@/contexts/DeviceContext";
import { BootProvider } from "@/contexts/BootContext";
import { Stack } from "expo-router";
import { BluetoothProvider } from '../contexts/BluetoothProvider';
import AnimatedSplash from '@/components/AnimatedSplash';
import NavigationGuard from '@/components/NavigationGuard';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState, type AppStateStatus } from 'react-native';
import { useDevice } from '@/contexts/DeviceContext';
import { useAuth } from '@/contexts/AuthContext';
import { backfillFromApi } from '@/services/dayGraphManager';
import { backfillFromApi as backfillRespirationFromApi } from '@/services/respirationGraphManager';
import { reconnectIfDisconnected } from '@/services/websocketService';
import { pushWebSocketDataToBuffers } from '@/services/websocketBufferHandler';

// Polyfills for MQTT in React Native
import { Buffer } from 'buffer';
import process from 'process';

// @ts-ignore
global.Buffer = Buffer;
// @ts-ignore
global.process = process;

// Initialize Firebase
import '@/services/firebase';

import { useBoot } from '@/contexts/BootContext';

function AppContent() {
  const { bootReady } = useBoot();
  const { activeDevice } = useDevice();
  const { auth } = useAuth();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // On app resume (background → active), backfill heart rate buffer from API to fill gaps.
  // Short delay so device/auth context is ready after resume.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (prev.match(/inactive|background/) && nextState === 'active') {
        const deviceId = activeDevice?.deviceId;
        if (auth.isLoggedIn && deviceId) {
          const id = deviceId.trim();
          const runResume = () => {
            backfillFromApi(id).catch((err) =>
              console.warn('[App] Resume heart rate backfill failed:', err)
            );
            backfillRespirationFromApi(id).catch((err) =>
              console.warn('[App] Resume respiration backfill failed:', err)
            );
            const bufferHandler = (data: any) => pushWebSocketDataToBuffers(data, id);
            reconnectIfDisconnected(id, bufferHandler).catch((err) =>
              console.warn('[App] Resume WebSocket reconnect failed:', err)
            );
          };
          setTimeout(runResume, 400);
        }
      }
    });
    return () => sub.remove();
  }, [auth.isLoggedIn, activeDevice?.deviceId]);

  // Block rendering until boot flags are loaded
  if (!bootReady) {
    return (
      <View style={styles.bootLoader}>
        <ActivityIndicator size="large" color="#C7B9FF" />
      </View>
    );
  }

  return (
    <>
      <NavigationGuard>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#02041A" },
            animation: "fade_from_bottom",
            animationDuration: 250,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(authentication)" />
          <Stack.Screen name="(bluetooth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="terms-of-service" />
          <Stack.Screen name="privacy-policy" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="PostLoginResolver" />
        </Stack>
      </NavigationGuard>
      {/* Global animated splash overlay */}
      <AnimatedSplash />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BootProvider>
        <AuthProvider>
          <SignupProvider>
            <DeviceProvider>
              <BluetoothProvider>
                <ProvisioningProvider>
                  <AppContent />
                </ProvisioningProvider>
              </BluetoothProvider>
            </DeviceProvider>
          </SignupProvider>
        </AuthProvider>
      </BootProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bootLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#02041A',
  },
});