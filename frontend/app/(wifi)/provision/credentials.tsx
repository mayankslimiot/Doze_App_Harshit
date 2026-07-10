import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProvisioning } from '../../../contexts/ProvisioningContext';
import { sendHomeWifiToDevice } from '../../../services/DeviceProvisioningService';

export default function Step2CredentialsScreen() {
  const router = useRouter();
  const { deviceAp, deviceApIp, setDeviceApIp, setHomeCredentials } = useProvisioning();

  const [ssid, setSsid] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ip, setIp] = useState(deviceApIp);

  const submit = async () => {
    if (!ssid || !pwd) {
      Alert.alert('Missing Info', 'Please enter your home Wi‑Fi SSID and password.');
      return;
    }
    setBusy(true);
    try {
      setDeviceApIp(ip.trim() || '192.168.4.1');
      console.log('[Provisioning] Target device AP:', {
        ssid: deviceAp?.ssid,
        bssid: deviceAp?.bssid,
        secure: deviceAp?.secure,
        deviceApIp: ip,
      });
      await sendHomeWifiToDevice({ deviceApIp: ip.trim() || '192.168.4.1', homeSsid: ssid.trim(), homePassword: pwd });
      setHomeCredentials(ssid.trim(), pwd);
      router.push('/(wifi)/provision/success');
    } catch (e: any) {
      console.error('[Provisioning] Send credentials failed:', e);
      Alert.alert('Failed', e?.message ?? 'Could not send credentials to device.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradient} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Step 2 • Home Wi‑Fi</Text>
        <View style={styles.headerIcon} />
      </View>

      <View style={styles.content}>
        <BlurView intensity={25} tint="dark" style={styles.card}>
          <Text style={styles.title}>Enter your Home Wi‑Fi</Text>
          <Text style={styles.caption}>These credentials will be sent securely over the local SoftAP to your device.</Text>

          <View style={styles.inputRow}>
            <Ionicons name="wifi-outline" size={20} color="rgba(255,255,255,0.7)" />
            <TextInput
              style={styles.input}
              placeholder="Home Wi‑Fi SSID"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={ssid}
              onChangeText={setSsid}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={20} color="rgba(255,255,255,0.7)" />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={pwd}
              onChangeText={setPwd}
              secureTextEntry={!showPwd}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPwd(!showPwd)}>
              <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={22} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>

          <Text style={styles.advLabel}>Advanced</Text>
          <View style={styles.inputRow}>
            <Ionicons name="globe-outline" size={20} color="rgba(255,255,255,0.7)" />
            <TextInput
              style={styles.input}
              placeholder="Device AP IP (default 192.168.4.1)"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={ip}
              onChangeText={setIp}
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#1D244D" /> : <Text style={styles.primaryText}>Send to Device</Text>}
          </TouchableOpacity>
        </BlurView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradient: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: Platform.OS === 'android' ? 50 : 10, paddingBottom: 10 },
  headerIcon: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 10 },
  card: { borderRadius: 24, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  title: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  caption: { color: 'rgba(255,255,255,0.8)', marginTop: 6, marginBottom: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, paddingHorizontal: 12, height: 52, marginBottom: 12 },
  input: { flex: 1, color: '#FFF' },
  advLabel: { color: 'rgba(255,255,255,0.8)', marginTop: 10, marginBottom: 6 },
  primaryBtn: { width: '100%', backgroundColor: '#FFFFFF', paddingVertical: 16, borderRadius: 18, alignItems: 'center', marginTop: 10 },
  primaryText: { color: '#1D244D', fontWeight: '700' },
});