import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiUrl } from './api';

// Get auth token from storage
async function getAuthToken(): Promise<string | null> {
  return await AsyncStorage.getItem('auth_token');
}

// Create headers with auth token
async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Validate device ID format and existence
export async function validateDeviceId(deviceId: string): Promise<{
  ok: boolean;
  exists: boolean;
  assigned: boolean;
  device?: any;
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    
    // Validate format: 16 hexadecimal characters (e.g., 77089FB890EAA298)
    const formatRegex = /^[0-9A-F]{16}$/i;
    if (!formatRegex.test(normalizedId)) {
      return {
        ok: false,
        exists: false,
        assigned: false,
        message: 'Device ID must be exactly 16 hexadecimal characters (e.g., 77089FB890EAA298)',
      };
    }

    const response = await fetch(apiUrl(`/api/devices/validate?deviceId=${encodeURIComponent(normalizedId)}`));
    const data = await response.json();
    
    if (!response.ok) {
      return {
        ok: false,
        exists: false,
        assigned: false,
        message: data.message || 'Failed to validate device',
      };
    }

    return {
      ok: data.ok || false,
      exists: data.exists || false,
      assigned: data.assigned || false,
      device: data.device || null,
    };
  } catch (error: any) {
    return {
      ok: false,
      exists: false,
      assigned: false,
      message: error.message || 'Network error',
    };
  }
}

// Add device to user account
export async function addDeviceToUser(deviceId: string): Promise<{
  success: boolean;
  message?: string;
  data?: any;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const response = await fetch(apiUrl('/api/user/devices/save'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId: normalizedId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || data.status || 'Failed to add device',
      };
    }

    return {
      success: true,
      message: 'Device added successfully',
      data,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get user's devices
export async function getUserDevices(): Promise<{
  success: boolean;
  devices?: any[];
  activeDevice?: any;
  message?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    
    const response = await fetch(apiUrl('/api/devices/user'), {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch devices',
      };
    }

    return {
      success: true,
      devices: data.devices || [],
      activeDevice: data.activeDevice || null,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get device history (latest N records)
export async function getDeviceHistory(
  deviceId: string,
  options?: { limit?: number; from?: Date; to?: Date }
): Promise<{
  success: boolean;
  data?: any[];
  summary?: any;
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const params = new URLSearchParams({
      deviceId: normalizedId,
      limit: String(options?.limit || 100),
    });
    
    if (options?.from) {
      params.append('from', options.from.toISOString());
    }
    if (options?.to) {
      params.append('to', options.to.toISOString());
    }

    const response = await fetch(apiUrl(`/api/devices/history?${params.toString()}`), {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch device history',
      };
    }

    return {
      success: true,
      data: data.data || [],
      summary: data.summary || null,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get latest health data for a device
export async function getHealthData(
  deviceId: string,
  options?: { limit?: number; start?: Date; end?: Date }
): Promise<{
  success: boolean;
  data?: any[];
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const params = new URLSearchParams();
    if (options?.limit) {
      params.append('limit', String(options.limit));
    }
    if (options?.start) {
      params.append('start', options.start.toISOString());
    }
    if (options?.end) {
      params.append('end', options.end.toISOString());
    }

    const queryString = params.toString();
    const url = apiUrl(`/api/data/health/${normalizedId}${queryString ? `?${queryString}` : ''}`);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch health data',
      };
    }

    // Response is an array of health records
    return {
      success: true,
      data: Array.isArray(data) ? data : [],
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get historical aggregated data
export async function getHistoricalData(
  deviceId: string,
  period: '24h' | '48h' | '72h' | '7d' | '30d' = '24h'
): Promise<{
  success: boolean;
  data?: any[];
  period?: string;
  aggregationMinutes?: number;
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const response = await fetch(apiUrl(`/api/data/history/${normalizedId}?period=${period}`), {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch historical data',
      };
    }

    return {
      success: true,
      data: data.data || [],
      period: data.period,
      aggregationMinutes: data.aggregationMinutes,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get live respiration data
export async function getRespirationLive(
  deviceId: string,
  options?: { windowMinutes?: number; bucketSeconds?: number }
): Promise<{
  success: boolean;
  points?: Array<{ timestamp: string; value: number }>;
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const params = new URLSearchParams({
      deviceId: normalizedId,
      windowMinutes: String(options?.windowMinutes || 30),
      bucketSeconds: String(options?.bucketSeconds || 30),
    });

    const response = await fetch(apiUrl(`/api/devices/history/respiration?${params.toString()}`), {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch respiration data',
      };
    }

    return {
      success: true,
      points: data.points || [],
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get monthly aggregated heart rate data (30 days, one per day)
export async function getMonthlyHeartRateData(
  deviceId: string,
  monthStart?: Date
): Promise<{
  success: boolean;
  data?: Array<{
    day: number;
    dayIndex: number;
    date: string;
    avg: number | null;
    min: number | null;
    max: number | null;
    isPartial: boolean;
    count: number;
  }>;
  monthStart?: string;
  monthEnd?: string;
  daysInMonth?: number;
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const params = new URLSearchParams();
    if (monthStart) {
      params.append('monthStart', monthStart.toISOString());
    }

    const queryString = params.toString();
    const url = apiUrl(`/api/data/health/monthly/${normalizedId}${queryString ? `?${queryString}` : ''}`);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch monthly heart rate data',
      };
    }

    return {
      success: true,
      data: data.data || [],
      monthStart: data.monthStart,
      monthEnd: data.monthEnd,
      daysInMonth: data.daysInMonth,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get weekly aggregated heart rate data (7 days, one per day)
export async function getWeeklyHeartRateData(
  deviceId: string,
  weekStart?: Date
): Promise<{
  success: boolean;
  data?: Array<{
    day: string;
    dayIndex: number;
    date: string;
    avg: number | null;
    min: number | null;
    max: number | null;
    isPartial: boolean;
    count: number;
  }>;
  weekStart?: string;
  weekEnd?: string;
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const params = new URLSearchParams();
    if (weekStart) {
      params.append('weekStart', weekStart.toISOString());
    }

    const queryString = params.toString();
    const url = apiUrl(`/api/data/health/weekly/${normalizedId}${queryString ? `?${queryString}` : ''}`);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch weekly heart rate data',
      };
    }

    return {
      success: true,
      data: data.data || [],
      weekStart: data.weekStart,
      weekEnd: data.weekEnd,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get heart rate graph data (backend-owned aggregation)
export async function getHeartRateGraph(
  deviceId: string,
  zoomLevel: number = 0
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: {
      index: number;
      label: string;
      rangeSec: number;
    };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const response = await fetch(
      apiUrl(`/api/data/health/heart-rate/graph/${normalizedId}?zoomLevel=${zoomLevel}`),
      {
        method: 'GET',
        headers,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch heart rate graph data',
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get live stress data
export async function getStressLive(
  deviceId: string,
  options?: { windowMinutes?: number; bucketSeconds?: number; from?: Date; to?: Date }
): Promise<{
  success: boolean;
  points?: Array<{ timestamp: string; value: number }>;
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const params = new URLSearchParams({
      deviceId: normalizedId,
      windowMinutes: String(options?.windowMinutes || 30),
      bucketSeconds: String(options?.bucketSeconds || 30),
    });
    
    if (options?.from) {
      params.append('from', options.from.toISOString());
    }
    if (options?.to) {
      params.append('to', options.to.toISOString());
    }

    const response = await fetch(apiUrl(`/api/devices/history/stress?${params.toString()}`), {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch stress data',
      };
    }

    return {
      success: true,
      points: data.points || [],
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get WiFi connection status for a device
export async function getWiFiStatus(
  deviceId: string
): Promise<{
  success: boolean;
  connected?: boolean;
  status?: string;
  wifiStatus?: string;
  wifiConnectedAt?: string;
  wifiLastAttempt?: string;
  deviceStatus?: string;
  message?: string;
}> {
  try {
    if (!deviceId) {
      return {
        success: false,
        message: 'Device ID is required',
      };
    }
    
    const headers = await getAuthHeaders();
    
    // Use the API endpoint for WiFi status
    // deviceId should be the serial number from Device Information Service
    const response = await fetch(apiUrl(`/api/http/wifi-status/${deviceId}`), {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch WiFi status',
      };
    }

    // API response format:
    // {
    //   "success": true,
    //   "deviceId": "3BCE9E1BFA48CF12",
    //   "wifiStatus": "CONNECTED",
    //   "wifiConnectedAt": "2025-12-18T13:40:56.533Z",
    //   "wifiLastAttempt": "2025-12-18T13:40:56.533Z",
    //   "deviceStatus": "active",
    //   "isConnected": true
    // }
    return {
      success: true,
      connected: data.isConnected === true || data.wifiStatus === 'CONNECTED',
      status: data.wifiStatus?.toLowerCase() || (data.isConnected ? 'connected' : 'disconnected'),
      wifiStatus: data.wifiStatus,
      wifiConnectedAt: data.wifiConnectedAt,
      wifiLastAttempt: data.wifiLastAttempt,
      deviceStatus: data.deviceStatus,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

/**
 * Auto-register device to current user
 * Called automatically when device connects to WiFi
 * @param serialNumber Device serial number (deviceId)
 * @returns Registration result
 */
export async function autoRegisterDevice(
  serialNumber: string
): Promise<{
  success: boolean;
  message?: string;
  device?: {
    deviceId: string;
    _id: string;
    userId: string;
    status: string;
    wifiStatus: string;
    wifiConnectedAt: string;
  };
  wasReassigned?: boolean;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    
    // Check if user is authenticated
    if (!headers['Authorization']) {
      return {
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Please log in to register device',
      };
    }

    const response = await fetch(
      apiUrl('/api/devices/auto-register'),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ serialNumber }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Please log in to register device',
        };
      }

      return {
        success: false,
        error: 'REGISTRATION_FAILED',
        message: errorData.message || `Failed to register device (${response.status})`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: data.message || 'Device registered successfully',
      device: data.device,
      wasReassigned: data.wasReassigned || false,
    };
  } catch (error) {
    console.error('Error auto-registering device:', error);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Activate a device (set as active device for user)
 * @param deviceId Device ID to activate
 * @returns Activation result
 */
export async function activateDevice(
  deviceId: string
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    
    if (!headers['Authorization']) {
      return {
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Please log in to activate device',
      };
    }

    const normalizedId = deviceId.trim().toUpperCase();
    const response = await fetch(
      apiUrl(`/api/devices/activate/${normalizedId}`),
      {
        method: 'PATCH',
        headers,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Please log in to activate device',
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          error: 'DEVICE_NOT_FOUND',
          message: 'Device not found',
        };
      }

      if (response.status === 403) {
        return {
          success: false,
          error: 'DEVICE_NOT_OWNED',
          message: 'Device does not belong to this user',
        };
      }

      return {
        success: false,
        error: 'ACTIVATION_FAILED',
        message: errorData.message || `Failed to activate device (${response.status})`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: data.message || 'Device activated successfully',
    };
  } catch (error) {
    console.error('Error activating device:', error);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

/**
 * Update device custom name for current user
 * @param deviceId Device ID
 * @param customName Custom name for the device (null/empty to remove)
 * @returns Update result
 */
export async function updateDeviceName(
  deviceId: string,
  customName: string | null
): Promise<{
  success: boolean;
  message?: string;
  customName?: string | null;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    
    if (!headers['Authorization']) {
      return {
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Please log in to update device name',
      };
    }

    const normalizedId = deviceId.trim().toUpperCase();
    const response = await fetch(
      apiUrl(`/api/devices/rename/${normalizedId}`),
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ customName }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Please log in to update device name',
        };
      }

      if (response.status === 404) {
        return {
          success: false,
          error: 'DEVICE_NOT_FOUND',
          message: errorData.message || 'Device not found',
        };
      }

      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: errorData.message || `Failed to update device name (${response.status})`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: data.message || 'Device name updated successfully',
      customName: data.customName || null,
    };
  } catch (error) {
    console.error('Error updating device name:', error);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

