import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useProvisioning } from '../../../contexts/ProvisioningContext';
import { connectToNetwork, isSecure, ScannedNetwork, scanWifi } from '../../../services/WifiService';

export default function Step1SelectDeviceApScreen() {
  const router = useRouter();
  const { setDeviceAp } = useProvisioning();

  const [networks, setNetworks] = useState<ScannedNetwork[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectingSsid, setConnectingSsid] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{ ssid: string; capabilities?: string } | null>(null);
  const [password, setPassword] = useState('');

  const canScan = useMemo(() => Platform.OS === 'android', []);
  const scanSeq = useRef(0);
  const lastNonEmptyRef = useRef<ScannedNetwork[]>([]);

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Progressive, animated multi-pass scan
  const doScan = async () => {
    if (!canScan || isScanning) return;

    setIsScanning(true);
    const mySeq = ++scanSeq.current;

    // Keep current list visible until we get new items
    const map = new Map<string, ScannedNetwork>();
    (networks.length ? networks : lastNonEmptyRef.current).forEach(n => {
      const key = (n.bssid && String(n.bssid).toLowerCase()) || n.ssid;
      map.set(key, n);
    });

    try {
      console.log('[WiFi] Scanning for access points...');

      // Multiple passes to mitigate empty results and provide live updates
      const PASSES = 6;
      for (let i = 0; i < PASSES; i++) {
        // Abort if a newer scan started
        if (mySeq !== scanSeq.current) break;

        const list = await scanWifi().catch((e) => {
          // Don’t throw — just continue to next pass
          console.warn('[WiFi] scanWifi pass failed:', e?.message || e);
          return [] as ScannedNetwork[];
        });

        // Merge without wiping on empty pass
        if (Array.isArray(list) && list.length) {
          let added = 0;
          for (const n of list) {
            const key = (n.bssid && String(n.bssid).toLowerCase()) || n.ssid;
            const prev = map.get(key);
            // Update if new or stronger/different
            if (!prev || prev.level !== n.level || prev.capabilities !== n.capabilities) {
              map.set(key, n);
              added++;
            }
          }
          if (added > 0) {
            const next = Array.from(map.values())
              // Optional: sort by signal strength desc, then ssid
              .sort((a, b) => (b.level ?? -999) - (a.level ?? -999) || a.ssid.localeCompare(b.ssid));

            // Smoothly animate insertions/changes
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setNetworks(next);
            lastNonEmptyRef.current = next;
            console.log('[WiFi] Live update, total:', next.length);
          }
        }

        // Small delay between passes; increasing backoff
        await new Promise(res => setTimeout(res, 250 + i * 150));
      }

      // Finalize: if nothing found across passes, keep previous list (don’t wipe UI)
      if (mySeq === scanSeq.current) {
        const finalList = Array.from(map.values());
        if (finalList.length) {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setNetworks(finalList);
          lastNonEmptyRef.current = finalList;
          console.log('[WiFi] Scan complete. Total:', finalList.length);
        } else {
          console.log('[WiFi] Scan complete. No results, retaining previous view.');
          if (networks.length === 0 && lastNonEmptyRef.current.length > 0) {
            setNetworks(lastNonEmptyRef.current);
          }
        }
      }
    } catch (e: any) {
      console.error('[WiFi] Scan error:', e);
      const msg = String(e?.message ?? e);
      if (/expo-location native module not available/i.test(msg)) {
        Alert.alert('Dev Client Required', 'Rebuild and open the custom dev client: npx expo run:android, then npx expo start --dev-client.');
      } else if (/Location service is turned off/i.test(msg)) {
        Alert.alert('Turn On Location', 'Android requires Location services enabled to scan Wi‑Fi.');
      } else if (/permission/i.test(msg)) {
        Alert.alert('Permission Needed', 'Allow Location permission in App Settings to scan Wi‑Fi.');
      } else {
        Alert.alert('Scan Failed', msg);
      }
    } finally {
      // Cooldown to avoid back-to-back native races
      setTimeout(() => {
        if (mySeq === scanSeq.current) setIsScanning(false);
      }, 500);
    }
  };

  // Auto-scan on mount (Android)
  useEffect(() => {
    if (canScan) doScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canScan]);


  const tryConnect = async (n: ScannedNetwork, pwd?: string) => {
    setConnectingSsid(n.ssid);
    try {
      console.log('[WiFi] Connecting to:', { ssid: n.ssid, secure: isSecure(n.capabilities) });
      await connectToNetwork(n.ssid, pwd, n.capabilities);
      console.log('[WiFi] Connected to device AP:', n.ssid);
      setDeviceAp({
        ssid: n.ssid,
        bssid: n.bssid,
        secure: isSecure(n.capabilities),
        password: pwd,
      });
      router.push('/(wifi)/provision/credentials');
    } catch (e: any) {
      console.error('[WiFi] Connect error:', e);
      Alert.alert('Connection Failed', e?.message ?? 'Could not connect to selected network.');
    } finally {
      setConnectingSsid(null);
      setPassword('');
      setPasswordPrompt(null);
    }
  };

  const onSelectNetwork = (n: ScannedNetwork) => {
    if (isSecure(n.capabilities)) {
      setPasswordPrompt({ ssid: n.ssid, capabilities: n.capabilities });
    } else {
      tryConnect(n);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradient} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIcon}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Step 1 • Select Device AP</Text>
        <View style={styles.headerIcon} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Scan and select your device’s Wi‑Fi access point. If it’s secured, you’ll be asked for a password.
        </Text>

        <TouchableOpacity style={styles.scanBtn} onPress={doScan} disabled={isScanning || !canScan}>
          {isScanning ? <ActivityIndicator color="#FFF" /> : <>
            <Ionicons name="refresh" size={18} color="#FFF" />
            <Text style={styles.scanText}>Rescan</Text>
          </>}
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <Text style={styles.notice}>
            iOS limits Wi‑Fi scanning. Please connect to the device AP in Settings, then return here.
          </Text>
        )}

        <ScrollView>
          {Array.isArray(networks) && networks.map((n) => (
            <TouchableOpacity key={`${n.bssid ?? n.ssid}`} onPress={() => onSelectNetwork(n)} disabled={!!connectingSsid}>
              <BlurView intensity={25} tint="dark" style={styles.item}>
                <Ionicons name={isSecure(n.capabilities) ? 'lock-closed-outline' : 'wifi-outline'} size={20} color="#FFF" />
                <Text style={styles.itemText} numberOfLines={1}>{n.ssid || '(Hidden SSID)'}</Text>
                {connectingSsid === n.ssid && <ActivityIndicator color="#FFF" />}
              </BlurView>
            </TouchableOpacity>
          ))}
          {!isScanning && Array.isArray(networks) && networks.length === 0 && (
            <Text style={styles.empty}>No networks found. Ensure the device AP is on and nearby.</Text>
          )}
        </ScrollView>
      </View>

      {passwordPrompt && (
        <View style={styles.passwordSheet}>
          <BlurView intensity={30} tint="dark" style={styles.passwordCard}>
            <Text style={styles.sheetTitle}>Enter password for</Text>
            <Text style={styles.sheetSsid}>{passwordPrompt.ssid}</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.6)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
            <View style={styles.actionsRow}>
              <TouchableOpacity onPress={() => { setPassword(''); setPasswordPrompt(null); }} style={styles.secondaryBtn}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => tryConnect({ ssid: passwordPrompt.ssid, capabilities: passwordPrompt.capabilities }, password)}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryText}>Connect</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      )}
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
  subtitle: { color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 10 },
  scanBtn: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(74,144,226,0.3)', marginBottom: 12 },
  scanText: { color: '#FFF', fontWeight: '600' },
  notice: { color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 10 },
  itemText: { flex: 1, color: '#FFF', fontSize: 16 },
  empty: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 30 },
  passwordSheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12 },
  passwordCard: { borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  sheetTitle: { color: '#FFF', fontSize: 14, opacity: 0.8 },
  sheetSsid: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, paddingHorizontal: 12 },
  input: { flex: 1, height: 48, color: '#FFF' },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  secondaryBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  secondaryText: { color: '#FFF' },
  primaryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFF' },
  primaryText: { color: '#1D244D', fontWeight: '700' },
});