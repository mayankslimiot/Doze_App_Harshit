import { AuthProvider } from "@/contexts/AuthContext";
import { ProvisioningProvider } from "@/contexts/ProvisioningContext";
import { SignupProvider } from "@/contexts/SignupContext";
import { DeviceProvider } from "@/contexts/DeviceContext";
import { Stack } from "expo-router";
import { BluetoothProvider } from '../contexts/BluetoothProvider';
import AnimatedSplash from '@/components/AnimatedSplash';
import NavigationGuard from '@/components/NavigationGuard';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Polyfills for MQTT in React Native
import { Buffer } from 'buffer';
import process from 'process';

// @ts-ignore
global.Buffer = Buffer;
// @ts-ignore
global.process = process;


export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SignupProvider>
        <DeviceProvider>
        <BluetoothProvider>
        <ProvisioningProvider>
          <NavigationGuard>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#02041A" },
              animation: "fade_from_bottom", // Use a simple fade for clean transitions
              animationDuration: 3000, // A faster duration feels more responsive
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
          </Stack>
          </NavigationGuard>
          {/* Global animated splash overlay */}
          <AnimatedSplash />
        </ProvisioningProvider>
      </BluetoothProvider>
      </DeviceProvider>
      </SignupProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}