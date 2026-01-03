import mqtt, { MqttClient } from 'mqtt';

// MQTT Broker configuration
// React Native requires WebSocket, not raw TCP
// Broker: mqtt://172.236.188.162:1883 (converted to ws://172.236.188.162:8083 for React Native)
// HARDCODED for APK builds - environment variables may not be available in production builds
const MQTT_BROKER_URL = 'mqtt://172.236.188.162:1883';
const MQTT_USERNAME = 'doze';
const MQTT_PASSWORD = 'bK67ZwBHSWkl';

// Device WiFi Status MQTT Configuration (from firmware)
const DEVICE_WIFI_MQTT_BROKER = 'broker.hivemq.com';
const DEVICE_WIFI_MQTT_PORT = 8000; // WebSocket port (React Native requires WebSocket, not TCP)
// Note: Firmware uses port 1883 (TCP), but React Native needs WebSocket on port 8000
const DEVICE_WIFI_MQTT_USERNAME = 'Plawat';
const DEVICE_WIFI_MQTT_PASSWORD = '123456';
const DEVICE_WIFI_STATUS_TOPIC = 'device/status';

let client: MqttClient | null = null;
let currentDeviceId: string | null = null;
let wifiStatusClient: MqttClient | null = null;
let wifiStatusCallback: WiFiStatusCallback | null = null;

export type MQTTMessageHandler = (data: {
  temp?: number;
  humidity?: number;
  iaq?: number;
  eco2?: number;
  tvoc?: number;
  etoh?: number;
  hrv?: number;
  stress?: number;
  respiration?: number;
  heartRate?: number;
  timestamp?: Date;
  [key: string]: any;
}) => void;

/**
 * Connect to MQTT broker
 * NOTE: React Native requires WebSocket, not raw TCP
 * If WebSocket is not available on broker, HTTP polling will be used as fallback
 */
export const connectMQTT = (deviceId: string): MqttClient | null => {
  console.log(`[MQTT] Attempting to connect to broker (React Native requires WebSocket)`);
  
  // If client exists but we have a different device, disconnect first
  if (client && currentDeviceId !== deviceId) {
    console.log('[MQTT] Disconnecting existing client for new device');
    client.end();
    client = null;
  }

  // Reuse existing connection if same device
  if (client && currentDeviceId === deviceId && client.connected) {
    console.log('[MQTT] Reusing existing MQTT connection');
    return client;
  }

  try {
    // React Native requires WebSocket, not raw TCP
    // Try different WebSocket ports (common: 8083, 9001, 1884)
    let connectionUrl = MQTT_BROKER_URL;
    
    if (connectionUrl.startsWith('mqtt://')) {
      // Extract host and port
      const hostPort = connectionUrl.replace('mqtt://', '');
      const [host, port] = hostPort.split(':');
      
      // Try WebSocket on common ports
      // Port 8083 is most common for MQTT over WebSocket
      const wsPort = '8083';
      connectionUrl = `ws://${host}:${wsPort}`;
      console.log(`[MQTT] Converted mqtt:// to WebSocket: ${connectionUrl}`);
      console.log(`[MQTT] Note: If this fails, broker may need WebSocket enabled on port ${wsPort}`);
    }

    console.log(`[MQTT] Connecting with credentials:`, {
      url: connectionUrl,
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD ? '***' : 'MISSING',
      protocol: 'WebSocket (required for React Native)',
    });

    // For React Native, we need to use WebSocket transport
    // The mqtt library will automatically use WebSocket when URL starts with ws:// or wss://
    client = mqtt.connect(connectionUrl, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: `react_native_${Math.random().toString(16).substring(2, 10)}`,
      clean: true,
      reconnectPeriod: 1000,
      connectTimeout: 15000, // Increased timeout for WebSocket
      keepalive: 60,
      // WebSocket-specific options
      // @ts-ignore
      transformWsUrl: (url: string, options: any, client: any) => {
        console.log('[MQTT] WebSocket URL transform:', url);
        return url;
      },
    });

    currentDeviceId = deviceId;

    client.on('connect', (connack) => {
      console.log(`[MQTT] ✅ Connected successfully for device: ${deviceId}`);
      console.log(`[MQTT] Connack:`, connack);
      
      // Subscribe after connection is established
      subscribeToDeviceTopics(deviceId);
      
      // Log that we're ready to receive messages
      console.log(`[MQTT] ✅ Ready to receive messages for device: ${deviceId}`);
    });

    client.on('error', (error) => {
      console.error('[MQTT] ❌ Connection error:', error);
      console.error('[MQTT] Error details:', {
        message: error.message,
        code: (error as any).code,
        errno: (error as any).errno,
      });
      console.error('[MQTT] ⚠️ WebSocket connection failed. This is expected if:');
      console.error('[MQTT]    1. Broker does not have WebSocket enabled');
      console.error('[MQTT]    2. WebSocket port (8083) is not open');
      console.error('[MQTT]    3. Network/firewall blocking WebSocket');
      console.error('[MQTT] App will fallback to HTTP polling for data updates.');
    });

    client.on('reconnect', () => {
      console.log('[MQTT] 🔄 Attempting to reconnect...');
    });

    client.on('offline', () => {
      console.warn('[MQTT] ⚠️ Client is offline');
    });

    client.on('close', () => {
      console.log('[MQTT] Connection closed');
    });

    client.on('end', () => {
      console.log('[MQTT] Connection ended');
    });

    // Additional event for debugging
    client.on('packetsend', (packet) => {
      console.log('[MQTT] Packet sent:', packet.cmd);
    });

    client.on('packetreceive', (packet) => {
      console.log('[MQTT] Packet received:', packet.cmd);
    });

    return client;
  } catch (error) {
    console.error('[MQTT] ❌ Failed to create client:', error);
    console.error('[MQTT] Error stack:', (error as Error).stack);
    return null;
  }
};

/**
 * Subscribe to device-specific topics (same as website)
 */
export const subscribeToDeviceTopics = (deviceId: string) => {
  if (!client || !deviceId) {
    console.warn('[MQTT] Cannot subscribe: client not initialized or deviceId missing');
    return;
  }

  const healthTopic = `/${deviceId}/health`;
  const sleepTopic = `/${deviceId}/sleep`;

  console.log(`[MQTT] Subscribing to topics for ${deviceId}:`);
  console.log(`  - Health: ${healthTopic}`);
  console.log(`  - Sleep: ${sleepTopic}`);

  client.subscribe(healthTopic, (err) => {
    if (!err) {
      console.log(`[MQTT] ✅ Subscribed to health topic: ${healthTopic}`);
    } else {
      console.error(`[MQTT] ❌ Failed to subscribe to health topic:`, err);
    }
  });

  client.subscribe(sleepTopic, (err) => {
    if (!err) {
      console.log(`[MQTT] ✅ Subscribed to sleep topic: ${sleepTopic}`);
    } else {
      console.error(`[MQTT] ❌ Failed to subscribe to sleep topic:`, err);
    }
  });
};

/**
 * Setup MQTT message handler (same pattern as website)
 * IMPORTANT: This must be called BEFORE the client connects to ensure messages are caught
 */
export const setupMQTTMessageHandler = (
  client: MqttClient,
  onMessage: MQTTMessageHandler
) => {
  // Remove any existing message handlers to avoid duplicates
  client.removeAllListeners('message');
  
  console.log('[MQTT] 🔧 Setting up message handler (before connection)...');
  console.log('[MQTT] Client state:', {
    connected: client.connected,
    disconnecting: (client as any).disconnecting,
    reconnecting: (client as any).reconnecting,
  });
  
  // Attach message handler directly to client (same as website)
  client.on('message', (topic, message) => {
    const timestamp = new Date().toLocaleTimeString('en-IN', { hour12: false });
    
    try {
      const messageStr = message.toString();
      const parsedData = JSON.parse(messageStr);

      // Transform data to match our health data format (same as backend processing)
      // MQTT sends: { temp, hr, resp, humidity, iaq, etc. }
      // UI expects: { temperature, heartRate, respiration, etc. }
      const healthData = {
        // Core health metrics
        temperature: parsedData.temperature !== undefined ? parsedData.temperature : 
                     (parsedData.temp !== undefined ? parsedData.temp : undefined),
        heartRate: parsedData.heartRate !== undefined ? parsedData.heartRate : 
                   (parsedData.hr !== undefined ? parsedData.hr : undefined),
        respiration: parsedData.respiration !== undefined ? parsedData.respiration : 
                     (parsedData.resp !== undefined ? parsedData.resp : undefined),
        stress: parsedData.stress !== undefined ? parsedData.stress : undefined,
        hrv: parsedData.hrv !== undefined ? parsedData.hrv : undefined,
        
        // Environment metrics
        humidity: parsedData.humidity !== undefined ? parsedData.humidity : undefined,
        iaq: parsedData.iaq !== undefined ? parsedData.iaq : undefined,
        eco2: parsedData.eco2 !== undefined ? parsedData.eco2 : undefined,
        tvoc: parsedData.tvoc !== undefined ? parsedData.tvoc : undefined,
        etoh: parsedData.etoh !== undefined ? parsedData.etoh : undefined,
        
        // Additional fields
        metrics: parsedData.metrics || {},
        signals: parsedData.signals || {},
        raw: parsedData.raw || {},
        timestamp: new Date(),
        
        // Keep original fields for compatibility
        temp: parsedData.temp !== undefined ? parsedData.temp : parsedData.temperature,
        hr: parsedData.hr !== undefined ? parsedData.hr : parsedData.heartRate,
        resp: parsedData.resp !== undefined ? parsedData.resp : parsedData.respiration,
      };

      // Real-time data print - har 6 seconds
      console.log(`[${timestamp}] 📱 MQTT: 🌡️${healthData.temperature || 'N/A'}°C | ❤️${healthData.heartRate || 'N/A'}BPM | 🌬️${healthData.respiration || 'N/A'}RPM | 😰${healthData.stress || 'N/A'} | 💧${healthData.humidity || 'N/A'}% | 🌬️IAQ:${healthData.iaq || 'N/A'}`);
      
      onMessage(healthData);
    } catch (error) {
      console.error('[MQTT] ❌ Error parsing message:', error);
      console.error('[MQTT] Raw message:', message.toString());
      console.error('[MQTT] Error stack:', (error as Error).stack);
    }
  });
  
  console.log('[MQTT] ✅ Message handler attached to client');
};

/**
 * Disconnect from MQTT broker
 */
export const disconnectMQTT = () => {
  if (client) {
    console.log('[MQTT] Disconnecting...');
    client.end();
    client = null;
    currentDeviceId = null;
  }
};

/**
 * Check if MQTT is connected
 */
export const isMQTTConnected = (): boolean => {
  return client !== null && client.connected === true;
};

/**
 * WiFi Status callback type
 */
export type WiFiStatusCallback = (status: 'CON' | 'FAIL') => void;

/**
 * WiFi Provisioning callback type - for CONNECTED message
 */
export type WiFiProvisioningCallback = (status: 'CONNECTED') => void;

// WiFi Provisioning MQTT client (for device/{serialNumber}/wifi topic)
let wifiProvisioningClient: MqttClient | null = null;
let wifiProvisioningCallback: WiFiProvisioningCallback | null = null;
let wifiProvisioningSerialNumber: string | null = null;

/**
 * Connect to Device WiFi Status MQTT broker and subscribe to WiFi status topic
 * This listens for device WiFi connection status updates (CON/FAIL)
 * @param onStatusUpdate Optional callback when WiFi status is received
 */
export const connectToDeviceWiFiStatusMQTT = (onStatusUpdate?: WiFiStatusCallback): MqttClient | null => {
  console.log('═══════════════════════════════════════');
  console.log('[WiFi Status MQTT] Connecting to device WiFi status broker...');
  console.log(`   Broker: ${DEVICE_WIFI_MQTT_BROKER}:${DEVICE_WIFI_MQTT_PORT}`);
  console.log(`   Username: ${DEVICE_WIFI_MQTT_USERNAME}`);
  console.log(`   Topic: ${DEVICE_WIFI_STATUS_TOPIC}`);
  console.log('═══════════════════════════════════════');

  // Store callback for later use
  if (onStatusUpdate) {
    wifiStatusCallback = onStatusUpdate;
    console.log('[WiFi Status MQTT] ✅ Callback registered for status updates');
    console.log('[WiFi Status MQTT] 📋 Callback function:', typeof onStatusUpdate);
  } else {
    console.log('[WiFi Status MQTT] ⚠️ No callback provided - UI updates will not happen');
  }

  // If client already exists and is connected, reuse it
  if (wifiStatusClient && wifiStatusClient.connected) {
    console.log('[WiFi Status MQTT] ✅ Reusing existing connection');
    return wifiStatusClient;
  }

  try {
    // React Native requires WebSocket (not TCP)
    // HiveMQ public broker: Port 1883 = TCP, Port 8000 = WebSocket
    // IMPORTANT: 
    // 1. WebSocket URL must include /mqtt path
    // 2. HiveMQ public broker does NOT support authentication - do NOT send username/password
    const wsUrl = `ws://${DEVICE_WIFI_MQTT_BROKER}:${DEVICE_WIFI_MQTT_PORT}/mqtt`;
    
    console.log(`[WiFi Status MQTT] 🔌 Connecting to: ${wsUrl}`);
    console.log(`[WiFi Status MQTT] 📋 Configuration:`);
    console.log(`   - Protocol: WebSocket (required for React Native)`);
    console.log(`   - Broker: ${DEVICE_WIFI_MQTT_BROKER}`);
    console.log(`   - Port: ${DEVICE_WIFI_MQTT_PORT} (WebSocket)`);
    console.log(`   - Path: /mqtt (required for HiveMQ)`);
    console.log(`   - Topic: ${DEVICE_WIFI_STATUS_TOPIC}`);
    console.log(`   - Authentication: DISABLED (HiveMQ public broker is anonymous)`);
    console.log(`[WiFi Status MQTT] ⏳ Attempting connection...`);

    // HiveMQ public broker does NOT support authentication
    // Sending username/password will cause "connack timeout" error
    // Do NOT include username/password fields at all
    const mqttOptions: any = {
      clientId: `react_native_wifi_status_${Math.random().toString(16).substring(2, 10)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 20000, // Increased timeout
      keepalive: 60,
      // DO NOT include username or password - HiveMQ public broker rejects auth
    };

    console.log(`[WiFi Status MQTT] ✅ Connecting WITHOUT credentials (HiveMQ public broker is anonymous)`);
    console.log(`[WiFi Status MQTT] ⚠️ Note: Firmware uses credentials, but public broker ignores them`);

    wifiStatusClient = mqtt.connect(wsUrl, mqttOptions);

    // IMPORTANT: Attach message handler BEFORE connection completes
    // This ensures we catch messages immediately after subscription
    console.log('[WiFi Status MQTT] 📋 Attaching message handler...');
    wifiStatusClient.on('message', (topic, message) => {
      const timestamp = new Date().toLocaleTimeString('en-IN', { hour12: false });
      const messageStr = message.toString().trim();
      
      console.log('═══════════════════════════════════════');
      console.log(`[${timestamp}] 📨 📨 📨 MQTT MESSAGE RECEIVED! 📨 📨 📨`);
      console.log(`[WiFi Status MQTT] Topic: ${topic}`);
      console.log(`[WiFi Status MQTT] Raw Message: "${messageStr}"`);
      console.log(`[WiFi Status MQTT] Message Length: ${messageStr.length} chars`);
      console.log(`[WiFi Status MQTT] Message Bytes:`, Array.from(message.toString()).map(c => c.charCodeAt(0)));
      console.log('═══════════════════════════════════════');
      
      if (messageStr === 'CON') {
        console.log('');
        console.log('✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅');
        console.log('✅ ✅ ✅ DEVICE WIFI CONNECTED SUCCESSFULLY! ✅ ✅ ✅');
        console.log('✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅');
        console.log(`[${timestamp}] Device successfully connected to WiFi network`);
        console.log('✅ Device is now online and ready!');
        console.log('✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅');
        console.log('');
        
        // Call callback to update UI
        console.log('[WiFi Status MQTT] 🔍 Checking if callback exists...');
        console.log(`[WiFi Status MQTT]    Callback exists: ${wifiStatusCallback ? '✅ YES' : '❌ NO'}`);
        console.log(`[WiFi Status MQTT]    Callback type: ${typeof wifiStatusCallback}`);
        
        if (wifiStatusCallback) {
          console.log('[WiFi Status MQTT] 📱 📱 📱 CALLING CALLBACK TO UPDATE UI... 📱 📱 📱');
          try {
            wifiStatusCallback('CON');
            console.log('[WiFi Status MQTT] ✅ Callback executed successfully');
          } catch (error) {
            console.error('[WiFi Status MQTT] ❌ Error executing callback:', error);
            console.error('[WiFi Status MQTT] Error stack:', (error as Error).stack);
          }
        } else {
          console.error('[WiFi Status MQTT] ❌ ❌ ❌ CALLBACK NOT FOUND! ❌ ❌ ❌');
          console.error('[WiFi Status MQTT] UI will NOT update automatically');
          console.error('[WiFi Status MQTT] This means callback was not registered properly');
        }
      } else if (messageStr === 'FAIL') {
        console.log('');
        console.log('❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌');
        console.log('❌ ❌ ❌ DEVICE WIFI CONNECTION FAILED! ❌ ❌ ❌');
        console.log('❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌');
        console.log(`[${timestamp}] Device failed to connect to WiFi network`);
        console.log('');
        console.log('   Possible reasons:');
        console.log('   ❌ Wrong WiFi password');
        console.log('   ❌ WiFi network not found (out of range)');
        console.log('   ❌ Weak signal strength');
        console.log('   ❌ Network connection error');
        console.log('   ❌ Router blocking connection');
        console.log('');
        console.log('   💡 Try:');
        console.log('   1. Double-check WiFi password');
        console.log('   2. Move device closer to router');
        console.log('   3. Check router settings');
        console.log('❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌ ❌');
        console.log('');
        
        // Call callback to update UI
        console.log('[WiFi Status MQTT] 🔍 Checking if callback exists...');
        console.log(`[WiFi Status MQTT]    Callback exists: ${wifiStatusCallback ? '✅ YES' : '❌ NO'}`);
        
        if (wifiStatusCallback) {
          console.log('[WiFi Status MQTT] 📱 📱 📱 CALLING CALLBACK TO UPDATE UI... 📱 📱 📱');
          try {
            wifiStatusCallback('FAIL');
            console.log('[WiFi Status MQTT] ✅ Callback executed successfully');
          } catch (error) {
            console.error('[WiFi Status MQTT] ❌ Error executing callback:', error);
            console.error('[WiFi Status MQTT] Error stack:', (error as Error).stack);
          }
        } else {
          console.error('[WiFi Status MQTT] ❌ ❌ ❌ CALLBACK NOT FOUND! ❌ ❌ ❌');
          console.error('[WiFi Status MQTT] UI will NOT update automatically');
        }
      } else {
        console.log(`[WiFi Status MQTT] ⚠️ ⚠️ ⚠️ UNKNOWN MESSAGE FORMAT ⚠️ ⚠️ ⚠️`);
        console.log(`[WiFi Status MQTT] Received: "${messageStr}"`);
        console.log(`[WiFi Status MQTT] Expected: "CON" or "FAIL"`);
        console.log(`[WiFi Status MQTT] This might be a different message type`);
      }
    });
    console.log('[WiFi Status MQTT] ✅ Message handler attached');

    wifiStatusClient.on('connect', (connack) => {
      console.log('═══════════════════════════════════════');
      console.log('[WiFi Status MQTT] ✅ ✅ ✅ CONNECTED SUCCESSFULLY! ✅ ✅ ✅');
      console.log(`[WiFi Status MQTT] Connack:`, JSON.stringify(connack, null, 2));
      console.log(`[WiFi Status MQTT] Connection State:`, wifiStatusClient?.connected ? 'CONNECTED' : 'NOT CONNECTED');
      console.log('═══════════════════════════════════════');
      
      // Subscribe to WiFi status topic
      if (wifiStatusClient) {
        console.log(`[WiFi Status MQTT] 📡 Subscribing to topic: ${DEVICE_WIFI_STATUS_TOPIC}`);
        wifiStatusClient.subscribe(DEVICE_WIFI_STATUS_TOPIC, { qos: 0 }, (err, granted) => {
          if (!err) {
            console.log('═══════════════════════════════════════');
            console.log(`[WiFi Status MQTT] ✅ ✅ ✅ SUBSCRIBED SUCCESSFULLY! ✅ ✅ ✅`);
            console.log(`[WiFi Status MQTT] Topic: ${DEVICE_WIFI_STATUS_TOPIC}`);
            console.log(`[WiFi Status MQTT] Granted:`, granted);
            console.log('[WiFi Status MQTT] 📡 📡 📡 LISTENING FOR MESSAGES... 📡 📡 📡');
            console.log('[WiFi Status MQTT]    Expected messages:');
            console.log('[WiFi Status MQTT]      - "CON" = WiFi connected successfully');
            console.log('[WiFi Status MQTT]      - "FAIL" = WiFi connection failed');
            console.log('═══════════════════════════════════════');
          } else {
            console.error('═══════════════════════════════════════');
            console.error(`[WiFi Status MQTT] ❌ ❌ ❌ SUBSCRIPTION FAILED! ❌ ❌ ❌`);
            console.error(`[WiFi Status MQTT] Error:`, err);
            console.error('═══════════════════════════════════════');
          }
        });
      }
    });

    wifiStatusClient.on('error', (error) => {
      console.error('═══════════════════════════════════════');
      console.error('[WiFi Status MQTT] ❌ ❌ ❌ CONNECTION ERROR! ❌ ❌ ❌');
      console.error('[WiFi Status MQTT] Error:', error);
      console.error('[WiFi Status MQTT] Error details:', {
        message: error.message,
        code: (error as any).code,
        errno: (error as any).errno,
        stack: (error as Error).stack,
      });
      console.error('[WiFi Status MQTT] ⚠️ Troubleshooting:');
      console.error('[WiFi Status MQTT]    1. Check internet connection');
      console.error('[WiFi Status MQTT]    2. Verify broker URL: broker.hivemq.com');
      console.error('[WiFi Status MQTT]    3. Check WebSocket port: 8000');
      console.error('[WiFi Status MQTT]    4. Verify credentials are correct');
      console.error('═══════════════════════════════════════');
    });

    wifiStatusClient.on('reconnect', () => {
      console.log('[WiFi Status MQTT] 🔄 🔄 🔄 Attempting to reconnect... 🔄 🔄 🔄');
    });

    wifiStatusClient.on('offline', () => {
      console.warn('═══════════════════════════════════════');
      console.warn('[WiFi Status MQTT] ⚠️ ⚠️ ⚠️ CLIENT IS OFFLINE ⚠️ ⚠️ ⚠️');
      console.warn('[WiFi Status MQTT] Connection lost, will attempt to reconnect...');
      console.warn('═══════════════════════════════════════');
    });

    wifiStatusClient.on('close', () => {
      console.log('═══════════════════════════════════════');
      console.log('[WiFi Status MQTT] 🔌 Connection closed');
      console.log('═══════════════════════════════════════');
    });

    // Add connection status check after 5 seconds
    setTimeout(() => {
      if (wifiStatusClient) {
        const isConnected = wifiStatusClient.connected;
        console.log('═══════════════════════════════════════');
        console.log('[WiFi Status MQTT] 🔍 Connection Status Check (5s after init):');
        console.log(`[WiFi Status MQTT]    Connected: ${isConnected ? '✅ YES' : '❌ NO'}`);
        console.log(`[WiFi Status MQTT]    Client exists: ${wifiStatusClient ? '✅ YES' : '❌ NO'}`);
        console.log(`[WiFi Status MQTT]    Callback registered: ${wifiStatusCallback ? '✅ YES' : '❌ NO'}`);
        if (!isConnected) {
          console.log('[WiFi Status MQTT] ⚠️ Not connected yet, check error messages above');
        }
        console.log('═══════════════════════════════════════');
      }
    }, 5000);

    return wifiStatusClient;
  } catch (error) {
    console.error('[WiFi Status MQTT] ❌ Failed to create client:', error);
    console.error('[WiFi Status MQTT] Error stack:', (error as Error).stack);
    return null;
  }
};

/**
 * Disconnect from Device WiFi Status MQTT broker
 */
export const disconnectDeviceWiFiStatusMQTT = () => {
  if (wifiStatusClient) {
    console.log('[WiFi Status MQTT] Disconnecting...');
    wifiStatusClient.end();
    wifiStatusClient = null;
    wifiStatusCallback = null; // Clear callback
  }
};

/**
 * Check if Device WiFi Status MQTT is connected
 */
export const isDeviceWiFiStatusMQTTConnected = (): boolean => {
  return wifiStatusClient !== null && wifiStatusClient.connected === true;
};

/**
 * Get detailed WiFi Status MQTT connection info (for debugging)
 */
export const getDeviceWiFiStatusMQTTInfo = () => {
  if (!wifiStatusClient) {
    return {
      connected: false,
      exists: false,
      broker: DEVICE_WIFI_MQTT_BROKER,
      port: DEVICE_WIFI_MQTT_PORT,
      topic: DEVICE_WIFI_STATUS_TOPIC,
    };
  }
  
  return {
    connected: wifiStatusClient.connected,
    exists: true,
    broker: DEVICE_WIFI_MQTT_BROKER,
    port: DEVICE_WIFI_MQTT_PORT,
    topic: DEVICE_WIFI_STATUS_TOPIC,
    clientId: (wifiStatusClient as any).options?.clientId,
  };
};

/**
 * Connect to MQTT broker for WiFi provisioning status
 * Subscribes to device/{serialNumber}/status topic to listen for "connected" message (lowercase)
 * Uses credentials from backend .env: MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD
 * 
 * SINGLE SOURCE OF TRUTH:
 * - Topic: device/{serialNumber}/status
 * - Message: "connected" (lowercase only)
 * - One-time handling with immediate cleanup
 * 
 * @param serialNumber Device serial number (used in topic: device/{serialNumber}/status)
 * @param onConnected Callback when "connected" message is received
 * @returns MQTT client instance or null if failed
 */
export const connectToWiFiProvisioningMQTT = (
  serialNumber: string,
  onConnected?: WiFiProvisioningCallback
): MqttClient | null => {
  console.log('═══════════════════════════════════════');
  console.log('[WiFi Provisioning MQTT] Connecting to WiFi provisioning broker...');
  console.log(`   Broker: ${MQTT_BROKER_URL}`);
  console.log(`   Username: ${MQTT_USERNAME}`);
  console.log(`   Serial Number: ${serialNumber}`);
  console.log(`   Topic: device/${serialNumber}/status`);
  console.log(`   Expected Message: "connected" (lowercase)`);
  console.log('═══════════════════════════════════════');

  if (!serialNumber) {
    console.error('[WiFi Provisioning MQTT] ❌ Serial number is required');
    return null;
  }

  // Store callback
  if (onConnected) {
    wifiProvisioningCallback = onConnected;
    wifiProvisioningSerialNumber = serialNumber;
    console.log('[WiFi Provisioning MQTT] ✅ Callback registered for "connected" message');
  }

  // NEVER reuse existing client - always create fresh connection for one-time flow
  if (wifiProvisioningClient) {
    console.log('[WiFi Provisioning MQTT] 🔄 Disconnecting existing client for fresh connection');
    wifiProvisioningClient.removeAllListeners('message'); // Remove all message listeners
    wifiProvisioningClient.end();
    wifiProvisioningClient = null;
  }

  try {
    // Convert mqtt:// to ws:// for React Native (WebSocket required)
    let connectionUrl = MQTT_BROKER_URL;
    
    if (connectionUrl.startsWith('mqtt://')) {
      // Extract host and port
      const hostPort = connectionUrl.replace('mqtt://', '');
      const [host, port] = hostPort.split(':');
      
      // Use WebSocket port (common: 8083, 9001, 1884)
      // Try 8083 first (most common for MQTT over WebSocket)
      const wsPort = port === '1883' ? '8083' : port;
      connectionUrl = `ws://${host}:${wsPort}`;
      console.log(`[WiFi Provisioning MQTT] Converted mqtt:// to WebSocket: ${connectionUrl}`);
    } else if (!connectionUrl.startsWith('ws://') && !connectionUrl.startsWith('wss://')) {
      // If no protocol specified, assume WebSocket
      connectionUrl = `ws://${connectionUrl}`;
      console.log(`[WiFi Provisioning MQTT] Added ws:// protocol: ${connectionUrl}`);
    }

    // SINGLE SOURCE OF TRUTH: device/{serialNumber}/status
    const topic = `device/${serialNumber}/status`;
    
    console.log(`[WiFi Provisioning MQTT] 🔌 Connecting to: ${connectionUrl}`);
    console.log(`[WiFi Provisioning MQTT] 📋 Configuration:`);
    console.log(`   - Protocol: WebSocket (required for React Native)`);
    console.log(`   - Broker URL: ${connectionUrl}`);
    console.log(`   - Username: ${MQTT_USERNAME}`);
    console.log(`   - Password: ${MQTT_PASSWORD ? '***' : 'MISSING'}`);
    console.log(`   - Topic: ${topic}`);
    console.log(`   - Expected Message: "connected" (lowercase only)`);
    console.log(`[WiFi Provisioning MQTT] ⏳ Attempting connection...`);

    const mqttOptions: any = {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: `react_native_wifi_provisioning_${Math.random().toString(16).substring(2, 10)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 20000,
      keepalive: 60,
    };

    wifiProvisioningClient = mqtt.connect(connectionUrl, mqttOptions);

    // Flag to ensure one-time message handling
    let messageHandled = false;

    // IMPORTANT: Attach message handler BEFORE connection completes
    // ONE-TIME HANDLING: Immediately detach listener and disconnect after processing
    console.log('[WiFi Provisioning MQTT] 📋 Attaching message handler (one-time only)...');
    wifiProvisioningClient.on('message', (messageTopic, message) => {
      // Prevent duplicate processing
      if (messageHandled) {
        console.log('[WiFi Provisioning MQTT] ⚠️ Message already handled, ignoring duplicate');
        return;
      }

      const timestamp = new Date().toLocaleTimeString('en-IN', { hour12: false });
      const messageStr = message.toString().trim();
      
      console.log('═══════════════════════════════════════');
      console.log(`[${timestamp}] 📨 📨 📨 MQTT MESSAGE RECEIVED! 📨 📨 📨`);
      console.log(`[WiFi Provisioning MQTT] Topic: ${messageTopic}`);
      console.log(`[WiFi Provisioning MQTT] Raw Message: "${messageStr}"`);
      console.log(`[WiFi Provisioning MQTT] Expected Topic: ${topic}`);
      console.log(`[WiFi Provisioning MQTT] Expected Message: "connected"`);
      console.log('═══════════════════════════════════════');
      
      // Check if message is from the correct topic
      if (messageTopic !== topic) {
        console.log(`[WiFi Provisioning MQTT] ⚠️ Message from different topic, ignoring`);
        return;
      }
      
      // Check for "connected" message (lowercase only - SINGLE SOURCE OF TRUTH)
      if (messageStr === 'connected') {
        // Mark as handled immediately to prevent any duplicate processing
        messageHandled = true;
        
        console.log('');
        console.log('✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅');
        console.log('✅ ✅ ✅ DEVICE WIFI CONNECTED SUCCESSFULLY! ✅ ✅ ✅');
        console.log('✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅');
        console.log(`[${timestamp}] Device successfully connected to WiFi network`);
        console.log(`[WiFi Provisioning MQTT] Topic: ${messageTopic}`);
        console.log(`[WiFi Provisioning MQTT] Message: "${messageStr}"`);
        console.log('✅ Device is now online and ready!');
        console.log('✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅');
        console.log('');
        
        // IMMEDIATE CLEANUP: Remove message listener before calling callback
        console.log('[WiFi Provisioning MQTT] 🧹 Removing message listener to prevent duplicates...');
        wifiProvisioningClient?.removeAllListeners('message');
        
        // Call callback to update UI (only once)
        if (wifiProvisioningCallback) {
          console.log('[WiFi Provisioning MQTT] 📱 📱 📱 CALLING CALLBACK TO UPDATE UI... 📱 📱 📱');
          try {
            wifiProvisioningCallback('CONNECTED');
            console.log('[WiFi Provisioning MQTT] ✅ Callback executed successfully');
          } catch (error) {
            console.error('[WiFi Provisioning MQTT] ❌ Error executing callback:', error);
            console.error('[WiFi Provisioning MQTT] Error stack:', (error as Error).stack);
          }
        } else {
          console.error('[WiFi Provisioning MQTT] ❌ ❌ ❌ CALLBACK NOT FOUND! ❌ ❌ ❌');
        }
      } else {
        console.log(`[WiFi Provisioning MQTT] ⚠️ ⚠️ ⚠️ UNEXPECTED MESSAGE ⚠️ ⚠️ ⚠️`);
        console.log(`[WiFi Provisioning MQTT] Received: "${messageStr}"`);
        console.log(`[WiFi Provisioning MQTT] Expected: "connected" (lowercase)`);
        console.log(`[WiFi Provisioning MQTT] Message ignored - waiting for exact match`);
      }
    });
    console.log('[WiFi Provisioning MQTT] ✅ Message handler attached (one-time only)');

    wifiProvisioningClient.on('connect', (connack) => {
      console.log('═══════════════════════════════════════');
      console.log('[WiFi Provisioning MQTT] ✅ ✅ ✅ CONNECTED SUCCESSFULLY! ✅ ✅ ✅');
      console.log(`[WiFi Provisioning MQTT] Connack:`, JSON.stringify(connack, null, 2));
      console.log(`[WiFi Provisioning MQTT] Connection State:`, wifiProvisioningClient?.connected ? 'CONNECTED' : 'NOT CONNECTED');
      console.log(`[WiFi Provisioning MQTT] Serial Number: ${serialNumber}`);
      console.log(`[WiFi Provisioning MQTT] Callback registered: ${wifiProvisioningCallback ? 'YES' : 'NO'}`);
      console.log('═══════════════════════════════════════');
      
      // Subscribe to WiFi provisioning topic (SINGLE SOURCE OF TRUTH)
      if (wifiProvisioningClient) {
        const topic = `device/${serialNumber}/status`;
        console.log(`[WiFi Provisioning MQTT] 📡 Subscribing to topic: ${topic}`);
        wifiProvisioningClient.subscribe(topic, { qos: 0 }, (err, granted) => {
          if (!err) {
            console.log('═══════════════════════════════════════');
            console.log(`[WiFi Provisioning MQTT] ✅ ✅ ✅ SUBSCRIBED SUCCESSFULLY! ✅ ✅ ✅`);
            console.log(`[WiFi Provisioning MQTT] Topic: ${topic}`);
            console.log(`[WiFi Provisioning MQTT] Granted:`, JSON.stringify(granted, null, 2));
            console.log('[WiFi Provisioning MQTT] 📡 📡 📡 LISTENING FOR "connected" MESSAGE... 📡 📡 📡');
            console.log('[WiFi Provisioning MQTT] ⚠️ Make sure device publishes to this exact topic');
            console.log('═══════════════════════════════════════');
          } else {
            console.error('═══════════════════════════════════════');
            console.error(`[WiFi Provisioning MQTT] ❌ ❌ ❌ SUBSCRIPTION FAILED! ❌ ❌ ❌`);
            console.error(`[WiFi Provisioning MQTT] Error:`, err);
            console.error(`[WiFi Provisioning MQTT] Topic attempted: ${topic}`);
            console.error('═══════════════════════════════════════');
          }
        });
      }
    });

    wifiProvisioningClient.on('error', (error) => {
      console.error('═══════════════════════════════════════');
      console.error('[WiFi Provisioning MQTT] ❌ ❌ ❌ CONNECTION ERROR! ❌ ❌ ❌');
      console.error('[WiFi Provisioning MQTT] Error:', error);
      console.error('[WiFi Provisioning MQTT] Error details:', {
        message: error.message,
        code: (error as any).code,
        errno: (error as any).errno,
        stack: (error as Error).stack,
      });
      console.error('[WiFi Provisioning MQTT] ⚠️ Troubleshooting:');
      console.error('[WiFi Provisioning MQTT]    1. Check internet connection');
      console.error('[WiFi Provisioning MQTT]    2. Verify broker URL: ws://172.236.188.162:8083');
      console.error('[WiFi Provisioning MQTT]    3. Check Android Network Security Config');
      console.error('[WiFi Provisioning MQTT]    4. Verify cleartext traffic is allowed');
      console.error('[WiFi Provisioning MQTT]    5. Check if WebSocket port 8083 is accessible');
      console.error('═══════════════════════════════════════');
    });

    wifiProvisioningClient.on('reconnect', () => {
      console.log('[WiFi Provisioning MQTT] 🔄 🔄 🔄 Attempting to reconnect... 🔄 🔄 🔄');
    });

    wifiProvisioningClient.on('offline', () => {
      console.warn('[WiFi Provisioning MQTT] ⚠️ ⚠️ ⚠️ CLIENT IS OFFLINE ⚠️ ⚠️ ⚠️');
    });

    wifiProvisioningClient.on('close', () => {
      console.log('[WiFi Provisioning MQTT] 🔌 Connection closed');
    });

    return wifiProvisioningClient;
  } catch (error) {
    console.error('[WiFi Provisioning MQTT] ❌ Failed to create client:', error);
    console.error('[WiFi Provisioning MQTT] Error stack:', (error as Error).stack);
    return null;
  }
};

/**
 * Disconnect from WiFi Provisioning MQTT broker
 * Ensures complete cleanup: removes all listeners, disconnects client, clears callbacks
 */
export const disconnectWiFiProvisioningMQTT = () => {
  if (wifiProvisioningClient) {
    console.log('[WiFi Provisioning MQTT] 🧹 Disconnecting and cleaning up...');
    
    // Remove all event listeners to prevent any further callbacks
    wifiProvisioningClient.removeAllListeners('message');
    wifiProvisioningClient.removeAllListeners('connect');
    wifiProvisioningClient.removeAllListeners('error');
    wifiProvisioningClient.removeAllListeners('reconnect');
    wifiProvisioningClient.removeAllListeners('offline');
    wifiProvisioningClient.removeAllListeners('close');
    
    // Disconnect the client
    wifiProvisioningClient.end();
    
    // Clear all references
    wifiProvisioningClient = null;
    wifiProvisioningCallback = null;
    wifiProvisioningSerialNumber = null;
    
    console.log('[WiFi Provisioning MQTT] ✅ Cleanup complete - all listeners removed, client disconnected');
  }
};

/**
 * Check if WiFi Provisioning MQTT is connected
 */
export const isWiFiProvisioningMQTTConnected = (): boolean => {
  return wifiProvisioningClient !== null && wifiProvisioningClient.connected === true;
};

