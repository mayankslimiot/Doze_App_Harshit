import { apiUrl } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DashboardDevice {
  id: string;
  name: string;
  status: string;
  ts: number;
  syncStatus: string;
  room?: string;
  bed?: string;
}

export interface HealthDataPoint {
  timestamp: number;   // Unix ms
  heartRate: number | null;
  respiration: number | null;
  temperature?: number | null;
  humidity?: number | null;
  stress?: number | null;
  iaq?: number | null;
  tvoc?: number | null;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/** Fetch all devices for the logged-in sub-admin */
export async function getDevices(): Promise<DashboardDevice[]> {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/dashboard/devices'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.status === 'success') return json.data as DashboardDevice[];
  throw new Error(json.message || 'Failed to fetch devices');
}

export async function getDashboardStats() {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/dashboard/stats'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.status === 'success') return json.data;
  throw new Error(json.message || 'Failed to fetch stats');
}

export async function getDashboardSessions() {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/dashboard/sessions'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.status === 'success') return json.data;
  throw new Error(json.message || 'Failed to fetch sessions');
}

export async function getUserProfile() {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/user/profile'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  // The backend returns the user object directly, not wrapped in a data property
  if (res.ok) return json;
  throw new Error(json.message || 'Failed to fetch profile');
}

export async function updateUserProfile(data: any) {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/user/profile'), {
    method: 'PUT',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (json.status === 'success') return json.data;
  throw new Error(json.message || 'Failed to update profile');
}

export async function uploadProfileImage(file: File) {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('profileImage', file);

  const res = await fetch(apiUrl('/api/user/profile/image'), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  const json = await res.json();
  if (json.status === 'success') return json.data;
  throw new Error(json.message || 'Failed to upload image');
}

export async function deleteUserProfile() {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/user/profile'), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  if (json.status === 'success') return json;
  throw new Error(json.message || 'Failed to delete account');
}

/**
 * Fetch recent health data for a device (last N minutes).
 * Uses the raw health-data endpoint with date range.
 */
export async function getRecentHealthData(
  deviceId: string,
  durationMs: number = 10 * 60 * 1000, // default 10 min
): Promise<HealthDataPoint[]> {
  const token = localStorage.getItem('token');
  const endMs = Date.now();
  const startMs = endMs - durationMs;

  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();

  const url = apiUrl(
    `/api/data/health/raw/${encodeURIComponent(deviceId)}?start=${startISO}&end=${endISO}&limit=50000`,
  );

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.status === 'success' && Array.isArray(json.data)) {
    return json.data.map((d: Record<string, unknown>) => ({
      timestamp: d.timestampSeconds
        ? (d.timestampSeconds as number) * 1000
        : new Date(d.timestamp as string).getTime(),
      heartRate: (d.heartRate as number) ?? null,
      respiration: (d.respiration as number) ?? null,
      temperature: (d.temperature as number) ?? null,
      humidity: (d.humidity as number) ?? null,
      stress: (d.stress as number) ?? null,
      iaq: (d.iaq as number) ?? null,
      tvoc: (d.tvoc as number) ?? (d.voc as number) ?? null,
    }));
  }
  return [];
}

export async function getHealthDataRange(
  deviceId: string,
  startISO: string,
  endISO: string,
): Promise<HealthDataPoint[]> {
  const token = localStorage.getItem('token');
  const url = apiUrl(
    `/api/data/health/raw/${encodeURIComponent(deviceId)}?start=${startISO}&end=${endISO}&limit=50000`,
  );

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.status === 'success' && Array.isArray(json.data)) {
    return json.data.map((d: Record<string, unknown>) => ({
      timestamp: d.timestampSeconds
        ? (d.timestampSeconds as number) * 1000
        : new Date(d.timestamp as string).getTime(),
      heartRate: (d.heartRate as number) ?? null,
      respiration: (d.respiration as number) ?? null,
      temperature: (d.temperature as number) ?? null,
      humidity: (d.humidity as number) ?? null,
      stress: (d.stress as number) ?? null,
      iaq: (d.iaq as number) ?? null,
      tvoc: (d.tvoc as number) ?? (d.voc as number) ?? null,
    }));
  }
  return [];
}

export async function renameDashboardDevice(deviceId: string, name: string, room?: string, bed?: string) {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl(`/api/devices/dashboard-rename/${encodeURIComponent(deviceId)}`), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, room, bed }),
  });
  if (!res.ok) {
    throw new Error('Failed to rename device');
  }
  return res.json();
}

export async function removeDashboardDevice(deviceId: string) {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl(`/api/devices/dashboard-remove/${encodeURIComponent(deviceId)}`), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error('Failed to remove device');
  }
  return res.json();
}

export async function updateUserPassword(data: any) {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/user/profile/password'), {
    method: 'PUT',
    headers: { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (res.ok) return json;
  throw new Error(json.message || 'Failed to update password');
}

export interface OrgRoom {
  room: string;
  beds: string[];
}

/** Fetch all rooms + their beds for the current org's devices */
export async function getOrgRoomsBeds(): Promise<OrgRoom[]> {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/dashboard/rooms-beds'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.status === 'success') return json.data as OrgRoom[];
  throw new Error(json.message || 'Failed to fetch rooms/beds');
}
/** Upload organization logo */
export async function uploadOrganizationLogo(file: File): Promise<string> {
  const token = localStorage.getItem('token');
  const formData = new FormData();
  formData.append('logo', file);

  const res = await fetch(apiUrl('/api/organizations/upload-logo'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  const json = await res.json();
  if (json.status === 'success') return json.logoUrl;
  throw new Error(json.message || 'Failed to upload logo');
}

/** Update organization details */
export async function updateOrganizationDetails(orgId: string, data: any): Promise<any> {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl(`/api/organizations/${orgId}`), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (json.status === 'success') return json.data;
  throw new Error(json.message || 'Failed to update organization');
}

/** Get the single latest health data point for a device */
export async function getLatestHealthDataPoint(
  deviceId: string,
): Promise<HealthDataPoint | null> {
  const token = localStorage.getItem('token');
  const url = apiUrl(
    `/api/data/health/raw/${encodeURIComponent(deviceId)}?limit=1`,
  );

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
    const d = json.data[0];
    return {
      timestamp: d.timestampSeconds
        ? (d.timestampSeconds as number) * 1000
        : new Date(d.timestamp as string).getTime(),
      heartRate: (d.heartRate as number) ?? null,
      respiration: (d.respiration as number) ?? null,
      temperature: (d.temperature as number) ?? null,
      humidity: (d.humidity as number) ?? null,
      stress: (d.stress as number) ?? null,
      iaq: (d.iaq as number) ?? null,
      tvoc: (d.tvoc as number) ?? (d.voc as number) ?? null,
    };
  }
  return null;
}

export async function getSessions() {
  const token = localStorage.getItem('token');
  const res = await fetch(apiUrl('/api/sessions'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.success) return json.data;
  throw new Error(json.message || 'Failed to fetch sessions');
}
