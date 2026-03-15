import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
    View,
} from 'react-native';

// --- Mock Data & Types ---
// Replace with your actual Wi-Fi library's types and functions
type WifiNetwork = { ssid: string; BSSID: string }; // BSSID is the MAC address
const MOCK_AVAILABLE_APS: WifiNetwork[] = [
  { ssid: 'SLIMiot-Ring-A4B2', BSSID: 'AA:BB:CC:DD:EE:01' },
  { ssid: 'Living Room Wifi', BSSID: 'AA:BB:CC:DD:EE:02' },
  { ssid: 'MyOtherAP', BSSID: 'AA:BB:CC:DD:EE:03' },
];
const MOCK_SAVED_NETWORKS: WifiNetwork[] = [
    { ssid: 'MyHomeWiFi', BSSID: 'FF:GG:HH:II:JJ:01' },
    { ssid: 'Work-Guest', BSSID: 'FF:GG:HH:II:JJ:02' },
];
// --- End Mock Data ---

type ProvisioningStep = 'SELECT_DEVICE_AP' | 'SEND_CREDENTIALS';

export default function SoftProvisioningScreen() {
  const router = useRouter();
  
  // Flow control state
  const [step, setStep] = useState<ProvisioningStep>('SELECT_DEVICE_AP');
  
  // Step 1: SELECT_DEVICE_AP states
  const [availableAPs, setAvailableAPs] = useState<WifiNetwork[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectingToAP, setConnectingToAP] = useState<string | null>(null);

  // Step 2: SEND_CREDENTIALS states
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [savedNetworks, setSavedNetworks] = useState<WifiNetwork[]>([]);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordHidden, setIsPasswordHidden] = useState(true);
  const [isProvisioning, setIsProvisioning] = useState(false);

  // --- API & Library Functions (to be implemented) ---

  const scanForAccessPoints = async () => {
    setIsScanning(true);
    console.log('Scanning for Wi-Fi APs...');
    // TODO: Use a library like 'react-native-wifi-reborn' to scan for networks.
    // const networks = await WifiManager.reScanAndLoadWifiList();
    // For now, we use mock data and filter for device APs.
    setTimeout(() => {
      const deviceAPs = MOCK_AVAILABLE_APS.filter(ap => ap.ssid.startsWith('SLIMiot-Ring'));
      setAvailableAPs(deviceAPs);
      setIsScanning(false);
    }, 2000);
  };

  const connectToDeviceAP = async (network: WifiNetwork) => {
    setConnectingToAP(network.ssid);
    console.log(`Connecting to device AP: ${network.ssid}`);
    // TODO: Use your Wi-Fi library to connect to the device's AP.
    // This will disconnect the phone from its current Wi-Fi.
    // await WifiManager.connectToProtectedSSID(network.ssid, 'device_password_if_any', false);
    setTimeout(() => {
      console.log('Successfully connected to device AP.');
      setConnectingToAP(null);
      setStep('SEND_CREDENTIALS'); // Move to the next step
      fetchSavedNetworks();
    }, 2000);
  };

  const fetchSavedNetworks = async () => {
      // TODO: Use your Wi-Fi library to get saved/configured networks from the phone.
      // This is often not possible on modern iOS for security reasons.
      // On Android, it might be possible with the right permissions.
      console.log('Fetching saved networks from phone...');
      setSavedNetworks(MOCK_SAVED_NETWORKS);
  };

  const sendCredentialsToDevice = async () => {
    if (!ssid || !password) {
      Alert.alert('Missing Information', 'Please provide a Wi-Fi name and password.');
      return;
    }
    setIsProvisioning(true);
    console.log(`Sending credentials to device: SSID=${ssid}`);
    // TODO: Make an HTTP POST request to the device's static IP (e.g., http://192.168.4.1/config)
    // const response = await fetch('http://192.168.4.1/config', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ ssid, password }),
    // });
    setTimeout(() => {
      setIsProvisioning(false);
      Alert.alert('Success!', 'Device is connecting to your Wi-Fi.');
      router.back();
    }, 3000);
  };

  useEffect(() => {
    scanForAccessPoints();
  }, []);

  const toggleManualEntry = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowManualEntry(!showManualEntry);
  };

  // --- Render Functions for Each Step ---

  const renderSelectDeviceAPStep = () => (
    <View style={styles.content}>
      <Text style={styles.stepTitle}>Step 1: Connect to Your Device</Text>
      <Text style={styles.stepSubtitle}>Select your SLIMiot Ring's access point from the list below.</Text>
      <TouchableOpacity style={styles.rescanButton} onPress={scanForAccessPoints} disabled={isScanning}>
        <Ionicons name="refresh" size={20} color="#FFF" />
        <Text style={styles.rescanButtonText}>{isScanning ? 'Scanning...' : 'Rescan for Devices'}</Text>
      </TouchableOpacity>
      <ScrollView>
        {availableAPs.length > 0 ? availableAPs.map(ap => (
          <TouchableOpacity key={ap.BSSID} onPress={() => connectToDeviceAP(ap)} disabled={!!connectingToAP}>
            <BlurView intensity={25} tint="dark" style={styles.itemContainer}>
              <Ionicons name="hardware-chip-outline" size={24} color="rgba(255, 255, 255, 0.8)" />
              <Text style={styles.itemName}>{ap.ssid}</Text>
              {connectingToAP === ap.ssid && <ActivityIndicator color="#FFF" />}
            </BlurView>
          </TouchableOpacity>
        )) : !isScanning && (
            <Text style={styles.emptyText}>No SLIMiot devices found. Make sure your device is powered on and in setup mode.</Text>
        )}
      </ScrollView>
    </View>
  );

  const renderSendCredentialsStep = () => (
    <View style={styles.content}>
      <Text style={styles.stepTitle}>Step 2: Provide Wi-Fi Credentials</Text>
      <Text style={styles.stepSubtitle}>Choose a saved network or enter credentials manually to connect your device to the internet.</Text>
      
      {/* Saved Networks List */}
      <Text style={styles.listHeader}>Select a saved network</Text>
      {savedNetworks.map(net => (
          <TouchableOpacity key={net.BSSID} onPress={() => { setSsid(net.ssid); setPassword(''); Alert.alert('Network Selected', `Please enter the password for "${net.ssid}" in the manual entry section.`); setShowManualEntry(true); }}>
              <BlurView intensity={25} tint="dark" style={styles.itemContainer}>
                  <Ionicons name="wifi" size={20} color="rgba(255, 255, 255, 0.8)" />
                  <Text style={styles.itemName}>{net.ssid}</Text>
              </BlurView>
          </TouchableOpacity>
      ))}

      {/* Manual Entry Section */}
      <TouchableOpacity onPress={toggleManualEntry} style={styles.manualEntryToggle}>
        <Text style={styles.manualEntryText}>Enter Wi-Fi Manually</Text>
        <Ionicons name={showManualEntry ? 'chevron-up' : 'chevron-down'} size={20} color="rgba(255, 255, 255, 0.7)" />
      </TouchableOpacity>

      {showManualEntry && (
        <View>
          <View style={styles.inputContainer}>
            <TextInput style={styles.input} placeholder="Wi-Fi Name (SSID)" placeholderTextColor="rgba(255, 255, 255, 0.5)" value={ssid} onChangeText={setSsid} />
          </View>
          <View style={styles.inputContainer}>
            <TextInput style={styles.input} placeholder="Password" placeholderTextColor="rgba(255, 255, 255, 0.5)" value={password} onChangeText={setPassword} secureTextEntry={isPasswordHidden} />
            <TouchableOpacity onPress={() => setIsPasswordHidden(!isPasswordHidden)}>
              <Ionicons name={isPasswordHidden ? 'eye-off-outline' : 'eye-outline'} size={22} color="rgba(255, 255, 255, 0.5)" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TouchableOpacity style={[styles.primaryButton, isProvisioning && {backgroundColor: 'grey'}]} onPress={sendCredentialsToDevice} disabled={isProvisioning}>
        {isProvisioning ? <ActivityIndicator color="#1D244D" /> : <Text style={styles.primaryButtonText}>Connect Device to Wi-Fi</Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconContainer}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerText}>Device Wi-Fi Setup</Text>
        <View style={styles.headerIconContainer} />
      </View>
      {step === 'SELECT_DEVICE_AP' ? renderSelectDeviceAPStep() : renderSendCredentialsStep()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: Platform.OS === 'android' ? 50 : 0, paddingBottom: 10 },
  headerIconContainer: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerText: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  stepTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', textAlign: 'center' },
  stepSubtitle: { fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', marginTop: 10, marginBottom: 20 },
  rescanButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: 'rgba(74, 144, 226, 0.3)', padding: 12, borderRadius: 15, marginBottom: 20 },
  rescanButtonText: { color: '#FFF', fontWeight: '600' },
  itemContainer: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 20, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', gap: 15 },
  itemName: { flex: 1, color: '#FFF', fontSize: 16 },
  emptyText: { color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', marginTop: 40 },
  listHeader: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 16, fontWeight: '600', marginBottom: 10, marginTop: 10 },
  manualEntryToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, marginTop: 10 },
  manualEntryText: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 16 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.2)', borderRadius: 15, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  input: { flex: 1, height: 50, color: '#FFFFFF', fontSize: 16 },
  primaryButton: { width: '100%', backgroundColor: '#FFFFFF', paddingVertical: 18, borderRadius: 20, alignItems: 'center', marginTop: 'auto', marginBottom: 20 },
  primaryButtonText: { color: '#1D244D', fontWeight: 'bold', fontSize: 16 },
});
