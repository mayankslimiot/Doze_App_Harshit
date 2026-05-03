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
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import Svg from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { useAuth } from '@/contexts/AuthContext';
import { useDevice } from '@/contexts/DeviceContext';
import { useBoot } from '@/contexts/BootContext';
import { useRouter } from 'expo-router';
import { HealthGauge } from '@/components/HealthGauge';
import {
  calculateBMI,
  calculateWaistHeightRatio,
  calculateABSI,
  getBMIScore,
  getWaistHeightRatioScore,
  getABSIScore,
  calculateOverallBodyIndex,
  calculateAge,
  HINTS,
} from '@/utils/bodyMetrics';
import { API_BASE_URL } from '@/services/api';
import { getHealthData, getHistoricalData, getStressGraph, updateDeviceName, deleteDevice, activateDevice, removeSharedDevice, cleanupLocalBleStores } from '@/services/deviceData';
import { getSleepSession, getSleepSessions, calculateSleepSession, type SleepSession } from '@/services/sleepAnalytics';
// MQTT imports commented out - using WebSocket instead
// import { connectMQTT, disconnectMQTT, setupMQTTMessageHandler, isMQTTConnected } from '@/services/mqttService';
// import type { MqttClient } from 'mqtt';
import { connectWebSocket, disconnectWebSocket, isWebSocketConnected, unsubscribeFromDevice } from '@/services/websocketService';
import type { Socket } from 'socket.io-client';
import { addRawPoint } from '@/services/heartRateBuffer';
import { prepareDayGraph, clearDayGraphState } from '@/services/dayGraphManager';
import { addRawPoint as addRespirationRawPoint } from '@/services/respirationBuffer';
import { prepareRespirationGraph, clearRespirationGraphState } from '@/services/respirationGraphManager';
import { addRawPoint as addStressRawPoint } from '@/services/stressBuffer';
import { prepareStressGraph, clearStressGraphState } from '@/services/stressGraphManager';
import { processHeartRateReading } from '@/services/heartRateNotifications';
import { processRespirationReading } from '@/services/respirationNotifications';
import { useFont } from '@shopify/react-native-skia';

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

function CalculatedIndexRow({
  label,
  subtitle,
  value,
  score,
  onInfoPress
}: {
  label: string;
  subtitle?: string;
  value: string;
  score: number;
  onInfoPress?: () => void;
}) {
  return (
    <View style={styles.calculatedIndexCard}>
      <View style={styles.calculatedIndexHeader}>
        <View style={styles.calculatedIndexLabelContainer}>
          <Text style={styles.calculatedIndexLabel}>{label}</Text>
          {subtitle ? <Text style={styles.calculatedIndexSubtitle}>{subtitle}</Text> : null}
        </View>
        <TouchableOpacity onPress={onInfoPress} style={styles.infoIcon}>
          <Ionicons name="information-circle-outline" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>
      <View style={styles.calculatedIndexContent}>
        <View style={styles.calculatedIndexGaugeContainer}>
          <HealthGauge score={score} size={84} />
          <Text style={styles.calculatedIndexScore}>{score.toFixed(1)}</Text>
        </View>
        <Text style={styles.calculatedIndexValue}>{value}</Text>
      </View>
    </View>
  );
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
  const { activeDevice, devices, ownedDevices, sharedDevices, refreshDevices, setActiveDevice } = useDevice();
  const router = useRouter();

  // FIXED: Prevent double-tap navigation with a more robust lock
  const isNavigatingRef = React.useRef(false);
  const debouncedPush = React.useCallback((path: string) => {
    if (isNavigatingRef.current) {
      console.log('[Home] Navigation blocked - already in progress');
      return;
    }

    console.log('[Home] Navigating to:', path);
    isNavigatingRef.current = true;
    router.push(path as any);

    // Reset the lock after a longer delay to ensure the new screen is fully mounted
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 1000);
  }, [router]);

  // Preload chart font early so axes are ready when graph loads
  // This font is cached by React Native Skia, so chart screens will use the cached version
  const chartFont = useFont(require('../../assets/fonts/SpaceMono-Regular.ttf'), 9);

  // TEMP: Log mount/unmount to verify component lifecycle
  React.useEffect(() => {
    console.log('✅ [Home] MOUNT');
    return () => {
      console.log('❌ [Home] UNMOUNT');
    };
  }, []);

  // Log font loading status for debugging
  React.useEffect(() => {
    if (chartFont) {
      console.log('[Home] Chart font preloaded successfully');
    }
  }, [chartFont]);

  // Redirect to setup only when user has no devices AND has not skipped setup (setupSeen = false)
  const { setupSeen } = useBoot();
  React.useEffect(() => {
    if (devices !== null && devices.length === 0 && !setupSeen) {
      router.replace('/setup');
    }
  }, [devices, setupSeen, router]);

  // Clear Day graph state when device changes
  // FIXED: Reset data loaded flag when device changes
  React.useEffect(() => {
    if (activeDevice?.deviceId) {
      // Reset data loaded flag when device changes
      if (didInitialFetchRef.current !== activeDevice.deviceId) {
        didInitialFetchRef.current = null; // Reset flag for new device
        
        // MANDATORY: Clear dashboard state whenever device changes
        // This prevents showing stale data from the previously active device
        console.log('[Home] Device changed, resetting dashboard state');
        setLatestHealthData(null);
        setHistoricalData([]);
        setActiveSleepSession(null);
      }
      return () => {
        // Cleanup: clear Day graph state when device changes
        clearDayGraphState(activeDevice.deviceId);
        clearRespirationGraphState(activeDevice.deviceId);
      };
    } else {
      // Reset flag if no device
      didInitialFetchRef.current = null;
      setLatestHealthData(null);
      setHistoricalData([]);
      setActiveSleepSession(null);
    }
  }, [activeDevice?.deviceId]);
  const [sleepDate, setSleepDate] = React.useState(new Date());
  const [isDatePickerVisible, setDatePickerVisible] = React.useState(false);
  const [displayScore, setDisplayScore] = React.useState(0);
  const [isSwitcherOpen, setSwitcherOpen] = React.useState(false);

  // Device editing state
  const [editingDeviceId, setEditingDeviceId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState<string>('');
  const [isSavingName, setIsSavingName] = React.useState(false);
  const [isDeletingDevice, setIsDeletingDevice] = React.useState(false);
  const [nameError, setNameError] = React.useState<string>('');
  const [isSwitchingDevice, setIsSwitchingDevice] = React.useState(false);
  const [switchingDeviceId, setSwitchingDeviceId] = React.useState<string | null>(null);

  // Real device data state
  const [latestHealthData, setLatestHealthData] = React.useState<any>(null);
  const [historicalData, setHistoricalData] = React.useState<any[]>([]);
  const [activeSleepSession, setActiveSleepSession] = React.useState<SleepSession | null>(null);
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

  // Track last stress data received time (for 9-minute fallback)
  const lastStressDataTimeRef = React.useRef<number | null>(null);

  // Track if data has been initially loaded per deviceId to prevent refetch on tab switch
  const didInitialFetchRef = React.useRef<string | null>(null);

  // Store token in ref to prevent effect reruns when token reference changes
  const tokenRef = React.useRef<string | null>(auth.token || null);
  React.useEffect(() => {
    tokenRef.current = auth.token || null;
  }, [auth.token]);

  const carouselRef = React.useRef<ScrollView | null>(null);
  const loopData = React.useMemo(() => {
    const first = MOCK_MEDITATIONS[0];
    const last = MOCK_MEDITATIONS[MOCK_MEDITATIONS.length - 1];
    return [last, ...MOCK_MEDITATIONS, first];
  }, []);
  const [carouselIndex, setCarouselIndex] = React.useState(1);
  const autoplayRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch device data (for initial load and fallback)
  // Only fetch if data not already loaded to prevent reload on tab switch
  const fetchDeviceData = React.useCallback(async (forceRefresh = false) => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    // Guard: Don't refetch if data already loaded for this device and not forcing refresh
    if (!forceRefresh && didInitialFetchRef.current === activeDevice.deviceId) {
      console.log('[Home] Skipping fetchDeviceData - data already loaded for device:', activeDevice.deviceId);
      return;
    }

    try {
      setIsLoadingData(true);
      console.log('[Home] fetchDeviceData called', { deviceId: activeDevice.deviceId, forceRefresh });

      // Fetch latest health data
      const healthResult = await getHealthData(activeDevice.deviceId, { limit: 1 });
      if (healthResult.success && healthResult.data && healthResult.data.length > 0) {
        // Include _deviceId metadata for consistent merging logic in messageHandler
        setLatestHealthData({ 
          ...healthResult.data[0], 
          _deviceId: activeDevice.deviceId 
        });
        setLastUpdateTime(new Date());
        didInitialFetchRef.current = activeDevice.deviceId; // Mark as fetched for this device
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

      // Fetch latest sleep session (look back 24h to find most recent)
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const sleepResult = await getSleepSessions(activeDevice.deviceId, twentyFourHoursAgo, now);
      if (sleepResult.success && sleepResult.data && sleepResult.data.length > 0) {
        // Data is usually sorted by date, get the last one (most recent)
        const sessions = [...sleepResult.data].sort((a, b) => 
          new Date(a.sessionDate).getTime() - new Date(b.sessionDate).getTime()
        );
        setActiveSleepSession(sessions[sessions.length - 1]);
      } else {
        // Fallback: try to calculate for today specifically if no sessions found
        const dateStr = now.toISOString().split('T')[0];
        const calcResult = await calculateSleepSession(activeDevice.deviceId, dateStr);
        if (calcResult.success && calcResult.data) {
          setActiveSleepSession(calcResult.data);
        } else {
          setActiveSleepSession(null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch device data:', error);
    } finally {
      setIsLoadingData(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn]); // FIXED: Removed latestHealthData from deps

  // Setup WebSocket connection (replacing MQTT)
  // FIXED: Only depends on deviceId, not auth.token to prevent reruns on tab switch
  React.useEffect(() => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    const deviceId = activeDevice.deviceId;
    console.log('[Home] WebSocket effect running', { deviceId, isLoggedIn: auth.isLoggedIn });

    // Setup message handler for WebSocket
    const messageHandler = (data: any) => {
      setLastStreamAt(Date.now());

      // Feed raw heart rate data to shared buffer (for graph)
      // Handle null values (gaps) and valid heart rate values
      const heartRateValue = data.heartRate ?? data.hr ?? data.bpm ?? null;

      // Extract timestamp
      let timestamp: number;
      if (data.timestamp) {
        timestamp = new Date(data.timestamp).getTime();
      } else if (data.timestampSeconds) {
        timestamp = data.timestampSeconds * 1000;
      } else {
        timestamp = Date.now();
      }

      // Process heart rate value: null = gap, 0 = invalid (treat as gap), valid range = 0 < value < 250
      let processedValue: number | null = null;

      if (heartRateValue === null) {
        // Explicit null from backend = gap
        processedValue = null;
      } else if (heartRateValue === 0) {
        // 0 is invalid, treat as gap (should not happen if backend is fixed)
        processedValue = null;
      } else if (Number.isFinite(heartRateValue) && heartRateValue > 0 && heartRateValue < 250) {
        // Valid heart rate value
        processedValue = Number(heartRateValue);
      } else {
        // Invalid value, skip
        return;
      }

      // Add point to buffer (including null gaps)
      addRawPoint(deviceId, timestamp, processedValue);

      // Process heart rate for notifications (only if value is valid, not null)
      if (processedValue !== null) {
        processHeartRateReading(processedValue, deviceId).catch((error) => {
          console.error('[Home] Error processing heart rate notification:', error);
        });
      }

      // Feed raw respiration data to shared buffer (for graph)
      // Handle null values (gaps) like heart rate - when no human detected
      const respirationValue = data.respiration ?? data.resp ?? null;

      // Reuse timestamp already extracted above for heart rate (same message)

      // Process respiration value: null = gap, valid range = 0 < value < 50
      let processedRespirationValue: number | null = null;

      if (respirationValue === null) {
        // Explicit null from backend = gap (no human detected)
        processedRespirationValue = null;
      } else if (respirationValue === 0) {
        // 0 is invalid, treat as gap
        processedRespirationValue = null;
      } else if (Number.isFinite(respirationValue) && respirationValue > 0 && respirationValue < 50) {
        // Valid respiration value
        processedRespirationValue = Number(respirationValue);
      } else {
        // Invalid value, skip
        return;
      }

      // Add to buffer (including null gaps)
      addRespirationRawPoint(deviceId, timestamp, processedRespirationValue);

      // Process respiration for notifications (only if value is valid, not null)
      if (processedRespirationValue !== null) {
        processRespirationReading(processedRespirationValue, deviceId).catch((error) => {
          console.error('[Home] Error processing respiration notification:', error);
        });
      }

      // Feed raw stress data to shared buffer (for graph)
      // Handle both direct stress field and payload.stress_level from streamType "180s"
      const stressValue = data.stress ?? data.stress_level ?? (data.payload?.stress_level) ?? null;
      if (stressValue != null) {
        // Parse stress_level as float (can be string from DB)
        const parsedValue = typeof stressValue === 'string' ? parseFloat(stressValue) : Number(stressValue);
        if (!isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= 100) {
          let timestamp: number;
          if (data.timestamp) {
            timestamp = new Date(data.timestamp).getTime();
          } else if (data.timestampSeconds) {
            timestamp = data.timestampSeconds * 1000;
          } else if (data.payload?.timestamp) {
            timestamp = new Date(data.payload.timestamp).getTime();
          } else {
            timestamp = Date.now();
          }
          console.log('[Home] 📊 Stress point received via WebSocket:', {
            deviceId,
            value: parsedValue,
            timestamp: new Date(timestamp).toISOString(),
            source: data.stress ? 'data.stress' : data.stress_level ? 'data.stress_level' : 'data.payload.stress_level',
          });
          addStressRawPoint(deviceId, timestamp, parsedValue);
          // Update last stress data time for fallback check
          lastStressDataTimeRef.current = Date.now();
        } else {
          console.log('[Home] ⚠️ Invalid stress value received:', {
            deviceId,
            rawValue: stressValue,
            parsedValue,
            isValid: !isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= 100,
          });
        }
      } else {
        // Log when stress data is expected but missing (only in debug mode)
        if (__DEV__ && (data.respiration != null || data.heartRate != null)) {
          console.log('[Home] 🔍 WebSocket data received but no stress field:', {
            deviceId,
            hasRespiration: data.respiration != null,
            hasHeartRate: data.heartRate != null,
            hasStress: data.stress != null,
            hasStressLevel: data.stress_level != null,
            hasPayloadStress: data.payload?.stress_level != null,
            keys: Object.keys(data),
          });
        }
      }

      // CRITICAL: Update state immediately for real-time updates
      // React Native will batch these updates automatically
      // Use functional state update to ensure React detects changes
      // Force update by always creating a new object with current timestamp
      const updateTimestamp = new Date();
      const updateKey = Date.now(); // Unique key for each update

      // CRITICAL: Update state in a way that React Native will definitely detect
      // Use functional update to ensure we always have latest previous values
      setLatestHealthData((prev: any) => {
        // Refined Merging: Ensure we ONLY merge with previous state if it belongs to the SAME device
        // This prevents blending data from two different devices during a transition
        const prevDeviceId = prev?._deviceId;
        const currentActiveDeviceId = activeDevice?.deviceId;
        
        const isSameDevice = prevDeviceId && currentActiveDeviceId && prevDeviceId === currentActiveDeviceId;
        const safePrev = isSameDevice ? prev : null;

        if (!isSameDevice && prevDeviceId) {
          console.log('[Home] ⚠️ WebSocket data received for new device, ignoring previous state from:', prevDeviceId);
        }

        // Handle respiration data - prioritize new data, but keep previous if new is invalid/zero
        // Accept any positive value, or keep previous if new data is missing/zero
        const newRespiration = (data.respiration !== undefined && data.respiration > 0)
          ? data.respiration
          : ((data.resp !== undefined && data.resp > 0)
            ? data.resp
            : ((safePrev?.respiration && safePrev.respiration > 0)
              ? safePrev.respiration
              : ((safePrev?.resp && safePrev.resp > 0)
                ? safePrev.resp
                : 0)));

        // Create a completely new object with all fields to ensure reference change
        const newHealthData = {
          // Metadata for tracking
          _deviceId: currentActiveDeviceId,

          // Core health metrics (handle both formats: temp/hr/resp and temperature/heartRate/respiration)
          temperature: data.temperature !== undefined ? data.temperature :
            (data.temp !== undefined ? data.temp : (safePrev?.temperature ?? 0)),
          heartRate: data.heartRate !== undefined ? data.heartRate :
            (data.hr !== undefined ? data.hr : (safePrev?.heartRate ?? 0)),
          respiration: newRespiration,
          resp: newRespiration, // Also set resp field for compatibility
          stress: data.stress !== undefined ? data.stress : (safePrev?.stress ?? 0),
          hrv: data.hrv !== undefined ? data.hrv : (safePrev?.hrv ?? 0),

          // Environment metrics
          humidity: data.humidity !== undefined ? data.humidity : (safePrev?.humidity ?? 0),
          iaq: data.iaq !== undefined ? data.iaq : (safePrev?.iaq ?? 0),
          eco2: data.eco2 !== undefined ? data.eco2 : (safePrev?.eco2 ?? 0),
          tvoc: data.tvoc !== undefined ? data.tvoc : (safePrev?.tvoc ?? 0),
          etoh: data.etoh !== undefined ? data.etoh : (safePrev?.etoh ?? 0),

          // Additional fields - create new objects to ensure reference change
          metrics: data.metrics ? { ...data.metrics } : (safePrev?.metrics ? { ...safePrev.metrics } : {}),
          signals: data.signals ? { ...data.signals } : (safePrev?.signals ? { ...safePrev.signals } : {}),
          raw: data.raw ? { ...data.raw } : (safePrev?.raw ? { ...safePrev.raw } : {}),
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

    // Initial fetch for historical data - only if not already loaded for this device
    // FIXED: Only fetch ONCE per deviceId, not on tab switch
    if (didInitialFetchRef.current !== currentDeviceId) {
      console.log('[Home] Initial data fetch triggered for device:', currentDeviceId);
      fetchDeviceData(true); // Force refresh on initial load
    } else {
      console.log('[Home] Skipping initial fetch - data already loaded for device:', currentDeviceId);
    }

    // PHASE 2: Prepare Day graph data (buffer hydration + initial aggregation)
    // This ensures Day graph is ready BEFORE Insight screen opens
    // FIXED: Use tokenRef.current instead of auth.token to prevent reruns
    prepareDayGraph(currentDeviceId, tokenRef.current || undefined)
      .then(() => {
        console.log('[Home] Day graph preparation completed for device:', currentDeviceId);
      })
      .catch((error) => {
        console.error('[Home] Failed to prepare Day graph:', error);
      });

    // PHASE 3: Prepare Respiration graph data (buffer hydration + initial aggregation)
    // This ensures Respiration graph is ready BEFORE Insight screen opens
    prepareRespirationGraph(currentDeviceId, tokenRef.current || undefined)
      .then(() => {
        console.log('[Home] Respiration graph preparation completed for device:', currentDeviceId);
      })
      .catch((error) => {
        console.error('[Home] Failed to prepare Respiration graph:', error);
      });

    // PHASE 4: Prepare Stress graph data (buffer hydration + initial graph data)
    // This ensures Stress graph is ready BEFORE Insight screen opens
    // Pass today's date (or undefined for default today)
    prepareStressGraph(currentDeviceId, new Date(), tokenRef.current || undefined)
      .then(() => {
        console.log('[Home] Stress graph preparation completed for device:', currentDeviceId);
      })
      .catch((error) => {
        console.error('[Home] Failed to prepare Stress graph:', error);
      });

    // Cleanup on unmount or device change
    // FIXED: Cleanup should ONLY disconnect socket, NOT reset sensor/graph state
    // Only disconnect if device changed OR user logged out, NOT on tab switch
    return () => {
      console.log('[Home] WebSocket cleanup running', {
        deviceId: currentDeviceId,
        currentActiveDevice: activeDevice?.deviceId,
        isLoggedIn: auth.isLoggedIn
      });
      clearInterval(checkConnection);

      // CRITICAL: Only disconnect if device actually changed OR user logged out
      // Do NOT disconnect on tab switch (when deviceId matches)
      const deviceChanged = activeDevice?.deviceId !== currentDeviceId;
      const userLoggedOut = !auth.isLoggedIn;

      if (deviceChanged || userLoggedOut) {
        console.log('[Home] Disconnecting WebSocket - device changed or user logged out');
        disconnectWebSocket();
        // Only reset state on device change or logout
        if (deviceChanged) {
          setWsSocket(null);
          setWsConnected(false);
          setLastStreamAt(null);
        }
      } else {
        console.log('[Home] Keeping WebSocket connected - tab switch only');
        // Tab switch: Keep socket connected, don't reset state
      }
    };
  }, [activeDevice?.deviceId, auth.isLoggedIn]); // FIXED: Removed auth.token dependency

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
  // FIXED: Only poll if WebSocket disconnected, don't refetch on tab switch
  React.useEffect(() => {
    if (wsConnected) {
      return; // Don't poll if WebSocket is active
    }

    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    // FIXED: Only fetch if data not loaded for this device, otherwise just start polling interval
    if (didInitialFetchRef.current !== activeDevice.deviceId) {
      fetchDeviceData(true);
    }

    // Poll for updates every 30 seconds (fallback mode)
    const pollInterval = setInterval(() => {
      fetchDeviceData(false); // Don't force refresh on polling
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [wsConnected, activeDevice?.deviceId, auth.isLoggedIn]); // FIXED: Removed fetchDeviceData from deps

  // Fallback: Silent API fetch for stress data if no WebSocket data for 9 minutes
  React.useEffect(() => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn || !wsConnected) {
      return; // Only run when WebSocket is connected (fallback for missed packets)
    }

    // Check every 1 minute if stress data hasn't arrived for 9 minutes
    const stressFallbackInterval = setInterval(async () => {
      const now = Date.now();
      const lastStressTime = lastStressDataTimeRef.current;

      // If we've never received stress data, or it's been more than 9 minutes (540000ms)
      const NINE_MINUTES_MS = 9 * 60 * 1000;
      const shouldFetch = !lastStressTime || (now - lastStressTime > NINE_MINUTES_MS);

      if (shouldFetch) {
        console.log('[Home] 🔄 Stress fallback: Fetching latest stress data via API (9 min threshold)');

        try {
          // Fetch last 24 hours of stress data (silent, no loading state)
          const dayEnd = new Date();
          const dayStart = new Date(dayEnd.getTime() - (24 * 60 * 60 * 1000));

          const result = await getStressGraph(activeDevice.deviceId, dayStart, dayEnd);

          if (result.success && result.data?.points && result.data.points.length > 0) {
            // Add fetched points to stress buffer (silently)
            let addedCount = 0;
            result.data.points.forEach((point: { x: number; y: number }) => {
              // x is timestamp in ms, y is stress value
              if (point.x && point.y !== null && point.y !== undefined && point.y >= 0 && point.y <= 100) {
                addStressRawPoint(activeDevice.deviceId, point.x, point.y);
                addedCount++;
                // Update last stress time if this is a recent point (within last hour)
                if (point.x > now - (60 * 60 * 1000)) {
                  lastStressDataTimeRef.current = Math.max(
                    lastStressDataTimeRef.current || 0,
                    point.x
                  );
                }
              }
            });

            if (addedCount > 0) {
              console.log(`[Home] ✅ Stress fallback: Added ${addedCount} points to buffer`);
            } else {
              console.log('[Home] ⚠️ Stress fallback: No valid points to add');
            }
          } else {
            console.log('[Home] ⚠️ Stress fallback: API returned no data');
          }
        } catch (error) {
          console.error('[Home] ❌ Stress fallback: API fetch failed:', error);
        }
      }
    }, 60 * 1000); // Check every 1 minute

    return () => clearInterval(stressFallbackInterval);
  }, [activeDevice?.deviceId, auth.isLoggedIn, wsConnected]);

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

      // Calculate sleep duration (real data from activeSleepSession or --)
      const sleepDuration = activeSleepSession 
        ? `${Math.floor(activeSleepSession.totalSleepTime / 60)}h ${Math.round(activeSleepSession.totalSleepTime % 60)}m`
        : '--';

      const metrics = [
        { key: 'heartRate', name: 'Estimated HR', value: hr > 0 ? String(Math.round(hr)) : '--', unit: 'BPM', icon: '❤️', colors: ['#2B2E57', '#1B1E3D'] as const },
        { key: 'respiration', name: 'Estimated Respiration', value: resp > 0 ? String(Math.round(resp)) : '--', unit: 'RPM', icon: '🫁', colors: ['#24425F', '#18253A'] as const },
        { key: 'stress', name: 'Stress', value: stressText, unit: '', icon: '😮‍💨', colors: ['#4A2B2B', '#1E1414'] as const },
        { key: 'sleep', name: 'Sleep', value: sleepDuration, unit: '', icon: '😴', colors: ['#2B2E57', '#1B1E3D'] as const },
      ];

      return metrics;
    },
    [latestHealthData, updateCounter] // Include updateCounter to force recomputation
  );

  const envMetrics = React.useMemo(() => {
    const temp = latestHealthData?.temperature || latestHealthData?.temp || 0;
    const hum = latestHealthData?.humidity || 0;
    const iaq = latestHealthData?.iaq || 0;
    const eco2 = latestHealthData?.eco2 || 0;
    const tvoc = latestHealthData?.tvoc || 0;
    const etoh = latestHealthData?.etoh || 0;

    return [
      { key: 'temp', name: 'Temperature', value: temp > 0 ? temp.toFixed(1) : '--', unit: '°C', icon: '🌡️', colors: ['#2B2E57', '#1B1E3D'] as const },
      { key: 'hum', name: 'Humidity', value: hum > 0 ? String(Math.round(hum)) : '--', unit: '%', icon: '💧', colors: ['#24425F', '#18253A'] as const },
      { key: 'iaq', name: 'IAQ', value: iaq > 0 ? String(Math.round(iaq)) : '--', unit: '', icon: '🌬️', colors: ['#3A2C59', '#1D1430'] as const },
      { key: 'eco2', name: 'eCO₂', value: eco2 > 0 ? String(Math.round(eco2)) : '--', unit: 'ppm', icon: '🫧', colors: ['#29334D', '#121A2A'] as const },
      { key: 'tvoc', name: 'TVOC', value: tvoc > 0 ? String(Math.round(tvoc)) : '--', unit: 'ppb', icon: '☁️', colors: ['#2F2E4A', '#17162A'] as const },
      { key: 'etoh', name: 'ETOH', value: etoh > 0 ? etoh.toFixed(2) : '--', unit: 'ppb', icon: '🍷', colors: ['#2B2F3F', '#161925'] as const },
    ];
  }, [latestHealthData, updateCounter]);

  // --- Body Measurement Calculations ---
  const bodyMetrics = React.useMemo(() => {
    const p: any = auth.user?.profile || {};
    const gender = p.gender || 'Male';

    const weightKg = parseFloat(p.weight || '0');
    const heightCm = parseFloat(p.height || '0');
    const waistCm = parseFloat(p.waist || '0');

    const allFieldsFilled = weightKg > 0 && heightCm > 0 && waistCm > 0;

    if (!allFieldsFilled) {
      return {
        allFieldsFilled,
        bmi: '—',
        waistHeightRatio: '—',
        absi: '—',
        bmiScore: 0,
        waistHeightScore: 0,
        absiScore: 0,
        overallScore: 0,
      };
    }

    const heightM = heightCm / 100;
    const heightInches = heightCm / 2.54;
    const waistInches = waistCm / 2.54;
    const waistM = waistCm / 100;

    const age = calculateAge(p.dateOfBirth);

    const bmi = calculateBMI(weightKg, heightM);
    const waistHeightRatio = calculateWaistHeightRatio(waistM, heightM);
    const absi = calculateABSI(waistM, weightKg, heightM);

    const bmiScore = getBMIScore(bmi, age, gender);
    const waistHeightScore = getWaistHeightRatioScore(waistHeightRatio, gender);
    const absiScore = getABSIScore(absi);
    const overallScore = calculateOverallBodyIndex(waistHeightScore, bmiScore.score, absiScore);

    return {
      allFieldsFilled,
      bmi: bmi.toFixed(2),
      waistHeightRatio: waistHeightRatio.toFixed(2),
      absi: absi.toFixed(2),
      bmiScore: bmiScore.score,
      waistHeightScore,
      absiScore,
      overallScore,
    };
  }, [auth.user?.profile]);

  // --- Sleep Specific Calculations ---
  const sleepMetrics = React.useMemo(() => {
    // Real data from activeSleepSession if available
    // Default to 0 if no data to avoid showing "dummy" constants
    const durationMinutes = activeSleepSession?.totalSleepTime || 0; 
    const efficiency = activeSleepSession?.sleepEfficiency || 0;
    
    const durationHours = durationMinutes / 60;
    
    return {
      duration: durationHours,
      efficiency: efficiency,
      durationLabel: activeSleepSession 
        ? `${Math.floor(activeSleepSession.totalSleepTime / 60)}h ${Math.round(activeSleepSession.totalSleepTime % 60)}m`
        : "0h 0m",
      efficiencyLabel: activeSleepSession ? `${Math.round(efficiency)}%` : "--",
    };
  }, [activeSleepSession]);

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

  // Helper function to get display name for device
  const getDeviceDisplayName = (device: any) => {
    return device.customName || device.defaultName || device.deviceId;
  };

  // Handle rename device
  const handleRenameDevice = (device: any) => {
    setEditingDeviceId(device.deviceId);
    setEditingName(''); // Always start with empty field for fresh input
    setNameError('');
  };

  // Validate device name for duplicates
  const validateDeviceName = (name: string): boolean => {
    if (!name || !name.trim()) {
      setNameError('');
      return true; // Empty name is allowed (uses device ID)
    }

    const trimmedName = name.trim();

    // Get current device's existing name
    const currentDevice = devices?.find(d => d.deviceId === editingDeviceId);
    const currentDeviceName = currentDevice?.customName?.toLowerCase() || '';

    // Check if name already exists for another device (excluding current device)
    const nameExists = devices?.some(device =>
      device.deviceId !== editingDeviceId &&
      device.customName &&
      device.customName.toLowerCase() === trimmedName.toLowerCase()
    );

    // Allow if it's the same as current device's name
    if (trimmedName.toLowerCase() === currentDeviceName) {
      setNameError('');
      return true;
    }

    if (nameExists) {
      setNameError('Already exist please use different name');
      return false;
    }

    setNameError('');
    return true;
  };

  // Handle name input change with validation
  const handleNameChange = (text: string) => {
    setEditingName(text);
    if (text.trim()) {
      validateDeviceName(text);
    } else {
      setNameError('');
    }
  };

  const handleSaveName = async () => {
    if (!editingDeviceId) return;

    const trimmedName = editingName.trim();

    // Validate name length
    if (trimmedName.length > 50) {
      Alert.alert('Error', 'Device name must be 50 characters or less');
      return;
    }

    // Validate for duplicates
    if (!validateDeviceName(trimmedName)) {
      return; // Error message already set
    }

    try {
      setIsSavingName(true);
      const result = await updateDeviceName(editingDeviceId, trimmedName || null);

      if (result.success) {
        // Refresh device list to get updated names
        await refreshDevices();
        setEditingDeviceId(null);
        setEditingName('');
        setNameError('');
        Alert.alert('Success', result.message || 'Device name updated');
      } else {
        Alert.alert('Error', result.message || 'Failed to update device name');
      }
    } catch (error: any) {
      console.error('Error saving device name:', error);
      Alert.alert('Error', error.message || 'Failed to update device name');
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingDeviceId(null);
    setEditingName('');
    setNameError('');
  };

  const handleRemoveShared = async (deviceId: string) => {
    Alert.alert(
      'Remove shared device',
      'Remove this device from your account? You will no longer see its data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await removeSharedDevice(deviceId);
              if (result.success) await refreshDevices();
              else Alert.alert('Error', result.message ?? 'Failed to remove');
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Something went wrong');
            }
          },
        },
      ]
    );
  };

  const handleDeleteDevice = (deviceId?: string) => {
    const deviceIdToDelete = deviceId || editingDeviceId;
    if (!deviceIdToDelete) return;

    Alert.alert(
      'Remove Device',
      'Remove this device from your account? You will no longer see it or its data.',
      [
        {
          text: 'No',
          style: 'cancel',
          onPress: () => { },
        },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeletingDevice(true);
              const result = await deleteDevice(deviceIdToDelete);

              if (result.success) {
                await cleanupLocalBleStores(deviceIdToDelete);
                if (editingDeviceId === deviceIdToDelete) {
                  setEditingDeviceId(null);
                  setEditingName('');
                }
                await refreshDevices();
              } else {
                Alert.alert('Error', result.message || 'Failed to remove device');
              }
            } catch (error: any) {
              console.error('Error removing device:', error);
              Alert.alert('Error', error.message || 'Failed to remove device');
            } finally {
              setIsDeletingDevice(false);
            }
          },
        },
      ]
    );
  };

  const handleSwitchDevice = async (device: any) => {
    if (device.deviceId === activeDevice?.deviceId) {
      return; // Already active
    }

    try {
      setSwitchingDeviceId(device.deviceId);
      setIsSwitchingDevice(true);
      const oldDeviceId = activeDevice?.deviceId;

      console.log(`[Account] Switching from device ${oldDeviceId} to ${device.deviceId}`);

      // Unsubscribe from old device if WebSocket is connected
      if (oldDeviceId && isWebSocketConnected()) {
        console.log(`[Account] Unsubscribing from old device: ${oldDeviceId}`);
        unsubscribeFromDevice(oldDeviceId);
      }

      // Disconnect current WebSocket completely
      console.log('[Account] Disconnecting WebSocket...');
      disconnectWebSocket();

      // Call backend API to activate device
      console.log(`[Account] Activating device on backend: ${device.deviceId}`);
      const result = await activateDevice(device.deviceId);

      if (result.success) {
        console.log('[Account] Backend activation successful');

        // Update active device in context
        await setActiveDevice(device);
        console.log('[Account] Active device updated in context');

        // Refresh device list
        await refreshDevices();
        console.log('[Account] Device list refreshed');

        // Close the modal after successful switch
        setSwitcherOpen(false);

        // Note: WebSocket will be reconnected automatically by home screen's useEffect
        // when activeDevice changes. We don't need to connect here as the home screen
        // will handle it dynamically.
        console.log('[Account] WebSocket will reconnect automatically on home screen');
      } else {
        console.error('[Account] Failed to switch device:', result.message);
        Alert.alert('Error', result.message || 'Failed to switch device');
      }
    } catch (error: any) {
      console.error('[Account] Error switching device:', error);
      Alert.alert('Error', error.message || 'Failed to switch device');
    } finally {
      setIsSwitchingDevice(false);
      setSwitchingDeviceId(null);
    }
  };

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
        {/* --- My Health Section (NEW Grid + Sparklines) --- */}
        <View style={[styles.sectionHeaderRow, { marginTop: insets.top + 10 }]}>
          <Text style={styles.sectionTitle}>My Health</Text>
          <View style={styles.cardHeaderRight}>
            {activeDevice ? (
              <TouchableOpacity
                style={styles.deviceNameIndicator}
                onPress={() => debouncedPush('/(tabs)/all-devices')}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.deviceIndicatorDot,
                    wsConnected && lastStreamAt !== null ? styles.deviceIndicatorGreen : styles.deviceIndicatorYellow,
                  ]}
                />
                <Text style={styles.deviceNameText}>
                  {activeDevice && getDeviceDisplayName(activeDevice)}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                onPress={() => debouncedPush('/(bluetooth)/ScanScreen')}
                style={{ marginRight: 8 }}
              >
                <Text style={styles.viewAll}>Add Device</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.avatarPill}
              onPress={() => debouncedPush('/(tabs)/profile')}
              activeOpacity={0.8}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </TouchableOpacity>
          </View>
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
                          ? { activeOpacity: 0.85, onPress: () => debouncedPush('/charts/sleep-insights') }
                          : m.key === 'heartRate'
                            ? { activeOpacity: 0.85, onPress: () => debouncedPush('/charts/heart-rate-insights') }
                            : m.key === 'respiration'
                              ? { activeOpacity: 0.85, onPress: () => debouncedPush('/charts/respiration-insights') }
                              : m.key === 'stress'
                                ? { activeOpacity: 0.85, onPress: () => debouncedPush('/charts/stress-insights') }
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

        {/* --- My Sleep Section (Restored with Bars) --- */}
        <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
          <Text style={styles.sectionTitle}>My Sleep</Text>
        </View>

        <BlurView intensity={25} tint="dark" style={styles.sleepRedesignCard}>
          <View style={styles.sleepMetricBarRow}>
            <View style={styles.sleepMetricBarInfo}>
              <Text style={styles.sleepMetricBarLabel}>Duration</Text>
              <Text style={styles.sleepMetricBarValue}>{sleepMetrics.durationLabel}</Text>
            </View>
            <View style={styles.sleepMetricBarTrack}>
              <LinearGradient 
                colors={['#4facfe', '#00f2fe']} 
                style={[styles.sleepMetricBarFill, { width: `${Math.min(100, (sleepMetrics.duration / 8) * 100)}%` }]} 
                start={{x: 0, y: 0}} 
                end={{x: 1, y: 0}}
              />
            </View>
          </View>

          <View style={[styles.sleepMetricBarRow, { marginTop: 16 }]}>
            <View style={styles.sleepMetricBarInfo}>
              <Text style={styles.sleepMetricBarLabel}>Efficiency</Text>
              <Text style={styles.sleepMetricBarValue}>{sleepMetrics.efficiencyLabel}</Text>
            </View>
            <View style={styles.sleepMetricBarTrack}>
              <LinearGradient 
                colors={['#f6d365', '#fda085']} 
                style={[styles.sleepMetricBarFill, { width: `${sleepMetrics.efficiency}%` }]} 
                start={{x: 0, y: 0}} 
                end={{x: 1, y: 0}}
              />
            </View>
          </View>
        </BlurView>


        {/* --- Body Measurement Section --- */}
        <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
          <Text style={styles.sectionTitle}>Body Measurement</Text>
        </View>
        <BlurView intensity={25} tint="dark" style={styles.bodyMeasurementCard}>
          <View style={styles.calculatedIndicesGrid}>
            <CalculatedIndexRow
              label="Waist Height ratio"
              value={bodyMetrics.waistHeightRatio}
              score={bodyMetrics.waistHeightScore}
              onInfoPress={() => Alert.alert('Waist-to-height ratio', HINTS.WHR)}
            />
            <CalculatedIndexRow
              label="BMI"
              value={bodyMetrics.bmi}
              score={bodyMetrics.bmiScore}
              onInfoPress={() => Alert.alert('BMI', HINTS.BMI)}
            />
            <CalculatedIndexRow
              label="ABSI"
              value={bodyMetrics.absi}
              score={bodyMetrics.absiScore}
              onInfoPress={() => Alert.alert('ABSI', HINTS.ABSI)}
            />
            <CalculatedIndexRow
              label="Overall Body Index"
              value={bodyMetrics.allFieldsFilled ? bodyMetrics.overallScore.toFixed(1) : '—'}
              score={bodyMetrics.overallScore}
              onInfoPress={() => Alert.alert('Overall Body Index', HINTS.OBI)}
            />
          </View>
        </BlurView>

        {/* --- Environment Data (NEW Grid + Sparklines) --- */}
        <View style={[styles.sectionHeaderRow, { marginTop: 18 }]}>
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

        <View style={styles.disclaimerContainer}>
          <Text style={styles.disclaimerText}>
            This app is not a medical device and does not diagnose, treat, cure, or prevent any disease. For general wellness and lifestyle purposes only.
          </Text>
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
                debouncedPush('/(bluetooth)/ScanScreen');
              }}
            >
              <Text style={styles.manageText}>Add Device</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Devices list: owned + shared */}
            <View style={styles.devicesSection}>
              <Text style={styles.devicesSectionTitle}>Your Devices</Text>
              {!devices || devices.length === 0 ? (
                <View style={styles.emptyDevicesContainer}>
                  <Ionicons name="phone-portrait-outline" size={32} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyDevicesText}>No devices found</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.devicesList}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {(() => {
                    const sortedDevices = [...devices].sort((a, b) => {
                      if (a.deviceId === activeDevice?.deviceId) return -1;
                      if (b.deviceId === activeDevice?.deviceId) return 1;
                      return 0;
                    });
                    return sortedDevices.map((device, index) => {
                      const isActive = device.deviceId === activeDevice?.deviceId;
                      const isSwitching = switchingDeviceId === device.deviceId;
                      const isShared = !!(device as any).isShared;
                      return (
                        <TouchableOpacity
                          key={device.deviceId}
                          style={[
                            styles.deviceCard,
                            index === sortedDevices.length - 1 && styles.lastDeviceCard,
                            isActive && styles.activeDeviceCard,
                          ]}
                          onPress={() => !isActive && handleSwitchDevice(device)}
                          disabled={isActive || isSwitchingDevice}
                          activeOpacity={0.7}
                        >
                          <View style={styles.deviceCardContent}>
                            <View style={styles.deviceInfo}>
                              {isSwitching ? (
                                <ActivityIndicator size="small" color="#4CAF50" />
                              ) : (
                                <Ionicons
                                  name={isActive ? "phone-portrait" : "phone-portrait-outline"}
                                  size={18}
                                  color={isActive ? "#4CAF50" : "rgba(255,255,255,0.6)"}
                                />
                              )}
                              <View style={styles.deviceNameContainer}>
                                <View style={styles.deviceNameRow}>
                                  <Text style={styles.deviceCardName}>{getDeviceDisplayName(device)}</Text>
                                  {isShared && (
                                    <View style={styles.sharedBadge}>
                                      <Text style={styles.sharedBadgeText}>Shared</Text>
                                    </View>
                                  )}
                                </View>
                                {device.customName || device.defaultName ? (
                                  <Text style={styles.deviceCardId}>{device.deviceId}</Text>
                                ) : null}
                              </View>
                            </View>
                            <View style={styles.deviceActions}>
                              {isShared ? (
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    handleRemoveShared(device.deviceId);
                                  }}
                                  style={styles.deviceEditButton}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                  disabled={isSwitchingDevice}
                                >
                                  <Text style={styles.removeSharedText}>Remove</Text>
                                </TouchableOpacity>
                              ) : (
                                <>
                                  <TouchableOpacity
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleRenameDevice(device);
                                    }}
                                    style={styles.deviceEditButton}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    disabled={isSwitchingDevice}
                                  >
                                    <Text style={styles.deviceEditButtonText}>Edit</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={(e) => {
                                      e.stopPropagation();
                                      handleDeleteDevice(device.deviceId);
                                    }}
                                    style={styles.deviceDeleteButton}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    disabled={isSwitchingDevice}
                                  >
                                    <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    });
                  })()}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Device Popup */}
      {editingDeviceId !== null && (
        <Modal
          visible={editingDeviceId !== null}
          animationType="fade"
          transparent
          onRequestClose={handleCancelEdit}
        >
          <View style={styles.popupBackdrop}>
            <TouchableOpacity
              style={styles.popupBackdropTouch}
              activeOpacity={1}
              onPress={handleCancelEdit}
            />
            <View style={styles.popupContentWrapper}>
              <View style={styles.popupContent}>
                <View style={styles.popupHeader}>
                  <Text style={styles.popupTitle}>Rename Device</Text>
                  <TouchableOpacity onPress={handleCancelEdit}>
                    <Ionicons name="close" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.popupSubtitle}>
                  Enter a custom name for this device (optional)
                </Text>
                <Text style={styles.popupHint}>
                  Leave empty to use device ID as name
                </Text>

                <TextInput
                  style={[
                    styles.nameInput,
                    nameError && styles.nameInputError
                  ]}
                  placeholder="e.g., Bedroom Device, Living Room"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={editingName}
                  onChangeText={handleNameChange}
                  maxLength={50}
                  autoFocus
                />
                {nameError ? (
                  <Text style={styles.nameErrorText}>{nameError}</Text>
                ) : null}

                <View style={styles.popupButtons}>
                  <TouchableOpacity
                    style={[styles.popupButton, styles.popupButtonCancel]}
                    onPress={handleCancelEdit}
                    disabled={isSavingName || isDeletingDevice}
                  >
                    <Text style={styles.popupButtonTextCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.popupButton, styles.popupButtonSave, (isSavingName || nameError) && styles.popupButtonDisabled]}
                    onPress={handleSaveName}
                    disabled={isSavingName || isDeletingDevice || !!nameError}
                  >
                    {isSavingName ? (
                      <ActivityIndicator size="small" color="#1D244D" />
                    ) : (
                      <Text style={styles.popupButtonTextSave}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disclaimerContainer: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  disclaimerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 16,
  },
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  scrollContent: { paddingTop: 26, paddingHorizontal: 16 },
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
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sectionTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
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
    marginTop: 4, // Reduced to make gap with header consistent (12+4=16px)
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

  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'transparent' },
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
  devicesSection: { marginTop: 8 },
  devicesSectionTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  devicesList: { maxHeight: 300 },
  emptyDevicesContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  emptyDevicesText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 8 },
  deviceCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  activeDeviceCard: { backgroundColor: 'rgba(76, 175, 80, 0.1)', borderColor: '#4CAF50', borderWidth: 2 },
  lastDeviceCard: { marginBottom: 0 },
  deviceCardContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deviceInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  deviceNameContainer: { flex: 1, minWidth: 0 },
  deviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  deviceCardName: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  deviceCardId: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 },
  sharedBadge: { backgroundColor: 'rgba(199, 185, 255, 0.25)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  sharedBadgeText: { color: '#C7B9FF', fontSize: 10, fontWeight: '700' },
  removeSharedText: { color: '#FF9F43', fontSize: 12, fontWeight: '600' },
  activeBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: '#4CAF50', marginLeft: 8 },
  activeBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  deviceActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceEditButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  deviceEditButtonText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  deviceDeleteButton: { padding: 6 },
  // Popup styles
  popupBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  popupBackdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  popupContentWrapper: {
    width: '85%',
    maxWidth: 400,
    zIndex: 1001,
  },
  popupContent: {
    backgroundColor: '#1D244D',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  popupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  popupTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  popupSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 8,
  },
  popupHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  nameInputError: {
    borderColor: '#FF3B30',
    borderWidth: 2,
  },
  nameErrorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginBottom: 24,
    marginTop: 4,
  },
  popupButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  popupButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  popupButtonCancel: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  popupButtonSave: {
    backgroundColor: '#FFFFFF',
  },
  popupButtonDisabled: {
    opacity: 0.5,
  },
  popupButtonTextCancel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  popupButtonTextSave: {
    color: '#1D244D',
    fontSize: 16,
    fontWeight: '600',
  },

  // Body Measurement styles
  bodyMeasurementCard: {
    marginTop: 4, // Added to make gap with header consistent (12+4=16px)
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
    marginHorizontal: 0,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden'
  },
  calculatedIndicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  calculatedIndexCard: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16, // Matched to profile
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  calculatedIndexHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12, // Matched to profile
  },
  calculatedIndexLabelContainer: {
    flex: 1,
  },
  calculatedIndexLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12, // Matched to profile
    fontWeight: '600',
  },
  calculatedIndexSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10, // Matched to profile
    marginTop: 2,
  },
  calculatedIndexContent: {
    alignItems: 'center',
    gap: 8, // Matched to profile
  },
  calculatedIndexGaugeContainer: {
    alignItems: 'center',
    gap: 6, // Matched to profile
  },
  calculatedIndexScore: {
    color: '#fff',
    fontSize: 16, // Matched to profile
    fontWeight: '700',
  },
  calculatedIndexValue: {
    color: '#fff',
    fontSize: 18, // Matched to profile
    fontWeight: '700',
    marginTop: 4,
  },
  infoIcon: {
    padding: 2,
  },
  
  // My Sleep Redesign Styles
  sleepRedesignCard: {
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 0,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  sleepMetricBarRow: {
    width: '100%',
  },
  sleepMetricBarInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  sleepMetricBarLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sleepMetricBarValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  sleepMetricBarTrack: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 5,
    overflow: 'hidden',
    width: '100%',
  },
  sleepMetricBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  
  // Disclaimer Footer Styles
  disclaimerFooter: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.8,
  },
  disclaimerIcon: {
    marginBottom: 8,
  },
  disclaimerFooterText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 4,
  },
  disclaimerLink: {
    color: '#4facfe',
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
