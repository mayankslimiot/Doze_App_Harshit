import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useProvisioning } from '../../../contexts/ProvisioningContext';

export default function Step3SuccessScreen() {
  const router = useRouter();
  const { homeSsid } = useProvisioning();

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradient} />
      <View style={styles.header}>
        <View style={styles.headerIcon} />
        <Text style={styles.headerTitle}>Step 3 • Finished</Text>
        <View style={styles.headerIcon} />
      </View>

      <View style={styles.center}>
        <Ionicons name="checkmark-circle" size={84} color="#4CD964" />
        <Text style={styles.title}>Credentials Sent</Text>
        <Text style={styles.subtitle}>
          Your device is now connecting to{'\n'}{homeSsid ? `"${homeSsid}"` : 'your Wi‑Fi'}.
        </Text>
        <Text style={styles.note}>
          In a future update, this screen will confirm mapping from the server.
        </Text>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/setup')}>
          <Text style={styles.primaryText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradient: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: Platform.OS === 'android' ? 50 : 10, paddingBottom: 10 },
  headerIcon: { width: 40, height: 40 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  title: { color: '#FFF', fontSize: 24, fontWeight: '800', marginTop: 10 },
  subtitle: { color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 8 },
  note: { color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginTop: 8, fontSize: 12 },
  primaryBtn: { marginTop: 20, backgroundColor: '#FFF', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 18 },
  primaryText: { color: '#1D244D', fontWeight: '700' },
});