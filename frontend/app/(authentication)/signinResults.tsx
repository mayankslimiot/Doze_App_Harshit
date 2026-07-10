import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function SigninResult() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ok?: string | string[] }>();
  const okValue = Array.isArray(params.ok) ? params.ok[0] : params.ok;
  const okParam = String(okValue) === '1';

  const [done, setDone] = useState(false);

  // If ok=1 is present, show a brief loading then success
  useEffect(() => {
    let t: any;
    if (okParam) {
      t = setTimeout(() => setDone(true), 700); // small delay for UX
    } else {
      // If no ok param, go directly to success
      setDone(true);
    }
    return () => clearTimeout(t);
  }, [okParam]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradient} />

      <BlurView intensity={25} tint="dark" style={styles.card}>
        {!done ? (
          <>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.title}>Logging you in…</Text>
            <Text style={styles.subtitle}>Please wait while we verify your credentials.</Text>
          </>
        ) : (
          <>
            <View style={styles.iconContainer}>
              <Ionicons name="checkmark-circle" size={88} color="#22c55e" />
            </View>
            <Text style={styles.title}>Login Successful!</Text>
            <Text style={styles.subtitle}>Welcome back! Let's continue your journey.</Text>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                // Navigate to PostLoginResolver - it will handle device check and routing
                router.replace('/PostLoginResolver');
              }}
            >
              <Text style={styles.primaryText}>Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.replace('/(authentication)/signin')}
            >
              <Text style={styles.secondaryText}>Back to Login</Text>
            </TouchableOpacity>
          </>
        )}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '100%',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    paddingVertical: 40,
    paddingHorizontal: 30,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconContainer: {
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  primaryBtn: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  primaryText: {
    color: '#1D244D',
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondaryBtn: {
    width: '100%',
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
  },
  secondaryText: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    fontSize: 16,
  },
});