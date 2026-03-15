import mqtt, { MqttClient } from 'mqtt';

const MQTT_BROKER_HOST = '172.236.188.162';
const MQTT_BROKER_WS_PORT = 8083;
const MQTT_BROKER_URL = `ws://${MQTT_BROKER_HOST}:${MQTT_BROKER_WS_PORT}`;
const MQTT_USERNAME = 'doze';
const MQTT_PASSWORD = 'bK67ZwBHSWkl';

export type WiFiProvisioningCallback = (status: 'CONNECTED') => void;

let mqttClient: MqttClient | null = null;
let provisioningCallback: WiFiProvisioningCallback | null = null;
let messageHandled = false;

export const connectToWiFiProvisioningMQTT = (
  serialNumber: string,
  onConnected?: WiFiProvisioningCallback
): MqttClient | null => {
  if (!serialNumber) {
    console.error('[MQTT] Serial number required');
    return null;
  }

  if (mqttClient) {
    mqttClient.removeAllListeners();
    mqttClient.end();
    mqttClient = null;
  }

  messageHandled = false;
  provisioningCallback = onConnected || null;

  const topic = `device/${serialNumber}/status`;

  console.log('[MQTT] Serial Number:', serialNumber);
  console.log('[MQTT] Topic:', topic);
  console.log('[MQTT] Broker URL:', MQTT_BROKER_URL);

  try {
    const mqttOptions: any = {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: `react_native_${Math.random().toString(16).substring(2, 10)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 20000,
      keepalive: 60,
      protocol: 'ws',
      protocolVersion: 4,
      protocolId: 'MQTT',
      rejectUnauthorized: false,
      wsOptions: {
        rejectUnauthorized: false,
      },
    };

    console.log('[MQTT] Connection options:', {
      url: MQTT_BROKER_URL,
      username: MQTT_USERNAME,
      protocol: 'ws',
    });

    mqttClient = mqtt.connect(MQTT_BROKER_URL, mqttOptions);

    console.log('[MQTT] Client created, waiting for connection...');

    mqttClient.on('message', (messageTopic, message) => {
      console.log('[MQTT] Message received - Topic:', messageTopic, 'Expected:', topic);
      
      if (messageHandled) {
        return;
      }

      if (messageTopic !== topic) {
        console.log('[MQTT] Topic mismatch, ignoring');
        return;
      }

      const messageStr = message.toString().trim();
      console.log('[MQTT] Message content:', messageStr);

      if (messageStr === 'connected') {
        messageHandled = true;

        console.log('[MQTT] APK RECEIVED');
        console.log('[MQTT] WIFI CONNECTED');

        mqttClient?.removeAllListeners('message');

        if (provisioningCallback) {
          try {
            provisioningCallback('CONNECTED');
          } catch (error) {
            console.error('[MQTT] Callback error:', error);
          }
        }
      }
    });

    mqttClient.on('connect', () => {
      console.log('[MQTT] MQTT CONNECTED');

      if (mqttClient) {
        mqttClient.subscribe(topic, { qos: 0 }, (err) => {
          if (!err) {
            console.log('[MQTT] SUBSCRIBED');
          } else {
            console.error('[MQTT] Subscription failed:', err);
          }
        });
      }
    });

    mqttClient.on('error', (error) => {
      console.error('[MQTT] Connection error:', error);
      console.error('[MQTT] Error message:', error.message);
      console.error('[MQTT] Error code:', (error as any).code);
      console.error('[MQTT] Error stack:', (error as Error).stack);
      if ((error as any).errno) {
        console.error('[MQTT] Error errno:', (error as any).errno);
      }
      if ((error as any).syscall) {
        console.error('[MQTT] Error syscall:', (error as any).syscall);
      }
      if ((error as any).hostname) {
        console.error('[MQTT] Error hostname:', (error as any).hostname);
      }
      if ((error as any).port) {
        console.error('[MQTT] Error port:', (error as any).port);
      }
    });

    mqttClient.on('offline', () => {
      console.error('[MQTT] Client went offline');
      console.error('[MQTT] This usually means WebSocket handshake failed');
      console.error('[MQTT] Broker URL attempted:', MQTT_BROKER_URL);
      console.error('[MQTT] Possible causes:');
      console.error('[MQTT]   1. Broker does not support WebSocket on port 8083');
      console.error('[MQTT]   2. Network security config blocking connection');
      console.error('[MQTT]   3. Firewall blocking WebSocket');
      console.error('[MQTT]   4. Wrong WebSocket endpoint');
    });

    mqttClient.on('close', () => {
      console.error('[MQTT] Connection closed');
      console.error('[MQTT] Client connected state:', mqttClient?.connected);
    });

    mqttClient.on('reconnect', () => {
      console.log('[MQTT] Attempting to reconnect...');
    });

    mqttClient.on('end', () => {
      console.error('[MQTT] Connection ended');
    });

    setTimeout(() => {
      if (mqttClient) {
        console.log('[MQTT] Connection status after 2s:', mqttClient.connected ? 'CONNECTED' : 'NOT CONNECTED');
        if (!mqttClient.connected) {
          console.error('[MQTT] Still not connected after 2 seconds');
        }
      }
    }, 2000);

    return mqttClient;
  } catch (error) {
    console.error('[MQTT] Failed to create client:', error);
    return null;
  }
};

export const disconnectWiFiProvisioningMQTT = () => {
  if (mqttClient) {
    mqttClient.removeAllListeners();
    mqttClient.end();
    mqttClient = null;
    provisioningCallback = null;
    messageHandled = false;
  }
};

export const isWiFiProvisioningMQTTConnected = (): boolean => {
  return mqttClient !== null && mqttClient.connected === true;
};
