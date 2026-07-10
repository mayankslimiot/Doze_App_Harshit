import React, { createContext, ReactNode, useContext } from 'react';
import { Device } from 'react-native-ble-plx';
import { useBluetooth as useBluetoothLogic } from '../hooks/useBluetooth';

// Define the shape of the context data
interface BluetoothContextType {
  scannedDevices: Device[];
  connectedDevice: Device | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
  isScanning: boolean;
  requestPermissions(): Promise<boolean>;
  startScan(): void;
  stopScan(): void;
  connectToDevice(device: Device): Promise<void>;
  disconnectDevice(): Promise<void>;
}

// Create the context with a default undefined value
const BluetoothContext = createContext<BluetoothContextType | undefined>(undefined);

// Define props for the provider component
interface BluetoothProviderProps {
  children: ReactNode;
}

// Create the provider component that will wrap your app
export const BluetoothProvider: React.FC<BluetoothProviderProps> = ({ children }) => {
  const bluetoothState = useBluetoothLogic(); // This is the hook from `hooks/useBluetooth.ts`

  return (
    <BluetoothContext.Provider value={bluetoothState}>
      {children}
    </BluetoothContext.Provider>
  );
};

// Create a custom hook for easy access to the context
export const useBluetooth = (): BluetoothContextType => {
  const context = useContext(BluetoothContext);
  if (context === undefined) {
    throw new Error('useBluetooth must be used within a BluetoothProvider');
  }
  return context;
};