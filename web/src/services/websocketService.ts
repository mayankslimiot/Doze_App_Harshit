import { io, Socket } from 'socket.io-client';
import { WS_BASE_URL } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface HealthDataUpdate {
  deviceId?: string;
  timestamp?: string | Date;
  temperature?: number | null;
  humidity?: number | null;
  heartRate?: number | null;
  respiration?: number | null;
  stress?: number | null;
  iaq?: number | null;
  tvoc?: number | null;
  eco2?: number | null;
  etoh?: number | null;
  voltage?: number | null;
  level?: number | null;
  status?: string;
  [key: string]: unknown;
}

export interface DeviceUpdate {
  deviceId: string;
  bedStatus: 'Vacant' | 'Occupied' | 'Waiting';
  absenceStart?: number;
  HV?: number;
  isLive: boolean;
  source?: 'packet' | 'timeout';
}

export type HealthDataHandler = (data: HealthDataUpdate) => void;
export type DeviceUpdateHandler = (data: DeviceUpdate) => void;
export type NotificationHandler = (data: any) => void;

// ---------------------------------------------------------------------------
// State (module-level singleton)
// ---------------------------------------------------------------------------
let socket: Socket | null = null;
let subscribedDevices: Set<string> = new Set();
const healthHandlers: Set<HealthDataHandler> = new Set();
const deviceUpdateHandlers: Set<DeviceUpdateHandler> = new Set();
const notificationHandlers: Set<NotificationHandler> = new Set();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getAuthToken(): string | null {
  return localStorage.getItem('token');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect to the WebSocket server (singleton — one global connection).
 * Safe to call multiple times; only creates a new socket if none exists.
 */
export function connectWebSocket(): Socket | null {
  // Already have a socket (connected or connecting) — reuse
  if (socket) {
    console.log('[WS] Socket already exists, connected=', socket.connected);
    return socket;
  }

  const token = getAuthToken();
  if (!token) {
    console.error('[WS] No auth token in localStorage');
    return null;
  }

  console.log('[WS] Creating new connection to', WS_BASE_URL);

  socket = io(WS_BASE_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('[WS] ✅ Connected! socketId=', socket?.id);
    console.log('[WS] Subscribing to', subscribedDevices.size, 'devices:', [...subscribedDevices]);
    // Subscribe / re-subscribe to all tracked devices
    subscribedDevices.forEach((deviceId) => {
      console.log('[WS] Emitting subscribe_device for', deviceId);
      socket?.emit('subscribe_device', { deviceId });
    });
  });

  socket.on('subscribed', (data: { deviceId: string; room: string }) => {
    console.log('[WS] ✅ Backend confirmed subscription:', data.deviceId, data.room);
  });

  socket.on('health_data_update', (data: HealthDataUpdate) => {
    console.log('[WS] 📨 health_data_update received:', {
      deviceId: data.deviceId,
      heartRate: data.heartRate,
      respiration: data.respiration,
      handlers: healthHandlers.size,
    });
    healthHandlers.forEach((h) => {
      try {
        h(data);
      } catch (e) {
        console.error('[WS] handler error', e);
      }
    });
  });

  socket.on('device_update', (data: DeviceUpdate) => {
    console.log('[WS] 📨 device_update received:', data.deviceId, data.bedStatus);
    deviceUpdateHandlers.forEach((h) => {
      try {
        h(data);
      } catch (e) {
        console.error('[WS] handler error', e);
      }
    });
  });

  socket.on('new_notification', (data: any) => {
    console.log('[WS] 📨 new_notification received:', data);
    notificationHandlers.forEach((h) => {
      try {
        h(data);
      } catch (e) {
        console.error('[WS] handler error', e);
      }
    });
  });

  socket.on('error', (err: { message: string }) => {
    console.error('[WS] ❌ Server error:', err);
  });

  socket.on('disconnect', (reason: string) => {
    console.log('[WS] Disconnected:', reason);
  });

  socket.on('connect_error', (err: Error) => {
    console.error('[WS] ❌ Connection error:', err.message);
  });

  socket.on('connected', (data: unknown) => {
    console.log('[WS] ✅ Backend connected event:', data);
  });

  return socket;
}

/** Subscribe the current socket to a device room */
export function subscribeToDevice(deviceId: string): void {
  subscribedDevices.add(deviceId);
  console.log('[WS] subscribeToDevice called for', deviceId, '| socket connected=', socket?.connected);
  if (socket?.connected) {
    console.log('[WS] Emitting subscribe_device immediately for', deviceId);
    socket.emit('subscribe_device', { deviceId });
  } else {
    console.log('[WS] Socket not yet connected — will subscribe on connect event');
  }
}

/** Unsubscribe from a device room */
export function unsubscribeFromDevice(deviceId: string): void {
  subscribedDevices.delete(deviceId);
  if (socket?.connected) {
    socket.emit('unsubscribe_device', { deviceId });
  }
}

/** Fully disconnect and tear down the WebSocket */
export function disconnectWebSocket(): void {
  console.log('[WS] disconnectWebSocket called');
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  subscribedDevices.clear();
  healthHandlers.clear();
  deviceUpdateHandlers.clear();
  notificationHandlers.clear();
}

/** Add a health-data handler */
export function addHealthDataHandler(handler: HealthDataHandler): void {
  healthHandlers.add(handler);
  console.log('[WS] addHealthDataHandler — total handlers:', healthHandlers.size);
}

/** Remove a health-data handler */
export function removeHealthDataHandler(handler: HealthDataHandler): void {
  healthHandlers.delete(handler);
  console.log('[WS] removeHealthDataHandler — total handlers:', healthHandlers.size);
}

/** Add a device-update handler */
export function addDeviceUpdateHandler(handler: DeviceUpdateHandler): void {
  deviceUpdateHandlers.add(handler);
}

/** Remove a device-update handler */
export function removeDeviceUpdateHandler(handler: DeviceUpdateHandler): void {
  deviceUpdateHandlers.delete(handler);
}

/** Add a notification handler */
export function addNotificationHandler(handler: NotificationHandler): void {
  notificationHandlers.add(handler);
}

/** Remove a notification handler */
export function removeNotificationHandler(handler: NotificationHandler): void {
  notificationHandlers.delete(handler);
}

/** Check connection state */
export function isConnected(): boolean {
  return socket?.connected ?? false;
}
