import { getBleManager } from "@/hooks/useBluetooth";
import { Buffer } from "buffer";
import React, { createContext, ReactNode, useContext, useState } from "react";
import { Device } from "react-native-ble-plx";

interface ProvisioningContextType {
  wifiSSID: string;
  wifiPassword: string;
  selectedDevice: Device | null;
  selectedDeviceId: string | null;
  serialNumber: string | null; // Device serial number from BLE Device Information Service
  wifiProvisioningSuccess: boolean; // Track if WiFi provisioning succeeded
  provisionForHospitalId: string | null;
  provisionForHospitalName: string | null;
  setWifiSSID: (ssid: string) => void;
  setWifiPassword: (password: string) => void;
  setSelectedDevice: (device: Device | null) => void;
  setSerialNumber: (serialNumber: string | null) => void;
  setWifiProvisioningSuccess: (success: boolean) => void;
  setProvisionForHospitalId: (id: string | null) => void;
  setProvisionForHospitalName: (name: string | null) => void;
  sendWifiCredentials: () => Promise<boolean>;
}

const ProvisioningContext = createContext<ProvisioningContextType | undefined>(undefined);

export const ProvisioningProvider = ({ children }: { children: ReactNode }) => {
  const [wifiSSID, setWifiSSID] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [serialNumber, setSerialNumber] = useState<string | null>(null);
  const [wifiProvisioningSuccess, setWifiProvisioningSuccess] = useState(false);
  const [provisionForHospitalId, setProvisionForHospitalId] = useState<string | null>(null);
  const [provisionForHospitalName, setProvisionForHospitalName] = useState<string | null>(null);

  // UUIDs matching Nordic UART Service (nRF52832)
  // Service UUID: Nordic UART Service = 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
  // RX Characteristic (App writes to device): 6e400002-b5a3-f393-e0a9-e50e24dcca9e
  // TX Characteristic (Device writes to app): 6E400003-B5A3-F393-E0A9-E50E24DCCA9E (for status)
  const PROVISION_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
  const WIFI_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";  // RX characteristic for WiFi credentials
  const STATUS_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";  // TX characteristic for status updates

  const handleSetSelectedDevice = (device: Device | null) => {
    const newDeviceId = device?.id || null;

    // If the selected device changes (including being cleared), reset the serial number
    if (newDeviceId !== selectedDeviceId) {
      setSerialNumber(null);
    }

    setSelectedDevice(device);
    setSelectedDeviceId(newDeviceId);
  };

  const sendWifiCredentials = async (): Promise<boolean> => {
    try {
      if (!selectedDeviceId) {
        throw new Error("No device selected");
      }

      console.log(`Sending WiFi credentials to device: ${selectedDeviceId}`);
      
      // Get the singleton BleManager instance
      const bleManager = getBleManager();
      
      // Step 1: Check if device is connected
      console.log("Checking device connection status...");
      const isConnected = await bleManager.isDeviceConnected(selectedDeviceId);
      
      if (!isConnected) {
        console.log("Device not connected, attempting to reconnect...");
        await bleManager.connectToDevice(selectedDeviceId, { timeout: 10000 });
        console.log("Device reconnected successfully");
      } else {
        console.log("Device is already connected");
      }

      // Step 2: Discover all services and characteristics
      console.log("Discovering services and characteristics...");
      const device = await bleManager.discoverAllServicesAndCharacteristicsForDevice(selectedDeviceId);
      console.log("Service discovery completed");

      // Step 3: Verify the service exists
      console.log(`Checking for service ${PROVISION_SERVICE_UUID}...`);
      const services = await device.services();
      const provisionService = services.find(s => s.uuid.toUpperCase() === PROVISION_SERVICE_UUID.toUpperCase());
      
      if (!provisionService) {
        console.error("Available services:", services.map(s => s.uuid));
        throw new Error(`Provisioning service ${PROVISION_SERVICE_UUID} not found on device`);
      }
      console.log("Provisioning service found!");

      // Step 4: Verify the characteristic exists
      console.log(`Checking for characteristic ${WIFI_CHAR_UUID}...`);
      const characteristics = await provisionService.characteristics();
      const wifiChar = characteristics.find(c => c.uuid.toUpperCase() === WIFI_CHAR_UUID.toUpperCase());
      
      if (!wifiChar) {
        console.error("Available characteristics:", characteristics.map(c => c.uuid));
        throw new Error(`WiFi credential characteristic ${WIFI_CHAR_UUID} not found`);
      }
      console.log("WiFi credential characteristic found!");

      // Step 5: Build plain text payload in comma-separated format (ssid,password)
      const creds = `${wifiSSID},${wifiPassword}`;

      console.log(`WiFi credentials payload (plain text): ${creds}`);
      
      // Step 6: Convert to base64 as react-native-ble-plx expects base64 encoded string
      const base64Creds = Buffer.from(creds, 'utf-8').toString('base64');
      console.log(`WiFi credentials payload (base64): ${base64Creds}`);
      console.log(`Writing ${creds.length} bytes (${base64Creds.length} base64 chars) to characteristic...`);

      // Step 7: Write the base64 encoded credentials (library expects base64)
      await bleManager.writeCharacteristicWithResponseForDevice(
        selectedDeviceId,
        PROVISION_SERVICE_UUID,
        WIFI_CHAR_UUID,
        base64Creds
      );

      console.log("WiFi credentials sent successfully!");
      return true;
    } catch (err: any) {
      console.error("Error sending credentials:", err);
      console.error("Error details:", {
        message: err.message,
        errorCode: err.errorCode,
        iosErrorCode: err.iosErrorCode,
        androidErrorCode: err.androidErrorCode,
        reason: err.reason,
        deviceId: selectedDeviceId,
        serviceUUID: PROVISION_SERVICE_UUID,
        charUUID: WIFI_CHAR_UUID,
      });
      return false;
    }
  };

  return (
    <ProvisioningContext.Provider
      value={{
        wifiSSID,
        wifiPassword,
        selectedDevice,
        selectedDeviceId,
        serialNumber,
        wifiProvisioningSuccess,
        provisionForHospitalId,
        provisionForHospitalName,
        setWifiSSID,
        setWifiPassword,
        setSelectedDevice: handleSetSelectedDevice,
        setSerialNumber,
        setWifiProvisioningSuccess,
        setProvisionForHospitalId,
        setProvisionForHospitalName,
        sendWifiCredentials,
      }}
    >
      {children}
    </ProvisioningContext.Provider>
  );
};

export const useProvisioning = () => {
  const context = useContext(ProvisioningContext);
  if (!context)
    throw new Error("useProvisioning must be used within ProvisioningProvider");
  return context;
};
