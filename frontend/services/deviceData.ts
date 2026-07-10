import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiUrl } from './api';

// Get auth token from storage
async function getAuthToken(): Promise<string | null> {
  return await AsyncStorage.getItem('auth_token');
}

// Create headers with auth token
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
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
// Get device details by deviceId (includes bedStatus, absenceStart, HV, isLive)
export async function getDeviceDetails(deviceId: string): Promise<{
  success: boolean;
  data?: {
    deviceId: string;
    bedStatus?: 'Vacant' | 'Occupied' | 'Waiting';
    absenceStart?: number;
    HV?: number;
    isLive?: boolean;
    lastActiveAt?: Date | string;
    [key: string]: any;
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const response = await fetch(apiUrl(`/api/devices/details/${normalizedId}`), {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch device details',
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

export async function getUserDevices(): Promise<{
  success: boolean;
  devices?: any[];
  ownedDevices?: any[];
  sharedDevices?: any[];
  activeDevice?: any;
  message?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    
    // 12-second timeout to prevent hanging on slow/dead server
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(apiUrl('/api/devices/user'), {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

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
      ownedDevices: data.ownedDevices || [],
      sharedDevices: data.sharedDevices || [],
      activeDevice: data.activeDevice || null,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

/**
 * Share device with a caretaker (owner only).
 * Caretaker must be a registered user (email exists).
 */
export async function shareDevice(
  deviceId: string,
  email: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const headers = await getAuthHeaders();
    if (!headers['Authorization']) {
      return { success: false, message: 'Please log in' };
    }
    const response = await fetch(apiUrl('/api/devices/share'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId: deviceId.trim().toUpperCase(), email: email.trim().toLowerCase() }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to share device' };
    }
    return { success: true, message: data.message || 'Device shared successfully' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Network error' };
  }
}

/**
 * Caretaker removes shared device from their own account.
 */
export async function removeSharedDevice(deviceId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const headers = await getAuthHeaders();
    if (!headers['Authorization']) {
      return { success: false, message: 'Please log in' };
    }
    const response = await fetch(apiUrl('/api/devices/remove-shared'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId: deviceId.trim().toUpperCase() }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to remove device' };
    }
    return { success: true, message: data.message || 'Device removed from your account' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Network error' };
  }
}

/**
 * Owner removes a caretaker from a device.
 */
export async function removeCaretaker(
  deviceId: string,
  caretakerId: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const headers = await getAuthHeaders();
    if (!headers['Authorization']) {
      return { success: false, message: 'Please log in' };
    }
    const response = await fetch(apiUrl('/api/devices/remove-caretaker'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ deviceId: deviceId.trim().toUpperCase(), caretakerId }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to remove caretaker' };
    }
    return { success: true, message: data.message || 'Caretaker removed' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Network error' };
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
  zoomLevel: number = 0,
  raw: boolean = false
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
    
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/heart-rate/graph/${normalizedId}?zoomLevel=${zoomLevel}${rawParam}`),
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

/** Get heart rate raw data for a specific date range (e.g. previous day). Used for Day view historical. */
export async function getHeartRateGraphForDateRange(
  deviceId: string,
  startMs: number,
  endMs: number,
  raw: boolean = true
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel?: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/heart-rate/graph/${normalizedId}?zoomLevel=0${rawParam}&start=${startMs}&end=${endMs}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch heart rate data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

// Get respiration graph data (last 24 hours) - Uses dedicated optimized endpoint
export async function getRespirationGraph(
  deviceId: string,
  zoomLevel: number = 0,
  raw: boolean = false
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>; // y can be null for gaps
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
    
    const rawParam = raw ? '&raw=true' : '';
    // Use dedicated optimized endpoint (similar to heart rate)
    const response = await fetch(
      apiUrl(`/api/data/health/respiration/graph/${normalizedId}?zoomLevel=${zoomLevel}${rawParam}`),
      {
        method: 'GET',
        headers,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch respiration graph data',
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

/** Get respiration raw data for a specific date range (e.g. previous day). Used for Day view historical. */
export async function getRespirationGraphForDateRange(
  deviceId: string,
  startMs: number,
  endMs: number,
  raw: boolean = true
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel?: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/respiration/graph/${normalizedId}?zoomLevel=0${rawParam}&start=${startMs}&end=${endMs}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch respiration data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

// Get monthly respiration data (30 days aggregated)
export async function getMonthlyRespirationData(
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
    const url = apiUrl(`/api/data/health/monthly/${normalizedId}?metric=respiration${queryString ? `&${queryString}` : ''}`);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch monthly respiration data',
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

// Get weekly aggregated respiration data (7 days, one per day)
export async function getWeeklyRespirationData(
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
    const url = apiUrl(`/api/data/health/weekly/${normalizedId}?metric=respiration${queryString ? `&${queryString}` : ''}`);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch weekly respiration data',
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

// Get stress graph data (Day view - returns raw points, no aggregation)
// For Day view: returns actual received packets only (sparse data)
export async function getStressGraph(
  deviceId: string,
  dayStart?: Date,
  dayEnd?: Date
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number }>; // x = timestamp ms, y = stress value
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const params = new URLSearchParams();
    if (dayStart) {
      params.append('from', dayStart.toISOString());
    }
    if (dayEnd) {
      params.append('to', dayEnd.toISOString());
    }

    const queryString = params.toString();
    const url = apiUrl(`/api/data/health/stress/graph/${normalizedId}${queryString ? `?${queryString}` : ''}`);

    console.log('[getStressGraph] Requesting:', {
      url,
      deviceId: normalizedId,
      dayStart: dayStart?.toISOString(),
      dayEnd: dayEnd?.toISOString(),
    });

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    console.log('[getStressGraph] Response:', {
      ok: response.ok,
      status: response.status,
      pointsCount: data.points?.length || data.data?.points?.length || 0,
      hasPoints: !!(data.points || data.data?.points),
      samplePoint: data.points?.[0] || data.data?.points?.[0],
    });

    if (!response.ok) {
      console.error('[getStressGraph] API error:', data.message || 'Failed to fetch stress graph data');
      return {
        success: false,
        message: data.message || 'Failed to fetch stress graph data',
      };
    }

    // Backend should return raw points: [{timestamp, stress_level}, ...]
    // Transform to {x: timestamp_ms, y: stress_value}
    const rawPoints = data.points || data.data?.points || [];
    console.log('[getStressGraph] Processing points:', {
      rawCount: rawPoints.length,
      firstPoint: rawPoints[0],
      lastPoint: rawPoints[rawPoints.length - 1],
    });

    const points = rawPoints.map((p: any) => {
      // Handle timestamp: can be ISO string, Date object, or Unix timestamp
      let timestamp: number;
      if (p.timestamp) {
        if (typeof p.timestamp === 'string') {
          timestamp = new Date(p.timestamp).getTime();
        } else if (p.timestamp instanceof Date) {
          timestamp = p.timestamp.getTime();
        } else if (typeof p.timestamp === 'number') {
          // Assume milliseconds if > year 2000, otherwise seconds
          timestamp = p.timestamp > 946684800000 ? p.timestamp : p.timestamp * 1000;
        } else {
          timestamp = Date.now();
        }
      } else if (p.timestampSeconds) {
        timestamp = p.timestampSeconds * 1000;
      } else {
        timestamp = Date.now();
      }

      // Extract stress_level: can be string "51.05" or number
      const value = parseFloat(p.stress_level || p.value || p.stress || '0');
      
      return {
        x: timestamp,
        y: isNaN(value) || value < 0 || value > 100 ? null : value,
      };
    }).filter((p: any) => p.y !== null);

    console.log('[getStressGraph] Processed points:', {
      validCount: points.length,
      filteredCount: rawPoints.length - points.length,
    });

    return {
      success: true,
      data: { points },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

// Get weekly aggregated stress data (7 days, one per day)
export async function getWeeklyStressData(
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
    const url = apiUrl(`/api/data/health/weekly/${normalizedId}?metric=stress${queryString ? `&${queryString}` : ''}`);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch weekly stress data',
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

// Get monthly aggregated stress data (30 days, one per day)
export async function getMonthlyStressData(
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
    const url = apiUrl(`/api/data/health/monthly/${normalizedId}?metric=stress${queryString ? `&${queryString}` : ''}`);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: data.message || 'Failed to fetch monthly stress data',
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
 * @param bleMac BLE MAC address (e.g. CF:55:85:A0:50:D2) from connected device - saved for scan matching
 * @returns Registration result
 */
export async function autoRegisterDevice(
  serialNumber: string,
  bleMac?: string,
  organizationId?: string
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
    defaultName?: string | null;
    customName?: string | null;
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
        body: JSON.stringify({ 
          serialNumber, 
          ...(bleMac && { bleMac }),
          ...(organizationId && { organizationId }) 
        }),
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
  customName: string | null,
  room?: string | null,
  bed?: string | null
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
        body: JSON.stringify({ customName, room, bed }),
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

/**
 * Delete a device from user account
 * @param deviceId Device ID to delete
 * @returns Delete result
 */
export async function deleteDevice(
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
        message: 'Please log in to delete device',
      };
    }

    const normalizedId = deviceId.trim().toUpperCase();
    const response = await fetch(
      apiUrl(`/api/devices/remove/${normalizedId}`),
      {
        method: 'DELETE',
        headers,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 401) {
        return {
          success: false,
          error: 'AUTH_REQUIRED',
          message: 'Please log in to delete device',
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
        error: 'DELETE_FAILED',
        message: errorData.message || `Failed to delete device (${response.status})`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      message: data.message || 'Device removed from your account',
    };
  } catch (error) {
    console.error('Error removing device:', error);
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

const BLE_TO_BACKEND_DEVICE_ID_KEY = '@slimiot_ble_to_backend_device_id';
const PREVIOUS_DEVICES_KEY = '@slimiot_previous_doze_devices';

/**
 * Clean up local BLE stores after a device is removed from the account.
 * Removes entries from the BLE→backend map and previous-devices list
 * whose backend deviceId matches the removed device.
 */
export async function cleanupLocalBleStores(removedBackendDeviceId: string): Promise<void> {
  const normalizedId = removedBackendDeviceId.trim().toUpperCase();

  try {
    const raw = await AsyncStorage.getItem(BLE_TO_BACKEND_DEVICE_ID_KEY);
    if (raw) {
      const map: Record<string, string> = JSON.parse(raw);
      let changed = false;
      for (const bleId of Object.keys(map)) {
        if ((map[bleId] || '').trim().toUpperCase() === normalizedId) {
          delete map[bleId];
          changed = true;
        }
      }
      if (changed) {
        await AsyncStorage.setItem(BLE_TO_BACKEND_DEVICE_ID_KEY, JSON.stringify(map));
        console.log(`[cleanupLocalBleStores] Removed BLE map entries for ${normalizedId}`);
      }
    }
  } catch (e) {
    console.error('[cleanupLocalBleStores] Error cleaning BLE map:', e);
  }

  try {
    const prevRaw = await AsyncStorage.getItem(PREVIOUS_DEVICES_KEY);
    if (prevRaw) {
      const list: Array<{ id: string; name: string | null; backendDeviceId?: string }> = JSON.parse(prevRaw);
      const filtered = list.filter(
        (d) => (d.backendDeviceId || '').trim().toUpperCase() !== normalizedId
      );
      if (filtered.length !== list.length) {
        await AsyncStorage.setItem(PREVIOUS_DEVICES_KEY, JSON.stringify(filtered));
        console.log(`[cleanupLocalBleStores] Removed previous-device entries for ${normalizedId}`);
      }
    }
  } catch (e) {
    console.error('[cleanupLocalBleStores] Error cleaning previous devices:', e);
  }
}

/**
 * Prune the BLE→backend map: remove entries whose backend deviceId
 * is not in the current list of account devices.
 */
export async function pruneBleMappings(currentDeviceIds: string[]): Promise<void> {
  const validIds = new Set(currentDeviceIds.map((id) => (id || '').trim().toUpperCase()));

  try {
    const raw = await AsyncStorage.getItem(BLE_TO_BACKEND_DEVICE_ID_KEY);
    if (!raw) return;

    const map: Record<string, string> = JSON.parse(raw);
    let changed = false;
    for (const bleId of Object.keys(map)) {
      const backendId = (map[bleId] || '').trim().toUpperCase();
      if (backendId && !validIds.has(backendId)) {
        delete map[bleId];
        changed = true;
      }
    }
    if (changed) {
      await AsyncStorage.setItem(BLE_TO_BACKEND_DEVICE_ID_KEY, JSON.stringify(map));
      console.log('[pruneBleMappings] Pruned stale BLE map entries');
    }
  } catch (e) {
    console.error('[pruneBleMappings] Error pruning BLE map:', e);
  }
}


/** Get temperature graph data (last 24 hours) */
export async function getTemperatureGraph(
  deviceId: string,
  zoomLevel: number = 0,
  raw: boolean = false
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/temperature/graph/${normalizedId}?zoomLevel=${zoomLevel}${rawParam}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch temperature graph data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get temperature raw data for a specific date range */
export async function getTemperatureGraphForDateRange(
  deviceId: string,
  startMs: number,
  endMs: number,
  raw: boolean = true
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel?: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/temperature/graph/${normalizedId}?zoomLevel=0${rawParam}&start=${startMs}&end=${endMs}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch temperature data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get monthly aggregated temperature data */
export async function getMonthlyTemperatureData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (monthStart) params.append('monthStart', monthStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/monthly/${normalizedId}?metric=temperature${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch monthly temperature data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get weekly aggregated temperature data */
export async function getWeeklyTemperatureData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (weekStart) params.append('weekStart', weekStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/weekly/${normalizedId}?metric=temperature${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch weekly temperature data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}


/** Get humidity graph data (last 24 hours) */
export async function getHumidityGraph(
  deviceId: string,
  zoomLevel: number = 0,
  raw: boolean = false
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/humidity/graph/${normalizedId}?zoomLevel=${zoomLevel}${rawParam}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch humidity graph data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get humidity raw data for a specific date range */
export async function getHumidityGraphForDateRange(
  deviceId: string,
  startMs: number,
  endMs: number,
  raw: boolean = true
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel?: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/humidity/graph/${normalizedId}?zoomLevel=0${rawParam}&start=${startMs}&end=${endMs}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch humidity data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get monthly aggregated humidity data */
export async function getMonthlyHumidityData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (monthStart) params.append('monthStart', monthStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/monthly/${normalizedId}?metric=humidity${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch monthly humidity data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get weekly aggregated humidity data */
export async function getWeeklyHumidityData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (weekStart) params.append('weekStart', weekStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/weekly/${normalizedId}?metric=humidity${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch weekly humidity data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}


/** Get iaq graph data (last 24 hours) */
export async function getIaqGraph(
  deviceId: string,
  zoomLevel: number = 0,
  raw: boolean = false
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/iaq/graph/${normalizedId}?zoomLevel=${zoomLevel}${rawParam}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch iaq graph data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get iaq raw data for a specific date range */
export async function getIaqGraphForDateRange(
  deviceId: string,
  startMs: number,
  endMs: number,
  raw: boolean = true
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel?: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/iaq/graph/${normalizedId}?zoomLevel=0${rawParam}&start=${startMs}&end=${endMs}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch iaq data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get monthly aggregated iaq data */
export async function getMonthlyIaqData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (monthStart) params.append('monthStart', monthStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/monthly/${normalizedId}?metric=iaq${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch monthly iaq data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get weekly aggregated iaq data */
export async function getWeeklyIaqData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (weekStart) params.append('weekStart', weekStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/weekly/${normalizedId}?metric=iaq${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch weekly iaq data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}


/** Get eco2 graph data (last 24 hours) */
export async function getEco2Graph(
  deviceId: string,
  zoomLevel: number = 0,
  raw: boolean = false
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/eco2/graph/${normalizedId}?zoomLevel=${zoomLevel}${rawParam}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch eco2 graph data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get eco2 raw data for a specific date range */
export async function getEco2GraphForDateRange(
  deviceId: string,
  startMs: number,
  endMs: number,
  raw: boolean = true
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel?: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/eco2/graph/${normalizedId}?zoomLevel=0${rawParam}&start=${startMs}&end=${endMs}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch eco2 data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get monthly aggregated eco2 data */
export async function getMonthlyEco2Data(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (monthStart) params.append('monthStart', monthStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/monthly/${normalizedId}?metric=eco2${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch monthly eco2 data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get weekly aggregated eco2 data */
export async function getWeeklyEco2Data(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (weekStart) params.append('weekStart', weekStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/weekly/${normalizedId}?metric=eco2${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch weekly eco2 data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}


/** Get tvoc graph data (last 24 hours) */
export async function getTvocGraph(
  deviceId: string,
  zoomLevel: number = 0,
  raw: boolean = false
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/tvoc/graph/${normalizedId}?zoomLevel=${zoomLevel}${rawParam}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch tvoc graph data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get tvoc raw data for a specific date range */
export async function getTvocGraphForDateRange(
  deviceId: string,
  startMs: number,
  endMs: number,
  raw: boolean = true
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel?: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/tvoc/graph/${normalizedId}?zoomLevel=0${rawParam}&start=${startMs}&end=${endMs}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch tvoc data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get monthly aggregated tvoc data */
export async function getMonthlyTvocData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (monthStart) params.append('monthStart', monthStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/monthly/${normalizedId}?metric=tvoc${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch monthly tvoc data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get weekly aggregated tvoc data */
export async function getWeeklyTvocData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (weekStart) params.append('weekStart', weekStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/weekly/${normalizedId}?metric=tvoc${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch weekly tvoc data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}


/** Get etoh graph data (last 24 hours) */
export async function getEtohGraph(
  deviceId: string,
  zoomLevel: number = 0,
  raw: boolean = false
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/etoh/graph/${normalizedId}?zoomLevel=${zoomLevel}${rawParam}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch etoh graph data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get etoh raw data for a specific date range */
export async function getEtohGraphForDateRange(
  deviceId: string,
  startMs: number,
  endMs: number,
  raw: boolean = true
): Promise<{
  success: boolean;
  data?: {
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel?: { index: number; label: string; rangeSec: number };
  };
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const rawParam = raw ? '&raw=true' : '';
    const response = await fetch(
      apiUrl(`/api/data/health/etoh/graph/${normalizedId}?zoomLevel=0${rawParam}&start=${startMs}&end=${endMs}`),
      { method: 'GET', headers }
    );
    const data = await response.json();
    if (!response.ok) {
      return { success: false, message: data.message || 'Failed to fetch etoh data' };
    }
    return { success: true, data: data.data };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get monthly aggregated etoh data */
export async function getMonthlyEtohData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (monthStart) params.append('monthStart', monthStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/monthly/${normalizedId}?metric=etoh${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch monthly etoh data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

/** Get weekly aggregated etoh data */
export async function getWeeklyEtohData(
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
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (weekStart) params.append('weekStart', weekStart.toISOString());
    
    const response = await fetch(apiUrl(`/api/data/health/weekly/${normalizedId}?metric=etoh${params.toString() ? `&${params.toString()}` : ''}`), {
      method: 'GET',
      headers,
    });
    const data = await response.json();
    if (!response.ok) return { success: false, message: data.message || 'Failed to fetch weekly etoh data' };
    return { success: true, data: data.data || [] };
  } catch (error: any) {
    return { success: false, message: error.message || 'Network error' };
  }
}

