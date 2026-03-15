import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

// WebSocket server configuration
import { WS_BASE_URL } from './api';

const getWebSocketUrl = (): string => {
  return WS_BASE_URL;
};

let socket: Socket | null = null;
let currentDeviceId: string | null = null;
let messageHandlers: Set<WebSocketMessageHandler> = new Set();
let deviceUpdateHandlers: Set<DeviceUpdateHandler> = new Set();
let isConnecting = false;

export type WebSocketMessageHandler = (data: {
  deviceId?: string;
  timestamp?: Date | string;
  temperature?: number;
  humidity?: number;
  heartRate?: number;
  respiration?: number;
  stress?: number;
  hrv?: number;
  iaq?: number;
  eco2?: number;
  tvoc?: number;
  etoh?: number;
  pm10?: number;
  co2?: number;
  voc?: number;
  voltage?: number;
  level?: number;
  status?: string;
  metrics?: any;
  signals?: any;
  [key: string]: any;
}) => void;

export type DeviceUpdateHandler = (data: {
  deviceId: string;
  bedStatus: 'Vacant' | 'Occupied' | 'Waiting';
  absenceStart?: number;
  HV?: number;
  isLive: boolean;
  source?: 'packet' | 'timeout';
}) => void;

/**
 * Get authentication token from storage
 */
async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem('auth_token');
  } catch (error) {
    console.error('[WebSocket] Failed to get auth token:', error);
    return null;
  }
}

/**
 * Connect to WebSocket server
 * @param deviceId - Device ID to subscribe to
 * @param onMessage - Callback function for health data updates
 */
export const connectWebSocket = async (
  deviceId: string,
  onMessage?: WebSocketMessageHandler
): Promise<Socket | null> => {
  // If already connected to the same device, ensure subscription and add handler
  if (socket && socket.connected && currentDeviceId === deviceId) {
    if (onMessage) {
      messageHandlers.add(onMessage);
      console.log('[WebSocket] Added handler to existing connection. Total handlers:', messageHandlers.size);
    }
    // CRITICAL: Ensure we're subscribed to the device room (in case subscription was missed)
    if (socket.connected) {
      console.log('[WebSocket] 🔄 Ensuring subscription to device:', deviceId);
      socket.emit('subscribe_device', { deviceId });
    }
    return socket;
  }

  // If we have a stale/disconnected socket instance, clean it up before creating a new one.
  // Otherwise the app can end up "thinking" it has a socket object while no data flows.
  if (socket && !socket.connected) {
    disconnectWebSocket();
  }

  // Disconnect existing socket if device changed
  if (socket && currentDeviceId && currentDeviceId !== deviceId) {
    // Unsubscribe from old device first
    unsubscribeFromDevice(currentDeviceId);
    // Then disconnect
    disconnectWebSocket();
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    return null;
  }

  try {
    isConnecting = true;
    currentDeviceId = deviceId;

    // Get auth token
    const token = await getAuthToken();
    if (!token) {
      console.error('[WebSocket] No auth token found. User must be logged in.');
      isConnecting = false;
      return null;
    }

    const wsUrl = getWebSocketUrl();

    // Create Socket.IO client with authentication
    socket = io(wsUrl, {
      auth: {
        token: token,
      },
      transports: ['websocket', 'polling'], // Support both transports
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    // Store message handler
    if (onMessage) {
      messageHandlers.add(onMessage);
      console.log('[WebSocket] Added handler during connection. Total handlers:', messageHandlers.size);
    }

    // Connection event handlers
    socket.on('connect', () => {
      isConnecting = false;
      console.log('[WebSocket] ✅ Connected! Subscribing to device:', deviceId);

      // Subscribe to device room after connection
      if (deviceId && currentDeviceId === deviceId) {
        console.log('[WebSocket] 📡 Emitting subscribe_device for:', deviceId);
        socket?.emit('subscribe_device', { deviceId });
      } else {
        console.log('[WebSocket] ⚠️ Not subscribing - deviceId mismatch. Expected:', deviceId, 'Current:', currentDeviceId);
      }
    });

    // Also listen for 'subscribed' confirmation from backend
    socket.on('subscribed', (data: any) => {
      console.log('[WebSocket] ✅ Backend confirmed subscription:', data);
    });

    // Listen for subscription errors
    socket.on('error', (error: any) => {
      console.error('[WebSocket] ❌ Socket error:', error);
    });

    socket.on('health_data_update', (data: any) => {
      console.log('[WebSocket] 📨 health_data_update received!', {
        handlers: messageHandlers.size,
        deviceId: data.deviceId,
        currentDeviceId: currentDeviceId,
        respiration: data.respiration,
        timestamp: data.timestamp
      });
      
      // Only process data for the current active device
      if (data.deviceId && data.deviceId !== currentDeviceId) {
        console.log('[WebSocket] ⚠️ Ignoring data from different device. Expected:', currentDeviceId, 'Got:', data.deviceId);
        return;
      }

      // Call all registered message handlers
      if (messageHandlers.size > 0) {
        console.log('[WebSocket] ✅ Calling', messageHandlers.size, 'handler(s) with data:', {
          respiration: data.respiration,
          deviceId: data.deviceId
        });
        messageHandlers.forEach((handler) => {
          try {
            handler(data);
          } catch (error) {
            console.error('[WebSocket] ❌ Error in handler:', error);
          }
        });
      } else {
        console.log('[WebSocket] ⚠️ No handlers registered!');
      }
    });

    // ✅ Listen for device_update events (bedStatus, absenceStart, HV, isLive)
    socket.on('device_update', (data: any) => {
      console.log('[WebSocket] 📨 device_update received!', {
        deviceId: data.deviceId,
        bedStatus: data.bedStatus,
        isLive: data.isLive,
        source: data.source
      });

      // Call all registered device update handlers
      if (deviceUpdateHandlers.size > 0) {
        deviceUpdateHandlers.forEach((handler) => {
          try {
            handler(data);
          } catch (error) {
            console.error('[WebSocket] ❌ Error in device update handler:', error);
          }
        });
      }
    });

    socket.on('error', (error: any) => {
      console.error('[WebSocket] Error:', error);
      isConnecting = false;
    });

    socket.on('disconnect', () => {
      isConnecting = false;
    });

    socket.on('connect_error', (error: Error) => {
      console.error('[WebSocket] ❌ Connection error:', error.message);
      isConnecting = false;
    });

    // Wait for connection (with timeout)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (socket && socket.connected) {
          resolve(socket);
        } else {
          isConnecting = false;
          resolve(null);
        }
      }, 10000);

      socket?.on('connect', () => {
        clearTimeout(timeout);
        resolve(socket);
      });
    });
  } catch (error) {
    console.error('[WebSocket] Failed to create socket:', error);
    isConnecting = false;
    return null;
  }
};

/**
 * Disconnect socket only; keep handlers and currentDeviceId.
 * Used when reconnecting on app resume so existing handlers still receive data.
 */
function disconnectSocketOnly(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  isConnecting = false;
}

/**
 * Reconnect WebSocket if disconnected (e.g. after app resume).
 * Safe to call from app resume: no-op if already connected to same device.
 * resumeHandler: optional handler that pushes to buffers so graphs get data even if Home isn't mounted.
 */
export const reconnectIfDisconnected = async (
  deviceId: string,
  resumeHandler?: WebSocketMessageHandler
): Promise<Socket | null> => {
  const id = deviceId?.trim();
  if (!id) return null;

  if (socket && socket.connected && currentDeviceId === id) {
    return socket;
  }
  if (isConnecting) {
    return null;
  }
  if (socket) {
    disconnectSocketOnly();
  }
  return connectWebSocket(id, resumeHandler);
};

/**
 * Remove a specific message handler
 */
export const removeWebSocketHandler = (handler: WebSocketMessageHandler) => {
  messageHandlers.delete(handler);
};

/**
 * Add a device update handler
 */
export const addDeviceUpdateHandler = (handler: DeviceUpdateHandler) => {
  deviceUpdateHandlers.add(handler);
};

/**
 * Remove a device update handler
 */
export const removeDeviceUpdateHandler = (handler: DeviceUpdateHandler) => {
  deviceUpdateHandlers.delete(handler);
};

/**
 * Disconnect from WebSocket server
 */
export const disconnectWebSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentDeviceId = null;
    messageHandlers.clear();
    deviceUpdateHandlers.clear();
    isConnecting = false;
  }
};

/**
 * Check if WebSocket is connected
 */
export const isWebSocketConnected = (): boolean => {
  return socket !== null && socket.connected === true;
};

/**
 * Manually subscribe to a device room
 */
export const subscribeToDevice = (deviceId: string) => {
  if (socket && socket.connected) {
    socket.emit('subscribe_device', { deviceId });
  }
};

/**
 * Unsubscribe from a device room
 */
export const unsubscribeFromDevice = (deviceId: string) => {
  if (socket && socket.connected) {
    socket.emit('unsubscribe_device', { deviceId });
  }
};

