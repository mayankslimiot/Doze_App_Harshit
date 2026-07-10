import { apiUrl } from './api';

export interface ManualEntryPayload {
  deviceId: string;
  room: string;
  bed: string;
  heartRate: number;
  respiration: number;
  date: string;
  time: string;
}

export const createManualEntry = async (payload: ManualEntryPayload) => {
  const token = localStorage.getItem('token');
  const response = await fetch(apiUrl('/api/manual-entries'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to create manual entry');
  }

  return response.json();
};

export const getManualEntries = async (deviceId: string) => {
  const token = localStorage.getItem('token');
  const response = await fetch(apiUrl(`/api/manual-entries/${deviceId}`), {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch manual entries');
  }

  return response.json();
};
