import React, { createContext, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';

export type DeviceAp = {
  ssid: string;
  bssid?: string;
  secure: boolean; // WPA/WEP
  password?: string;
};

type ProvisioningState = {
  deviceAp?: DeviceAp;
  deviceApIp: string; // ESP8266 SoftAP default
  homeSsid?: string;
  homePassword?: string;
};

type ProvisioningContextValue = ProvisioningState & {
  setDeviceAp: (ap: DeviceAp) => void;
  setDeviceApPassword: (password: string) => void;
  setHomeCredentials: (ssid: string, password: string) => void;
  setDeviceApIp: (ip: string) => void;
  reset: () => void;
};

const ProvisioningContext = createContext<ProvisioningContextValue | undefined>(undefined);

export const ProvisioningProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ProvisioningState>({
    deviceApIp: Platform.select({ ios: '192.168.4.1', android: '192.168.4.1', default: '192.168.4.1' })!,
  });

  const value = useMemo<ProvisioningContextValue>(() => ({
    ...state,
    setDeviceAp: (ap) => setState((s) => ({ ...s, deviceAp: ap })),
    setDeviceApPassword: (password) =>
      setState((s) => ({ ...s, deviceAp: s.deviceAp ? { ...s.deviceAp, password } : s.deviceAp })),
    setHomeCredentials: (ssid, password) => setState((s) => ({ ...s, homeSsid: ssid, homePassword: password })),
    setDeviceApIp: (ip) => setState((s) => ({ ...s, deviceApIp: ip })),
    reset: () =>
      setState({
        deviceApIp: Platform.select({ ios: '192.168.4.1', android: '192.168.4.1', default: '192.168.4.1' })!,
      }),
  }), [state]);

  return <ProvisioningContext.Provider value={value}>{children}</ProvisioningContext.Provider>;
};

export const useProvisioning = () => {
  const ctx = useContext(ProvisioningContext);
  if (!ctx) throw new Error('useProvisioning must be used within ProvisioningProvider');
  return ctx;
};