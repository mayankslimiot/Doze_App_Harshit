import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { addDeviceToUser, getUserDevices, validateDeviceId } from '@/services/deviceData';
import { useAuth } from '@/contexts/AuthContext';

// Safe NetInfo import — falls back to assuming online if module unavailable
let NetInfo: any = null;
try {
  NetInfo = require('@react-native-community/netinfo').default;
} catch (e) {
  console.warn('[DEVICE] NetInfo not available, assuming online');
}

type Device = {
  _id: string;
  deviceId: string;
  deviceType?: string;
  manufacturer?: string;
  status?: string;
  customName?: string | null;
  defaultName?: string | null;
  isShared?: boolean;
  sharedWith?: Array<{ userId: string; email?: string }>;
  bleMac?: string | null;  // BLE MAC (12 hex) for scan matching
};

type DeviceContextType = {
  devices: Device[] | null; // null = unknown/not loaded, [] = no devices, [x] = has devices
  ownedDevices: Device[] | null;
  sharedDevices: Device[] | null;
  activeDevice: Device | null;
  isLoading: boolean;
  isOnline: boolean;
  addDevice: (deviceId: string) => Promise<{ success: boolean; message?: string }>;
  refreshDevices: () => Promise<void>;
  setActiveDevice: (device: Device | null) => Promise<void>;
  isDeviceShared: (deviceId: string) => boolean;
};

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  // CRITICAL: null = unknown/not loaded, [] = loaded with no devices, [x] = loaded with devices
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [ownedDevices, setOwnedDevices] = useState<Device[] | null>(null);
  const [sharedDevices, setSharedDevices] = useState<Device[] | null>(null);
  const [activeDevice, setActiveDeviceState] = useState<Device | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { auth } = useAuth();

  // Monitor network state
  useEffect(() => {
    if (!NetInfo) return; // NetInfo unavailable — skip monitoring
    const unsubscribe = NetInfo.addEventListener((state: any) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      // If network comes back and devices never loaded, auto-retry
      if (online && devices === null && !isLoading && auth.isLoggedIn) {
        console.log('[DEVICE] Network restored — auto-retrying loadDevices');
        retryCountRef.current = 0;
        loadDevices();
      }
    });
    return () => unsubscribe();
  }, [devices, isLoading, auth.isLoggedIn]);

  // Load devices on mount, but only if user is logged in
  useEffect(() => {
    // Only load devices if auth is not loading and user is logged in
    if (!auth.isLoading && auth.isLoggedIn) {
    loadDevices();
    } else if (!auth.isLoading && !auth.isLoggedIn) {
      // User not logged in - clear devices (set to null = unknown) and set loading to false
      setDevices(null);
      setActiveDeviceState(null);
      setIsLoading(false);
    }
  }, [auth.isLoading, auth.isLoggedIn]);

  const loadDevices = async () => {
    try {
      // TEMP: Log device loading start
      const loadStart = Date.now();
      console.log('[DEVICE] loadDevices started', {
        timestamp: loadStart,
        isLoggedIn: auth.isLoggedIn,
        retryCount: retryCountRef.current,
      });
      
      setIsLoading(true);

      // === CACHE READ: Load cached devices for instant UI unblock ===
      if (retryCountRef.current === 0) {
        try {
          const cachedRaw = await AsyncStorage.getItem('cached_devices');
          if (cachedRaw) {
            const cachedDevices = JSON.parse(cachedRaw) as Device[];
            if (Array.isArray(cachedDevices)) {
              setDevices(cachedDevices);
              // Also restore active device from cache
              const storedActiveId = await AsyncStorage.getItem('active_device_id');
              if (storedActiveId && cachedDevices.length > 0) {
                const cachedActive = cachedDevices.find(d => d.deviceId === storedActiveId) || cachedDevices[0];
                setActiveDeviceState(cachedActive);
              } else if (cachedDevices.length > 0) {
                setActiveDeviceState(cachedDevices[0]);
              }
              console.log('[DEVICE] Cache loaded', { count: cachedDevices.length });
            }
          }
        } catch (cacheErr) {
          console.warn('[DEVICE] Cache read failed:', cacheErr);
        }
      }

      // === API CALL: Fetch fresh device data ===
      const result = await getUserDevices();
      
      if (result.success) {
        // Reset retry counter on success
        retryCountRef.current = 0;

        const devicesList = result.devices || [];
        const ownedList = result.ownedDevices || [];
        const sharedList = result.sharedDevices || [];
        setDevices(devicesList);
        setOwnedDevices(ownedList);
        setSharedDevices(sharedList);
        
        // === CACHE WRITE: Save fresh data for next app launch ===
        try {
          await AsyncStorage.setItem('cached_devices', JSON.stringify(devicesList));
        } catch (cacheErr) {
          console.warn('[DEVICE] Cache write failed:', cacheErr);
        }

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
          console.log('[DeviceContext] Auto-setting first device as active:', active?.deviceId);
        }
        
        setActiveDeviceState(active);
        if (active) {
          await AsyncStorage.setItem('active_device_id', active.deviceId);
        } else {
          await AsyncStorage.removeItem('active_device_id');
        }
        
        console.log('[DEVICE] loadDevices completed', {
          devicesCount: devicesList.length,
          ownedCount: ownedList.length,
          sharedCount: sharedList.length,
          hasActiveDevice: !!active,
          activeDeviceId: active?.deviceId || null,
          loadTime: Date.now() - loadStart,
          timestamp: Date.now(),
        });
      } else {
        // API call failed — trigger auto-retry
        console.log('[DEVICE] loadDevices API failed', {
          error: result.message || 'Unknown error',
          retryCount: retryCountRef.current,
          loadTime: Date.now() - loadStart,
          timestamp: Date.now(),
        });
        scheduleRetry();
      }
    } catch (error) {
      console.error('[DEVICE] loadDevices error:', error);
      scheduleRetry();
    } finally {
      setIsLoading(false);
    }
  };

  // === AUTO-RETRY with exponential backoff ===
  const MAX_RETRIES = 3;
  const scheduleRetry = () => {
    if (retryCountRef.current >= MAX_RETRIES) {
      console.log('[DEVICE] Max retries reached, giving up. Cache will be used if available.');
      return;
    }
    // Exponential backoff: 2s, 4s, 8s
    const delay = Math.pow(2, retryCountRef.current + 1) * 1000;
    retryCountRef.current += 1;
    console.log(`[DEVICE] Scheduling retry #${retryCountRef.current} in ${delay}ms`);

    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      // Only retry if online (or if NetInfo unavailable, always retry)
      if (!NetInfo) {
        loadDevices();
        return;
      }
      NetInfo.fetch().then((state: any) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          loadDevices();
        } else {
          console.log('[DEVICE] Skipping retry — no network');
        }
      });
    }, delay);
  };

  // Cleanup retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const refreshDevices = async () => {
    // TEMP: Log device refresh
    console.log('[DEVICE] refreshDevices called', {
      timestamp: Date.now(),
      currentDevicesCount: devices?.length || 0,
      isLoggedIn: auth.isLoggedIn,
    });
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
        // Check if devices is null or empty array
        const currentDevices = devices || [];
        if (currentDevices.length === 0 && result.data) {
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

  const isDeviceShared = (deviceId: string) => {
    const d = devices?.find((x) => x.deviceId === deviceId);
    return !!(d && (d as Device).isShared);
  };

  return (
    <DeviceContext.Provider
      value={{
        devices,
        ownedDevices,
        sharedDevices,
        activeDevice,
        isLoading,
        isOnline,
        addDevice,
        refreshDevices,
        setActiveDevice,
        isDeviceShared,
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



