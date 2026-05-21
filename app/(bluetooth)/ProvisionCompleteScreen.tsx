

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, SafeAreaView, StyleSheet, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { useDevice } from '@/contexts/DeviceContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function ProvisionCompleteScreen() {
  const router = useRouter();
  const { isLightTheme } = useTheme();
  const { refreshDevices } = useDevice();
  const params = useLocalSearchParams();
  const wifiSSID = (params.wifiSSID as string) || 'WiFi Network';
  const deviceId = (params.deviceId as string) || '';
  const connectedAt = params.connectedAt ? new Date(params.connectedAt as string) : new Date();
  
  const [autoNavigateCountdown, setAutoNavigateCountdown] = useState(5);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Success animation
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-navigation countdown
    countdownIntervalRef.current = setInterval(() => {
      setAutoNavigateCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
          handleContinue();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const handleContinue = async () => {
    // Clear countdown if still running
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    // Refresh devices to ensure the newly added device is loaded
    await refreshDevices();
    // Navigate to home or main app screen
    router.replace('/(tabs)/home');
  };

  const handleAddAnother = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }
    router.push('/(bluetooth)/ScanScreen');
  };

  return (
    <SafeAreaView style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} />
      {isLightTheme ? null : (
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      )}
      
      <View style={styles.content}>
        {/* Success Icon */}
        <Animated.View style={[styles.iconContainer, { transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.iconCircle, isLightTheme && { backgroundColor: 'rgba(76, 175, 80, 0.1)' }]}>
            <Ionicons name="checkmark-circle" size={120} color="#4CAF50" />
          </View>
        </Animated.View>

        <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
          <Text style={[styles.title, isLightTheme && { color: '#111111' }]}>Setup Complete! 🎉</Text>
          <Text style={[styles.subtitle, isLightTheme && { color: '#666666' }]}>
            Your Dozemate device is now connected to WiFi and ready to use.
          </Text>

          <View style={[
            styles.infoCard,
            isLightTheme && {
              backgroundColor: '#FFFFFF',
              borderColor: '#E5E7EB',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.03,
              shadowRadius: 10,
              elevation: 2,
            }
          ]}>
            <View style={styles.infoRow}>
              <Ionicons name="wifi" size={24} color="#4CAF50" />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, isLightTheme && { color: '#666666' }]}>WiFi Network</Text>
                <Text style={[styles.infoValue, isLightTheme && { color: '#111111' }]}>{wifiSSID}</Text>
              </View>
            </View>

            <View style={[styles.divider, isLightTheme && { backgroundColor: '#E5E7EB' }]} />

            <View style={styles.infoRow}>
              <Ionicons name="time" size={24} color="#4CAF50" />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, isLightTheme && { color: '#666666' }]}>Connected At</Text>
                <Text style={[styles.infoValue, isLightTheme && { color: '#111111' }]}>
                  {connectedAt.toLocaleTimeString('en-IN', { hour12: false })}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, isLightTheme && { backgroundColor: '#E5E7EB' }]} />

            <View style={styles.infoRow}>
              <Ionicons name="cloud-done" size={24} color="#4CAF50" />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, isLightTheme && { color: '#666666' }]}>Cloud Sync</Text>
                <Text style={[styles.infoValue, isLightTheme && { color: '#111111' }]}>Active</Text>
              </View>
            </View>

            <View style={[styles.divider, isLightTheme && { backgroundColor: '#E5E7EB' }]} />

            <View style={styles.infoRow}>
              <Ionicons name="heart" size={24} color="#4CAF50" />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoLabel, isLightTheme && { color: '#666666' }]}>Wellness Tracking</Text>
                <Text style={[styles.infoValue, isLightTheme && { color: '#111111' }]}>Running</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity onPress={handleContinue} style={styles.button}>
            <Text style={styles.buttonText}>Continue to Dashboard</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>

          {autoNavigateCountdown > 0 && (
            <Text style={[styles.autoNavigateText, isLightTheme && { color: '#666666' }]}>
              Auto-navigating in {autoNavigateCountdown} second{autoNavigateCountdown !== 1 ? 's' : ''}...
            </Text>
          )}

          <View style={styles.actionButtons}>
            <TouchableOpacity
              onPress={handleAddAnother}
              style={[
                styles.secondaryButton,
                isLightTheme && {
                  backgroundColor: 'rgba(0, 97, 164, 0.06)',
                  borderColor: 'rgba(0, 97, 164, 0.15)',
                }
              ]}
            >
              <Ionicons name="add-circle-outline" size={20} color={isLightTheme ? '#0061A4' : '#4A90E2'} />
              <Text style={[styles.secondaryButtonText, isLightTheme && { color: '#0061A4' }]}>Add Another Device</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.note, isLightTheme && { color: '#9CA3AF' }]}>
            Your device will now send health data to the Dozemate cloud server
          </Text>
        </Animated.View>
      </View>
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
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  iconContainer: {
    marginBottom: 30,
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 30,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoTextContainer: {
    marginLeft: 15,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    gap: 10,
    width: '100%',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  note: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    marginTop: 20,
    fontStyle: 'italic',
  },
  autoNavigateText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    marginTop: 15,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 15,
    gap: 10,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 144, 226, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
  },
  secondaryButtonText: {
    color: '#4A90E2',
    fontSize: 14,
    fontWeight: '600',
  },
});
