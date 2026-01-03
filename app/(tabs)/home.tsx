import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  Animated,
  RefreshControl,
  InteractionManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import Svg from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useDevice } from '@/contexts/DeviceContext';
import { useRouter } from 'expo-router';
import { getHealthData, getHistoricalData } from '@/services/deviceData';
// MQTT imports commented out - using WebSocket instead
// import { connectMQTT, disconnectMQTT, setupMQTTMessageHandler, isMQTTConnected } from '@/services/mqttService';
// import type { MqttClient } from 'mqtt';
import { connectWebSocket, disconnectWebSocket, isWebSocketConnected } from '@/services/websocketService';
import type { Socket } from 'socket.io-client';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RNSvg = require('react-native-svg');
const { Circle, Path, Rect } = RNSvg as { Circle: any; Path: any; Rect: any };
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const { width } = Dimensions.get('window');
const ITEM_WIDTH = width * 0.72 + 16;
const CIRCLE_SIZE = 160;
const STROKE_WIDTH = 10;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// NOTE: Home should not show mock/static values when device data is unavailable.

const MOCK_MEDITATIONS = [
  {
    id: '1',
    title: 'Druvbbal',
    subtitle: 'Instant Stress & Anxiety Buster',
    duration: '6 Min',
    image: require('../../assets/images/partial-react-logo.png'),
  },
  {
    id: '2',
    title: 'Calm Focus',
    subtitle: 'Deep focus in minutes',
    duration: '8 Min',
    image: require('../../assets/images/react-logo.png'),
  },
  {
    id: '3',
    title: 'Breath Ease',
    subtitle: 'Release tension gently',
    duration: '5 Min',
    image: require('../../assets/images/icon.png'),
  },
];

// small util: generate sample sparkline points
function genSparklinePoints(widthPx = 120, heightPx = 28, count = 10, min = 0, max = 100) {
  // Ensure count is at least 2 to generate valid SVG path
  const safeCount = Math.max(2, count);
  const values = Array.from({ length: safeCount }, () => Math.random() * (max - min) + min);
  const stepX = widthPx / (safeCount - 1);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = heightPx - ((v - minVal) / range) * heightPx;
    return `${x},${y}`;
  }).filter(p => p && p.includes(',')); // Filter out invalid points
  // Ensure we have at least 2 points
  if (points.length < 2) {
    // Generate at least 2 points if we don't have enough
    points.push(`${0},${heightPx / 2}`);
    points.push(`${widthPx},${heightPx / 2}`);
  }
  return { svgPoints: points.join(' '), raw: values };
}

// Mini bar chart component for Sleep card - simple white bars with varying heights
function MiniSleepChart({ width = 120, height = 32 }: { width?: number; height?: number }) {
  const barWidth = 10;
  const barSpacing = 6;
  const chartPadding = 4;
  const availableHeight = height - chartPadding * 2;
  
  // Varying bar heights to show it's a bar chart (up and down pattern)
  const barHeights = [0.85, 0.45, 0.70, 0.35, 0.90, 0.55, 0.65]; // percentages of available height

  return (
    <RNSvg.Svg width={width} height={height}>
      {barHeights.map((heightPercent, barIndex) => {
        const barX = chartPadding + barIndex * (barWidth + barSpacing);
        const barHeight = availableHeight * heightPercent;
        const barY = chartPadding + availableHeight - barHeight;

        return (
          <Rect
            key={`mini-bar-${barIndex}`}
            x={barX}
            y={barY}
            width={barWidth}
            height={barHeight}
            fill="rgba(255,255,255,0.9)"
            rx={2}
            ry={2}
          />
        );
      })}
    </RNSvg.Svg>
  );
}

// Mini bar chart component for Stress card - simple white bars with varying heights
function MiniStressChart({ width = 120, height = 32 }: { width?: number; height?: number }) {
  const barWidth = 10;
  const barSpacing = 6;
  const chartPadding = 4;
  const availableHeight = height - chartPadding * 2;
  
  // Varying bar heights to show it's a bar chart (up and down pattern)
  const barHeights = [0.60, 0.45, 0.70, 0.50, 0.65, 0.55, 0.75]; // percentages of available height

  return (
    <RNSvg.Svg width={width} height={height}>
      {barHeights.map((heightPercent, barIndex) => {
        const barX = chartPadding + barIndex * (barWidth + barSpacing);
        const barHeight = availableHeight * heightPercent;
        const barY = chartPadding + availableHeight - barHeight;

        return (
          <Rect
            key={`mini-stress-bar-${barIndex}`}
            x={barX}
            y={barY}
            width={barWidth}
            height={barHeight}
            fill="rgba(255,255,255,0.9)"
            rx={2}
            ry={2}
          />
        );
      })}
    </RNSvg.Svg>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { auth } = useAuth();
  const { activeDevice } = useDevice();
  const router = useRouter();
  const [sleepDate, setSleepDate] = React.useState(new Date());
  const [isDatePickerVisible, setDatePickerVisible] = React.useState(false);
  const [displayScore, setDisplayScore] = React.useState(0);
  const [isSwitcherOpen, setSwitcherOpen] = React.useState(false);
  
  // Real device data state
  const [latestHealthData, setLatestHealthData] = React.useState<any>(null);
  const [historicalData, setHistoricalData] = React.useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = React.useState(false);
  const [lastUpdateTime, setLastUpdateTime] = React.useState<Date | null>(null);
  // MQTT client replaced with WebSocket
  // const [mqttClient, setMqttClient] = React.useState<MqttClient | null>(null);
  // const [useMQTT, setUseMQTT] = React.useState(true);
  const [wsSocket, setWsSocket] = React.useState<Socket | null>(null);
  const [wsConnected, setWsConnected] = React.useState(false);
  // Force update counter to ensure React Native detects changes
  const [updateCounter, setUpdateCounter] = React.useState(0);
  const [lastStreamAt, setLastStreamAt] = React.useState<number | null>(null);

  const carouselRef = React.useRef<ScrollView | null>(null);
  const loopData = React.useMemo(() => {
    const first = MOCK_MEDITATIONS[0];
    const last = MOCK_MEDITATIONS[MOCK_MEDITATIONS.length - 1];
    return [last, ...MOCK_MEDITATIONS, first];
  }, []);
  const [carouselIndex, setCarouselIndex] = React.useState(1);
  const autoplayRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch device data (for initial load and fallback)
  const fetchDeviceData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    try {
      setIsLoadingData(true);
      
      // Fetch latest health data
      const healthResult = await getHealthData(activeDevice.deviceId, { limit: 1 });
      if (healthResult.success && healthResult.data && healthResult.data.length > 0) {
        setLatestHealthData(healthResult.data[0]);
        setLastUpdateTime(new Date());
      } else {
        // If backend returns no data, keep UI empty (no mock/static fallback)
        setLatestHealthData(null);
        setLastUpdateTime(null);
      }

      // Fetch historical data for charts
      const historyResult = await getHistoricalData(activeDevice.deviceId, '24h');
      if (historyResult.success && historyResult.data) {
        setHistoricalData(historyResult.data);
      } else {
        setHistoricalData([]);
      }
    } catch (error) {
      console.error('Failed to fetch device data:', error);
    } finally {
      setIsLoadingData(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn]);

  // Setup WebSocket connection (replacing MQTT)
  React.useEffect(() => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    const deviceId = activeDevice.deviceId;
    
    // Setup message handler for WebSocket
    const messageHandler = (data: any) => {
      setLastStreamAt(Date.now());
      
      // CRITICAL: Update state immediately for real-time updates
      // React Native will batch these updates automatically
      // Use functional state update to ensure React detects changes
      // Force update by always creating a new object with current timestamp
      const updateTimestamp = new Date();
      const updateKey = Date.now(); // Unique key for each update
      
      // CRITICAL: Update state in a way that React Native will definitely detect
      // Use functional update to ensure we always have latest previous values
      setLatestHealthData((prev: any) => {
        // Handle respiration data - prioritize new data, but keep previous if new is invalid/zero
        // Accept any positive value, or keep previous if new data is missing/zero
        const newRespiration = (data.respiration !== undefined && data.respiration > 0) 
          ? data.respiration 
          : ((data.resp !== undefined && data.resp > 0) 
              ? data.resp 
              : ((prev?.respiration && prev.respiration > 0) 
                  ? prev.respiration 
                  : ((prev?.resp && prev.resp > 0) 
                      ? prev.resp 
                      : 0)));
        
        // Create a completely new object with all fields to ensure reference change
        const newHealthData = {
          // Core health metrics (handle both formats: temp/hr/resp and temperature/heartRate/respiration)
          temperature: data.temperature !== undefined ? data.temperature : 
                       (data.temp !== undefined ? data.temp : (prev?.temperature ?? 0)),
          heartRate: data.heartRate !== undefined ? data.heartRate : 
                     (data.hr !== undefined ? data.hr : (prev?.heartRate ?? 0)),
          respiration: newRespiration,
          resp: newRespiration, // Also set resp field for compatibility
          stress: data.stress !== undefined ? data.stress : (prev?.stress ?? 0),
          hrv: data.hrv !== undefined ? data.hrv : (prev?.hrv ?? 0),
          
          // Environment metrics
          humidity: data.humidity !== undefined ? data.humidity : (prev?.humidity ?? 0),
          iaq: data.iaq !== undefined ? data.iaq : (prev?.iaq ?? 0),
          eco2: data.eco2 !== undefined ? data.eco2 : (prev?.eco2 ?? 0),
          tvoc: data.tvoc !== undefined ? data.tvoc : (prev?.tvoc ?? 0),
          etoh: data.etoh !== undefined ? data.etoh : (prev?.etoh ?? 0),
          
          // Additional fields - create new objects to ensure reference change
          metrics: data.metrics ? { ...data.metrics } : (prev?.metrics ? { ...prev.metrics } : {}),
          signals: data.signals ? { ...data.signals } : (prev?.signals ? { ...prev.signals } : {}),
          raw: data.raw ? { ...data.raw } : (prev?.raw ? { ...prev.raw } : {}),
          timestamp: updateTimestamp, // Always use new timestamp to force update
          _updateKey: updateKey, // Force React to detect change
        };
        
        // Always return a new object to ensure React Native detects the change
        return newHealthData;
      });
      
      // Update timestamp separately to trigger re-render (this is a separate state that always changes)
      setLastUpdateTime(updateTimestamp);
      
      // Force update counter to ensure useMemo recomputes
      setUpdateCounter(prev => prev + 1);
      
      // Update historical data array (keep only last 30 minutes - sliding window)
      setHistoricalData((prev) => {
        const now = updateTimestamp.getTime();
        const thirtyMinutesAgo = now - (30 * 60 * 1000); // 30 minutes in milliseconds
        
        const newDataPoint = {
          temperature: data.temperature ?? data.temp ?? 0,
          heartRate: data.heartRate ?? data.hr ?? 0,
          respiration: data.respiration ?? data.resp ?? 0,
          stress: data.stress ?? 0,
          hrv: data.hrv ?? 0,
          humidity: data.humidity ?? 0,
          iaq: data.iaq ?? 0,
          eco2: data.eco2 ?? 0,
          tvoc: data.tvoc ?? 0,
          etoh: data.etoh ?? 0,
          timestamp: updateTimestamp,
        };
        
        // Filter out old data points (older than 30 minutes) and add new point
        const filteredData = prev.filter((point) => {
          const pointTime = point.timestamp instanceof Date ? point.timestamp.getTime() : new Date(point.timestamp).getTime();
          return pointTime >= thirtyMinutesAgo;
        });
        
        // Add new point and ensure it's sorted by timestamp
        const newData = [...filteredData, newDataPoint].sort((a, b) => {
          const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
          const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
          return timeA - timeB;
        });
        
        return newData;
      });
    };

    // Connect to WebSocket server
    let socketInstance: Socket | null = null;
    const currentDeviceId = activeDevice.deviceId; // Capture deviceId to check if it changed
    
    connectWebSocket(currentDeviceId, messageHandler)
      .then((socket) => {
        // Check if device hasn't changed during connection
        if (activeDevice?.deviceId !== currentDeviceId) {
          if (socket) {
            disconnectWebSocket();
          }
          return;
        }
        
        if (socket) {
          socketInstance = socket;
          setWsSocket(socket);
          setWsConnected(socket.connected === true);
        }
      })
      .catch((error) => {
        console.error('[Home] WebSocket connection error:', error);
      });

    // Monitor connection status
    const checkConnection = setInterval(() => {
      // Check if device has changed
      if (activeDevice?.deviceId !== currentDeviceId) {
        clearInterval(checkConnection);
        disconnectWebSocket();
        setWsSocket(null);
        setWsConnected(false);
        setLastStreamAt(null);
        return;
      }
      
      const isConnected = isWebSocketConnected();
      setWsConnected(isConnected);
    }, 5000);

    // Initial fetch for historical data
    fetchDeviceData();

    // Cleanup on unmount or device change
    return () => {
      clearInterval(checkConnection);
      // Only disconnect if this is still the active device
      if (activeDevice?.deviceId === currentDeviceId) {
        disconnectWebSocket();
      }
      setWsSocket(null);
      setWsConnected(false);
      setLastStreamAt(null);
    };
  }, [activeDevice?.deviceId, auth.isLoggedIn]);

  // Keep wsConnected reactive to actual socket events (so dot/polling update immediately)
  React.useEffect(() => {
    if (!wsSocket) return;

    const onConnect = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    const onConnectError = () => setWsConnected(false);

    wsSocket.on('connect', onConnect);
    wsSocket.on('disconnect', onDisconnect);
    wsSocket.on('connect_error', onConnectError);

    // Initialize from current state
    setWsConnected(wsSocket.connected === true);

    return () => {
      wsSocket.off('connect', onConnect);
      wsSocket.off('disconnect', onDisconnect);
      wsSocket.off('connect_error', onConnectError);
    };
  }, [wsSocket]);

  /* MQTT CODE COMMENTED OUT - Using WebSocket instead
  // Setup MQTT connection (same as website)
  React.useEffect(() => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn || !useMQTT) {
      return;
    }

    console.log('[Home] Setting up MQTT connection for device:', activeDevice.deviceId);
    
    // Setup message handler FIRST (before connection) to ensure we catch all messages
    // This ensures React detects state changes even when values are similar
    const messageHandler = (data: any) => {
      // ... MQTT message handler code ...
    };

    // Connect to MQTT broker (this will also set up the message handler)
    const client = connectMQTT(activeDevice.deviceId);
    
    if (!client) {
      console.warn('[Home] Failed to create MQTT client, falling back to HTTP polling');
      setUseMQTT(false);
      return;
    }

    setMqttClient(client);

    // Setup message handler - attach it BEFORE connection completes
    // This ensures we catch messages as soon as they arrive
    setupMQTTMessageHandler(client, messageHandler);

    // Monitor connection status
    const checkConnection = setInterval(() => {
      if (client) {
        const isConnected = client.connected;
        console.log('[Home] MQTT connection status:', isConnected ? '🟢 Connected' : '🔴 Disconnected');
        if (!isConnected) {
          console.warn('[Home] MQTT disconnected, will attempt reconnect');
        }
      }
    }, 5000);

    // Initial fetch for historical data
    fetchDeviceData();

    // Cleanup on unmount or device change
    return () => {
      console.log('[Home] Cleaning up MQTT connection');
      clearInterval(checkConnection);
      disconnectMQTT();
      setMqttClient(null);
    };
  }, [activeDevice?.deviceId, auth.isLoggedIn, useMQTT]);
  */

  // Fallback: HTTP polling if WebSocket is not connected
  React.useEffect(() => {
    if (wsConnected) {
      return; // Don't poll if WebSocket is active
    }

    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    fetchDeviceData();
    
    // Poll for updates every 30 seconds (fallback mode)
    const pollInterval = setInterval(() => {
      fetchDeviceData();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [fetchDeviceData, wsConnected, activeDevice?.deviceId, auth.isLoggedIn]);

  /* MQTT FALLBACK CODE COMMENTED OUT
  // Fallback: HTTP polling if MQTT is disabled or fails
  React.useEffect(() => {
    if (!useMQTT || mqttClient) {
      return; // Don't poll if MQTT is active
    }

    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    console.log('[Home] Using HTTP polling fallback');
    fetchDeviceData();
    
    // Poll for updates every 30 seconds (fallback mode)
    const pollInterval = setInterval(() => {
      fetchDeviceData();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [fetchDeviceData, useMQTT, mqttClient, activeDevice?.deviceId, auth.isLoggedIn]);
  */

  React.useEffect(() => {
    requestAnimationFrame(() => {
      carouselRef.current?.scrollTo({ x: ITEM_WIDTH * 1, y: 0, animated: false });
    });

    autoplayRef.current = setInterval(() => {
      setCarouselIndex((prev) => {
        const next = prev + 1;
        carouselRef.current?.scrollTo({ x: ITEM_WIDTH * next, y: 0, animated: true });
        return next;
      });
    }, 3000);
    return () => {
      if (autoplayRef.current) clearInterval(autoplayRef.current);
    };
  }, []);

  const formattedDate = React.useMemo(() => {
    const d = sleepDate;
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday ? 'Today' : d.toLocaleDateString();
  }, [sleepDate]);

  const progressAnim = React.useRef(new Animated.Value(0)).current;
  const scoreAnim = React.useRef(new Animated.Value(0)).current;

  const hasAnyDeviceData = React.useMemo(() => {
    if (!latestHealthData) return false;
    const anyNonZero =
      (latestHealthData.heartRate ?? latestHealthData.hr ?? 0) > 0 ||
      (latestHealthData.respiration ?? latestHealthData.resp ?? 0) > 0 ||
      (latestHealthData.temperature ?? latestHealthData.temp ?? 0) > 0 ||
      (latestHealthData.humidity ?? 0) > 0 ||
      (latestHealthData.stress ?? 0) > 0 ||
      (latestHealthData.iaq ?? 0) > 0 ||
      (latestHealthData.eco2 ?? 0) > 0 ||
      (latestHealthData.tvoc ?? 0) > 0 ||
      (latestHealthData.etoh ?? 0) > 0;
    return anyNonZero;
  }, [latestHealthData]);

  // Calculate sleep score from latest data (if available)
  const sleepScore = React.useMemo(() => {
    if (!latestHealthData) return 0;
    
    // First, try to use SleepQuality from metrics if available (backend provides this)
    const sleepQuality = latestHealthData.metrics?.SleepQuality;
    if (sleepQuality !== undefined && sleepQuality !== null && sleepQuality > 0) {
      return Math.round(Math.max(0, Math.min(100, sleepQuality)));
    }
    
    // Fallback: Calculate based on multiple factors
    const hr = latestHealthData.heartRate || 0;
    const resp = latestHealthData.respiration || 0;
    const stress = latestHealthData.stress || 0;
    const hrv = latestHealthData.hrv || 0;
    
    // If there isn't enough data, keep UI empty (no mock/static fallback)
    if (hr === 0 || resp === 0) return 0;
    
    // Multi-factor sleep score calculation:
    // 1. Heart rate score (optimal: 50-70 BPM for sleep)
    let hrScore = 100;
    if (hr < 50 || hr > 100) {
      hrScore = Math.max(0, 100 - Math.abs(hr - 65) * 1.5);
    } else if (hr >= 50 && hr <= 70) {
      hrScore = 100; // Optimal range
    } else {
      hrScore = Math.max(0, 100 - (hr - 70) * 2);
    }
    
    // 2. Respiration score (optimal: 12-18 RPM)
    let respScore = 100;
    if (resp < 10 || resp > 24) {
      respScore = Math.max(0, 100 - Math.abs(resp - 16) * 3);
    } else if (resp >= 12 && resp <= 18) {
      respScore = 100; // Optimal range
    } else {
      respScore = Math.max(0, 100 - Math.abs(resp - 16) * 2);
    }
    
    // 3. Stress score (lower is better, 0-50 range)
    let stressScore = 100;
    if (stress > 0) {
      stressScore = Math.max(0, 100 - stress * 1.5);
    }
    
    // 4. HRV score (higher is generally better for sleep, but depends on baseline)
    let hrvScore = 50; // Default neutral
    if (hrv > 0) {
      // HRV typically 300-1600ms, higher is better for recovery
      if (hrv >= 500) {
        hrvScore = 100;
      } else if (hrv >= 300) {
        hrvScore = 50 + ((hrv - 300) / 200) * 50; // Scale 300-500 to 50-100
      } else {
        hrvScore = (hrv / 300) * 50; // Scale 0-300 to 0-50
      }
    }
    
    // Weighted average: HR (30%), Respiration (30%), Stress (25%), HRV (15%)
    const finalScore = (
      hrScore * 0.30 +
      respScore * 0.30 +
      stressScore * 0.25 +
      hrvScore * 0.15
    );
    
    return Math.round(Math.max(0, Math.min(100, finalScore)));
  }, [latestHealthData]);

  React.useEffect(() => {
    // Keep empty (0) when there is no device data; no mock fallback.
    Animated.parallel([
      Animated.timing(progressAnim, {
        toValue: sleepScore / 100,
        duration: 1000,
        useNativeDriver: false,
      }),
      Animated.timing(scoreAnim, {
        toValue: sleepScore,
        duration: 1000,
        useNativeDriver: false,
      }),
    ]).start();

    const id = scoreAnim.addListener(({ value }) => {
      setDisplayScore(Math.round(value));
    });
    return () => scoreAnim.removeListener(id);
  }, [progressAnim, scoreAnim, sleepScore]);

  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  const activeName = auth.user?.name || auth.user?.email || 'User';
  const activeEmail = auth.user?.email || '';
  const initials = React.useMemo(() => {
    const base = activeName.trim() || activeEmail.trim();
    if (!base) return 'U';
    const parts = base.split(' ');
    const first = parts[0]?.[0] || base[0];
    const second = parts.length > 1 ? parts[1]?.[0] : '';
    return (first + (second || '')).toUpperCase();
  }, [activeName, activeEmail]);

  // Data for health section - 4 cards (using real data)
   // CRITICAL: Include updateCounter in dependencies to force recomputation
   const healthMetrics = React.useMemo(
     () => {
       const hr = latestHealthData?.heartRate || latestHealthData?.hr || 0;
       const resp = latestHealthData?.respiration || latestHealthData?.resp || 0;
       const stress = latestHealthData?.stress || 0;
       
       // Format stress level
       let stressText = '--';
       if (stress > 0) {
         if (stress < 30) stressText = 'Low';
         else if (stress < 60) stressText = 'Moderate';
         else stressText = 'High';
       }

       // Calculate sleep duration (mock for now, could be calculated from historical data)
       const sleepDuration = '--';

      const metrics = [
        { key: 'heartRate', name: 'Heart Rate', value: hr > 0 ? String(Math.round(hr)) : '--', unit: 'BPM', icon: '❤️', colors: ['#2B2E57', '#1B1E3D'] as const },
        { key: 'respiration', name: 'Respiration Rate', value: resp > 0 ? String(Math.round(resp)) : '--', unit: 'RPM', icon: '🫁', colors: ['#24425F', '#18253A'] as const },
        { key: 'stress', name: 'Stress', value: stressText, unit: '', icon: '😮‍💨', colors: ['#4A2B2B', '#1E1414'] as const },
        { key: 'sleep', name: 'Sleep', value: sleepDuration, unit: '', icon: '😴', colors: ['#2B2E57', '#1B1E3D'] as const },
      ];
       
      return metrics;
     },
     [latestHealthData, updateCounter] // Include updateCounter to force recomputation
   );

  // Data for environment section - only the specified cards (using real data)
   // CRITICAL: Include updateCounter in dependencies to force recomputation
   const envMetrics = React.useMemo(
     () => {
       const temp = latestHealthData?.temperature || latestHealthData?.temp || 0;
       const hum = latestHealthData?.humidity || 0;
       const iaq = latestHealthData?.iaq || 0;
       const eco2 = latestHealthData?.eco2 || 0;
       const tvoc = latestHealthData?.tvoc || 0;
       const etoh = latestHealthData?.etoh || 0;

       const metrics = [
         { key: 'temp', name: 'Temperature', value: temp > 0 ? temp.toFixed(1) : '--', unit: '°C', icon: '🌡️', colors: ['#2B2E57', '#1B1E3D'] as const },
         { key: 'hum', name: 'Humidity', value: hum > 0 ? String(Math.round(hum)) : '--', unit: '%', icon: '💧', colors: ['#24425F', '#18253A'] as const },
         { key: 'iaq', name: 'IAQ', value: iaq > 0 ? String(Math.round(iaq)) : '--', unit: '', icon: '🌬️', colors: ['#3A2C59', '#1D1430'] as const },
         { key: 'eco2', name: 'eCO₂', value: eco2 > 0 ? String(Math.round(eco2)) : '--', unit: 'ppm', icon: '🫧', colors: ['#29334D', '#121A2A'] as const },
         { key: 'tvoc', name: 'TVOC', value: tvoc > 0 ? String(Math.round(tvoc)) : '--', unit: 'ppb', icon: '☁️', colors: ['#2F2E4A', '#17162A'] as const },
         { key: 'etoh', name: 'ETOH', value: etoh > 0 ? etoh.toFixed(2) : '--', unit: 'ppb', icon: '🍷', colors: ['#2B2F3F', '#161925'] as const },
       ];
       
      return metrics;
     },
     [latestHealthData, updateCounter] // Include updateCounter to force recomputation
   );

  // Generate sparkline points from historical data
  const sparklines = React.useMemo(() => {
    const map: Record<string, { svgPoints: string; raw: number[] }> = {};
    
    if (historicalData.length === 0) {
      // No historical data: keep charts empty (no random/mock sparklines)
      return map;
    }

    // Map historical data to sparklines
    const dataMap: Record<string, number[]> = {
      heartRate: historicalData
        .map((d) => {
          const hr = d.heartRate ?? d.hr ?? null;
          return hr !== null && hr !== undefined && !isNaN(hr) ? Number(hr) : null;
        })
        .filter((v): v is number => v !== null && v > 0),
      respiration: historicalData
        .map(d => {
          const resp = d.respiration ?? d.resp ?? null;
          return resp !== null && resp !== undefined && !isNaN(resp) ? Number(resp) : null;
        })
        .filter((v): v is number => v !== null && v > 0),
      stress: historicalData.map(d => d.stress || 0).filter(v => v > 0),
      temp: historicalData.map(d => d.temperature || d.temp || 0).filter(v => v > 0),
      hum: historicalData.map(d => d.humidity || 0).filter(v => v > 0),
      iaq: historicalData.map(d => d.iaq || 0).filter(v => v > 0),
      eco2: historicalData.map(d => d.eco2 || 0).filter(v => v > 0),
      tvoc: historicalData.map(d => d.tvoc || 0).filter(v => v > 0),
      etoh: historicalData.map(d => d.etoh || 0).filter(v => v > 0),
    };

    [...healthMetrics, ...envMetrics].forEach((m) => {
      const values = dataMap[m.key] || [];
      if (values.length >= 2) {
        // Ensure we have at least 2 points for valid SVG path
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const stepX = 120 / (values.length - 1 || 1);
        const points = values.map((v, i) => {
          const x = i * stepX;
          const y = 28 - ((v - min) / range) * 28;
          return `${x},${y}`;
        }).filter(p => p && p.includes(',')); // Filter out invalid points
        
        // Ensure we have at least 2 valid points
        if (points.length >= 2) {
          map[m.key] = { svgPoints: points.join(' '), raw: values };
        } else {
          // Not enough valid points: keep empty (no random/mock fallback)
        }
      } else {
        // Not enough data: keep empty (no random/mock fallback)
      }
    });
    
    return map;
  }, [healthMetrics, envMetrics, historicalData]);


  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingData}
            onRefresh={fetchDeviceData}
            tintColor="#FFFFFF"
          />
        }
      >
        {/* --- Sleep Card --- */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Your Sleep</Text>
            <View style={styles.cardHeaderRight}>
              {activeDevice && (
                <View style={styles.deviceNameIndicator}>
                  <View
                    style={[
                      styles.deviceIndicatorDot,
                      wsConnected && lastStreamAt !== null ? styles.deviceIndicatorGreen : styles.deviceIndicatorYellow,
                    ]}
                  />
                  <Text style={styles.deviceNameText}>
                    {activeDevice.customName || activeDevice.deviceId}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.avatarPill}
                onPress={() => setSwitcherOpen(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.avatarText}>{initials}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.dateCenter} onPress={() => setDatePickerVisible(true)}>
            <Text style={styles.dateCenterText}>{formattedDate}</Text>
          </TouchableOpacity>

          {/* ---- Circular Progress ---- */}
          <View style={styles.gaugeContainer}>
            <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
              {/* Background track */}
              <Circle
                cx={CIRCLE_SIZE / 2}
                cy={CIRCLE_SIZE / 2}
                r={RADIUS}
                stroke="rgba(126,166,255,0.18)"
                strokeWidth={STROKE_WIDTH}
                fill="none"
              />
              {/* Progress arc */}
              <AnimatedCircle
                cx={CIRCLE_SIZE / 2}
                cy={CIRCLE_SIZE / 2}
                r={RADIUS}
                stroke="#7EA6FF"
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeDasharray={`${CIRCUMFERENCE}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                rotation={-90}
                originX={CIRCLE_SIZE / 2}
                originY={CIRCLE_SIZE / 2}
              />
            </Svg>

            <View style={styles.centerTextContainer}>
              <Text style={styles.gaugeScore}>{displayScore}</Text>
              <Text style={styles.gaugeCaption}>Sleep Score</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            {[
              { label: 'Duration', value: '--', iconName: 'time-outline' },
              { label: 'Heart Rate', value: hasAnyDeviceData ? `${Math.round(latestHealthData?.heartRate ?? latestHealthData?.hr ?? 0)}BPM` : '--', iconName: 'heart' },
              { label: 'Respiration', value: hasAnyDeviceData && (latestHealthData?.respiration > 0 || latestHealthData?.resp > 0) ? `${Math.round(latestHealthData?.respiration ?? latestHealthData?.resp ?? 0)}RPM` : '--', iconName: 'pulse-outline' },
              { label: 'Efficiency', value: '--', iconName: 'trending-up-outline' },
            ].map((m) => (
              <View key={m.label} style={styles.metricItem}>
                <Ionicons name={m.iconName as any} size={18} color="#C7D6FF" />
                <Text key={`metric-${m.label}-${updateCounter}`} style={styles.metricValue}>{m.value}</Text>
                <Text style={styles.metricLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* --- My Health Section (NEW Grid + Sparklines) --- */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My Health</Text>
        </View>

        <View style={styles.envCard}>
          {/* container for grid */}
          <View style={styles.envGrid}>
            {(() => {
              // split into rows of 2 (flex: 1 ensures consistent widths; marginHorizontal provides gaps)
              const rows = [];
              for (let i = 0; i < healthMetrics.length; i += 2) rows.push(healthMetrics.slice(i, i + 2));
              return rows.map((pair, rowIndex) => (
                <View key={`health-row-${rowIndex}`} style={styles.envRow}>
                  {pair.map((m) => {
                    const spark = sparklines[m.key];
                    const Container: any = m.key === 'sleep' || m.key === 'heartRate' || m.key === 'respiration' || m.key === 'stress' ? TouchableOpacity : View;
                    return (
                      <Container
                        key={m.key}
                        style={styles.envTile}
                        {...(m.key === 'sleep'
                          ? { activeOpacity: 0.85, onPress: () => router.push('/charts/sleep-insights') }
                          : m.key === 'heartRate'
                          ? { activeOpacity: 0.85, onPress: () => router.push('/charts/heart-rate-insights') }
                          : m.key === 'respiration'
                          ? { activeOpacity: 0.85, onPress: () => router.push('/charts/respiration-insights') }
                          : m.key === 'stress'
                          ? { activeOpacity: 0.85, onPress: () => router.push('/charts/stress-insights') }
                          : {})}
                      >
                        <LinearGradient colors={m.colors} style={styles.envTileBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                        <View style={styles.envTileInner}>
                          <View style={styles.envTopRow}>
                            <View style={[styles.envIconWrap, { marginRight: 4 }]}>
                              <Text style={styles.envIcon}>{m.icon}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.envName} numberOfLines={1} ellipsizeMode="tail">{m.name}</Text>
                            </View>
                            {/* small status dot (color-coded) */}
                            <View style={[styles.statusDot, { backgroundColor: '#7EA6FF' }]} />
                          </View>

                          <View style={styles.envValueRow}>
                            <Text key={`env-value-${m.key}-${updateCounter}`} style={styles.envValueNum}>{m.value}</Text>
                            <Text style={styles.envUnit}>{m.unit ? ` ${m.unit}` : ''}</Text>
                          </View>

                          {/* mini chart - bar chart for sleep and stress, sparkline for others */}
                          <View style={styles.sparklineWrap}>
                            {m.key === 'sleep' ? (
                              // No device data -> keep empty (no static chart)
                              hasAnyDeviceData ? <MiniSleepChart width={120} height={32} /> : null
                            ) : m.key === 'stress' ? (
                              hasAnyDeviceData ? <MiniStressChart width={120} height={32} /> : null
                            ) : (
                              <Svg height={28} width={120}>
                                {(() => {
                                  if (!spark || !spark.svgPoints) {
                                    return null;
                                  }
                                  
                                  const pts = spark.svgPoints.split(' ').filter(p => p.trim().length > 0);
                                  if (!pts.length || pts.length < 2) {
                                    return null;
                                  }
                                  
                                  // Ensure we have valid coordinates
                                  const validPts = pts.filter(pt => pt && pt.includes(','));
                                  if (validPts.length < 2) {
                                    return null;
                                  }
                                  
                                  const d = `M ${validPts[0]} L ${validPts.slice(1).join(' L ')}`;
                                  
                                  return (
                                    <Path
                                      d={d}
                                      fill="none"
                                      stroke="rgba(255,255,255,0.9)"
                                      strokeWidth={2}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      opacity={0.95}
                                    />
                                  );
                                })()}
                              </Svg>
                            )}
                          </View>
                        </View>
                      </Container>
                    );
                  })}

                  {/* if only one item in row, render a spacer to keep layout stable */}
                  {pair.length === 1 ? <View style={[styles.envTile, styles.emptyTile]} /> : null}
                </View>
              ));
            })()}
          </View>
        </View>

        {/* --- Environment Data (NEW Grid + Sparklines) --- */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Environment Data</Text>
        </View>

        <View style={styles.envCard}>
          {/* container for grid */}
          <View style={styles.envGrid}>
            {(() => {
              // split into rows of 2 (flex: 1 ensures consistent widths; marginHorizontal provides gaps)
              const rows = [];
              for (let i = 0; i < envMetrics.length; i += 2) rows.push(envMetrics.slice(i, i + 2));
              return rows.map((pair, rowIndex) => (
                <View key={`env-row-${rowIndex}`} style={styles.envRow}>
                  {pair.map((m) => {
                    const spark = sparklines[m.key];
                    return (
                      <View
                        key={m.key}
                        style={styles.envTile}
                      >
                        <LinearGradient colors={m.colors} style={styles.envTileBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
                        <View style={styles.envTileInner}>
                          <View style={styles.envTopRow}>
                            <View style={[styles.envIconWrap, { marginRight: 4 }]}>
                              <Text style={styles.envIcon}>{m.icon}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.envName} numberOfLines={1} ellipsizeMode="tail">{m.name}</Text>
                            </View>
                            {/* small status dot (color-coded) */}
                            <View style={[styles.statusDot, { backgroundColor: '#7EA6FF' }]} />
                          </View>

                          <View style={styles.envValueRow}>
                            <Text key={`env-value-${m.key}-${updateCounter}`} style={styles.envValueNum}>{m.value}</Text>
                            <Text style={styles.envUnit}>{m.unit ? ` ${m.unit}` : ''}</Text>
                          </View>

                          {/* mini sparkline */}
                           <View style={styles.sparklineWrap}>
                             <Svg height={28} width={120}>
                               {(() => {
                                 if (!spark || !spark.svgPoints) return null;
                                 const pts = spark.svgPoints.split(' ').filter(p => p.trim().length > 0);
                                 if (!pts.length || pts.length < 2) return null;
                                 // Ensure we have valid coordinates
                                 const validPts = pts.filter(pt => pt && pt.includes(','));
                                 if (validPts.length < 2) return null;
                                 const d = `M ${validPts[0]} L ${validPts.slice(1).join(' L ')}`;
                                 return (
                                   <Path
                                     d={d}
                                     fill="none"
                                     stroke="rgba(255,255,255,0.9)"
                                     strokeWidth={2}
                                     strokeLinecap="round"
                                     strokeLinejoin="round"
                                     opacity={0.95}
                                   />
                                 );
                               })()}
                             </Svg>
                          </View>
                        </View>
                      </View>
                    );
                  })}

                  {/* if only one item in row, render a spacer to keep layout stable */}
                  {pair.length === 1 ? <View style={[styles.envTile, styles.emptyTile]} /> : null}
                </View>
              ));
            })()}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        date={sleepDate}
        onConfirm={(d) => {
          setSleepDate(d);
          setDatePickerVisible(false);
        }}
        onCancel={() => setDatePickerVisible(false)}
      />

      {/* Profile Switcher Modal */}
      <Modal
        visible={isSwitcherOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setSwitcherOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={() => setSwitcherOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetAvatarLg}>
                <Text style={styles.avatarLgText}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetGreeting}>Hi, {activeName}!</Text>
                {!!activeEmail && <Text style={styles.sheetEmail}>{activeEmail}</Text>}
              </View>
            </View>

            <TouchableOpacity
              style={styles.manageBtn}
              onPress={() => {
                setSwitcherOpen(false);
                router.push('/(tabs)/profile');
              }}
            >
              <Text style={styles.manageText}>Manage your Account</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Accounts list: currently only active account */}
            <TouchableOpacity style={styles.accountRow} activeOpacity={0.8}>
              <View style={styles.accountAvatarSm}>
                <Text style={styles.avatarSmText}>{initials}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.accountName}>{activeName}</Text>
                {!!activeEmail && <Text style={styles.accountEmail}>{activeEmail}</Text>}
              </View>
              <Text style={styles.activeMark}>✓</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addAccountRow}
              onPress={() => {
                setSwitcherOpen(false);
                router.push('/(authentication)/signin');
              }}
            >
              <Text style={styles.addAccountText}>Add another account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manageDeviceRow}
              onPress={() => {
                setSwitcherOpen(false);
                router.push('/(tabs)/profile');
              }}
            >
              <Text style={styles.manageDeviceText}>Manage accounts on this device</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', width: '100%', height: '100%' },
  scrollContent: { paddingTop: 56, paddingHorizontal: 16 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceNameIndicator: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6,
    marginRight: 8,
  },
  deviceIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  deviceIndicatorGreen: {
    backgroundColor: '#4CAF50',
  },
  deviceIndicatorYellow: {
    backgroundColor: '#FFA500',
  },
  deviceNameText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  infoPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  infoText: { color: '#FFF', fontWeight: '700' },
  dateCenter: { alignItems: 'center', marginVertical: 8 },
  dateCenterText: { color: '#B7C2FF', fontSize: 14, fontWeight: '700' },
  gaugeContainer: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  centerTextContainer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  gaugeScore: { color: '#FFF', fontSize: 36, fontWeight: '800' },
  gaugeCaption: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  metricItem: { alignItems: 'center', width: (width - 16 * 2 - 12 * 3) / 4 },
  metricIcon: { width: 18, height: 18, marginBottom: 6, opacity: 0.8 },
  metricValue: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  metricLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  sectionHeaderRow: {
    marginTop: 20,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  viewAll: { color: '#7EA6FF', fontWeight: '700' },
  carouselContent: { paddingVertical: 8, paddingRight: 16 },
  meditationCard: {
    width: width * 0.72,
    marginRight: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  meditationImage: { height: 120, alignItems: 'center', justifyContent: 'center' },
  meditationThumb: { width: 72, height: 72, opacity: 0.9 },
  meditationTextBlock: { padding: 12 },
  meditationTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  meditationSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  meditationMeta: { color: '#B7C2FF', fontSize: 12, marginTop: 6, fontWeight: '700' },

  // Environment panel styles (updated)
  envCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  envGrid: {
    // parent container for rows
    width: '100%',
  },
  envRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  envTile: {
    flex: 1, // take equal width
    minHeight: 110,
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: 6, // gap between tiles
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyTile: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    opacity: 0,
  },
  envTileBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.22,
  },
  envTileInner: { flex: 1, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'space-between' },
  envTopRow: { flexDirection: 'row', alignItems: 'center' },
  envIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  envIcon: { fontSize: 16 },
  envName: { color: 'rgba(255,255,255,0.95)', fontSize: 13, fontWeight: '700', marginLeft: 4, flexShrink: 1 },
  envValueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  envValueNum: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  envUnit: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '700', marginLeft: 6, marginBottom: 2 },
  sparklineWrap: { marginTop: 8, alignItems: 'flex-start' },
  statusDot: { width: 10, height: 10, borderRadius: 6, marginLeft: 8 },

  chevWrap: { marginLeft: 6 },
  chev: { color: '#C7D6FF', fontSize: 16 },

  listItem: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  listIconTile: { width: 36, height: 36, borderRadius: 8, overflow: 'hidden', marginRight: 12 },
  listIconBg: { width: '100%', height: '100%' },
  listTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', flex: 1 },
  chevron: { color: 'rgba(255,255,255,0.8)', fontSize: 22, marginLeft: 8 },

  healthCard: {
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  healthRow: {
    marginBottom: 16,
  },
  healthLabel: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  healthBar: {
    height: 8,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  healthTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
  },
  healthFill: {
    height: 8,
    borderRadius: 8,
  },
  healthValue: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },

  // Profile switcher styles
  avatarPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  avatarText: { color: '#FFF', fontWeight: '800', fontSize: 12 },

  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: '#0F112B',
    padding: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sheetAvatarLg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginRight: 12,
  },
  avatarLgText: { color: '#FFF', fontWeight: '900', fontSize: 20 },
  sheetGreeting: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  sheetEmail: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
  manageBtn: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, marginBottom: 8 },
  manageText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 8 },
  accountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  accountAvatarSm: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)', marginRight: 10 },
  avatarSmText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  accountName: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  accountEmail: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  activeMark: { color: '#C7B9FF', fontSize: 16, fontWeight: '900' },
  addAccountRow: { paddingVertical: 12 },
  addAccountText: { color: '#C7B9FF', fontWeight: '800' },
  manageDeviceRow: { paddingVertical: 10 },
  manageDeviceText: { color: 'rgba(255,255,255,0.8)' },
});
