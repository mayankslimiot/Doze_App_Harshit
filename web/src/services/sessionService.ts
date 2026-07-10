import { apiUrl } from './api';

export interface MonitoringSessionPayload {
  patientCode?: string;
  bedId?: string;
  deviceId?: string;
  startTime?: string;
  expectedEndTime?: string;
  technicianNotes?: string;
  consentVerified: boolean;
  name?: string;
  patientId?: string;
  room?: string;
  bed?: string;
  age?: number;
  sex?: string;
  admissionDate?: string;
  dischargeDate?: string;
  patientPhone?: string;
  patientEmail?: string;
  caretakerPhone?: string;
  caretakerEmail?: string;
}

export const createMonitoringSession = async (payload: MonitoringSessionPayload) => {
  const token = localStorage.getItem('token');
  const response = await fetch(apiUrl('/api/sessions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to create monitoring session');
  }

  return response.json();
};

export const deleteSession = async (id: string) => {
  const token = localStorage.getItem('token');
  const response = await fetch(apiUrl(`/api/sessions/${id}`), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to delete session');
  }

  return response.json();
};

export const updateSessionDetails = async (sessionId: string, data: { name?: string; patientCode?: string; admissionDate?: string; dischargeDate?: string }) => {
  const token = localStorage.getItem('token');
  const response = await fetch(apiUrl(`/api/sessions/${sessionId}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to update session details');
  }

  return response.json();
};
