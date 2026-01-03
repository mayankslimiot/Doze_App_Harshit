import CustomAlert from "@/components/CustomAlert";
import { useBluetooth } from "@/contexts/BluetoothProvider";
import { useProvisioning } from "@/contexts/ProvisioningContext";
import { ScannedNetwork, scanWifi } from "@/services/WifiService";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter, usePathname } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import WifiManager from "react-native-wifi-reborn";

export default function WiFiSetupScreen() {
  const {
    wifiSSID,
    wifiPassword,
    setWifiSSID,
    setWifiPassword,
    sendWifiCredentials,
    selectedDevice,
    wifiProvisioningSuccess,
  } = useProvisioning();
  const { connectedDevice, connectionStatus } = useBluetooth();
  const router = useRouter();
  const pathname = usePathname();

  const [showPassword, setShowPassword] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertButtons, setAlertButtons] = useState<Array<{text: string, onPress: () => void, style?: 'default' | 'primary'}>>([]);
  const [connectionStatusText, setConnectionStatusText] = useState<string>("Connected");
  
  // WiFi network scanning states
  const [showNetworkPicker, setShowNetworkPicker] = useState(false);
  const [availableNetworks, setAvailableNetworks] = useState<ScannedNetwork[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  
  // Ref to track if we've already shown the disconnection alert
  const hasShownDisconnectAlert = useRef(false);

  // Function to show disconnect alert
  const showDisconnectAlert = useCallback(() => {
    console.log('⚠️ Unexpected device disconnection in WiFiSetupScreen');
    hasShownDisconnectAlert.current = true;
    
    setAlertTitle("Device Disconnected");
    setAlertMessage(
      `Connection to ${selectedDevice?.name || 'device'} was lost.\n\n` +
      "This might happen if:\n" +
      "• The device moved out of range\n" +
      "• Bluetooth was turned off\n" +
      "• The device was powered off\n\n" +
      "If WiFi setup was in progress, please check if it completed successfully."
    );
    setAlertButtons([
      {
        text: "Check Status",
        onPress: () => {
          setShowAlert(false);
          hasShownDisconnectAlert.current = false;
          // Navigate to ConnectScreen to check provisioning status
          setTimeout(() => {
            router.push("/(bluetooth)/ConnectScreen");
          }, 300);
        },
        style: 'primary' as const
      },
      {
        text: "Back to Scan",
        onPress: () => {
          setShowAlert(false);
          hasShownDisconnectAlert.current = false;
          setTimeout(() => {
            router.replace("/(bluetooth)/ScanScreen");
          }, 300);
        },
        style: 'default' as const
      }
    ]);
    setShowAlert(true);
  }, [selectedDevice, router]);

  // Monitor device connection status
  useEffect(() => {
    console.log('📱 WiFiSetupScreen - Connection status:', connectionStatus);
    console.log('📱 WiFiSetupScreen - Connected device:', connectedDevice?.name);

    // Update status text
    switch (connectionStatus) {
      case 'connected':
        setConnectionStatusText('Connected');
        // Reset the alert flag when reconnected
        hasShownDisconnectAlert.current = false;
        break;
      case 'connecting':
        setConnectionStatusText('Connecting...');
        break;
      case 'disconnecting':
        setConnectionStatusText('Disconnecting...');
        break;
      case 'disconnected':
        setConnectionStatusText('Disconnected');
        break;
      default:
        setConnectionStatusText('Unknown');
    }

    // Handle disconnection - only show alert if WiFi provisioning hasn't succeeded
    // After WiFi connection, BLE disconnect is expected and normal
    if (connectionStatus === 'disconnected' && !hasShownDisconnectAlert.current) {
      // If WiFi provisioning succeeded, BLE disconnect is expected - don't show alert
      if (wifiProvisioningSuccess) {
        console.log('✅ WiFi provisioning succeeded - BLE disconnect is expected, not showing alert');
        hasShownDisconnectAlert.current = true;
        return; // Don't show disconnect alert after successful WiFi connection
      }
      
      // Check if we're currently on ConnectScreen (provisioning in progress)
      // In that case, wait a bit to see if WiFi connection succeeds
      const isProvisioningInProgress = pathname?.includes('ConnectScreen') || 
                                       pathname?.includes('provision');
      
      if (isProvisioningInProgress) {
        console.log('⏳ Provisioning in progress - BLE disconnect might be normal, waiting 3s...');
        // Wait a bit to see if we get success status via MQTT
        const waitTimeout = setTimeout(() => {
          // Re-check success status after wait
          if (wifiProvisioningSuccess) {
            console.log('✅ WiFi provisioning succeeded during wait - not showing disconnect alert');
            return;
          }
          // If still not successful after wait, show alert
          console.log('⚠️ Still no success after wait - showing disconnect alert');
          showDisconnectAlert();
        }, 3000);
        
        // Cleanup timeout if component unmounts
        return () => clearTimeout(waitTimeout);
      }
      
      // Show disconnect alert for unexpected disconnections (not during provisioning)
      showDisconnectAlert();
    }
  }, [connectionStatus, connectedDevice, selectedDevice, router, wifiProvisioningSuccess, showDisconnectAlert]);

  const checkLocationPermission = async (): Promise<boolean> => {
    try {
      console.log('📍 Checking location permission...');
      const { status } = await Location.getForegroundPermissionsAsync();
      
      if (status === 'granted') {
        console.log('✅ Location permission already granted');
        return true;
      }
      
      // Request permission
      console.log('🔐 Requesting location permission...');
      const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
      
      if (newStatus === 'granted') {
        console.log('✅ Location permission granted');
        return true;
      }
      
      // Permission denied
      console.log('❌ Location permission denied');
      setAlertTitle("Location Permission Required");
      setAlertMessage(
        "Location permission is required to scan WiFi networks on Android.\n\n" +
        "This is an Android system requirement for WiFi scanning."
      );
      setAlertButtons([
        {
          text: "Cancel",
          onPress: () => setShowAlert(false),
          style: 'default'
        },
        {
          text: "Open Settings",
          onPress: () => {
            setShowAlert(false);
            Linking.openSettings();
          },
          style: 'primary'
        }
      ]);
      setShowAlert(true);
      return false;
    } catch (error) {
      console.error('❌ Error checking location permission:', error);
      return false;
    }
  };

  const checkLocationServices = async (): Promise<boolean> => {
    try {
      console.log('📍 Checking location services...');
      const providers = await Location.getProviderStatusAsync();
      
      if (providers.locationServicesEnabled) {
        console.log('✅ Location services enabled');
        return true;
      }
      
      console.log('❌ Location services disabled');
      setAlertTitle("Location Services Off");
      setAlertMessage(
        "Location services are currently turned off.\n\n" +
        "Please enable location services in your device settings to scan WiFi networks."
      );
      setAlertButtons([
        {
          text: "Cancel",
          onPress: () => setShowAlert(false),
          style: 'default'
        },
        {
          text: "Open Settings",
          onPress: async () => {
            setShowAlert(false);
            if (Platform.OS === 'android') {
              // Open location settings directly on Android
              await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
            } else {
              // iOS - open app settings
              Linking.openSettings();
            }
          },
          style: 'primary'
        }
      ]);
      setShowAlert(true);
      return false;
    } catch (error) {
      console.error('❌ Error checking location services:', error);
      return false;
    }
  };

  const checkWifiState = async (): Promise<boolean> => {
    try {
      console.log('📶 Checking WiFi state...');
      
      if (Platform.OS === 'ios') {
        // iOS doesn't provide WiFi state checking
        return true;
      }
      
      const isEnabled = await WifiManager.isEnabled();
      
      if (isEnabled) {
        console.log('✅ WiFi is enabled');
        return true;
      }
      
      console.log('❌ WiFi is disabled');
      setAlertTitle("WiFi is Off");
      setAlertMessage(
        "WiFi is currently turned off.\n\n" +
        "Please enable WiFi to scan for available networks."
      );
      setAlertButtons([
        {
          text: "Cancel",
          onPress: () => setShowAlert(false),
          style: 'default'
        },
        {
          text: "Open Settings",
          onPress: async () => {
            setShowAlert(false);
            if (Platform.OS === 'android') {
              // Open WiFi settings directly on Android
              await Linking.sendIntent('android.settings.WIFI_SETTINGS');
            } else {
              // iOS - open app settings (can't directly open WiFi settings)
              Linking.openSettings();
            }
          },
          style: 'primary'
        }
      ]);
      setShowAlert(true);
      return false;
    } catch (error) {
      console.error('❌ Error checking WiFi state:', error);
      // If we can't check, assume it's enabled and let scanWifi handle errors
      return true;
    }
  };

  const handleScanNetworks = async () => {
    console.log('🔍 Starting WiFi scan process...');
    
    // Step 1: Check location permission (required on Android for WiFi scanning)
    if (Platform.OS === 'android') {
      const hasLocationPermission = await checkLocationPermission();
      if (!hasLocationPermission) {
        console.log('⚠️ Location permission not granted, aborting scan');
        return;
      }
      
      // Step 2: Check location services
      const locationServicesEnabled = await checkLocationServices();
      if (!locationServicesEnabled) {
        console.log('⚠️ Location services not enabled, aborting scan');
        return;
      }
    }
    
    // Step 3: Check WiFi state
    const wifiEnabled = await checkWifiState();
    if (!wifiEnabled) {
      console.log('⚠️ WiFi not enabled, aborting scan');
      return;
    }
    
    // All checks passed, proceed with scanning
    setIsScanning(true);
    try {
      console.log('🔍 Scanning for WiFi networks...');
      const networks = await scanWifi();
      console.log('📡 Found networks:', networks.length);
      
      if (networks.length === 0) {
        console.warn('⚠️ No networks found in scan result');
        console.log('📋 Raw networks array:', networks);
      } else {
        console.log('📋 Networks:', networks.map(n => n.ssid).join(', '));
      }
      
      // Remove duplicates based on SSID and sort by signal strength
      const uniqueNetworks = networks.reduce((acc: ScannedNetwork[], current: ScannedNetwork) => {
        const existing = acc.find(n => n.ssid === current.ssid);
        if (!existing) {
          acc.push(current);
        } else if (current.level && existing.level && current.level > existing.level) {
          // Keep the one with better signal
          const index = acc.indexOf(existing);
          acc[index] = current;
        }
        return acc;
      }, []);
      
      // Sort by signal strength (higher is better)
      uniqueNetworks.sort((a: ScannedNetwork, b: ScannedNetwork) => (b.level || -100) - (a.level || -100));
      
      console.log('📊 Unique networks after deduplication:', uniqueNetworks.length);
      
      setAvailableNetworks(uniqueNetworks);
      setShowNetworkPicker(true);
      
      // Show a helpful message if no networks found
      if (uniqueNetworks.length === 0) {
        console.warn('⚠️ No WiFi networks found');
      }
    } catch (error) {
      console.error('❌ Error scanning networks:', error);
      console.error('❌ Error details:', JSON.stringify(error));
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isThrottled = errorMessage.includes('throttled') || errorMessage.includes('only allowed to scan');
      
      setAlertTitle(isThrottled ? "Scan Limit Reached" : "Scan Failed");
      setAlertMessage(
        isThrottled 
          ? "Android limits WiFi scans to 4 times per 2 minutes.\n\n" +
            "Please wait a moment and try again, or manually enter your network name."
          : `Failed to scan WiFi networks.\n\n${errorMessage}\n\n` +
            "Please try again or manually enter your network name."
      );
      setAlertButtons([
        {
          text: "OK",
          onPress: () => setShowAlert(false),
          style: 'primary'
        }
      ]);
      setShowAlert(true);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectNetwork = (network: ScannedNetwork) => {
    console.log('✅ Selected network:', network.ssid);
    setWifiSSID(network.ssid);
    setShowNetworkPicker(false);
  };

  const handleSend = async () => {
    // Validate inputs
    if (!wifiSSID.trim()) {
      setAlertTitle("Invalid SSID");
      setAlertMessage("Please enter a valid Wi-Fi network name (SSID).");
      setAlertButtons([
        {
          text: "OK",
          onPress: () => setShowAlert(false),
          style: 'primary'
        }
      ]);
      setShowAlert(true);
      return;
    }

    if (!wifiPassword.trim()) {
      setAlertTitle("Invalid Password");
      setAlertMessage("Please enter your Wi-Fi password.");
      setAlertButtons([
        {
          text: "OK",
          onPress: () => setShowAlert(false),
          style: 'primary'
        }
      ]);
      setShowAlert(true);
      return;
    }

    if (wifiPassword.length < 8) {
      setAlertTitle("Password Too Short");
      setAlertMessage("Wi-Fi password must be at least 8 characters long.");
      setAlertButtons([
        {
          text: "OK",
          onPress: () => setShowAlert(false),
          style: 'primary'
        }
      ]);
      setShowAlert(true);
      return;
    }

    Keyboard.dismiss();
    setIsSending(true);

    try {
      // Navigate to ConnectScreen to monitor the connection status
      console.log('🚀 Navigating to ConnectScreen to monitor WiFi setup...');
      router.push("/(bluetooth)/ConnectScreen");
    } catch (error) {
      setIsSending(false);
      console.error("Error sending credentials:", error);
      
      setAlertTitle("Error");
      setAlertMessage("An unexpected error occurred while sending credentials. Please try again.");
      setAlertButtons([
        {
          text: "OK",
          onPress: () => setShowAlert(false),
          style: 'primary'
        }
      ]);
      setShowAlert(true);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={["#1D244D", "#02041A", "#1A1D3E"]}
          style={styles.gradientBackground}
        />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerIconContainer}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerText}>Wi-Fi Setup</Text>
          <View style={styles.headerIconContainer} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Device Info Card */}
          {selectedDevice && (
            <BlurView intensity={25} tint="dark" style={styles.deviceCard}>
              <View style={styles.deviceCardHeader}>
                <View style={styles.deviceIconWithStatus}>
                  <Ionicons name="hardware-chip" size={32} color="#4A90E2" />
                  <View style={[
                    styles.connectionStatusDot,
                    connectionStatus === 'connected' && styles.statusConnected,
                    connectionStatus === 'connecting' && styles.statusConnecting,
                    connectionStatus === 'disconnected' && styles.statusDisconnected,
                  ]} />
                </View>
                <View style={styles.deviceCardInfo}>
                  <Text style={styles.deviceCardTitle}>Connected Device</Text>
                  <Text style={styles.deviceCardName}>
                    {selectedDevice.name || "Unknown Device"}
                  </Text>
                  <Text style={styles.connectionStatus}>
                    Status: {connectionStatusText}
                  </Text>
                </View>
              </View>
            </BlurView>
          )}

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <Ionicons name="information-circle-outline" size={24} color="rgba(255, 255, 255, 0.7)" />
            <Text style={styles.instructionsText}>
              Enter your Wi-Fi network credentials to connect your device to the internet.
            </Text>
          </View>

          {/* SSID Input */}
          <View style={styles.inputContainer}>
            <View style={styles.labelWithButton}>
              <Text style={styles.inputLabel}>Wi-Fi Network (SSID)</Text>
              <TouchableOpacity
                onPress={handleScanNetworks}
                style={styles.scanButton}
                disabled={isSending || isScanning}
              >
                {isScanning ? (
                  <ActivityIndicator size="small" color="#4A90E2" />
                ) : (
                  <>
                    <Ionicons name="search" size={16} color="#4A90E2" />
                    <Text style={styles.scanButtonText}>Scan Networks</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
            <BlurView intensity={20} tint="dark" style={styles.inputWrapper}>
              <Ionicons
                name="wifi"
                size={20}
                color="rgba(255, 255, 255, 0.6)"
                style={styles.inputIcon}
              />
              <TextInput
                value={wifiSSID}
                onChangeText={setWifiSSID}
                placeholder="Enter network name"
                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                style={styles.textInput}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSending}
              />
            </BlurView>
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Wi-Fi Password</Text>
            <BlurView intensity={20} tint="dark" style={styles.inputWrapper}>
              <Ionicons
                name="lock-closed"
                size={20}
                color="rgba(255, 255, 255, 0.6)"
                style={styles.inputIcon}
              />
              <TextInput
                value={wifiPassword}
                onChangeText={setWifiPassword}
                placeholder="Enter password"
                placeholderTextColor="rgba(255, 255, 255, 0.4)"
                secureTextEntry={!showPassword}
                style={[styles.textInput, { flex: 1 }]}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSending}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                disabled={isSending}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={20}
                  color="rgba(255, 255, 255, 0.6)"
                />
              </TouchableOpacity>
            </BlurView>
          </View>

          {/* Security Note */}
          <View style={styles.securityNote}>
            <Ionicons name="shield-checkmark" size={18} color="#4A90E2" />
            <Text style={styles.securityText}>
              Your credentials are transmitted securely via Bluetooth
            </Text>
          </View>

          {/* Send Button */}
          <TouchableOpacity
            onPress={handleSend}
            style={[
              styles.sendButton,
              isSending && styles.sendButtonDisabled,
            ]}
            disabled={isSending}
          >
            {isSending ? (
              <View style={styles.sendingContainer}>
                <ActivityIndicator size="small" color="#1D244D" />
                <Text style={styles.sendButtonText}>Sending...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sendButtonText}>Send to Device</Text>
                <Ionicons name="arrow-forward" size={20} color="#1D244D" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Custom Alert */}
        <CustomAlert
          visible={showAlert}
          title={alertTitle}
          message={alertMessage}
          buttons={alertButtons}
          onClose={() => {
            setShowAlert(false);
            // Reset the flag when alert is closed
            hasShownDisconnectAlert.current = false;
          }}
        />

        {/* Network Picker Modal */}
        {showNetworkPicker && (
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setShowNetworkPicker(false)}>
              <View style={styles.modalBackdrop} />
            </TouchableWithoutFeedback>
            <View style={styles.modalContainer}>
                  <LinearGradient
                    colors={["#1D244D", "#02041A", "#1A1D3E"]}
                    style={styles.modalGradient}
                  >
                    {/* Modal Header */}
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Available Networks</Text>
                      <TouchableOpacity
                        onPress={() => setShowNetworkPicker(false)}
                        style={styles.modalCloseButton}
                      >
                        <Ionicons name="close" size={24} color="#FFF" />
                      </TouchableOpacity>
                    </View>

                    {/* Networks List */}
                    <ScrollView style={styles.networksList}>
                      {availableNetworks.length === 0 ? (
                        <View style={styles.emptyContainer}>
                          <Ionicons name="wifi-outline" size={48} color="rgba(255, 255, 255, 0.3)" />
                          <Text style={styles.emptyText}>No networks found</Text>
                        </View>
                      ) : (
                        availableNetworks.map((network, index) => (
                          <TouchableOpacity
                            key={`${network.ssid}-${index}`}
                            onPress={() => handleSelectNetwork(network)}
                            style={styles.networkItem}
                          >
                            <BlurView intensity={25} tint="dark" style={styles.networkItemBlur}>
                              <View style={styles.networkItemContent}>
                                <Ionicons 
                                  name={network.capabilities && /(WPA|WEP)/i.test(network.capabilities) ? "lock-closed" : "wifi"} 
                                  size={24} 
                                  color="#4A90E2" 
                                />
                                <View style={styles.networkInfo}>
                                  <Text style={styles.networkName}>{network.ssid}</Text>
                                  {network.capabilities && (
                                    <Text style={styles.networkCapabilities}>
                                      {network.capabilities.replace(/\[|\]/g, '').split('-').slice(0, 2).join(' • ')}
                                    </Text>
                                  )}
                                </View>
                                {network.level && (
                                  <View style={styles.signalStrength}>
                                    <Ionicons 
                                      name={
                                        network.level > -50 ? "cellular" : 
                                        network.level > -70 ? "cellular-outline" : 
                                        "cellular-outline"
                                      } 
                                      size={20} 
                                      color={
                                        network.level > -50 ? "#4CAF50" : 
                                        network.level > -70 ? "#FFC107" : 
                                        "#F44336"
                                      } 
                                    />
                                    <Text style={styles.signalText}>{network.level} dBm</Text>
                                  </View>
                                )}
                              </View>
                            </BlurView>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>

                    {/* Rescan Button */}
                    <TouchableOpacity
                      onPress={handleScanNetworks}
                      style={styles.rescanButton}
                      disabled={isScanning}
                    >
                      {isScanning ? (
                        <ActivityIndicator size="small" color="#1D244D" />
                      ) : (
                        <>
                          <Ionicons name="refresh" size={20} color="#1D244D" />
                          <Text style={styles.rescanButtonText}>Rescan</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </LinearGradient>
            </View>
          </View>
        )}
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#02041A",
  },
  gradientBackground: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: "100%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingTop: Platform.OS === "android" ? 50 : 0,
    paddingBottom: 10,
  },
  headerIconContainer: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerText: {
    color: "#FFF",
    fontSize: 26,
    fontWeight: "bold",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  deviceCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  deviceCardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  deviceIconWithStatus: {
    position: "relative",
  },
  connectionStatusDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#070a2aff",
  },
  statusConnected: {
    backgroundColor: "#4CAF50",
  },
  statusConnecting: {
    backgroundColor: "#FFA726",
  },
  statusDisconnected: {
    backgroundColor: "#F44336",
  },
  deviceCardInfo: {
    marginLeft: 15,
    flex: 1,
  },
  deviceCardTitle: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  deviceCardName: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  connectionStatus: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    marginTop: 4,
  },
  instructionsContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(74, 144, 226, 0.1)",
    borderRadius: 15,
    padding: 15,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.2)",
  },
  instructionsText: {
    flex: 1,
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 10,
  },
  inputContainer: {
    marginBottom: 20,
  },
  labelWithButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    marginLeft: 5,
  },
  inputLabel: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    fontWeight: "600",
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74, 144, 226, 0.2)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(74, 144, 226, 0.4)",
  },
  scanButtonText: {
    color: "#4A90E2",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 5,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: "#FFF",
    fontSize: 16,
    paddingVertical: 12,
  },
  eyeButton: {
    padding: 5,
    marginLeft: 5,
  },
  securityNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
    marginTop: 10,
  },
  securityText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    marginLeft: 8,
  },
  sendButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    paddingVertical: 18,
    paddingHorizontal: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
  sendButtonText: {
    color: "#1D244D",
    fontSize: 18,
    fontWeight: "bold",
    marginHorizontal: 8,
  },
  sendingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  // Network Picker Modal Styles
  modalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  modalContainer: {
    height: "70%",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    overflow: "hidden",
    zIndex: 1001,
  },
  modalGradient: {
    flex: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    color: "#FFF",
    fontSize: 22,
    fontWeight: "bold",
  },
  modalCloseButton: {
    padding: 5,
  },
  networksList: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 16,
    marginTop: 15,
  },
  networkItem: {
    marginBottom: 10,
  },
  networkItemBlur: {
    borderRadius: 15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  networkItemContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
  },
  networkInfo: {
    flex: 1,
    marginLeft: 12,
  },
  networkName: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 3,
  },
  networkCapabilities: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
    marginTop: 2,
  },
  signalStrength: {
    flexDirection: "row",
    alignItems: "center",
  },
  signalText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
    marginLeft: 5,
  },
  rescanButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 15,
  },
  rescanButtonText: {
    color: "#1D244D",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
});