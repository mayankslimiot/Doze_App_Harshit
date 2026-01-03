import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { addDeviceToUser, getUserDevices, validateDeviceId } from '@/services/deviceData';
import { useAuth } from '@/contexts/AuthContext';

type Device = {
  _id: string;
  deviceId: string;
  deviceType?: string;
  manufacturer?: string;
  status?: string;
  customName?: string | null;
};

type DeviceContextType = {
  devices: Device[];
  activeDevice: Device | null;
  isLoading: boolean;
  addDevice: (deviceId: string) => Promise<{ success: boolean; message?: string }>;
  refreshDevices: () => Promise<void>;
  setActiveDevice: (device: Device | null) => Promise<void>;
};

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [activeDevice, setActiveDeviceState] = useState<Device | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { auth } = useAuth();

  // Load devices on mount, but only if user is logged in
  useEffect(() => {
    // Only load devices if auth is not loading and user is logged in
    if (!auth.isLoading && auth.isLoggedIn) {
    loadDevices();
    } else if (!auth.isLoading && !auth.isLoggedIn) {
      // User not logged in - clear devices and set loading to false
      setDevices([]);
      setActiveDeviceState(null);
      setIsLoading(false);
    }
  }, [auth.isLoading, auth.isLoggedIn]);

  const loadDevices = async () => {
    try {
      setIsLoading(true);
      const result = await getUserDevices();
      
      if (result.success) {
        const devicesList = result.devices || [];
        setDevices(devicesList);
        
        let active: Device | null = null;
        
        // First, try to set active device from backend result
        if (result.activeDevice && devicesList.length > 0) {
          active = devicesList.find(d => String(d._id) === String(result.activeDevice)) || null;
        }
        
        // If no active device from backend, try to load from storage
        if (!active) {
          const storedDeviceId = await AsyncStorage.getItem('active_device_id');
          if (storedDeviceId && devicesList.length > 0) {
            active = devicesList.find(d => d.deviceId === storedDeviceId) || null;
          }
        }
        
        // If still no active device but we have devices, set the first one as active
        if (!active && devicesList.length > 0) {
          active = devicesList[0];
          console.log('[DeviceContext] Auto-setting first device as active:', active.deviceId);
        }
        
        // Set the active device
        setActiveDeviceState(active);
        if (active) {
          await AsyncStorage.setItem('active_device_id', active.deviceId);
        } else {
          await AsyncStorage.removeItem('active_device_id');
        }
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDevices = async () => {
    await loadDevices();
  };

  const addDevice = async (deviceId: string): Promise<{ success: boolean; message?: string }> => {
    try {
      // First validate the device ID
      const validation = await validateDeviceId(deviceId);
      
      if (!validation.ok || !validation.exists) {
        return {
          success: false,
          message: validation.message || 'Device not found or invalid format',
        };
      }

      // Add device to user account
      const result = await addDeviceToUser(deviceId);
      
      if (result.success) {
        // Refresh device list
        await refreshDevices();
        
        // If this is the first device, set it as active
        if (devices.length === 0 && result.data) {
          const newDevice = result.data.device || { deviceId };
          await setActiveDevice(newDevice as Device);
        }
      }
      
      return result;
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to add device',
      };
    }
  };

  const setActiveDevice = async (device: Device | null) => {
    setActiveDeviceState(device);
    if (device) {
      await AsyncStorage.setItem('active_device_id', device.deviceId);
      // Update backend to set this device as active
      try {
        const { activateDevice } = await import('@/services/deviceData');
        await activateDevice(device.deviceId);
      } catch (error) {
        console.error('Failed to update backend active device:', error);
      }
    } else {
      await AsyncStorage.removeItem('active_device_id');
    }
  };

  return (
    <DeviceContext.Provider
      value={{
        devices,
        activeDevice,
        isLoading,
        addDevice,
        refreshDevices,
        setActiveDevice,
      }}
    >
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDevice must be used within DeviceProvider');
  }
  return context;
}



