import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture } from 'react-native-gesture-handler';
import { useFont } from '@shopify/react-native-skia';
import { runOnJS, useAnimatedReaction, useDerivedValue } from 'react-native-reanimated';
import { CartesianChart, Line, Bar, Area, useChartTransformState } from 'victory-native';
import { Circle, Group } from '@shopify/react-native-skia';
import { useDevice } from '@/contexts/DeviceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBoot } from '@/contexts/BootContext';
import { getDeviceHistory, getWeeklyHeartRateData, getMonthlyHeartRateData, getHealthData, getDeviceDetails, getHeartRateGraphForDateRange, getRespirationGraphForDateRange } from '@/services/deviceData';
import { useFocusEffect } from 'expo-router';
import { ZOOM_LEVELS } from '@/utils/zoomLevels';
import { aggregateHeartRate } from '@/utils/heartRateAggregation';
import { aggregateRespiration } from '@/utils/respirationAggregation';
import { 
  getDayGraphData, 
  isDayGraphReady, 
  subscribe as subscribeToDayGraph, 
  updateZoomLevel 
} from '@/services/dayGraphManager';
import { getRawPoints } from '@/services/heartRateBuffer';
import { getRawPoints as getRespirationRawPoints } from '@/services/respirationBuffer';
import { 
  getRespirationGraphData, 
  isRespirationGraphReady, 
  subscribe as subscribeToRespirationGraph, 
  updateZoomLevel as updateRespirationZoomLevel 
} from '@/services/respirationGraphManager';
import { connectWebSocket, removeWebSocketHandler, addDeviceUpdateHandler, removeDeviceUpdateHandler, type WebSocketMessageHandler, type DeviceUpdateHandler } from '@/services/websocketService';
import HeartRateSkeleton from '@/components/HeartRateSkeleton';

const { width } = Dimensions.get('window');

interface HeartRateDataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  value: number; // Heart rate in BPM (beats per minute)
}

interface WeeklyHeartRateDataPoint {
  day: string;
  dayIndex: number;
  date: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  isPartial: boolean;
  count: number;
}

interface MonthlyHeartRateDataPoint {
  day: number;
  dayIndex: number;
  date: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  isPartial: boolean;
  count: number;
}

export default function HeartRateInsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeDevice } = useDevice();
  const { auth } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = React.useState<'Day' | 'Week' | 'Month'>('Day');
  
  const { onboardingSeen } = useBoot();
  
  // Log screen focus with state checks (using BootContext as single source of truth)
  useFocusEffect(
    React.useCallback(() => {
      const deviceBound = activeDevice?.deviceId ? true : false;
      
      console.log('[HEART_RATE] Screen focus', {
        hasSeenOnboarding: onboardingSeen,
        isLoggedIn: auth.isLoggedIn,
        deviceBound,
        deviceId: activeDevice?.deviceId || null,
        timestamp: Date.now(),
      });
    }, [auth.isLoggedIn, activeDevice?.deviceId, onboardingSeen])
  );
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [isLoadingHistoricalDay, setIsLoadingHistoricalDay] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [heartRateData, setHeartRateData] = React.useState<HeartRateDataPoint[]>([]);

  // True when Day view is showing today (same calendar day). Past date = historical fetch from API; today = buffer + live.
  const isTodaySelected = React.useMemo(() => {
    if (selectedPeriod !== 'Day') return true;
    const today = new Date();
    return (
      selectedDate.getFullYear() === today.getFullYear() &&
      selectedDate.getMonth() === today.getMonth() &&
      selectedDate.getDate() === today.getDate()
    );
  }, [selectedPeriod, selectedDate]);
  
  // Day view: Use pre-built graph data from DayGraphManager (prepared on Home screen)
  const [zoomIndex, setZoomIndex] = React.useState(0); // Start with 10min zoom
  const [graphData, setGraphData] = React.useState<{
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  } | null>(null);
  const [dayGraphReady, setDayGraphReady] = React.useState(false);
  const [respirationOverlayChecked, setRespirationOverlayChecked] = React.useState(false);
  // Trigger re-run of Day metrics when historical raw points are set (refs don't trigger re-renders)
  const [historicalDayRawPointsKey, setHistoricalDayRawPointsKey] = React.useState(0);
  
  // State for top tooltip showing date/time when interacting with graph
  const [topTooltipData, setTopTooltipData] = React.useState<{
    timestamp: number;
    heartRate: number | null;
    respiration?: number | null;
  } | null>(null);

  
  // Storage key for respiration overlay preference
  const RESPIRATION_OVERLAY_KEY = 'heart_rate_respiration_overlay_enabled';
  
  // Load respiration overlay state from storage on mount
  React.useEffect(() => {
    const loadRespirationOverlayState = async () => {
      try {
        const saved = await AsyncStorage.getItem(RESPIRATION_OVERLAY_KEY);
        if (saved !== null) {
          setRespirationOverlayChecked(saved === 'true');
        }
      } catch (error) {
        console.error('[HeartRateInsights] Failed to load respiration overlay state:', error);
      }
    };
    
    loadRespirationOverlayState();
  }, []);
  
  // Save respiration overlay state to storage when it changes
  const handleRespirationOverlayToggle = React.useCallback(async (checked: boolean) => {
    setRespirationOverlayChecked(checked);
    try {
      await AsyncStorage.setItem(RESPIRATION_OVERLAY_KEY, checked ? 'true' : 'false');
    } catch (error) {
      console.error('[HeartRateInsights] Failed to save respiration overlay state:', error);
    }
  }, []);
  const [weeklyHeartRateData, setWeeklyHeartRateData] = React.useState<WeeklyHeartRateDataPoint[]>([]);
  const [isLoadingWeekly, setIsLoadingWeekly] = React.useState(false);
  const [weeklyError, setWeeklyError] = React.useState<string | null>(null);
  const [hasLoadedWeekly, setHasLoadedWeekly] = React.useState(false);
  
  const [monthlyHeartRateData, setMonthlyHeartRateData] = React.useState<MonthlyHeartRateDataPoint[]>([]);
  const [isLoadingMonthly, setIsLoadingMonthly] = React.useState(false);
  const [monthlyError, setMonthlyError] = React.useState<string | null>(null);
  const [hasLoadedMonthly, setHasLoadedMonthly] = React.useState(false);
  
  // Respiration overlay data for Day view
  const [respirationGraphData, setRespirationGraphData] = React.useState<{
    points: Array<{ x: number; y: number }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  } | null>(null);
  const [respirationGraphReady, setRespirationGraphReady] = React.useState(false);
  
  // Bed status tracking (backend is single source of truth)
  const [bedStatus, setBedStatus] = React.useState<'Occupied' | 'Vacant' | 'Waiting'>('Vacant');
  const [isLoadingBedStatus, setIsLoadingBedStatus] = React.useState<boolean>(true);
  
  // Cache for weekly data: key = deviceId + weekStart date string
  const weeklyDataCache = React.useRef<Map<string, WeeklyHeartRateDataPoint[]>>(new Map());
  
  // Cache for monthly data: key = deviceId + monthStart date string
  const monthlyDataCache = React.useRef<Map<string, MonthlyHeartRateDataPoint[]>>(new Map());
  
  // Refs for request management (kept for potential future use)
  const socketInstanceRef = React.useRef<any>(null);
  const prevDeviceIdForResetRef = React.useRef<string | null>(null);
  
  const activeDeviceIdRef = React.useRef<string | null>(activeDevice?.deviceId ?? null);
  React.useEffect(() => {
    activeDeviceIdRef.current = activeDevice?.deviceId ?? null;
  }, [activeDevice?.deviceId]);

  // Historical day: raw points for selected past date (24hr of that day). Zoom changes re-aggregate from this, no re-fetch.
  const historicalDayRawPointsRef = React.useRef<Array<{ timestamp: number; value: number | null }>>([]);
  const historicalDayDateRef = React.useRef<string | null>(null); // 'YYYY-MM-DD' for which date we have raw points

  // Historical day respiration overlay: raw points for selected past date; re-aggregate on zoom/overlay toggle.
  const historicalDayRespirationRawPointsRef = React.useRef<Array<{ timestamp: number; value: number | null }>>([]);
  const historicalDayRespirationDateRef = React.useRef<string | null>(null);
  const [historicalRespirationGraphData, setHistoricalRespirationGraphData] = React.useState<{
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
  } | null>(null);

  // ----------------------------
  // Domain-based pan/zoom config
  // ----------------------------
  const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const INACTIVITY_MS = 10 * 1000; // 10 seconds without gestures -> return to live
  const MIN_WINDOW_MS = 10 * 1000; // 10 seconds min zoom window
  const MAX_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours max zoom window (matches fetched range)

  // Reduced top padding to bring chart closer to tooltip
  const CHART_PADDING = React.useMemo(
    () => ({ left: 28, right: 8, top: 8, bottom: 40 }),
    [],
  );

  // Padding for weekly bar chart - more left padding for first bar visibility
  const WEEKLY_CHART_PADDING = React.useMemo(
    () => ({ left: 40, right: 40, top: 18, bottom: 40 }),
    [],
  );

  // Padding for monthly bar chart
  const MONTHLY_CHART_PADDING = React.useMemo(
    () => ({ left: 40, right: 40, top: 18, bottom: 40 }),
    [],
  );

  // Load font asynchronously to avoid blocking initial render
  // Font loading is non-blocking - skeleton shows immediately
  const skiaFont = useFont(require('../../assets/fonts/SpaceMono-Regular.ttf'), 9);

  const [isLive, setIsLive] = React.useState(true);
  const [xDomain, setXDomain] = React.useState<[number, number] | null>(null);
  const [transformMatrix, setTransformMatrix] = React.useState<number[] | null>(null);

  // Smooth, finger-synced pan/zoom (data layer only). Axes remain fixed.
  const { state: transformState } = useChartTransformState({ scaleX: 1, scaleY: 1 });

  const IDENTITY_MATRIX = React.useMemo(
    () =>
      [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ] as any,
    [],
  );

  // PHASE 3: Day tab - today only: subscribe to DayGraphManager (buffer + live). Past date: use historical fetch effect below.
  // When viewing today, re-hydrate buffer from API so today's data + live websocket plot correctly.
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day' || !isTodaySelected) {
      return;
    }

    console.log('[HeartRateInsights] Setting up Day graph subscription for device (today):', activeDevice.deviceId);
    // Re-hydrate buffer with today's data from API so graph shows today + live updates
    import('@/services/dayGraphManager').then(({ prepareDayGraph }) => {
      prepareDayGraph(activeDevice.deviceId).catch((err) => {
        console.error('[HeartRateInsights] Failed to prepare Day graph:', err);
      });
    });

    const unsubscribe = subscribeToDayGraph(activeDevice.deviceId, (data) => {
      if (!isTodaySelected) return; // Don't overwrite when user switched to past date
      if (data) {
        setGraphData(data);
        setDayGraphReady(true);
      } else {
        setGraphData(null);
        setDayGraphReady(true);
      }
    });

    const initialData = getDayGraphData(activeDevice.deviceId);
    const ready = isDayGraphReady(activeDevice.deviceId);
    if (initialData) {
      setGraphData(initialData);
      setDayGraphReady(true);
    } else if (ready) {
      setGraphData(null);
      setDayGraphReady(true);
    }

    return unsubscribe;
  }, [activeDevice?.deviceId, selectedPeriod, isTodaySelected]);

  // Helper: aggregate from historical raw points and set graphData (used after fetch and on zoom change).
  // Viewport = zoomed window like "today": end of day minus range (10m/4h/24h), so X-axis and pan/zoom behave like current day.
  const applyHistoricalAggregation = React.useCallback(
    (rawPoints: Array<{ timestamp: number; value: number | null }>, startMs: number, endMs: number, zoomIdx: number) => {
      const zoomLevel = ZOOM_LEVELS[zoomIdx] || ZOOM_LEVELS[0];
      const rangeMs = zoomLevel.rangeSec * 1000;
      // Zoomed viewport: show last N ms of that day (like today shows last N ms). Clamp to day bounds.
      const viewportEnd = endMs;
      const viewportStart = Math.max(startMs, endMs - rangeMs);
      const aggregated = aggregateHeartRate(rawPoints, zoomIdx, viewportStart, viewportEnd);
      const hasValid = aggregated.points.some((p) => p.y != null && p.y > 0);
      if (!hasValid) {
        setGraphData(null);
      } else {
        setGraphData({
          points: aggregated.points,
          xDomain: aggregated.xDomain,
          yDomain: aggregated.yDomain,
          zoomLevel: { index: zoomIdx, label: zoomLevel.label, rangeSec: zoomLevel.rangeSec },
        });
      }
      setDayGraphReady(true);
      setIsLoadingHistoricalDay(false);
    },
    []
  );

  const applyHistoricalRespirationAggregation = React.useCallback(
    (rawPoints: Array<{ timestamp: number; value: number | null }>, startMs: number, endMs: number, zoomIdx: number) => {
      const zoomLevel = ZOOM_LEVELS[zoomIdx] || ZOOM_LEVELS[0];
      const rangeMs = zoomLevel.rangeSec * 1000;
      const viewportEnd = endMs;
      const viewportStart = Math.max(startMs, endMs - rangeMs);
      const aggregated = aggregateRespiration(rawPoints, zoomIdx, viewportStart, viewportEnd);
      const hasValid = aggregated.points.some((p) => p.y != null && p.y > 0);
      if (!hasValid) {
        setHistoricalRespirationGraphData(null);
      } else {
        setHistoricalRespirationGraphData({
          points: aggregated.points,
          xDomain: aggregated.xDomain,
          yDomain: aggregated.yDomain,
        });
      }
    },
    []
  );

  // Day view + past date: fill "buffer" (ref) with raw points from API only when date changes. 24hr of that day.
  // Zoom change does NOT re-fetch; we re-aggregate from ref in a separate effect.
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day' || isTodaySelected || !auth.isLoggedIn) {
      return;
    }
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    const startMs = dayStart.getTime();
    const endMs = dayEnd.getTime();
    const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

    // Already have raw points for this date: re-aggregate at 10 min when navigating (button and graph in sync)
    if (historicalDayDateRef.current === dateKey && historicalDayRawPointsRef.current.length > 0) {
      applyHistoricalAggregation(historicalDayRawPointsRef.current, startMs, endMs, 0);
      return;
    }

    let cancelled = false;
    setIsLoadingHistoricalDay(true);
    setDayGraphReady(false);
    setGraphData(null);

    getHeartRateGraphForDateRange(activeDevice.deviceId, startMs, endMs, true)
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data?.points) {
          historicalDayRawPointsRef.current = [];
          historicalDayDateRef.current = null;
          setGraphData(null);
          setDayGraphReady(true);
          setIsLoadingHistoricalDay(false);
          return;
        }
        const rawPoints = res.data.points
          .filter((p) => p.x >= startMs && p.x <= endMs)
          .map((p) => ({ timestamp: p.x, value: p.y }));
        historicalDayRawPointsRef.current = rawPoints;
        historicalDayDateRef.current = dateKey;
        setHistoricalDayRawPointsKey((k) => k + 1); // trigger metrics re-run after ref is populated
        applyHistoricalAggregation(rawPoints, startMs, endMs, 0);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[HeartRateInsights] Historical day fetch failed:', err);
          historicalDayRawPointsRef.current = [];
          historicalDayDateRef.current = null;
          setGraphData(null);
          setDayGraphReady(true);
          setIsLoadingHistoricalDay(false);
        }
      });

    return () => { cancelled = true; };
  }, [activeDevice?.deviceId, selectedPeriod, selectedDate, isTodaySelected, auth.isLoggedIn, applyHistoricalAggregation]);

  // Day view + past date: fetch respiration for selected day for overlay (same day window as heart rate).
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day' || isTodaySelected || !auth.isLoggedIn) {
      return;
    }
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    const startMs = dayStart.getTime();
    const endMs = dayEnd.getTime();
    const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

    if (historicalDayRespirationDateRef.current === dateKey) {
      // Already fetched for this date; if overlay is on and we have points, re-aggregate (e.g. zoom changed)
      if (respirationOverlayChecked && historicalDayRespirationRawPointsRef.current.length > 0) {
        applyHistoricalRespirationAggregation(historicalDayRespirationRawPointsRef.current, startMs, endMs, zoomIndex);
      }
      return;
    }

    let cancelled = false;
    getRespirationGraphForDateRange(activeDevice.deviceId, startMs, endMs, true)
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data) {
          historicalDayRespirationRawPointsRef.current = [];
          historicalDayRespirationDateRef.current = null;
          setHistoricalRespirationGraphData(null);
          return;
        }
        const rawPoints = (res.data.points || [])
          .filter((p) => p.x >= startMs && p.x <= endMs)
          .map((p) => ({ timestamp: p.x, value: p.y ?? null }));
        historicalDayRespirationRawPointsRef.current = rawPoints;
        historicalDayRespirationDateRef.current = dateKey; // Store date even when empty so we don't refetch
        if (respirationOverlayChecked && rawPoints.length > 0) {
          applyHistoricalRespirationAggregation(rawPoints, startMs, endMs, zoomIndex);
        } else {
          setHistoricalRespirationGraphData(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          historicalDayRespirationRawPointsRef.current = [];
          historicalDayRespirationDateRef.current = null;
          setHistoricalRespirationGraphData(null);
        }
      });

    return () => { cancelled = true; };
  }, [activeDevice?.deviceId, selectedPeriod, selectedDate, isTodaySelected, auth.isLoggedIn, respirationOverlayChecked, zoomIndex, applyHistoricalRespirationAggregation]);

  // When zoom or overlay changes on historical day: re-aggregate respiration from ref only.
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day' || isTodaySelected || !respirationOverlayChecked) return;
    const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    if (historicalDayRespirationDateRef.current !== dateKey || historicalDayRespirationRawPointsRef.current.length === 0) return;
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    const startMs = dayStart.getTime();
    const endMs = dayEnd.getTime();
    applyHistoricalRespirationAggregation(historicalDayRespirationRawPointsRef.current, startMs, endMs, zoomIndex);
  }, [zoomIndex, respirationOverlayChecked, selectedPeriod, selectedDate, isTodaySelected, activeDevice?.deviceId, applyHistoricalRespirationAggregation]);

  // When zoom changes on historical day: re-aggregate from ref only (no re-fetch, no reload).
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day' || isTodaySelected) return;
    const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    if (historicalDayDateRef.current !== dateKey || historicalDayRawPointsRef.current.length === 0) return;
    const dayStart = new Date(selectedDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(23, 59, 59, 999);
    const startMs = dayStart.getTime();
    const endMs = dayEnd.getTime();
    applyHistoricalAggregation(historicalDayRawPointsRef.current, startMs, endMs, zoomIndex);
  }, [zoomIndex, selectedPeriod, selectedDate, isTodaySelected, activeDevice?.deviceId, applyHistoricalAggregation]);

  // When back to today: clear historical refs and re-hydrate buffer for live (prepareDayGraph does that).
  React.useEffect(() => {
    if (isTodaySelected) {
      historicalDayRawPointsRef.current = [];
      historicalDayDateRef.current = null;
      historicalDayRespirationRawPointsRef.current = [];
      historicalDayRespirationDateRef.current = null;
      setHistoricalRespirationGraphData(null);
    }
  }, [isTodaySelected]);

  // Default zoom: 10 min when on Day view (today or previous day). Button and graph stay in sync.
  const ZOOM_INDEX_10M = 0;
  React.useEffect(() => {
    if (selectedPeriod !== 'Day') return;
    setZoomIndex(ZOOM_INDEX_10M);
  }, [selectedPeriod, selectedDate, isTodaySelected]);

  // PHASE 3: Respiration graph subscription for overlay
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day') {
      return;
    }

    console.log('[HeartRateInsights] Setting up Respiration graph subscription for overlay:', activeDevice.deviceId);
    
    // Subscribe to Respiration graph data updates
    const unsubscribe = subscribeToRespirationGraph(activeDevice.deviceId, (data) => {
      console.log('[HeartRateInsights] Respiration graph subscription callback fired:', {
        hasData: !!data,
        pointsLength: data?.points?.length || 0,
        xDomain: data?.xDomain,
        yDomain: data?.yDomain,
      });
      
      if (data) {
        setRespirationGraphData(data);
        setRespirationGraphReady(true);
      } else {
        setRespirationGraphData(null);
        setRespirationGraphReady(true);
      }
    });

    // Check initial readiness
    const initialData = getRespirationGraphData(activeDevice.deviceId);
    const ready = isRespirationGraphReady(activeDevice.deviceId);
    
    console.log('[HeartRateInsights] Initial Respiration graph check:', {
      hasInitialData: !!initialData,
      isReady: ready,
      pointsLength: initialData?.points?.length || 0,
    });
    
    if (initialData) {
      setRespirationGraphData(initialData);
      setRespirationGraphReady(true);
    } else if (ready) {
      setRespirationGraphData(null);
      setRespirationGraphReady(true);
    } else {
      // Trigger preparation if not ready
      console.log('[HeartRateInsights] Respiration graph not ready, triggering preparation...');
      import('@/services/respirationGraphManager').then(({ prepareRespirationGraph }) => {
        prepareRespirationGraph(activeDevice.deviceId).catch((error) => {
          console.error('[HeartRateInsights] Failed to prepare Respiration graph:', error);
        });
      });
    }

    return unsubscribe;
  }, [activeDevice?.deviceId, selectedPeriod]);

  // Update graph data when zoom level changes
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day') {
      return;
    }

    // Update zoom level in DayGraphManager
    updateZoomLevel(activeDevice.deviceId, zoomIndex).catch((error) => {
      console.error('[HeartRateInsights] Failed to update zoom level:', error);
    });
    
    // Update respiration zoom level to match heart rate zoom
    updateRespirationZoomLevel(activeDevice.deviceId, zoomIndex).catch((error) => {
      console.error('[HeartRateInsights] Failed to update respiration zoom level:', error);
    });
  }, [activeDevice?.deviceId, selectedPeriod, zoomIndex]);

  // PHASE 3: Day graph is prepared on Home screen - no initialization needed here

  // Domain ref for continuous updates without re-renders
  const domainRef = React.useRef<[number, number] | null>(null);
  const lastPanX = React.useRef(0);
  const lastScale = React.useRef(1);
  // UX FIX: Track last domain update time to throttle live domain updates
  // This prevents axis jumping - domain updates smoothly, not on every data point
  const lastDomainUpdateRef = React.useRef<number>(0);
  const DOMAIN_UPDATE_THROTTLE_MS = 1000; // Update domain every 1 second in live mode
  // Track previous zoom index to detect zoom level changes
  const prevZoomIndexRef = React.useRef<number>(zoomIndex);
  // Track if user has manually panned/zoomed to prevent automatic resets
  const hasUserInteractedRef = React.useRef<boolean>(false);

  const inactivityTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearInactivityTimer = React.useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  const resetTransform = React.useCallback(() => {
    transformState.matrix.value = IDENTITY_MATRIX;
    transformState.offset.value = IDENTITY_MATRIX;
  }, [IDENTITY_MATRIX, transformState.matrix, transformState.offset]);

  const returnToLive = React.useCallback(() => {
    clearInactivityTimer();
    resetTransform();
    lastPanX.current = 0;
    lastScale.current = 1;
    setIsLive(true);
    hasUserInteractedRef.current = false; // Reset interaction flag when returning to live
  }, [clearInactivityTimer, resetTransform]);

  // Domain computation - uses graphData for Day view (prepared by DayGraphManager)
  const computeLiveDomain = React.useCallback((): [number, number] | null => {
    if (selectedPeriod === 'Day') {
      // Use graphData from DayGraphManager
      if (graphData && graphData.xDomain) {
        return graphData.xDomain;
      }
      return null;
    } else {
      // For Week/Month views, use existing logic
      if (heartRateData.length === 0) return null;
      const latest = heartRateData[heartRateData.length - 1].timestamp;
      const oldest = heartRateData[0].timestamp;
      return [oldest, latest];
    }
  }, [selectedPeriod, graphData, heartRateData]);

  // Clamp to data bounds - for Day view, preserve user's domain if not in live mode
  const clampToData = React.useCallback(
    ([start, end]: [number, number]): [number, number] => {
      if (selectedPeriod === 'Day') {
        // CRITICAL: If user has interacted (panned/zoomed), ALWAYS preserve their domain
        // Don't use backend domain even if graphData changes
        if (hasUserInteractedRef.current && !isLive && xDomain) {
          // User has panned/zoomed - preserve their current view
          console.log('[HeartRateInsights] clampToData: Preserving user domain', xDomain);
          return xDomain;
        }
        // For Day view in live mode, use graphData from DayGraphManager
        if (!graphData || !graphData.points || graphData.points.length === 0) {
          return [start, end];
        }
        
        // Get data bounds from graphData points
        const timestamps = graphData.points.map(p => p.x).filter(t => Number.isFinite(t));
        if (timestamps.length === 0) {
          return [start, end];
        }
        
        const dataMin = Math.min(...timestamps);
        const dataMax = Math.max(...timestamps);
        
        // Clamp to data bounds
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          const liveDomain = computeLiveDomain();
          return liveDomain || [dataMin, dataMax];
        }

        const span = end - start;
        if (start < dataMin) {
          return [dataMin, dataMin + span];
        }
        if (end > dataMax) {
          return [dataMax - span, dataMax];
        }

        return [start, end];
      } else {
        // For Week/Month views, use existing logic
        if (heartRateData.length === 0) return [start, end];
        const dataMin = heartRateData[0].timestamp;
        const dataMax = heartRateData[heartRateData.length - 1].timestamp;

        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          return [dataMin, dataMax];
        }

        const span = end - start;
        if (start < dataMin) {
          return [dataMin, dataMin + span];
        }
        if (end > dataMax) {
          return [dataMax - span, dataMax];
        }

        return [start, end];
      }
    },
    [selectedPeriod, graphData, activeDevice?.deviceId, computeLiveDomain, heartRateData, isLive, xDomain],
  );

  // Pan domain: convert translateX to domain shift
  const panDomain = React.useCallback(
    (dx: number) => {
      if (!domainRef.current) return;

      const [start, end] = domainRef.current;
      const span = end - start;

      const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
      const timeShift = (-dx / chartWidth) * span;

      const next: [number, number] = [start + timeShift, end + timeShift];
      const clamped = clampToData(next);

      domainRef.current = clamped;
      setXDomain(clamped);
    },
    [clampToData],
  );

  // Zoom domain: convert scaleX to domain resize
  const zoomDomain = React.useCallback(
    (currentScale: number) => {
      if (!domainRef.current) return;

      const [start, end] = domainRef.current;
      const center = (start + end) / 2;
      const currentSpan = end - start;

      // Calculate scale delta from last scale
      const scaleDelta = currentScale / lastScale.current;
      
      // Apply scale delta to window size (inverse: larger scale = smaller window)
      let newSpan = currentSpan / scaleDelta;
      newSpan = Math.max(MIN_WINDOW_MS, Math.min(MAX_WINDOW_MS, newSpan));

      const next: [number, number] = [
        center - newSpan / 2,
        center + newSpan / 2,
      ];

      const clamped = clampToData(next);
      domainRef.current = clamped;
      setXDomain(clamped);
      
      // Update lastScale after applying zoom
      lastScale.current = currentScale;
    },
    [clampToData, MIN_WINDOW_MS, MAX_WINDOW_MS],
  );

  const onGestureStart = React.useCallback(() => {
    setIsLive(false);
    hasUserInteractedRef.current = true; // Mark that user has interacted
    clearInactivityTimer();
    
    const base = xDomain ?? computeLiveDomain();
    if (base) {
      domainRef.current = base;
      setXDomain(base);
    }
    
    lastPanX.current = 0;
    lastScale.current = 1;
  }, [clearInactivityTimer, xDomain, computeLiveDomain]);

  const onGestureEnd = React.useCallback(() => {
    clearInactivityTimer();
    lastPanX.current = 0;
    lastScale.current = 1;
    inactivityTimerRef.current = setTimeout(() => {
      returnToLive();
    }, INACTIVITY_MS);
  }, [INACTIVITY_MS, clearInactivityTimer, returnToLive]);

  // PAN: Watch translateX and update domain continuously
  useAnimatedReaction(
    () => {
      if (isLive) return null;
      const matrix = transformState.matrix.value;
      return matrix?.[12] ?? 0; // translateX
    },
    (translateX) => {
      if (translateX === null) return;

      const dx = translateX - lastPanX.current;
      lastPanX.current = translateX;

      if (Math.abs(dx) > 0.1) {
        runOnJS(panDomain)(dx);
      }
    },
    [isLive, panDomain],
  );

  // PINCH: Watch scaleX from matrix and update domain continuously
  useAnimatedReaction(
    () => {
      if (isLive) return null;
      const matrix = transformState.matrix.value;
      return matrix?.[0] ?? 1;
    },
    (scale) => {
      if (!scale || !domainRef.current) return;
      if (Math.abs(scale - lastScale.current) > 0.01) {
        runOnJS(zoomDomain)(scale);
      }
    },
    [isLive, zoomDomain],
  );

  // Track transform matrix changes to update tooltip position when panning
  useAnimatedReaction(
    () => {
      const matrix = transformState.matrix.value;
      const offset = transformState.offset.value;
      return { matrix, offset };
    },
    (transform) => {
      if (transform.matrix && Array.isArray(transform.matrix)) {
        const combined = [...transform.matrix];
        if (transform.offset && Array.isArray(transform.offset) && transform.offset.length >= 16) {
          combined[12] = (combined[12] || 0) + (transform.offset[12] || 0);
          combined[13] = (combined[13] || 0) + (transform.offset[13] || 0);
        }
        runOnJS(setTransformMatrix)(combined);
      }
    },
    [transformState.matrix, transformState.offset],
  );


  // Track built-in Victory transform gestures
  useAnimatedReaction(
    () => transformState.panActive.value || transformState.zoomActive.value,
    (active, prev) => {
      if (active && !prev) {
        runOnJS(onGestureStart)();
      } else if (!active && prev) {
        runOnJS(onGestureEnd)();
      }
    },
    [onGestureEnd, onGestureStart],
  );

  // Prevent automatic reset when zoom level changes if user has panned/zoomed
  React.useEffect(() => {
    // Only reset to live when zoom changes if we're already in live mode
    // If user has panned/zoomed, preserve their current view and transform state
    if (prevZoomIndexRef.current !== zoomIndex) {
      prevZoomIndexRef.current = zoomIndex;
      
      // CRITICAL: If user has interacted (panned/zoomed), NEVER reset to live
      // Preserve their current domain and transform state
      if (hasUserInteractedRef.current && !isLive && domainRef.current) {
        // User has panned/zoomed - keep their current view
        // Don't reset transform state, don't reset domain, don't reset isLive
        // The new graphData will arrive but we'll ignore its domain
        console.log('[HeartRateInsights] Zoom changed but preserving user view (hasUserInteracted=true)');
        return;
      }
      
      // If user hasn't interacted and we're in live mode, allow domain update
      // But DO NOT reset transform state or isLive here
      if (isLive && !hasUserInteractedRef.current) {
        // Will be handled by the domain update effect below
        console.log('[HeartRateInsights] Zoom changed in live mode, will update domain');
      }
    }
  }, [zoomIndex, isLive]);

  // Domain updates immediately when buffer data or zoom changes (in live mode)
  // Domain is computed from buffer data, not API-provided domain
  React.useEffect(() => {
    if (!isLive) {
      // User has panned/zoomed - preserve their current view
      return;
    }
    
    // Compute domain from buffer data (not from graphData.xDomain)
    const liveDomain = computeLiveDomain();
    if (liveDomain) {
      domainRef.current = liveDomain;
      setXDomain(liveDomain);
    }
  }, [computeLiveDomain, isLive, graphData, zoomIndex]); // Recompute when graphData or zoom changes

  // Cleanup timers on unmount
  React.useEffect(() => {
    return () => {
      clearInactivityTimer();
    };
  }, [clearInactivityTimer]);

  // Get start of week (Monday) for a given date
  const getWeekStartDate = React.useCallback((date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }, []);

  // Get start of month for a given date
  const getMonthStartDate = React.useCallback((date: Date): Date => {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    return monthStart;
  }, []);

  // Fetch monthly heart rate data (30 days aggregated)
  const fetchMonthlyHeartRateData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      setMonthlyHeartRateData([]);
      setHasLoadedMonthly(true);
      setIsLoadingMonthly(false);
      return;
    }

    try {
      setIsLoadingMonthly(true);
      setMonthlyError(null);
      
      // Calculate month start from selectedDate
      const monthStart = getMonthStartDate(selectedDate);
      
      // Check cache
      const cacheKey = `${activeDevice.deviceId}_${monthStart.toISOString()}`;
      const cachedData = monthlyDataCache.current.get(cacheKey);
      
      if (cachedData) {
        console.log('[HeartRateInsights] Using cached monthly data');
        setMonthlyHeartRateData(cachedData);
        setHasLoadedMonthly(true);
        setIsLoadingMonthly(false);
        return;
      }

      const result = await getMonthlyHeartRateData(activeDevice.deviceId, monthStart);

      if (result.success && result.data && Array.isArray(result.data)) {
        // Cache the data
        monthlyDataCache.current.set(cacheKey, result.data);
        setMonthlyHeartRateData(result.data);
      } else {
        setMonthlyHeartRateData([]);
        setMonthlyError(result.message || 'No monthly heart rate data available');
      }
      setHasLoadedMonthly(true);
    } catch (err: any) {
      console.error('Failed to fetch monthly heart rate data:', err);
      setMonthlyError(err.message || 'Failed to load monthly heart rate data');
      setMonthlyHeartRateData([]);
      setHasLoadedMonthly(true);
    } finally {
      setIsLoadingMonthly(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate, getMonthStartDate]);

  // Fetch weekly heart rate data (7 days aggregated)
  const fetchWeeklyHeartRateData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      setWeeklyHeartRateData([]);
      setHasLoadedWeekly(true);
      setIsLoadingWeekly(false);
      return;
    }

    try {
      setIsLoadingWeekly(true);
      setWeeklyError(null);
      
      // Calculate week start from selectedDate
      const weekStart = getWeekStartDate(selectedDate);
      
      // Check cache
      const cacheKey = `${activeDevice.deviceId}_${weekStart.toISOString()}`;
      const cachedData = weeklyDataCache.current.get(cacheKey);
      
      if (cachedData) {
        console.log('[HeartRateInsights] Using cached weekly data');
        setWeeklyHeartRateData(cachedData);
        setHasLoadedWeekly(true);
        setIsLoadingWeekly(false);
        return;
      }

      const result = await getWeeklyHeartRateData(activeDevice.deviceId, weekStart);

      if (result.success && result.data && Array.isArray(result.data)) {
        // Cache the data
        weeklyDataCache.current.set(cacheKey, result.data);
        setWeeklyHeartRateData(result.data);
      } else {
        setWeeklyHeartRateData([]);
        setWeeklyError(result.message || 'No weekly heart rate data available');
      }
      setHasLoadedWeekly(true);
    } catch (err: any) {
      console.error('Failed to fetch weekly heart rate data:', err);
      setWeeklyError(err.message || 'Failed to load weekly heart rate data');
      setWeeklyHeartRateData([]);
      setHasLoadedWeekly(true);
    } finally {
      setIsLoadingWeekly(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate, getWeekStartDate]);

  // Fetch heart rate data (last 24 hours) - Only used for Week/Month views
  // Day view uses backend graph API
  const fetchHeartRateData = React.useCallback(async () => {
    // Skip for Day view - ring buffer handles it
    if (selectedPeriod === 'Day') {
      return;
    }

    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      setHeartRateData([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const result = await getDeviceHistory(activeDevice.deviceId, {
        from: twentyFourHoursAgo,
        to: now,
        limit: 2000,
      });

      if (result.success && result.data && Array.isArray(result.data)) {
        const dataPoints: HeartRateDataPoint[] = result.data
          .filter((item: any) => {
            const value = item.heartRate || item.hr;
            return value && value > 0 && item.timestamp;
          })
          .map((item: any) => {
            const timestamp = new Date(item.timestamp);
            return {
              timestamp: isNaN(timestamp.getTime()) ? Date.now() : timestamp.getTime(),
              value: item.heartRate || item.hr || 0,
            };
          })
          .filter((point: HeartRateDataPoint) => point.value > 0 && point.value < 250)
          .sort((a: HeartRateDataPoint, b: HeartRateDataPoint) => a.timestamp - b.timestamp);

        setHeartRateData((prev) => {
          const existingMap = new Map<number, HeartRateDataPoint>();
          prev.forEach((point) => {
            existingMap.set(point.timestamp, point);
          });

          dataPoints.forEach((point) => {
            existingMap.set(point.timestamp, point);
          });

          const merged = Array.from(existingMap.values()).sort((a, b) => a.timestamp - b.timestamp);

          const nowMs = Date.now();
          const twentyFourHoursAgo = nowMs - (24 * 60 * 60 * 1000);
          return merged.filter((point) => point.timestamp >= twentyFourHoursAgo);
        });
      } else {
        setHeartRateData([]);
        setError('No heart rate data available');
      }
    } catch (err: any) {
      console.error('Failed to fetch heart rate data:', err);
      setError(err.message || 'Failed to load heart rate data');
      setHeartRateData([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedPeriod]);

  // Extract timestamp helper
  const extractTimestampMs = React.useCallback((data: any): number => {
    if (typeof data?.timestampSeconds === 'number' && Number.isFinite(data.timestampSeconds)) {
      return data.timestampSeconds * 1000;
    }
    if (typeof data?.timestamp === 'number' && Number.isFinite(data.timestamp)) {
      return data.timestamp < 10_000_000_000 ? data.timestamp * 1000 : data.timestamp;
    }
    if (typeof data?.timestamp === 'string' || data?.timestamp instanceof Date) {
      const ms = new Date(data.timestamp).getTime();
      if (Number.isFinite(ms)) return ms;
    }
    return Date.now();
  }, []);

  // PHASE 3: WebSocket and buffer updates are handled by DayGraphManager (via Home screen)
  // No WebSocket subscription needed here - DayGraphManager subscribes to buffer updates

  // Fetch latest health data on mount to set initial bed status
  React.useEffect(() => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    const deviceId = activeDevice.deviceId;

    // ✅ Fetch device details to get current bedStatus from backend (single source of truth)
    const fetchInitialBedStatus = async () => {
      setIsLoadingBedStatus(true);
      try {
        const result = await getDeviceDetails(deviceId);
        
        if (result.success && result.data) {
          const deviceData = result.data;
          const currentBedStatus = deviceData.bedStatus || 'Vacant';
          
          console.log('[HeartRateInsights] Initial bed status from backend:', {
            bedStatus: currentBedStatus,
            absenceStart: deviceData.absenceStart,
            HV: deviceData.HV,
            isLive: deviceData.isLive
          });

          // Set bedStatus directly from backend (backend handles all logic)
          setBedStatus(currentBedStatus as 'Occupied' | 'Vacant' | 'Waiting');
        } else {
          console.warn('[HeartRateInsights] Failed to fetch device details, defaulting to Vacant');
          setBedStatus('Vacant');
        }
      } catch (error) {
        console.error('[HeartRateInsights] Failed to fetch initial bed status:', error);
        setBedStatus('Vacant');
      } finally {
        setIsLoadingBedStatus(false);
      }
    };

    fetchInitialBedStatus();
  }, [activeDevice?.deviceId, auth.isLoggedIn]);

  // ✅ WebSocket connection for bed status tracking (backend is single source of truth)
  React.useEffect(() => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    const deviceId = activeDevice.deviceId;
    let isMounted = true;

    // ✅ Device update handler - receives bedStatus directly from backend
    const deviceUpdateHandler: DeviceUpdateHandler = (data) => {
      if (!isMounted || data.deviceId !== deviceId) {
        return;
      }

      console.log('[HeartRateInsights] Device update received:', {
        bedStatus: data.bedStatus,
        isLive: data.isLive,
        source: data.source,
        absenceStart: data.absenceStart,
        HV: data.HV
      });

      // ✅ Update bedStatus directly from backend (backend handles all logic)
      setBedStatus(data.bedStatus);
    };

    // Connect WebSocket and add device update handler
    connectWebSocket(deviceId).catch((error) => {
      console.error('[HeartRateInsights] Failed to connect WebSocket:', error);
    });

    // Add device update handler
    addDeviceUpdateHandler(deviceUpdateHandler);

    return () => {
      isMounted = false;
      removeDeviceUpdateHandler(deviceUpdateHandler);
    };
  }, [activeDevice?.deviceId, auth.isLoggedIn]);

  // Reset graph state when device changes (only reset if device actually changed)
  React.useEffect(() => {
    const currentDeviceId = activeDevice?.deviceId || null;
    const prevDeviceId = prevDeviceIdForResetRef.current;
    
    // Only reset if device actually changed (not on first mount)
    if (prevDeviceId !== null && prevDeviceId !== currentDeviceId) {
      console.log('[HeartRateInsights] 🔄 Device changed, resetting state:', { from: prevDeviceId, to: currentDeviceId });
      setGraphData(null);
      setDayGraphReady(false);
    }
    
    // Update ref for next comparison
    prevDeviceIdForResetRef.current = currentDeviceId;
  }, [activeDevice?.deviceId]);

  // Set loading state immediately when switching to Week/Month to prevent showing empty state
  React.useEffect(() => {
    if (selectedPeriod === 'Week') {
      setIsLoadingWeekly(true);
      setHasLoadedWeekly(false); // Reset loaded flag when switching
      setIsLoadingMonthly(false); // Reset other period's loading state
    } else if (selectedPeriod === 'Month') {
      setIsLoadingMonthly(true);
      setHasLoadedMonthly(false); // Reset loaded flag when switching
      setIsLoadingWeekly(false); // Reset other period's loading state
    } else {
      // Day view - reset both loading states
      setIsLoadingWeekly(false);
      setIsLoadingMonthly(false);
    }
  }, [selectedPeriod]);

  // Fetch data on mount and when period/date changes
  React.useEffect(() => {
    if (selectedPeriod === 'Week') {
      fetchWeeklyHeartRateData();
    } else if (selectedPeriod === 'Month') {
      fetchMonthlyHeartRateData();
    }
    // Day view: Graph data is fetched via fetchGraphData when zoom/device changes
  }, [fetchWeeklyHeartRateData, fetchMonthlyHeartRateData, selectedPeriod, selectedDate]);

  // Clear caches when device changes
  React.useEffect(() => {
    weeklyDataCache.current.clear();
    monthlyDataCache.current.clear();
  }, [activeDevice?.deviceId]);

  // Calculate metrics for Day view - RAW points in visible zoom window (today + past days). Fallback: aggregated points for past days.
  const metrics = React.useMemo(() => {
    if (selectedPeriod !== 'Day') return { min: 0, average: 0, max: 0 };
    if (!graphData?.xDomain) return { min: 0, average: 0, max: 0 };
    const [windowStart, windowEnd] = graphData.xDomain;
    let values: number[];
    if (isTodaySelected && activeDevice?.deviceId) {
      const rawPoints = getRawPoints(activeDevice.deviceId);
      const filtered = rawPoints.filter(
        (p) => p.timestamp >= windowStart && p.timestamp <= windowEnd && p.value != null && p.value > 0
      );
      values = filtered.map((p) => p.value as number);
    } else {
      // Past day: raw points in viewport first
      const rawPoints = historicalDayRawPointsRef.current;
      const filtered = rawPoints.filter(
        (p) => p.timestamp >= windowStart && p.timestamp <= windowEnd && p.value != null && p.value > 0
      );
      values = filtered.map((p) => p.value as number);
      // Fallback: use aggregated graphData.points (viewport first, then any) so metrics show when chart has data
      if (values.length === 0 && graphData.points?.length) {
        let agg = graphData.points
          .filter((p) => p.x >= windowStart && p.x <= windowEnd && p.y != null && p.y > 0)
          .map((p) => p.y as number);
        if (agg.length === 0) {
          agg = graphData.points
            .filter((p) => p.y != null && p.y > 0)
            .map((p) => p.y as number);
        }
        if (agg.length > 0) values = agg;
      }
    }
    if (values.length === 0) return { min: 0, average: 0, max: 0 };
    return {
      min: Math.round(Math.min(...values)),
      max: Math.round(Math.max(...values)),
      average: Math.round(values.reduce((sum, val) => sum + val, 0) / values.length),
    };
  }, [selectedPeriod, graphData, isTodaySelected, activeDevice?.deviceId, historicalDayRawPointsKey]);

  // Calculate metrics from weekly data (Week view)
  const weeklyMetrics = React.useMemo(() => {
    if (weeklyHeartRateData.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const validDays = weeklyHeartRateData.filter((d) => d.avg !== null && d.avg > 0);
    if (validDays.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const averages = validDays.map((d) => d.avg!);
    const mins = validDays.map((d) => d.min).filter((v) => v !== null && v > 0) as number[];
    const maxs = validDays.map((d) => d.max).filter((v) => v !== null && v > 0) as number[];
    
    return {
      min: mins.length > 0 ? Math.round(Math.min(...mins)) : Math.round(Math.min(...averages)),
      max: maxs.length > 0 ? Math.round(Math.max(...maxs)) : Math.round(Math.max(...averages)),
      average: Math.round(averages.reduce((sum, val) => sum + val, 0) / averages.length),
    };
  }, [weeklyHeartRateData]);

  // Calculate metrics from monthly data (Month view)
  const monthlyMetrics = React.useMemo(() => {
    if (monthlyHeartRateData.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const validDays = monthlyHeartRateData.filter((d) => d.avg !== null && d.avg > 0);
    if (validDays.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const averages = validDays.map((d) => d.avg!);
    const mins = validDays.map((d) => d.min).filter((v) => v !== null && v > 0) as number[];
    const maxs = validDays.map((d) => d.max).filter((v) => v !== null && v > 0) as number[];
    
    return {
      min: mins.length > 0 ? Math.round(Math.min(...mins)) : Math.round(Math.min(...averages)),
      max: maxs.length > 0 ? Math.round(Math.max(...maxs)) : Math.round(Math.max(...averages)),
      average: Math.round(averages.reduce((sum, val) => sum + val, 0) / averages.length),
    };
  }, [monthlyHeartRateData]);

  // Use appropriate metrics based on selected period
  const displayMetrics = selectedPeriod === 'Week' ? weeklyMetrics : 
                         selectedPeriod === 'Month' ? monthlyMetrics : metrics;

  // Chart data - now uses backend-provided data (Day view)
  const chartData = React.useMemo(() => {
    // For Day view, use backend-provided graph data
    if (selectedPeriod === 'Day') {
      if (!graphData || !graphData.points || graphData.points.length === 0) {
        return [];
      }
      // Backend already provides points in { x, y } format
      return graphData.points;
    }

    // For Week/Month views, use existing data
    if (heartRateData.length === 0) return [];
    return heartRateData.map((point) => ({
      x: point.timestamp,
      y: point.value,
    }));
  }, [selectedPeriod, graphData, heartRateData]);

  // Respiration chart data for overlay (Day view: today from manager, previous day from historical fetch)
  const respirationChartData = React.useMemo(() => {
    if (selectedPeriod !== 'Day' || !respirationOverlayChecked) {
      return [];
    }
    if (isTodaySelected) {
      if (!respirationGraphData || !respirationGraphData.points || respirationGraphData.points.length === 0) {
        return [];
      }
      return respirationGraphData.points;
    }
    // Previous day: use historically fetched and aggregated respiration
    if (!historicalRespirationGraphData || !historicalRespirationGraphData.points || historicalRespirationGraphData.points.length === 0) {
      return [];
    }
    return historicalRespirationGraphData.points;
  }, [selectedPeriod, respirationGraphData, respirationOverlayChecked, isTodaySelected, historicalRespirationGraphData]);

  // Chart-ready gate: Check if graphData is valid for rendering
  const isChartReady = React.useMemo(() => {
    if (selectedPeriod !== 'Day') {
      return chartData.length > 0 && skiaFont !== null;
    }
    
    // Day view: Check if graphData is valid AND font is loaded
    if (!graphData) {
      console.log('[HeartRateInsights] isChartReady: graphData is null');
      return false;
    }
    
    // Font must be loaded for axes to render
    if (!skiaFont) {
      console.log('[HeartRateInsights] isChartReady: font not loaded yet');
      return false;
    }
    
    // Must have points
    if (!graphData.points || graphData.points.length === 0) {
      console.log('[HeartRateInsights] isChartReady: no points', { pointsLength: graphData.points?.length || 0 });
      return false;
    }
    
    // X domain must be valid (start < end)
    if (!graphData.xDomain || 
        graphData.xDomain[0] >= graphData.xDomain[1] ||
        !Number.isFinite(graphData.xDomain[0]) ||
        !Number.isFinite(graphData.xDomain[1])) {
      console.log('[HeartRateInsights] isChartReady: invalid xDomain', { xDomain: graphData.xDomain });
      return false;
    }
    
    // Y domain must be valid (start < end)
    if (!graphData.yDomain || 
        graphData.yDomain[0] >= graphData.yDomain[1] ||
        !Number.isFinite(graphData.yDomain[0]) ||
        !Number.isFinite(graphData.yDomain[1])) {
      console.log('[HeartRateInsights] isChartReady: invalid yDomain', { yDomain: graphData.yDomain });
      return false;
    }
    
    console.log('[HeartRateInsights] isChartReady: TRUE', {
      pointsLength: graphData.points.length,
      xDomain: graphData.xDomain,
      yDomain: graphData.yDomain,
      fontLoaded: !!skiaFont,
    });
    return true;
  }, [selectedPeriod, graphData, chartData, skiaFont]);


  // Format weekly data for Victory Native Bar chart (Week view)
  const weeklyChartData = React.useMemo(() => {
    if (weeklyHeartRateData.length === 0) return [];
    
    // CRITICAL: Include ALL 7 days with sequential x values (0-6)
    // This ensures bars are properly spaced and don't merge into one continuous bar
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const formatted = [];
    
    for (let i = 0; i < 7; i++) {
      const dayData = weeklyHeartRateData.find((d) => d.dayIndex === i);
      if (dayData) {
        formatted.push({
          x: i, // MUST be sequential: 0, 1, 2, 3, 4, 5, 6
          y: dayData.avg !== null && dayData.avg > 0 ? dayData.avg : 0, // Use 0 if no data
          day: dayData.day,
          date: dayData.date,
          isPartial: dayData.isPartial,
          min: dayData.min,
          max: dayData.max,
          hasData: dayData.avg !== null && dayData.avg > 0,
        });
      } else {
        // Day exists in week but no data - include with 0 to maintain spacing but not show bar
        formatted.push({
          x: i, // Sequential x value (0-6) - CRITICAL for proper spacing
          y: 0, // Zero value - Bar component will handle this correctly
          day: dayNames[i],
          date: '',
          isPartial: false,
          min: null,
          max: null,
          hasData: false,
        });
      }
    }
    
    console.log('[HeartRateInsights] Weekly chart data updated. All 7 days:', formatted.length, 'Data:', formatted.map(d => ({ day: d.day, x: d.x, y: d.y, hasData: d.hasData })));
    
    return formatted;
  }, [weeklyHeartRateData]);

  // Format monthly data for Victory Native Bar chart (Month view)
  const monthlyChartData = React.useMemo(() => {
    if (monthlyHeartRateData.length === 0) return [];
    
    // Include ALL days in month with sequential x values (0 to daysInMonth-1)
    const formatted = [];
    const daysInMonth = monthlyHeartRateData.length;
    
    for (let i = 0; i < daysInMonth; i++) {
      const dayData = monthlyHeartRateData.find((d) => d.dayIndex === i);
      if (dayData) {
        formatted.push({
          x: i, // Sequential x value (0 to daysInMonth-1)
          y: dayData.avg !== null && dayData.avg > 0 ? dayData.avg : 0,
          day: dayData.day,
          date: dayData.date,
          isPartial: dayData.isPartial,
          min: dayData.min,
          max: dayData.max,
          hasData: dayData.avg !== null && dayData.avg > 0,
        });
      } else {
        // Day exists in month but no data
        formatted.push({
          x: i,
          y: 0,
          day: i + 1,
          date: '',
          isPartial: false,
          min: null,
          max: null,
          hasData: false,
        });
      }
    }
    
    console.log('[HeartRateInsights] Monthly chart data updated. Days:', formatted.length);
    
    return formatted;
  }, [monthlyHeartRateData]);

  // Y-axis domain for monthly view
  const monthlyYDomain = React.useMemo<[number, number] | undefined>(() => {
    if (monthlyChartData.length === 0) return [0, 140];
    
    const values = monthlyChartData.map((d) => d.y).filter((v) => v > 0);
    if (values.length === 0) return [0, 140];
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.2 || 10;
    
    return [Math.max(0, Math.floor(min - padding)), Math.min(140, Math.ceil(max + padding))];
  }, [monthlyChartData]);

  // Format X-axis labels for monthly view (day numbers)
  const formatMonthDayLabel = React.useCallback((label: string | number) => {
    const dayNum = typeof label === 'number' ? Math.round(label) : parseInt(String(label), 10);
    // Show every 5th day to avoid crowding
    if (dayNum % 5 === 0 || dayNum === 0) {
      return String(dayNum + 1);
    }
    return '';
  }, []);

  // Get latest point for tooltip
  const latestPoint = React.useMemo(() => {
    if (selectedPeriod === 'Day') {
      // Get latest raw HR point from buffer (actual measurement time, not aggregated bucket center)
      // This ensures tooltip time stays consistent across zoom levels
      if (activeDevice?.deviceId) {
        const rawPoints = getRawPoints(activeDevice.deviceId);
        // Find the last non-null point (skip NULL values as requested)
        for (let i = rawPoints.length - 1; i >= 0; i--) {
          const rawPoint = rawPoints[i];
          if (rawPoint && rawPoint.value !== null && rawPoint.value !== undefined) {
            // Use raw timestamp (actual measurement time) - this won't change with zoom
            return { timestamp: rawPoint.timestamp, value: rawPoint.value };
          }
        }
      }
      // Fallback: Use graph data if raw buffer not available
      if (graphData && graphData.points && graphData.points.length > 0) {
        // Find the last non-null point (skip gaps)
        for (let i = graphData.points.length - 1; i >= 0; i--) {
          const point = graphData.points[i];
          if (point && point.y !== null && point.y !== undefined) {
            return { timestamp: point.x, value: point.y };
          }
        }
        // If all points are null, return the last point with null value
        const last = graphData.points[graphData.points.length - 1];
        if (last) {
          return { timestamp: last.x, value: last.y }; // y can be null
        }
      }
      return null;
    }
    if (heartRateData.length === 0) return null;
    return heartRateData[heartRateData.length - 1];
  }, [selectedPeriod, graphData, heartRateData, activeDevice?.deviceId]);

  // Get latest respiration point for tooltip - finds last VALID (non-null) point
  const latestRespirationPoint = React.useMemo(() => {
    if (selectedPeriod !== 'Day' || !respirationOverlayChecked) {
      return null;
    }
    // Previous day: use historically aggregated respiration data
    if (!isTodaySelected && historicalRespirationGraphData?.points?.length) {
      const points = historicalRespirationGraphData.points;
      for (let i = points.length - 1; i >= 0; i--) {
        const point = points[i];
        if (point && point.y !== null && point.y !== undefined) {
          return { timestamp: point.x, value: point.y };
        }
      }
      const last = points[points.length - 1];
      if (last) return { timestamp: last.x, value: last.y };
      return null;
    }
    // Today: Get latest raw Respiration point from buffer (actual measurement time, not aggregated bucket center)
    if (activeDevice?.deviceId) {
      const rawPoints = getRespirationRawPoints(activeDevice.deviceId);
      for (let i = rawPoints.length - 1; i >= 0; i--) {
        const rawPoint = rawPoints[i];
        if (rawPoint && rawPoint.value !== null && rawPoint.value !== undefined) {
          return { timestamp: rawPoint.timestamp, value: rawPoint.value };
        }
      }
    }
    // Fallback: Use graph data if raw buffer not available (today)
    if (respirationGraphData && respirationGraphData.points && respirationGraphData.points.length > 0) {
      const points = respirationGraphData.points;
      for (let i = points.length - 1; i >= 0; i--) {
        const point = points[i];
        if (point && point.y !== null && point.y !== undefined) {
          return { timestamp: point.x, value: point.y };
        }
      }
      const last = points[points.length - 1];
      if (last) return { timestamp: last.x, value: last.y };
    }
    return null;
  }, [selectedPeriod, respirationGraphData, respirationOverlayChecked, zoomIndex, activeDevice?.deviceId, isTodaySelected, historicalRespirationGraphData]);

  // Update top tooltip when latest point changes
  React.useEffect(() => {
    if (latestPoint && selectedPeriod === 'Day') {
      // When respiration overlay is checked, ALWAYS include respiration (even if null, show '--')
      const respirationValue = respirationOverlayChecked 
        ? (latestRespirationPoint ? latestRespirationPoint.value : null)
        : undefined;
      
      // Handle null values correctly (gaps)
      setTopTooltipData({
        timestamp: latestPoint.timestamp,
        heartRate: latestPoint.value !== null ? latestPoint.value : null,
        respiration: respirationValue, // Always include when overlay checked (can be null for '--')
      });
    } else {
      setTopTooltipData(null);
    }
  }, [latestPoint, latestRespirationPoint, respirationOverlayChecked, selectedPeriod]);

  // Get start of week (Monday)
  const getWeekStart = React.useCallback((date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }, []);

  // Get end of week (Sunday)
  const getWeekEnd = React.useCallback((date: Date): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  }, [getWeekStart]);

  // Format date for display based on period
  const formattedDate = React.useMemo(() => {
    if (selectedPeriod === 'Day') {
      return selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } else if (selectedPeriod === 'Week') {
      const weekStart = getWeekStart(selectedDate);
      const weekEnd = getWeekEnd(selectedDate);
      const startStr = weekStart.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      const endStr = weekEnd.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
      return `${startStr} - ${endStr}`;
    } else {
      return selectedDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }
  }, [selectedDate, selectedPeriod]);

  // Navigate to previous period
  const goToPrevious = () => {
    const newDate = new Date(selectedDate);
    if (selectedPeriod === 'Day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (selectedPeriod === 'Week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setSelectedDate(newDate);
  };

  // Navigate to next period - prevent going to future dates
  const goToNext = () => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    const newDate = new Date(selectedDate);
    if (selectedPeriod === 'Day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (selectedPeriod === 'Week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    // Only update if new date is not in the future
    if (newDate <= today) {
      setSelectedDate(newDate);
    }
  };

  // Check if next button should be disabled (already at or past today)
  const canGoNext = React.useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const testDate = new Date(selectedDate);
    if (selectedPeriod === 'Day') {
      testDate.setDate(testDate.getDate() + 1);
    } else if (selectedPeriod === 'Week') {
      testDate.setDate(testDate.getDate() + 7);
    } else {
      testDate.setMonth(testDate.getMonth() + 1);
    }
    return testDate <= today;
  }, [selectedDate, selectedPeriod]);

  // Reset to today when period changes
  React.useEffect(() => {
    setSelectedDate(new Date());
  }, [selectedPeriod]);

  // Domain is now updated in the effect above (immediately when graphData changes)
  // This effect is no longer needed - domain updates are handled by the live mode effect

  // Format time for X-axis labels
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // X-axis domain - computed from buffer data for Day view (not API-provided)
  // If user has panned/zoomed, preserve their current domain
  const resolvedXDomain = React.useMemo<[number, number] | null>(() => {
    if (selectedPeriod === 'Day') {
      // If user has panned/zoomed (not in live mode), use their current domain
      if (!isLive && xDomain) {
        const clamped = clampToData(xDomain);
        console.log('[HeartRateInsights] resolvedXDomain: user domain (not live)', { xDomain, clamped });
        return clamped;
      }
      // In live mode, compute domain from graphData
      const live = computeLiveDomain();
      const result = live ? clampToData(live) : null;
      console.log('[HeartRateInsights] resolvedXDomain: live mode', { 
        live, 
        result, 
        hasGraphData: !!graphData,
        graphDataXDomain: graphData?.xDomain,
      });
      return result;
    }
    
    // For Week/Month views, use existing logic
    if (xDomain) {
      return clampToData(xDomain);
    }
    const live = computeLiveDomain();
    return live ? clampToData(live) : null;
  }, [clampToData, computeLiveDomain, xDomain, selectedPeriod, isLive, graphData]);

  // Compute loading state for Day view. When no device, don't show skeleton — show "No data available".
  const shouldShowDayLoading = React.useMemo(() => {
    if (selectedPeriod !== 'Day') return false;
    if (!activeDevice?.deviceId) return false;
    if (!isTodaySelected) return isLoadingHistoricalDay;
    if (graphData && isChartReady) return false;
    return !dayGraphReady && graphData === null;
  }, [selectedPeriod, graphData, isChartReady, dayGraphReady, isTodaySelected, isLoadingHistoricalDay, activeDevice?.deviceId]);

  // Dynamic Y-axis calculation for Heart Rate (Day view only, all zoom levels)
  // Calculates domain based on visible data points with 10% padding
  const calculateDynamicYDomain = React.useCallback((
    points: Array<{ x: number; y: number }>,
    xDomain: [number, number] | null
  ): [number, number] => {
    // Step 1: Filter visible points within X domain
    let visiblePoints = points;
    if (xDomain) {
      visiblePoints = points.filter(p => 
        p.x >= xDomain[0] && p.x <= xDomain[1]
      );
    }
    
    // Step 2: Collect valid HR values (ignore null, zero, NaN)
    const validValues = visiblePoints
      .map(p => p.y)
      .filter((y): y is number => 
        y !== null && 
        y !== undefined && 
        !isNaN(y) && 
        isFinite(y) && 
        y > 0
      );
    
    // Step 3: Calculate min/max
    if (validValues.length === 0) {
      // No valid points - use default domain
      return [40, 140];
    }
    
    const minHR = Math.min(...validValues);
    const maxHR = Math.max(...validValues);
    
    // Step 4: Apply 10% padding
    const paddingMin = minHR * 0.10;
    const paddingMax = maxHR * 0.10;
    
    let yMin = minHR - paddingMin;
    let yMax = maxHR + paddingMax;
    
    // Step 5: Safety guards
    if (minHR === maxHR) {
      // Single data point or all same value
      yMin = minHR - 5;
      yMax = maxHR + 5;
    }
    
    if (minHR <= 0) {
      yMin = 0;
      yMax = maxHR + 10;
    }
    
    if (validValues.length < 2) {
      // Less than 2 visible points - use last known domain or default
      return [40, 140];
    }
    
    // Ensure reasonable bounds
    yMin = Math.max(0, Math.floor(yMin));
    yMax = Math.min(200, Math.ceil(yMax)); // Cap at 200 BPM
    
    return [yMin, yMax];
  }, []);

  // Generate grid ticks for Y-axis (6-7 lines with BPM labels)
  const generateGridTicks = React.useCallback((yMin: number, yMax: number): number[] => {
    const range = yMax - yMin;
    const gridStep = Math.ceil(range / 6);
    const ticks: number[] = [];
    
    for (let i = 0; i <= 6; i++) {
      const tick = yMin + (i * gridStep);
      // Round to nearest integer BPM
      ticks.push(Math.round(tick));
    }
    
    // Ensure ticks don't exceed domain
    return ticks.filter(t => t >= yMin && t <= yMax);
  }, []);


  // Y-axis domain - dynamic for Day view, fixed for Week/Month views
  const yDomain = React.useMemo<[number, number] | undefined>(() => {
    if (selectedPeriod === 'Day') {
      // Dynamic Y-axis based on visible data points (filter null y for domain calc)
      const validPoints = chartData?.filter((p): p is { x: number; y: number } => p.y != null) ?? [];
      if (validPoints.length > 0 && resolvedXDomain) {
        return calculateDynamicYDomain(validPoints, resolvedXDomain);
      }
      // Fallback to default if no data
      return [40, 140];
    }
    // Default: 0-140 BPM for Week/Month views
    return [0, 140];
  }, [selectedPeriod, chartData, resolvedXDomain, calculateDynamicYDomain]);

  // Dynamic Y-axis calculation for Respiration Overlay (Day view only, all zoom levels)
  // Calculates domain based on visible data points with 10% padding
  const calculateDynamicRespirationYDomain = React.useCallback((
    points: Array<{ x: number; y: number | null }>,
    xDomain: [number, number] | null
  ): [number, number] => {
    // Step 1: Filter visible points within X domain
    let visiblePoints = points;
    if (xDomain) {
      visiblePoints = points.filter(p => 
        p.x >= xDomain[0] && p.x <= xDomain[1]
      );
    }
    
    // Step 2: Collect valid Respiration values (ignore null, zero, NaN)
    const validValues = visiblePoints
      .map(p => p.y)
      .filter((y): y is number => 
        y !== null && 
        y !== undefined && 
        !isNaN(y) && 
        isFinite(y) && 
        y > 0
      );
    
    // Step 3: Calculate min/max
    if (validValues.length === 0) {
      // No valid points - use default domain
      return [0, 20];
    }
    
    const minResp = Math.min(...validValues);
    const maxResp = Math.max(...validValues);
    
    // Step 4: Apply 10% padding
    const paddingMin = minResp * 0.10;
    const paddingMax = maxResp * 0.10;
    
    let yMin = minResp - paddingMin;
    let yMax = maxResp + paddingMax;
    
    // Step 5: Safety guards
    if (minResp === maxResp) {
      // Single data point or all same value
      yMin = Math.max(0, minResp - 1);
      yMax = maxResp + 1;
    }
    
    if (minResp <= 0) {
      yMin = 0;
      yMax = maxResp + 2;
    }
    
    if (validValues.length < 2) {
      // Less than 2 visible points - use last known domain or default
      return [0, 20];
    }
    
    // Ensure reasonable bounds for respiration (0-30 Resp/Min max)
    yMin = Math.max(0, Math.floor(yMin));
    yMax = Math.min(30, Math.ceil(yMax)); // Cap at 30 Resp/Min
    
    return [yMin, yMax];
  }, []);


  // Respiration Y-axis domain - dynamic for Day view when overlay is checked
  const respirationYDomain = React.useMemo<[number, number] | undefined>(() => {
    if (selectedPeriod === 'Day' && respirationOverlayChecked && respirationChartData && respirationChartData.length > 0 && resolvedXDomain) {
      // Dynamic Y-axis based on visible data points
      return calculateDynamicRespirationYDomain(respirationChartData, resolvedXDomain);
    }
    // Fallback to default if no data or overlay not checked
    return [0, 20];
  }, [selectedPeriod, respirationOverlayChecked, respirationChartData, resolvedXDomain, calculateDynamicRespirationYDomain]);

  // Chart domain object - uses backend-provided domains
  const chartDomain = React.useMemo(() => {
    if (!resolvedXDomain || !yDomain) return undefined;
    return {
      x: [...resolvedXDomain] as [number, number],
      y: [...yDomain] as [number, number],
    };
  }, [resolvedXDomain, yDomain]);

  // Respiration chart domain object - for split view
  const respirationChartDomain = React.useMemo(() => {
    if (!resolvedXDomain || !respirationYDomain) return undefined;
    return {
      x: [...resolvedXDomain] as [number, number],
      y: [...respirationYDomain] as [number, number],
    };
  }, [resolvedXDomain, respirationYDomain]);

  // Dynamic tick count for respiration Y-axis to avoid duplicate labels
  // When domain range is small, fewer ticks prevent rounding to same values
  const respirationYTickCount = React.useMemo(() => {
    if (!respirationYDomain) return 5; // Default fallback
    
    const [yMin, yMax] = respirationYDomain;
    const range = yMax - yMin;
    
    // For small ranges (< 5), use fewer ticks to avoid duplicates
    if (range < 5) {
      return 4; // 4 ticks for small ranges (e.g., 6-8)
    } else if (range < 10) {
      return 5; // 5 ticks for medium ranges (e.g., 0-10)
    } else {
      return 6; // 6 ticks for larger ranges (e.g., 0-20)
    }
  }, [respirationYDomain]);

  // Y-axis domain for weekly view (calculated from data with padding)
  const weeklyYDomain = React.useMemo<[number, number] | undefined>(() => {
    if (weeklyChartData.length === 0) return [0, 140];
    
    const values = weeklyChartData.map((d) => d.y).filter((v) => v > 0);
    if (values.length === 0) return [0, 140];
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.2 || 10; // 20% padding or minimum 10
    
    return [Math.max(0, Math.floor(min - padding)), Math.min(140, Math.ceil(max + padding))];
  }, [weeklyChartData]);

  // Format X-axis labels for weekly view (day names)
  const formatWeekDayLabel = React.useCallback((label: string | number) => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const index = typeof label === 'number' ? label : parseInt(String(label), 10);
    return dayNames[index] || String(label);
  }, []);


  // Calculate tooltip position based on latest point
  const tooltipPosition = React.useMemo(() => {
    if (!latestPoint || !resolvedXDomain || !yDomain) return null;
    
    const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    // Adjust chart height based on split view
    const chartHeight = respirationOverlayChecked && respirationChartData.length > 0
      ? (280 - CHART_PADDING.top - CHART_PADDING.bottom) / 2 // Half height in split view
      : 280 - CHART_PADDING.top - CHART_PADDING.bottom; // Full height in single view
    
    const [xStart, xEnd] = resolvedXDomain;
    const xRange = xEnd - xStart;
    const baseXPosition = CHART_PADDING.left + ((latestPoint.timestamp - xStart) / xRange) * chartWidth;
    
    const [yMin, yMax] = yDomain;
    const yRange = yMax - yMin;
    const hrValue = latestPoint.value ?? yMin;
    const baseYPosition = CHART_PADDING.top + chartHeight - ((hrValue - yMin) / yRange) * chartHeight;
    
    let xPosition = baseXPosition;
    let yPosition = baseYPosition;
    
    if (transformMatrix && Array.isArray(transformMatrix) && transformMatrix.length >= 16) {
      const translateX = transformMatrix[12] || 0;
      const translateY = transformMatrix[13] || 0;
      const scaleX = transformMatrix[0] || 1;
      const scaleY = transformMatrix[5] || 1;
      
      const chartCenterX = CHART_PADDING.left + chartWidth / 2;
      const chartCenterY = CHART_PADDING.top + chartHeight / 2;
      
      const relativeX = baseXPosition - chartCenterX;
      const relativeY = baseYPosition - chartCenterY;
      
      xPosition = relativeX * scaleX + chartCenterX + translateX;
      yPosition = relativeY * scaleY + chartCenterY + translateY;
    }
    
    const tooltipWidth = 90;
    const tooltipHeight = 50;
    
    let tooltipX = xPosition - tooltipWidth / 2;
    
    const minX = CHART_PADDING.left + 5;
    const maxX = width - CHART_PADDING.right - tooltipWidth - 5;
    tooltipX = Math.max(minX, Math.min(maxX, tooltipX));
    
    const tooltipY = yPosition - tooltipHeight - 10;
    
    return {
      x: tooltipX,
      y: Math.max(CHART_PADDING.top, tooltipY),
      pointX: xPosition,
      pointY: yPosition,
    };
  }, [latestPoint, resolvedXDomain, yDomain, width, transformMatrix, respirationOverlayChecked, respirationChartData]);

  // Calculate respiration tooltip position based on latest respiration point
  const respirationTooltipPosition = React.useMemo(() => {
    if (!latestRespirationPoint || !resolvedXDomain || !respirationYDomain || !respirationGraphData) return null;
    
    const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    // Chart wrapper is 320px total, each container is 50% = 160px
    // Use same chartHeight calculation as heart rate for consistency
    const chartHeight = (280 - CHART_PADDING.top - CHART_PADDING.bottom) / 2; // Half height in split view
    
    // Lower chart offset calculation:
    // Upper chart drawing area ends at: CHART_PADDING.top + chartHeight
    // Add divider (1px) and lower chart's top padding to get drawing area start
    // This should match: 160px (container start) + CHART_PADDING.top = 160 + 18 = 178px
    // But using chartHeight: CHART_PADDING.top + chartHeight + 1 + CHART_PADDING.top
    // If chartHeight = 111px: 18 + 111 + 1 + 18 = 148px (doesn't match)
    // 
    // Actually, the lower chart container starts at 160px (50% of 320px)
    // Lower chart drawing area starts at: 160 + CHART_PADDING.top = 160 + 18 = 178px
    // So: lowerChartDrawingStart = 160 + CHART_PADDING.top
    // But we need to express this in terms of chartHeight:
    // If upper chart ends at CHART_PADDING.top + chartHeight, and chartHeight = 111px
    // Then: CHART_PADDING.top + chartHeight = 18 + 111 = 129px (upper chart drawing end)
    // Lower chart container: 160px, drawing area: 160 + 18 = 178px
    // Difference: 178 - 129 = 49px = chartHeight - (chartHeight - (160 - CHART_PADDING.top - CHART_PADDING.bottom))
    // 
    // Simpler: Lower chart container is at 160px, drawing area at 160 + 18 = 178px
    // Express as: (CHART_PADDING.top + chartHeight) + (160 - (CHART_PADDING.top + chartHeight)) + CHART_PADDING.top
    // = CHART_PADDING.top + chartHeight + (160 - CHART_PADDING.top - chartHeight) + CHART_PADDING.top
    // = 160 + CHART_PADDING.top = 178px
    const chartWrapperHeight = 320;
    const singleChartContainerHeight = chartWrapperHeight / 2; // 160px
    const dividerHeight = 1; // Divider between charts
    const lowerChartDrawingStart = singleChartContainerHeight + dividerHeight + CHART_PADDING.top; // 160 + 1 + 18 = 179px
    
    const [xStart, xEnd] = resolvedXDomain;
    const xRange = xEnd - xStart;
    const baseXPosition = CHART_PADDING.left + ((latestRespirationPoint.timestamp - xStart) / xRange) * chartWidth;
    
    // Respiration values use [0, 20] domain
    const [respYMin, respYMax] = respirationYDomain;
    const respYRange = respYMax - respYMin;
    
    // Use EXACT same formula as heart rate tooltip, but use lowerChartDrawingStart
    // Formula: start + height - (normalized_value * height)
    const respValue = latestRespirationPoint.value ?? respYMin;
    const baseYPosition = lowerChartDrawingStart + chartHeight - ((respValue - respYMin) / respYRange) * chartHeight;
    
    let xPosition = baseXPosition;
    let yPosition = baseYPosition;
    
    if (transformMatrix && Array.isArray(transformMatrix) && transformMatrix.length >= 16) {
      const translateX = transformMatrix[12] || 0;
      const translateY = transformMatrix[13] || 0;
      const scaleX = transformMatrix[0] || 1;
      const scaleY = transformMatrix[5] || 1;
      
      const chartCenterX = CHART_PADDING.left + chartWidth / 2;
      const chartCenterY = lowerChartDrawingStart + chartHeight / 2; // Center of lower chart drawing area
      
      const relativeX = baseXPosition - chartCenterX;
      const relativeY = baseYPosition - chartCenterY;
      
      xPosition = relativeX * scaleX + chartCenterX + translateX;
      yPosition = relativeY * scaleY + chartCenterY + translateY;
    }
    
    const tooltipWidth = 90;
    const tooltipHeight = 50;
    
    let tooltipX = xPosition - tooltipWidth / 2;
    
    const minX = CHART_PADDING.left + 5;
    const maxX = width - CHART_PADDING.right - tooltipWidth - 5;
    tooltipX = Math.max(minX, Math.min(maxX, tooltipX));
    
    // Position respiration tooltip ABOVE the point
    const tooltipY = yPosition - tooltipHeight - 10;
    
    return {
      x: tooltipX,
      y: Math.max(lowerChartDrawingStart, tooltipY),
      pointX: xPosition,
      pointY: yPosition,
    };
  }, [latestRespirationPoint, resolvedXDomain, respirationYDomain, width, transformMatrix, respirationGraphData, respirationChartData]);

  const doubleTapGesture = React.useMemo(() => {
    return Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .maxDelay(250)
      .onEnd(() => {
        returnToLive();
      });
  }, [returnToLive]);

  const customGestures = React.useMemo(() => Gesture.Race(doubleTapGesture), [doubleTapGesture]);

  // Show skeleton immediately while data is loading
  const isInitialLoading = shouldShowDayLoading || 
    (selectedPeriod === 'Week' && isLoadingWeekly) ||
    (selectedPeriod === 'Month' && isLoadingMonthly) ||
    (selectedPeriod !== 'Day' && isLoading && heartRateData.length === 0);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient 
        colors={['#1D244D', '#02041A', '#1A1D3E']} 
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Estimated HR Trends</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Period Selector Tabs */}
        <View style={styles.periodContainer}>
          {(['Day', 'Week', 'Month'] as const).map((period) => (
            <TouchableOpacity
              key={period}
              style={[styles.periodTab, selectedPeriod === period && styles.periodTabActive]}
              onPress={() => setSelectedPeriod(period)}
              activeOpacity={0.8}
            >
              <Text style={[styles.periodTabText, selectedPeriod === period && styles.periodTabTextActive]}>
                {period}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date Navigation */}
        <View style={styles.dateNavigation}>
          <TouchableOpacity onPress={goToPrevious} style={styles.dateNavButton} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color="#C7D6FF" />
          </TouchableOpacity>
          <Text style={styles.dateText}>{formattedDate}</Text>
          <TouchableOpacity 
            onPress={goToNext} 
            style={canGoNext ? styles.dateNavButton : [styles.dateNavButton, styles.dateNavButtonDisabled]} 
            activeOpacity={0.8}
            disabled={!canGoNext}
          >
            <Ionicons name="chevron-forward" size={20} color={canGoNext ? "#C7D6FF" : "rgba(199,214,255,0.3)"} />
          </TouchableOpacity>
        </View>

        {/* Show skeleton when loading, otherwise show content */}
        {isInitialLoading ? (
          <HeartRateSkeleton />
        ) : (
          <>
            {/* Key Heart Rate Metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Min Est. HR</Text>
                <Text style={styles.metricValue}>{displayMetrics.min}</Text>
                <Text style={styles.metricUnit}>BPM</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Avg Est. HR</Text>
                <Text style={styles.metricValue}>{displayMetrics.average}</Text>
                <Text style={styles.metricUnit}>BPM</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Max Est. HR</Text>
                <Text style={styles.metricValue}>{displayMetrics.max}</Text>
                <Text style={styles.metricUnit}>BPM</Text>
              </View>
            </View>

            {/* Last Sync Time */}
            <View style={styles.lastSyncContainer}>
              <Text style={styles.lastSyncText}>
                Last sync: {(() => {
                  if (selectedPeriod === 'Day') {
                    // Day view: Use raw buffer data to get last valid (non-NULL) HR measurement time
                    if (activeDevice?.deviceId) {
                      const rawPoints = getRawPoints(activeDevice.deviceId);
                      // Find the last non-null point (skip NULL values)
                      for (let i = rawPoints.length - 1; i >= 0; i--) {
                        const rawPoint = rawPoints[i];
                        if (rawPoint && rawPoint.value !== null && rawPoint.value !== undefined) {
                          const lastTimestamp = rawPoint.timestamp;
                          const now = Date.now();
                          const displayTime = lastTimestamp > now ? now : lastTimestamp;
                          return new Date(displayTime).toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: false 
                          });
                        }
                      }
                    }
                    // Fallback: Use graphData if raw buffer not available
                    if (graphData && graphData.points && graphData.points.length > 0) {
                      // Find the last non-null point (skip NULL buckets)
                      for (let i = graphData.points.length - 1; i >= 0; i--) {
                        const point = graphData.points[i];
                        if (point && point.y !== null && point.y !== undefined) {
                          const lastTimestamp = point.x;
                          const now = Date.now();
                          const displayTime = lastTimestamp > now ? now : lastTimestamp;
                          return new Date(displayTime).toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: false 
                          });
                        }
                      }
                    }
                    return 'No data';
                  } else {
                    // Week/Month views: Use heartRateData
                    if (heartRateData.length > 0) {
                      const lastTimestamp = heartRateData[heartRateData.length - 1].timestamp;
                      const now = Date.now();
                      const displayTime = lastTimestamp > now ? now : lastTimestamp;
                          return new Date(displayTime).toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: false 
                          });
                    }
                    return 'No data';
                  }
                })()}
              </Text>
            </View>

                {/* Heart Rate Graph with Victory Native */}
            {selectedPeriod === 'Month' ? (
              // Monthly Bar Chart View
              isLoadingMonthly || (!hasLoadedMonthly && monthlyHeartRateData.length === 0 && !monthlyError) ? (
            <HeartRateSkeleton />
          ) : monthlyError && monthlyHeartRateData.length === 0 ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.errorText}>{monthlyError}</Text>
              <TouchableOpacity onPress={fetchMonthlyHeartRateData} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : monthlyChartData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No monthly heart rate data available</Text>
              <Text style={styles.emptySubtext}>Data will appear here when available</Text>
            </View>
          ) : (
            <View style={styles.chartContainer}>
              {/* Healthy Range Legend */}
              <View style={styles.legendContainer}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendRectangle, { backgroundColor: 'rgba(126,166,255,0.3)' }]} />
                  <Text style={styles.legendText}>Your healthy range</Text>
                </View>
              </View>

              {/* Victory Native Bar Chart */}
              <View style={styles.chartWrapper}>
                <CartesianChart
                  data={monthlyChartData}
                  xKey="x"
                  yKeys={['y']}
                  padding={MONTHLY_CHART_PADDING}
                  domain={{
                    x: [-0.5, monthlyChartData.length - 0.5],
                    y: monthlyYDomain,
                  }}
                  xAxis={{
                    font: skiaFont,
                    tickCount: 7,
                    labelColor: 'rgba(199,214,255,0.75)',
                    lineColor: 'rgba(255,255,255,0.08)',
                    labelOffset: 4,
                    formatXLabel: formatMonthDayLabel,
                  }}
                  yAxis={[
                    {
                      font: skiaFont,
                      tickCount: 8,
                      labelColor: 'rgba(199,214,255,0.75)',
                      lineColor: 'rgba(255,255,255,0.08)',
                      labelOffset: 4,
                      formatYLabel: (label) => `${Math.round(Number(label))}`,
                    },
                  ]}
                  transformConfig={{
                    pinch: { enabled: false },
                    pan: { enabled: false },
                  }}
                >
                  {({ points, chartBounds }) => {
                    if (!points?.y || !chartBounds || !Array.isArray(points.y)) {
                      return null;
                    }
                    
                    const chartData = monthlyChartData;
                    if (!chartData?.length) {
                      return null;
                    }
                    
                    const pointsWithData = points.y.filter((p: any, index: number) => {
                      if (!p || index >= chartData.length) return false;
                      const dayData = chartData[index];
                      return dayData?.hasData === true && dayData.y > 0;
                    });
                    
                    if (pointsWithData.length === 0) {
                      return null;
                    }
                    
                    const todayData = chartData.find((d) => d.isPartial && d.hasData);
                    const todayPoint = todayData ? 
                      pointsWithData.find((p: any) => {
                        return p && Math.abs(p.x - todayData.x) < 0.5;
                      }) : null;
                    
                    const allBars = (
                      <Bar
                        points={pointsWithData}
                        chartBounds={chartBounds}
                        color="#FF6B6B"
                        roundedCorners={{ topLeft: 8, topRight: 8 }}
                        innerPadding={0.5}
                        barCount={monthlyChartData.length}
                      />
                    );

                    if (todayPoint) {
                      return (
                        <>
                          {allBars}
                          <Bar
                            points={[todayPoint]}
                            chartBounds={chartBounds}
                            color="rgba(255, 107, 107, 0.6)"
                            roundedCorners={{ topLeft: 8, topRight: 8 }}
                            innerPadding={0.5}
                            barCount={monthlyChartData.length}
                          />
                        </>
                      );
                    }

                    return allBars;
                  }}
                </CartesianChart>
              </View>

            </View>
          )
            ) : selectedPeriod === 'Week' ? (
              // Weekly Bar Chart View
              isLoadingWeekly || (!hasLoadedWeekly && weeklyHeartRateData.length === 0 && !weeklyError) ? (
            <HeartRateSkeleton />
          ) : weeklyError && weeklyHeartRateData.length === 0 ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.errorText}>{weeklyError}</Text>
              <TouchableOpacity onPress={fetchWeeklyHeartRateData} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : weeklyChartData.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No weekly heart rate data available</Text>
              <Text style={styles.emptySubtext}>Data will appear here when available</Text>
            </View>
          ) : (
            <View style={styles.chartContainer}>
              {/* Healthy Range Legend */}
              <View style={styles.legendContainer}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendRectangle, { backgroundColor: 'rgba(126,166,255,0.3)' }]} />
                  <Text style={styles.legendText}>Your healthy range</Text>
                </View>
              </View>

              {/* Victory Native Bar Chart */}
              <View style={styles.chartWrapper}>
                <CartesianChart
                  data={weeklyChartData}
                  xKey="x"
                  yKeys={['y']}
                  padding={WEEKLY_CHART_PADDING}
                  domain={{
                    x: [-0.5, 6.5], // Extended domain to show first and last bars fully
                    y: weeklyYDomain,
                  }}
                  xAxis={{
                    font: skiaFont,
                    tickCount: 7,
                    labelColor: 'rgba(199,214,255,0.75)',
                    lineColor: 'rgba(255,255,255,0.08)',
                    labelOffset: 4,
                    formatXLabel: formatWeekDayLabel,
                  }}
                  yAxis={[
                    {
                      font: skiaFont,
                      tickCount: 8,
                      labelColor: 'rgba(199,214,255,0.75)',
                      lineColor: 'rgba(255,255,255,0.08)',
                      labelOffset: 4,
                      formatYLabel: (label) => `${Math.round(Number(label))}`,
                    },
                  ]}
                  transformConfig={{
                    pinch: { enabled: false },
                    pan: { enabled: false },
                  }}
                >
                  {({ points, chartBounds }) => {
                    // Add null checks to prevent undefined errors
                    if (!points || !points.y || !chartBounds || !Array.isArray(points.y)) {
                      return null;
                    }
                    
                    // Store weeklyChartData in a local variable to avoid Reanimated worklet issues
                    const chartData = weeklyChartData;
                    if (!chartData || chartData.length === 0) {
                      return null;
                    }
                    
                    // Filter out days WITHOUT data (y === 0 or hasData === false)
                    // Only render bars for days that actually have data
                    // The x domain [0, 6] ensures proper spacing even if some days are missing
                    const pointsWithData = points.y.filter((p: any, index: number) => {
                      if (!p || index >= chartData.length) return false;
                      const dayData = chartData[index];
                      return dayData && dayData.hasData === true && dayData.y > 0;
                    });
                    
                    if (pointsWithData.length === 0) {
                      return null;
                    }
                    
                    // Find today's point - match by x value since Victory Native preserves x coordinates
                    const todayData = chartData.find((d) => d.isPartial && d.hasData);
                    const todayPoint = todayData ? 
                      pointsWithData.find((p: any) => {
                        // Match by x value (day index 0-6)
                        return p && Math.abs(p.x - todayData.x) < 0.5;
                      }) : null;
                    
                    // Render only bars with actual data
                    // Use barCount={7} to tell Victory Native there are 7 total positions
                    // innerPadding={0.5} makes bars thinner (50% of space is padding between bars)
                    const allBars = (
                      <Bar
                        points={pointsWithData}
                        chartBounds={chartBounds}
                        color="#FF6B6B"
                        roundedCorners={{ topLeft: 8, topRight: 8 }}
                        innerPadding={0.5}
                        barCount={7}
                      />
                    );

                    // If today exists and has partial data, overlay a lighter bar for today
                    if (todayPoint) {
                      return (
                        <>
                          {allBars}
                          <Bar
                            points={[todayPoint]}
                            chartBounds={chartBounds}
                            color="rgba(255, 107, 107, 0.6)"
                            roundedCorners={{ topLeft: 8, topRight: 8 }}
                            innerPadding={0.5}
                            barCount={7}
                          />
                        </>
                      );
                    }

                    return allBars;
                  }}
                </CartesianChart>
              </View>

            </View>
          )
            ) : (
              // Day Line Chart View
              error && (selectedPeriod !== 'Day' ? heartRateData.length === 0 : !graphData) ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchHeartRateData} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (selectedPeriod === 'Day' ? (
            // Show "No data" when no device or Day graph has no data
            !activeDevice?.deviceId || (dayGraphReady && (!graphData || graphData.points.length === 0))
          ) : heartRateData.length === 0) ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="heart-outline" size={48} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>No data available</Text>
              <Text style={styles.emptySubtext}>Data will appear here when available</Text>
            </View>
          ) : (
          <View style={styles.chartContainer}>
            {/* Respiration Overlay Checkbox with Zoom Controls and Tooltip */}
            <View style={styles.legendContainer}>
              {/* Respiration Overlay Checkbox - Only for Day view */}
              {selectedPeriod === 'Day' && (
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => handleRespirationOverlayToggle(!respirationOverlayChecked)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.checkbox, respirationOverlayChecked && styles.checkboxChecked]}>
                    {respirationOverlayChecked && (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    )}
                  </View>
                  <Text style={styles.checkboxLabel}>Respiration</Text>
                </TouchableOpacity>
              )}
              
              {/* Top Tooltip - Inline with Respiration Overlay, shows value and time */}
              {selectedPeriod === 'Day' && topTooltipData && isChartReady && (
                <View style={styles.topTooltipInline} pointerEvents="none">
                  <View style={styles.topTooltipBoxInline}>
                    {/* Value - First line */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={[styles.topTooltipValueInline, { color: '#FF6B6B' }]}>
                        {topTooltipData.heartRate !== null ? Math.round(topTooltipData.heartRate) : '--'}
                      </Text>
                      {respirationOverlayChecked && (
                        <>
                          <Text style={styles.topTooltipValueSeparator}>
                            {' '}/{' '}
                          </Text>
                          <Text style={[styles.topTooltipValueInline, { color: '#FFD700' }]}>
                            {topTooltipData.respiration !== null && topTooltipData.respiration !== undefined 
                              ? Math.round(topTooltipData.respiration) 
                              : '--'}
                          </Text>
                        </>
                      )}
                    </View>
                    {/* Time - Second line */}
                    <Text style={styles.topTooltipTimeInline}>
                      {formatTime(topTooltipData.timestamp)}
                    </Text>
                  </View>
                </View>
              )}
              
              {/* Zoom Controls - Only for Day view, small buttons on right */}
              {selectedPeriod === 'Day' && (
                <View style={styles.zoomButtonsInline}>
                  <TouchableOpacity
                    style={[styles.zoomButtonSmall, zoomIndex === 0 && styles.zoomButtonDisabled]}
                    onPress={() => {
                      const newIndex = Math.max(0, zoomIndex - 1);
                      setZoomIndex(newIndex);
                      // Zoom level update is handled by DayGraphManager subscription
                    }}
                    disabled={zoomIndex === 0}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="remove" size={14} color={zoomIndex === 0 ? '#666' : '#FFFFFF'} />
                  </TouchableOpacity>
                  <Text style={styles.zoomLabelSmall}>
                    {ZOOM_LEVELS[zoomIndex].label}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.zoomButtonSmall,
                      zoomIndex === ZOOM_LEVELS.length - 1 && styles.zoomButtonDisabled,
                    ]}
                    onPress={() => {
                      const newIndex = Math.min(ZOOM_LEVELS.length - 1, zoomIndex + 1);
                      setZoomIndex(newIndex);
                      // Zoom level update is handled by DayGraphManager subscription
                    }}
                    disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="add"
                      size={14}
                      color={zoomIndex === ZOOM_LEVELS.length - 1 ? '#666' : '#FFFFFF'}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Victory Native Chart */}
            {/* CRITICAL: Chart-ready gate - only mount chart when graphData is fully valid */}
            {/* Prevents Victory from mounting with invalid props (zero-width domains, etc.) */}
            <View style={styles.chartWrapper}>
              {(() => {
                const canRender = isChartReady && chartData && chartData.length > 0 && resolvedXDomain;
                if (process.env.NODE_ENV === 'development' && selectedPeriod === 'Day') {
                  console.log('[HeartRateInsights] Chart render check:', {
                    isChartReady,
                    hasChartData: !!chartData,
                    chartDataLength: chartData?.length || 0,
                    hasResolvedXDomain: !!resolvedXDomain,
                    resolvedXDomain,
                    canRender,
                    respirationOverlayChecked,
                    hasRespirationData: respirationChartData.length > 0,
                  });
                }
                return canRender;
              })() ? (
              respirationOverlayChecked && respirationChartData.length > 0 ? (
                // Split view: Two separate charts stacked vertically
                <View style={{ flex: 1, width: '100%' }}>
                  {/* Heart Rate Chart - Upper Half */}
                  <View style={{ height: '49%', width: '100%' }}>
                    <CartesianChart
                      key={`chart-hr-${selectedPeriod}`}
                      data={chartData}
                      xKey="x"
                      yKeys={['y']}
                      padding={CHART_PADDING}
                      domain={chartDomain}
                      xAxis={{
                        font: skiaFont,
                        tickCount: 5,
                        labelColor: 'rgba(199,214,255,0.75)',
                        lineColor: 'rgba(255,255,255,0.08)',
                        labelOffset: 4,
                        enableRescaling: true,
                        formatXLabel: (label) => formatTime(Number(label)),
                      }}
                      yAxis={[
                        {
                          font: skiaFont,
                          tickCount: 6,
                          labelColor: 'rgba(199,214,255,0.75)',
                          lineColor: 'rgba(255,255,255,0.08)',
                          labelOffset: 4,
                          enableRescaling: true,
                          formatYLabel: (label) => `${Math.round(Number(label))}`,
                        },
                      ]}
                      transformState={transformState}
                      transformConfig={{
                        pinch: { dimensions: 'x' },
                        pan: { dimensions: ['x', 'y'], activateAfterLongPress: 100 },
                      }}
                      customGestures={customGestures}
                    >
                      {({ points, chartBounds }) => {
                        // Filter valid points that have actual data
                        const validPoints = points.y?.filter((point: any) => 
                          point && 
                          typeof point.x === 'number' && 
                          typeof point.y === 'number' &&
                          !isNaN(point.x) && 
                          !isNaN(point.y) &&
                          isFinite(point.x) && 
                          isFinite(point.y)
                        ) || [];
                        
                        const pathAnimate = isLive ? undefined : { type: 'timing' as const, duration: 250 };
                        return (
                          <>
                            <Area
                              points={points.y}
                              y0={chartBounds.bottom}
                              color="rgba(255, 107, 107, 0.28)"
                              curveType="linear"
                              connectMissingData={false}
                              animate={pathAnimate}
                            />
                            <Line
                              key={`line-hr-split-${zoomIndex}`}
                              points={points.y}
                              color="#FF6B6B"
                              strokeWidth={2.5}
                              strokeCap="round"
                              strokeJoin="round"
                              curveType="linear"
                              connectMissingData={false}
                              animate={pathAnimate}
                            />
                            {/* Hide heart rate dots when respiration overlay is checked */}
                            {!respirationOverlayChecked && validPoints.length > 0 && (
                              <Group>
                                {validPoints.map((point: any, idx: number) => (
                                  <Circle
                                    key={`hr-dot-${idx}`}
                                    cx={point.x}
                                    cy={point.y}
                                    r={2.5}
                                    color="#FF6B6B"
                                  />
                                ))}
                              </Group>
                            )}
                          </>
                        );
                      }}
                    </CartesianChart>
                  </View>
                  
                  {/* Divider Line */}
                  <View style={styles.chartDivider} />
                  
                  {/* Respiration Chart - Lower Half */}
                  <View style={{ height: '49%', width: '100%' }}>
                    <CartesianChart
                      key={`chart-resp-${selectedPeriod}`}
                      data={respirationChartData}
                      xKey="x"
                      yKeys={['y']}
                      padding={CHART_PADDING}
                      domain={respirationChartDomain}
                      xAxis={{
                        font: skiaFont,
                        tickCount: 5,
                        labelColor: 'rgba(199,214,255,0.75)',
                        lineColor: 'rgba(255,255,255,0.08)',
                        labelOffset: 4,
                        enableRescaling: true,
                        formatXLabel: (label) => formatTime(Number(label)),
                      }}
                      yAxis={[
                        {
                          font: skiaFont,
                          tickCount: respirationYTickCount,
                          labelColor: 'rgba(199,214,255,0.75)',
                          lineColor: 'rgba(255,255,255,0.08)',
                          labelOffset: 4,
                          enableRescaling: true,
                          formatYLabel: (label) => `${Math.round(Number(label))}`,
                        },
                      ]}
                      transformState={transformState}
                      transformConfig={{
                        pinch: { dimensions: 'x' },
                        pan: { dimensions: ['x', 'y'], activateAfterLongPress: 100 },
                      }}
                      customGestures={customGestures}
                    >
                      {({ points, chartBounds }) => {
                        // Split points into segments at gaps (null values)
                        // This creates vacant gaps in the line like heart rate graph
                        const segments: any[][] = [];
                        let currentSegment: any[] = [];
                        
                        points.y?.forEach((point: any) => {
                          if (!point) return;
                          // If point has null/undefined y value, it's a gap - start new segment
                          if (point.y === null || point.y === undefined) {
                            if (currentSegment.length > 0) {
                              segments.push(currentSegment);
                              currentSegment = [];
                            }
                          } else {
                            currentSegment.push(point);
                          }
                        });
                        
                        // Add last segment if it has points
                        if (currentSegment.length > 0) {
                          segments.push(currentSegment);
                        }
                        
                        const pathAnimate = isLive ? undefined : { type: 'timing' as const, duration: 250 };
                        
                        return (
                          <>
                            {/* Yellow shadow/area under respiration line - render for each segment */}
                            {segments.map((segment, segmentIndex) => (
                              <Area
                                key={`area-resp-segment-${segmentIndex}-${zoomIndex}-${respirationChartData.length}`}
                                points={segment}
                                y0={chartBounds.bottom}
                                color="rgba(255, 215, 0, 0.28)"
                                curveType="linear"
                                connectMissingData={false}
                                animate={pathAnimate}
                              />
                            ))}
                            {/* Render each segment as a separate line to create gaps */}
                            {segments.map((segment, segmentIndex) => (
                              <Line
                                key={`line-resp-segment-${segmentIndex}-${zoomIndex}-${respirationChartData.length}`}
                                points={segment}
                                color="#FFD700"
                                strokeWidth={2.5}
                                strokeCap="round"
                                strokeJoin="round"
                                curveType="linear"
                                connectMissingData={false}
                                animate={pathAnimate}
                              />
                            ))}
                            {/* Add small dots at each data point (only non-null points) - Hide when respiration overlay is checked */}
                            {!respirationOverlayChecked && points.y?.map((point: any, index: number) => {
                              if (!point || point.x === undefined || point.y === undefined || point.y === null) return null;
                              return (
                                <Circle
                                  key={`dot-resp-${index}`}
                                  cx={point.x}
                                  cy={point.y}
                                  r={2}
                                  color="#FFD700"
                                  opacity={0.9}
                                />
                              );
                            })}
                          </>
                        );
                      }}
                    </CartesianChart>
                  </View>
                </View>
              ) : (
                // Single view: Heart Rate only - Full Area
                <View style={{ position: 'relative', width: '100%', height: '100%' }}>
                  <CartesianChart
                    key={`chart-${selectedPeriod}`}
                    data={chartData}
                    xKey="x"
                    yKeys={['y']}
                    padding={CHART_PADDING}
                    domain={chartDomain}
                    xAxis={{
                      font: skiaFont,
                      tickCount: 5,
                      labelColor: 'rgba(199,214,255,0.75)',
                      lineColor: 'rgba(255,255,255,0.08)',
                      labelOffset: 4,
                      enableRescaling: true,
                      formatXLabel: (label) => formatTime(Number(label)),
                    }}
                    yAxis={[
                      {
                        font: skiaFont,
                        tickCount: 6,
                        labelColor: 'rgba(199,214,255,0.75)',
                        lineColor: 'rgba(255,255,255,0.08)',
                        labelOffset: 4,
                        enableRescaling: true,
                        formatYLabel: (label) => `${Math.round(Number(label))}`,
                      },
                    ]}
                    transformState={transformState}
                    transformConfig={{
                      pinch: { dimensions: 'x' },
                      pan: { dimensions: ['x', 'y'], activateAfterLongPress: 100 },
                    }}
                    customGestures={customGestures}
                  >
                      {({ points, chartBounds }) => {
                        const pathAnimate = isLive ? undefined : { type: 'timing' as const, duration: 250 };
                        return (
                          <>
                            <Area
                              points={points.y}
                              y0={chartBounds.bottom}
                              color="rgba(255, 107, 107, 0.28)"
                              curveType="linear"
                              connectMissingData={false}
                              animate={pathAnimate}
                            />
                            <Line
                              key={`line-hr-full-${zoomIndex}`}
                              points={points.y}
                              color="#FF6B6B"
                              strokeWidth={2.5}
                              strokeCap="round"
                              strokeJoin="round"
                              curveType="linear"
                              connectMissingData={false}
                              animate={pathAnimate}
                            />
                          </>
                        );
                      }}
                  </CartesianChart>
                </View>
              )
              ) : !isChartReady ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                  <ActivityIndicator size="small" color="#FF6B6B" />
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                    {!graphData ? 'Preparing graph data...' : 'Preparing chart...'}
                  </Text>
                </View>
              ) : null}

            </View>

            {/* Bed Status Indicator - Only show after API call completes */}
            {!isLoadingBedStatus && (
              <View style={styles.bedStatusContainer}>
                <View style={[
                  styles.bedStatusIndicator, 
                  bedStatus === 'Occupied' && styles.bedStatusOccupied,
                  bedStatus === 'Waiting' && styles.bedStatusWaiting
                ]}>
                  <View style={[
                    styles.bedStatusDot, 
                    bedStatus === 'Occupied' && styles.bedStatusDotOccupied,
                    bedStatus === 'Waiting' && styles.bedStatusDotWaiting
                  ]} />
                  <Text style={styles.bedStatusText}>
                    Bed {bedStatus}
                  </Text>
                </View>
              </View>
            )}
          </View>
          )
        )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02041A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  periodContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodTabActive: {
    backgroundColor: '#7EA6FF',
  },
  periodTabText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '700',
  },
  periodTabTextActive: {
    color: '#FFFFFF',
  },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  dateNavButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dateNavButtonDisabled: {
    opacity: 0.4,
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  metricUnit: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  healthyRangeContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  healthyRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  healthyRangeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 6,
  },
  outOfRangeMinutes: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  lastSyncContainer: {
    marginBottom: 20,
  },
  lastSyncText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    marginTop: 10,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  chartContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    width: '100%',
    paddingHorizontal: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendRectangle: {
    width: 16,
    height: 12,
    borderRadius: 2,
    marginRight: 8,
  },
  legendText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: '#7EA6FF',
    borderColor: '#7EA6FF',
  },
  checkboxLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
  },
  chartWrapper: {
    width: '100%',
    height: 320,
    marginTop: 8,
  },
  chartDivider: {
    height: 1,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 0,
    flexShrink: 0,
  },
  errorContainer: {
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    marginTop: 10,
    padding: 20,
  },
  errorText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#7EA6FF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  hintContainer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    marginTop: 8,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontStyle: 'italic',
  },
  tooltipContainer: {
    position: 'absolute',
    zIndex: 10,
  },
  tooltipBox: {
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  tooltipValue: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 1,
  },
  tooltipTime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 8,
    fontWeight: '500',
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: -5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FF6B6B',
  },
  topTooltipInline: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  topTooltipBoxInline: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: 'center',
    minWidth: 50,
  },
  topTooltipValueInline: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  topTooltipValueSeparator: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '600',
  },
  topTooltipTimeInline: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 8,
    fontWeight: '600',
    marginTop: 1,
    textAlign: 'center',
  },
  zoomControlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  zoomLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  zoomButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  zoomButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(126,166,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(126,166,255,0.3)',
  },
  zoomButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
    opacity: 0.5,
  },
  zoomButtonsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoomButtonSmall: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(126,166,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(126,166,255,0.3)',
  },
  zoomLabelSmall: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'center',
  },
  bedStatusContainer: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 4,
    marginTop: 4,
  },
  bedStatusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  bedStatusOccupied: {
    backgroundColor: 'rgba(255, 152, 0, 0.2)',
    borderColor: 'rgba(255, 152, 0, 0.5)',
  },
  bedStatusWaiting: {
    backgroundColor: 'rgba(158, 158, 158, 0.2)',
    borderColor: 'rgba(158, 158, 158, 0.4)',
  },
  bedStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginRight: 8,
  },
  bedStatusDotOccupied: {
    backgroundColor: '#FF9800',
  },
  bedStatusDotWaiting: {
    backgroundColor: '#9E9E9E',
  },
  bedStatusText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});


