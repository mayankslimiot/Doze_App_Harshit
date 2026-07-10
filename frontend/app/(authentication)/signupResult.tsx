import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function SignupResult() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const okValue = Array.isArray(params.ok) ? params.ok[0] : params.ok;
  const okParam = String(okValue) === '1';


  const [done, setDone] = useState(false);

  // If ok=1 is present, show a brief loading then success
  useEffect(() => {
    let t: any;
    if (okParam) {
      t = setTimeout(() => setDone(true), 700); // small delay for UX
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
            <Text style={styles.title}>Creating your account…</Text>
            <Text style={styles.subtitle}>Please wait while we finalize your signup.</Text>
          </>
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={88} color="#22c55e" style={{ marginBottom: 10 }} />
            <Text style={styles.title}>Account created</Text>
            <Text style={styles.subtitle}>A verification email has been sent to your email address.</Text>
            <Text style={styles.verificationText}>
              Please check your email and click the verification link to activate your account before logging in.
            </Text>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => router.replace('/(authentication)/signin')}
            >
              <Text style={styles.primaryText}>Go to Login</Text>
            </TouchableOpacity>
          </>
        )}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gradient: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
  card: {
    width: '86%',
    maxWidth: 520,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    gap: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 2 },
  verificationText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 8, paddingHorizontal: 16 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 16,
  },
  primaryText: { color: '#1D244D', fontWeight: 'bold', fontSize: 16 },
});