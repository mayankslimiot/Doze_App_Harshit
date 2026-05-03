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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture } from 'react-native-gesture-handler';
import { useFont, Circle, Group } from '@shopify/react-native-skia';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import { CartesianChart, Line, Bar, Area, useChartTransformState } from 'victory-native';
import { useDevice } from '@/contexts/DeviceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBoot } from '@/contexts/BootContext';
import { getDeviceHistory, getWeeklyRespirationData, getMonthlyRespirationData, getHealthData, getDeviceDetails, getRespirationGraphForDateRange } from '@/services/deviceData';
import { useFocusEffect } from 'expo-router';
import { ZOOM_LEVELS } from '@/utils/zoomLevels';
import { aggregateRespiration } from '@/utils/respirationAggregation';
import { 
  getRespirationGraphData, 
  isRespirationGraphReady, 
  subscribe as subscribeToRespirationGraph, 
  updateZoomLevel 
} from '@/services/respirationGraphManager';
import { getRawPoints } from '@/services/respirationBuffer';
import { connectWebSocket, removeWebSocketHandler, addDeviceUpdateHandler, removeDeviceUpdateHandler, type WebSocketMessageHandler, type DeviceUpdateHandler } from '@/services/websocketService';
import HeartRateSkeleton from '@/components/HeartRateSkeleton';

const { width } = Dimensions.get('window');

interface RespirationDataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  value: number; // Respiration rate in Resp/Min (breaths per minute)
}

interface WeeklyRespirationDataPoint {
  day: string;
  dayIndex: number;
  date: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  isPartial: boolean;
  count: number;
}

interface MonthlyRespirationDataPoint {
  day: number;
  dayIndex: number;
  date: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  isPartial: boolean;
  count: number;
}

export default function RespirationInsightsScreen() {
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
      
      console.log('[RESPIRATION] Screen focus', {
        hasSeenOnboarding: onboardingSeen,
        isLoggedIn: auth.isLoggedIn,
        deviceBound,
        deviceId: activeDevice?.deviceId || null,
        timestamp: Date.now(),
      });
    }, [auth.isLoggedIn, activeDevice?.deviceId, onboardingSeen])
  );
  const [selectedDate, setSelectedDate] = React.useState(() => {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // If past 12 PM, we are in the next cycle (D to D+1)
    if (now.getHours() >= 12) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return today;
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [isLoadingHistoricalDay, setIsLoadingHistoricalDay] = React.useState(false);
  const [navDirection, setNavDirection] = React.useState<'prev' | 'next' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [respirationData, setRespirationData] = React.useState<RespirationDataPoint[]>([]);

  // True when Day view is showing today's cycle. Past date = historical fetch from API; today = buffer + live.
  // Uses 12 noon cycle: if it's past 12 PM, the current cycle date is "tomorrow".
  const isTodaySelected = React.useMemo(() => {
    if (selectedPeriod !== 'Day') return true;
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    let currentCycleDate;
    if (now.getHours() >= 12) {
      currentCycleDate = new Date(todayStart);
      currentCycleDate.setDate(currentCycleDate.getDate() + 1);
    } else {
      currentCycleDate = todayStart;
    }
    
    return (
      selectedDate.getFullYear() === currentCycleDate.getFullYear() &&
      selectedDate.getMonth() === currentCycleDate.getMonth() &&
      selectedDate.getDate() === currentCycleDate.getDate()
    );
  }, [selectedPeriod, selectedDate]);
  
  // Day view: Use pre-built graph data from RespirationGraphManager (prepared on Home screen) when today; historical ref when past date
  const [zoomIndex, setZoomIndex] = React.useState(0); // Start with 10min zoom
  const [graphData, setGraphData] = React.useState<{
    points: Array<{ x: number; y: number | null }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  } | null>(null);
  const [respirationGraphReady, setRespirationGraphReady] = React.useState(false);
  // Trigger re-run of Day metrics when historical raw points are set (refs don't trigger re-renders)
  const [historicalDayRawPointsKey, setHistoricalDayRawPointsKey] = React.useState(0);
  
  // State for top tooltip showing value and time above the graph
  const [topTooltipData, setTopTooltipData] = React.useState<{
    timestamp: number;
    respiration: number | null;
  } | null>(null);
  
  const [weeklyRespirationData, setWeeklyRespirationData] = React.useState<WeeklyRespirationDataPoint[]>([]);
  const [isLoadingWeekly, setIsLoadingWeekly] = React.useState(false);
  const [weeklyError, setWeeklyError] = React.useState<string | null>(null);
  
  const [monthlyRespirationData, setMonthlyRespirationData] = React.useState<MonthlyRespirationDataPoint[]>([]);
  const [isLoadingMonthly, setIsLoadingMonthly] = React.useState(false);
  const [monthlyError, setMonthlyError] = React.useState<string | null>(null);
  
  // Bed status tracking (backend is single source of truth)
  const [bedStatus, setBedStatus] = React.useState<'Occupied' | 'Vacant' | 'Waiting'>('Vacant');
  const [isLoadingBedStatus, setIsLoadingBedStatus] = React.useState<boolean>(true);
  
  // Cache for weekly data: key = deviceId + weekStart date string
  const weeklyDataCache = React.useRef<Map<string, WeeklyRespirationDataPoint[]>>(new Map());
  
  // Cache for monthly data: key = deviceId + monthStart date string
  const monthlyDataCache = React.useRef<Map<string, MonthlyRespirationDataPoint[]>>(new Map());
  
  // Historical day: raw points for selected past date (24hr of that day). Zoom changes re-aggregate from this, no re-fetch.
  const historicalDayRawPointsRef = React.useRef<Array<{ timestamp: number; value: number | null }>>([]);
  const historicalDayDateRef = React.useRef<string | null>(null); // 'YYYY-MM-DD' for which date we have raw points

  // Refs for request management
  const socketInstanceRef = React.useRef<any>(null);
  const prevDeviceIdForResetRef = React.useRef<string | null>(null);
  
  const activeDeviceIdRef = React.useRef<string | null>(activeDevice?.deviceId ?? null);
  React.useEffect(() => {
    activeDeviceIdRef.current = activeDevice?.deviceId ?? null;
  }, [activeDevice?.deviceId]);

  // ----------------------------
  // Domain-based pan/zoom config
  // ----------------------------
  const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  const INACTIVITY_MS = 10 * 1000; // 10 seconds without gestures -> return to live
  const MIN_WINDOW_MS = 10 * 1000; // 10 seconds min zoom window
  const MAX_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours max zoom window (matches fetched range)

  const CHART_PADDING = React.useMemo(
    () => ({ left: 28, right: 8, top: 18, bottom: 40 }),
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

  // Domain ref for continuous updates without re-renders
  const domainRef = React.useRef<[number, number] | null>(null);
  const lastPanX = React.useRef(0);
  const lastScale = React.useRef(1);
  const lastDomainUpdateRef = React.useRef<number>(0);
  const DOMAIN_UPDATE_THROTTLE_MS = 1000; // Update domain every 1 second in live mode
  const prevZoomIndexRef = React.useRef<number>(zoomIndex);
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
    hasUserInteractedRef.current = false;
  }, [clearInactivityTimer, resetTransform]);

  // Domain computation - uses graphData for Day view (prepared by RespirationGraphManager)
  const computeLiveDomain = React.useCallback((): [number, number] | null => {
    if (selectedPeriod === 'Day') {
      // Use graphData from RespirationGraphManager
      if (graphData && graphData.xDomain) {
        return graphData.xDomain;
      }
      return null;
    } else {
      // For Week/Month views, use existing logic
      if (respirationData.length === 0) return null;
      const latest = respirationData[respirationData.length - 1].timestamp;
      const oldest = respirationData[0].timestamp;
      return [oldest, latest];
    }
  }, [selectedPeriod, graphData, respirationData]);

  // Clamp to data bounds
  const clampToData = React.useCallback(
    ([start, end]: [number, number]): [number, number] => {
      if (selectedPeriod === 'Day') {
        if (hasUserInteractedRef.current && !isLive && xDomain) {
          console.log('[RespirationInsights] clampToData: Preserving user domain', xDomain);
          return xDomain;
        }
        // Use graphData from RespirationGraphManager for Day view
        if (!graphData || !graphData.points || graphData.points.length === 0) return [start, end];
        
        const timestamps = graphData.points.map(p => p.x).filter(t => Number.isFinite(t));
        if (timestamps.length === 0) {
          return [start, end];
        }
        
        const dataMin = Math.min(...timestamps);
        const dataMax = Math.max(...timestamps);
        
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
        if (respirationData.length === 0) return [start, end];
        const dataMin = respirationData[0].timestamp;
        const dataMax = respirationData[respirationData.length - 1].timestamp;

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
    [selectedPeriod, graphData, respirationData, computeLiveDomain, isLive, xDomain],
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

      const scaleDelta = currentScale / lastScale.current;
      
      let newSpan = currentSpan / scaleDelta;
      newSpan = Math.max(MIN_WINDOW_MS, Math.min(MAX_WINDOW_MS, newSpan));

      const next: [number, number] = [
        center - newSpan / 2,
        center + newSpan / 2,
      ];

      const clamped = clampToData(next);
      domainRef.current = clamped;
      setXDomain(clamped);
      
      lastScale.current = currentScale;
    },
    [clampToData, MIN_WINDOW_MS, MAX_WINDOW_MS],
  );

  const onGestureStart = React.useCallback(() => {
    setIsLive(false);
    hasUserInteractedRef.current = true;
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
      return matrix?.[12] ?? 0;
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

  // Track transform matrix changes
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
    if (prevZoomIndexRef.current !== zoomIndex) {
      prevZoomIndexRef.current = zoomIndex;
      
      if (hasUserInteractedRef.current && !isLive && domainRef.current) {
        console.log('[RespirationInsights] Zoom changed but preserving user view');
        return;
      }
      
      if (isLive && !hasUserInteractedRef.current) {
        console.log('[RespirationInsights] Zoom changed in live mode, will update domain');
      }
    }
  }, [zoomIndex, isLive]);

  // Domain updates immediately when data or zoom changes (in live mode)
  React.useEffect(() => {
    if (!isLive) {
      return;
    }
    
    const liveDomain = computeLiveDomain();
    if (liveDomain) {
      domainRef.current = liveDomain;
      setXDomain(liveDomain);
    }
  }, [computeLiveDomain, isLive, respirationData, zoomIndex]);

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
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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

  // Fetch monthly respiration data (30 days aggregated)
  const fetchMonthlyRespirationData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      setMonthlyRespirationData([]);
      return;
    }

    try {
      setIsLoadingMonthly(true);
      setMonthlyError(null);
      
      const monthStart = getMonthStartDate(selectedDate);
      
      const cacheKey = `${activeDevice.deviceId}_${monthStart.toISOString()}`;
      const cachedData = monthlyDataCache.current.get(cacheKey);
      
      if (cachedData) {
        console.log('[RespirationInsights] Using cached monthly data');
        setMonthlyRespirationData(cachedData);
        setIsLoadingMonthly(false);
        return;
      }

      const result = await getMonthlyRespirationData(activeDevice.deviceId, monthStart);

      if (result.success && result.data && Array.isArray(result.data)) {
        monthlyDataCache.current.set(cacheKey, result.data);
        setMonthlyRespirationData(result.data);
      } else {
        setMonthlyRespirationData([]);
        setMonthlyError(result.message || 'No monthly respiration data available');
      }
    } catch (err: any) {
      console.error('Failed to fetch monthly respiration data:', err);
      setMonthlyError(err.message || 'Failed to load monthly respiration data');
      setMonthlyRespirationData([]);
    } finally {
      setIsLoadingMonthly(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate, getMonthStartDate]);

  // Fetch weekly respiration data (7 days aggregated)
  const fetchWeeklyRespirationData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      setWeeklyRespirationData([]);
      return;
    }

    try {
      setIsLoadingWeekly(true);
      setWeeklyError(null);
      
      const weekStart = getWeekStartDate(selectedDate);
      
      const cacheKey = `${activeDevice.deviceId}_${weekStart.toISOString()}`;
      const cachedData = weeklyDataCache.current.get(cacheKey);
      
      if (cachedData) {
        console.log('[RespirationInsights] Using cached weekly data');
        setWeeklyRespirationData(cachedData);
        setIsLoadingWeekly(false);
        return;
      }

      const result = await getWeeklyRespirationData(activeDevice.deviceId, weekStart);

      if (result.success && result.data && Array.isArray(result.data)) {
        weeklyDataCache.current.set(cacheKey, result.data);
        setWeeklyRespirationData(result.data);
      } else {
        setWeeklyRespirationData([]);
        setWeeklyError(result.message || 'No weekly respiration data available');
      }
    } catch (err: any) {
      console.error('Failed to fetch weekly respiration data:', err);
      setWeeklyError(err.message || 'Failed to load weekly respiration data');
      setWeeklyRespirationData([]);
    } finally {
      setIsLoadingWeekly(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate, getWeekStartDate]);

  // Day tab - today only: subscribe to RespirationGraphManager (buffer + live). Past date: use historical fetch effect below.
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day' || !isTodaySelected) {
      return;
    }

    console.log('[RespirationInsights] Setting up Respiration graph subscription for device (today):', activeDevice.deviceId);
    import('@/services/respirationGraphManager').then(({ prepareRespirationGraph }) => {
      prepareRespirationGraph(activeDevice.deviceId).catch((err) => {
        console.error('[RespirationInsights] Failed to prepare Respiration graph:', err);
      });
    });

    const unsubscribe = subscribeToRespirationGraph(activeDevice.deviceId, (data) => {
      if (!isTodaySelected) return;
      if (data) {
        setGraphData(data);
        setRespirationGraphReady(true);
        setIsLoading(false);
        setError(null);
      } else {
        setGraphData(null);
        setRespirationGraphReady(true);
        setIsLoading(false);
      }
    });

    const initialData = getRespirationGraphData(activeDevice.deviceId);
    const ready = isRespirationGraphReady(activeDevice.deviceId);
    if (initialData) {
      setGraphData(initialData);
      setRespirationGraphReady(true);
    } else if (ready) {
      setGraphData(null);
      setRespirationGraphReady(true);
    } else {
      import('@/services/respirationGraphManager').then(({ prepareRespirationGraph }) => {
        prepareRespirationGraph(activeDevice.deviceId).catch((error) => {
          console.error('[RespirationInsights] Failed to prepare Respiration graph:', error);
        });
      });
    }

    return unsubscribe;
  }, [activeDevice?.deviceId, selectedPeriod, isTodaySelected]);

  // Helper: aggregate from historical raw points and set graphData (used after fetch and on zoom change).
  const applyHistoricalAggregation = React.useCallback(
    (rawPoints: Array<{ timestamp: number; value: number | null }>, startMs: number, endMs: number, zoomIdx: number) => {
      const zoomLevel = ZOOM_LEVELS[zoomIdx] || ZOOM_LEVELS[0];
      const rangeMs = zoomLevel.rangeSec * 1000;
      const viewportEnd = endMs;
      const viewportStart = Math.max(startMs, endMs - rangeMs);
      const aggregated = aggregateRespiration(rawPoints, zoomIdx, viewportStart, viewportEnd);
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
      setRespirationGraphReady(true);
      setIsLoadingHistoricalDay(false);
    },
    []
  );

  // Day view + past date: fill ref with raw points from API only when date changes. 24hr of that day.
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day' || isTodaySelected || !auth.isLoggedIn) {
      return;
    }
    // 12 noon to 12 noon cycle: fetch from (selectedDate - 1 day) 12:00 PM to selectedDate 11:59 AM
    const dayStart = new Date(selectedDate);
    dayStart.setDate(dayStart.getDate() - 1);
    dayStart.setHours(12, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(11, 59, 59, 999);
    const startMs = dayStart.getTime();
    const endMs = dayEnd.getTime();
    const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

    if (historicalDayDateRef.current === dateKey && historicalDayRawPointsRef.current.length > 0) {
      applyHistoricalAggregation(historicalDayRawPointsRef.current, startMs, endMs, 0);
      return;
    }

    let cancelled = false;
    setIsLoadingHistoricalDay(true);
    setRespirationGraphReady(false);
    setGraphData(null);

    getRespirationGraphForDateRange(activeDevice.deviceId, startMs, endMs, true)
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data?.points) {
          historicalDayRawPointsRef.current = [];
          historicalDayDateRef.current = null;
          setGraphData(null);
          setRespirationGraphReady(true);
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
          console.error('[RespirationInsights] Historical day fetch failed:', err);
          historicalDayRawPointsRef.current = [];
          historicalDayDateRef.current = null;
          setGraphData(null);
          setRespirationGraphReady(true);
          setIsLoadingHistoricalDay(false);
        }
      });

    return () => { cancelled = true; };
  }, [activeDevice?.deviceId, selectedPeriod, selectedDate, isTodaySelected, auth.isLoggedIn, applyHistoricalAggregation]);

  // When zoom changes on historical day: re-aggregate from ref only (no re-fetch).
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day' || isTodaySelected) return;
    const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    if (historicalDayDateRef.current !== dateKey || historicalDayRawPointsRef.current.length === 0) return;
    // 12 noon to 12 noon cycle for re-aggregation
    const dayStart = new Date(selectedDate);
    dayStart.setDate(dayStart.getDate() - 1);
    dayStart.setHours(12, 0, 0, 0);
    const dayEnd = new Date(selectedDate);
    dayEnd.setHours(11, 59, 59, 999);
    const startMs = dayStart.getTime();
    const endMs = dayEnd.getTime();
    applyHistoricalAggregation(historicalDayRawPointsRef.current, startMs, endMs, zoomIndex);
  }, [zoomIndex, selectedPeriod, selectedDate, isTodaySelected, activeDevice?.deviceId, applyHistoricalAggregation]);

  // When back to today: clear historical refs.
  React.useEffect(() => {
    if (isTodaySelected) {
      historicalDayRawPointsRef.current = [];
      historicalDayDateRef.current = null;
    }
  }, [isTodaySelected]);

  // Default zoom: 10 min when on Day view (today or previous day).
  const ZOOM_INDEX_10M = 0;
  React.useEffect(() => {
    if (selectedPeriod !== 'Day') return;
    setZoomIndex(ZOOM_INDEX_10M);
  }, [selectedPeriod, selectedDate, isTodaySelected]);

  // Update zoom level in RespirationGraphManager when today is selected (past date uses local aggregation)
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day' || !isTodaySelected) {
      return;
    }
    updateZoomLevel(activeDevice.deviceId, zoomIndex).catch((error) => {
      console.error('[RespirationInsights] Failed to update zoom level:', error);
    });
  }, [activeDevice?.deviceId, selectedPeriod, zoomIndex, isTodaySelected]);

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

  // Setup message handler for WebSocket (real-time data updates)
  // Note: Day view updates are handled by RespirationGraphManager via buffer subscription
  // This handler is kept for Week/Month views if needed in the future
  const messageHandler = React.useCallback((data: any) => {
    if (!activeDeviceIdRef.current || data.deviceId !== activeDeviceIdRef.current) {
      return;
    }

    // Day view is handled by RespirationGraphManager - no manual updates needed
    if (selectedPeriod === 'Day') {
      return;
    }

    // Extract respiration value for Week/Month views (if needed in future)
    const respirationValue = data.respiration ?? data.resp ?? data.bpm ?? data.breathing ?? null;
    
    if (respirationValue != null && respirationValue > 0 && respirationValue < 50) {
      const updateTimestamp = extractTimestampMs(data);
      
      const newDataPoint: RespirationDataPoint = {
        timestamp: updateTimestamp,
        value: Number(respirationValue),
      };

      // Add new data point to existing data (keep last 24 hours)
      setRespirationData((prev) => {
        const nowMs = Date.now();
        const twentyFourHoursAgo = nowMs - (24 * 60 * 60 * 1000);
        
        const filteredData = prev.filter((point) => point.timestamp >= twentyFourHoursAgo);
        
        const existingIndex = filteredData.findIndex(
          (point) => Math.abs(point.timestamp - updateTimestamp) < 1000
        );
        
        let newData;
        if (existingIndex >= 0) {
          newData = [...filteredData];
          newData[existingIndex] = newDataPoint;
        } else {
          newData = [...filteredData, newDataPoint];
        }
        
        return newData.sort((a, b) => a.timestamp - b.timestamp);
      });
    }
  }, [extractTimestampMs, selectedPeriod]);

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
          
          console.log('[RespirationInsights] Initial bed status from backend:', {
            bedStatus: currentBedStatus,
            absenceStart: deviceData.absenceStart,
            HV: deviceData.HV,
            isLive: deviceData.isLive
          });

          // Set bedStatus directly from backend (backend handles all logic)
          setBedStatus(currentBedStatus as 'Occupied' | 'Vacant' | 'Waiting');
        } else {
          console.warn('[RespirationInsights] Failed to fetch device details, defaulting to Vacant');
          setBedStatus('Vacant');
        }
      } catch (error) {
        console.error('[RespirationInsights] Failed to fetch initial bed status:', error);
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

      console.log('[RespirationInsights] Device update received:', {
        bedStatus: data.bedStatus,
        isLive: data.isLive,
        source: data.source,
        absenceStart: data.absenceStart,
        HV: data.HV
      });

      // ✅ Update bedStatus directly from backend (backend handles all logic)
      setBedStatus(data.bedStatus);
    };

    // Handle real-time respiration data updates (for Week/Month views)
    const statusHandler: WebSocketMessageHandler = (data) => {
      if (!isMounted || data.deviceId !== deviceId) {
        return;
      }

      // Handle real-time respiration data updates
      messageHandler(data);
    };

    // Connect WebSocket and add device update handler
    connectWebSocket(deviceId, statusHandler).catch((error) => {
      console.error('[RespirationInsights] Failed to connect WebSocket:', error);
    });

    // Add device update handler
    addDeviceUpdateHandler(deviceUpdateHandler);

    return () => {
      isMounted = false;
      removeWebSocketHandler(statusHandler);
      removeDeviceUpdateHandler(deviceUpdateHandler);
    };
  }, [activeDevice?.deviceId, auth.isLoggedIn, messageHandler]);

  // Reset graph state when device changes
  React.useEffect(() => {
    const currentDeviceId = activeDevice?.deviceId || null;
    const prevDeviceId = prevDeviceIdForResetRef.current;
    
    if (prevDeviceId !== null && prevDeviceId !== currentDeviceId) {
      console.log('[RespirationInsights] 🔄 Device changed, resetting state:', { from: prevDeviceId, to: currentDeviceId });
      setRespirationData([]);
    }
    
    prevDeviceIdForResetRef.current = currentDeviceId;
  }, [activeDevice?.deviceId]);

  // Fetch data on mount and when period/date changes
  React.useEffect(() => {
    if (selectedPeriod === 'Week') {
      fetchWeeklyRespirationData();
    } else if (selectedPeriod === 'Month') {
      fetchMonthlyRespirationData();
    }
    // Day view is handled by RespirationGraphManager subscription - no polling needed
  }, [fetchWeeklyRespirationData, fetchMonthlyRespirationData, selectedPeriod, selectedDate]);

  // Clear caches when device changes
  React.useEffect(() => {
    weeklyDataCache.current.clear();
    monthlyDataCache.current.clear();
  }, [activeDevice?.deviceId]);

  // Calculate metrics from data (Day view) - RAW points in visible zoom window (today + past days). Fallback: aggregated points for past days.
  const metrics = React.useMemo(() => {
    if (selectedPeriod !== 'Day') {
      return { min: 0, average: 0, max: 0 };
    }
    if (!graphData || !graphData.xDomain) {
      return { min: 0, average: 0, max: 0 };
    }
    const [windowStart, windowEnd] = graphData.xDomain;
    let dataToUse: RespirationDataPoint[];
    if (isTodaySelected && activeDevice?.deviceId) {
      const rawPoints = getRawPoints(activeDevice.deviceId);
      const filtered = rawPoints.filter(
        (p) => p.timestamp >= windowStart && p.timestamp <= windowEnd && p.value !== null && p.value > 0
      );
      dataToUse = filtered.map((p) => ({ timestamp: p.timestamp, value: p.value! }));
    } else {
      const rawPoints = historicalDayRawPointsRef.current;
      const filtered = rawPoints.filter(
        (p) => p.timestamp >= windowStart && p.timestamp <= windowEnd && p.value !== null && p.value > 0
      );
      dataToUse = filtered.map((p) => ({ timestamp: p.timestamp, value: p.value! }));
      // Fallback: use aggregated graphData.points (viewport first, then any) so metrics show when chart has data
      if (dataToUse.length === 0 && graphData.points?.length) {
        let agg = graphData.points
          .filter((p) => p.x >= windowStart && p.x <= windowEnd && p.y != null && p.y > 0)
          .map((p) => ({ timestamp: p.x, value: p.y as number }));
        if (agg.length === 0) {
          agg = graphData.points
            .filter((p) => p.y != null && p.y > 0)
            .map((p) => ({ timestamp: p.x, value: p.y as number }));
        }
        if (agg.length > 0) dataToUse = agg;
      }
    }
    if (dataToUse.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const values = dataToUse.map((d) => d.value).filter((v) => !isNaN(v) && isFinite(v) && v > 0);
    if (values.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    return {
      min: Math.round(Math.min(...values)),
      max: Math.round(Math.max(...values)),
      average: Math.round(values.reduce((sum, val) => sum + val, 0) / values.length),
    };
  }, [selectedPeriod, graphData, activeDevice?.deviceId, isTodaySelected, historicalDayRawPointsKey]);

  // Calculate metrics from weekly data (Week view)
  const weeklyMetrics = React.useMemo(() => {
    if (weeklyRespirationData.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const validDays = weeklyRespirationData.filter((d) => d.avg !== null && d.avg > 0);
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
  }, [weeklyRespirationData]);

  // Calculate metrics from monthly data (Month view)
  const monthlyMetrics = React.useMemo(() => {
    if (monthlyRespirationData.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const validDays = monthlyRespirationData.filter((d) => d.avg !== null && d.avg > 0);
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
  }, [monthlyRespirationData]);

  // Use appropriate metrics based on selected period
  const displayMetrics = selectedPeriod === 'Week' ? weeklyMetrics : 
                         selectedPeriod === 'Month' ? monthlyMetrics : metrics;

  // Chart data - Day view uses graphData from RespirationGraphManager
  const chartData = React.useMemo(() => {
    if (selectedPeriod === 'Day') {
      // Use graphData from RespirationGraphManager
      if (!graphData || !graphData.points || graphData.points.length === 0) return [];
      return graphData.points;
    }

    // Week/Month views use respirationData (legacy, but kept for consistency)
    if (respirationData.length === 0) return [];
    return respirationData.map((point) => ({
      x: point.timestamp,
      y: point.value,
    }));
  }, [selectedPeriod, graphData, respirationData]);

  // Format weekly data for Victory Native Bar chart (Week view)
  const weeklyChartData = React.useMemo(() => {
    if (weeklyRespirationData.length === 0) return [];
    
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const formatted = [];
    
    for (let i = 0; i < 7; i++) {
      const dayData = weeklyRespirationData.find((d) => d.dayIndex === i);
      if (dayData) {
        formatted.push({
          x: i,
          y: dayData.avg !== null && dayData.avg > 0 ? dayData.avg : 0,
          day: dayData.day,
          date: dayData.date,
          isPartial: dayData.isPartial,
          min: dayData.min,
          max: dayData.max,
          hasData: dayData.avg !== null && dayData.avg > 0,
        });
      } else {
        formatted.push({
          x: i,
          y: 0,
          day: dayNames[i],
          date: '',
          isPartial: false,
          min: null,
          max: null,
          hasData: false,
        });
      }
    }
    
    console.log('[RespirationInsights] Weekly chart data updated. All 7 days:', formatted.length);
    
    return formatted;
  }, [weeklyRespirationData]);

  // Format monthly data for Victory Native Bar chart (Month view)
  const monthlyChartData = React.useMemo(() => {
    if (monthlyRespirationData.length === 0) return [];
    
    const formatted = [];
    const daysInMonth = monthlyRespirationData.length;
    
    for (let i = 0; i < daysInMonth; i++) {
      const dayData = monthlyRespirationData.find((d) => d.dayIndex === i);
      if (dayData) {
        formatted.push({
          x: i,
          y: dayData.avg !== null && dayData.avg > 0 ? dayData.avg : 0,
          day: dayData.day,
          date: dayData.date,
          isPartial: dayData.isPartial,
          min: dayData.min,
          max: dayData.max,
          hasData: dayData.avg !== null && dayData.avg > 0,
        });
      } else {
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
    
    console.log('[RespirationInsights] Monthly chart data updated. Days:', formatted.length);
    
    return formatted;
  }, [monthlyRespirationData]);

  // Y-axis domain for monthly view - dynamic based on max value + 10 padding
  const monthlyYDomain = React.useMemo<[number, number] | undefined>(() => {
    if (monthlyChartData.length === 0) return [0, 20];
    
    const values = monthlyChartData.map((d) => d.y).filter((v) => v > 0);
    if (values.length === 0) return [0, 20];
    
    const max = Math.max(...values);
    // Add 10 to the max value for padding, but ensure minimum of 20
    const maxWithPadding = Math.max(max + 10, 20);
    
    return [0, Math.ceil(maxWithPadding)];
  }, [monthlyChartData]);

  // Format X-axis labels for monthly view
  const formatMonthDayLabel = React.useCallback((label: string | number) => {
    const dayNum = typeof label === 'number' ? Math.round(label) : parseInt(String(label), 10);
    if (dayNum % 5 === 0 || dayNum === 0) {
      return String(dayNum + 1);
    }
    return '';
  }, []);

  // Get latest valid point for top tooltip (last point with valid non-null value)
  const latestPoint = React.useMemo(() => {
    if (selectedPeriod === 'Day') {
      // Use graphData from RespirationGraphManager
      if (graphData && graphData.points && graphData.points.length > 0) {
        // Find last valid point (iterate backwards to find first point with valid y value)
        for (let i = graphData.points.length - 1; i >= 0; i--) {
          const point = graphData.points[i];
          if (point && point.y !== null && point.y !== undefined && Number.isFinite(point.y) && point.y > 0) {
            return { timestamp: point.x, value: point.y };
          }
        }
        return null;
      }
      return null;
    }
    // Week/Month views: Find last valid point in respirationData
    if (respirationData.length === 0) return null;
    for (let i = respirationData.length - 1; i >= 0; i--) {
      const point = respirationData[i];
      if (point && point.value !== null && point.value !== undefined && Number.isFinite(point.value) && point.value > 0) {
        return point;
      }
    }
    return null;
  }, [selectedPeriod, graphData, respirationData]);


  // Update top tooltip data when latest point changes (Day view only)
  React.useEffect(() => {
    if (selectedPeriod === 'Day' && latestPoint) {
      setTopTooltipData({
        timestamp: latestPoint.timestamp,
        respiration: latestPoint.value !== null ? latestPoint.value : null,
      });
    } else {
      setTopTooltipData(null);
    }
  }, [latestPoint, selectedPeriod]);

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
      // Show cycle range: e.g. "23 - 24 Apr 2026"
      const cycleStart = new Date(selectedDate);
      cycleStart.setDate(cycleStart.getDate() - 1);
      
      const startDay = cycleStart.getDate();
      const startMonth = cycleStart.toLocaleDateString('en-US', { month: 'short' });
      const endDay = selectedDate.getDate();
      const endMonth = selectedDate.toLocaleDateString('en-US', { month: 'short' });
      const year = selectedDate.getFullYear();
      
      if (startMonth === endMonth) {
        return `${startDay} - ${endDay} ${startMonth} ${year}`;
      }
      return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
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
    setNavDirection('prev');
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

  // Navigate to next period - prevent going to future dates (cycle-aware)
  const goToNext = () => {
    setNavDirection('next');
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    let maxCycleDate;
    if (now.getHours() >= 12) {
      maxCycleDate = new Date(todayStart);
      maxCycleDate.setDate(maxCycleDate.getDate() + 1);
    } else {
      maxCycleDate = todayStart;
    }

    const newDate = new Date(selectedDate);
    if (selectedPeriod === 'Day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (selectedPeriod === 'Week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    // Only update if new date is not in the future
    if (newDate <= maxCycleDate) {
      setSelectedDate(newDate);
    }
  };

  // Check if next button should be disabled (already at or past today) - cycle-aware
  const canGoNext = React.useMemo(() => {
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    let maxCycleDate;
    if (now.getHours() >= 12) {
      maxCycleDate = new Date(todayStart);
      maxCycleDate.setDate(maxCycleDate.getDate() + 1);
    } else {
      maxCycleDate = todayStart;
    }

    const testDate = new Date(selectedDate);
    if (selectedPeriod === 'Day') {
      testDate.setDate(testDate.getDate() + 1);
    } else if (selectedPeriod === 'Week') {
      testDate.setDate(testDate.getDate() + 7);
    } else {
      testDate.setMonth(testDate.getMonth() + 1);
    }
    return testDate <= maxCycleDate;
  }, [selectedDate, selectedPeriod]);



  // Format time for X-axis labels
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // X-axis domain
  const resolvedXDomain = React.useMemo<[number, number] | null>(() => {
    if (selectedPeriod === 'Day') {
      if (!isLive && xDomain) {
        const clamped = clampToData(xDomain);
        return clamped;
      }
      const live = computeLiveDomain();
      return live ? clampToData(live) : null;
    }
    
    if (xDomain) {
      return clampToData(xDomain);
    }
    const live = computeLiveDomain();
    return live ? clampToData(live) : null;
  }, [clampToData, computeLiveDomain, xDomain, selectedPeriod, isLive]);

  // Dynamic Y-axis calculation for Respiration (Day view only, all zoom levels)
  // Calculates domain based on visible data points with 10% padding
  const calculateDynamicYDomain = React.useCallback((
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


  // Y-axis domain - dynamic for Day view, fixed for Week/Month views
  const yDomain = React.useMemo<[number, number] | undefined>(() => {
    if (selectedPeriod === 'Day') {
      // Dynamic Y-axis based on visible data points
      if (chartData && chartData.length > 0 && resolvedXDomain) {
        return calculateDynamicYDomain(chartData, resolvedXDomain);
      }
      // Fallback to default if no data
      return [0, 20];
    }
    // Default: 0-20 Resp/Min for Week/Month views
    return [0, 20];
  }, [selectedPeriod, chartData, resolvedXDomain, calculateDynamicYDomain]);

  // Chart domain object
  const chartDomain = React.useMemo(() => {
    if (!resolvedXDomain || !yDomain) return undefined;
    return {
      x: [...resolvedXDomain] as [number, number],
      y: [...yDomain] as [number, number],
    };
  }, [resolvedXDomain, yDomain]);

  // Y-axis domain for weekly view - dynamic based on max value + 10 padding
  const weeklyYDomain = React.useMemo<[number, number] | undefined>(() => {
    if (weeklyChartData.length === 0) return [0, 20];
    
    const values = weeklyChartData.map((d) => d.y).filter((v) => v > 0);
    if (values.length === 0) return [0, 20];
    
    const max = Math.max(...values);
    // Add 10 to the max value for padding, but ensure minimum of 20
    const maxWithPadding = Math.max(max + 10, 20);
    
    return [0, Math.ceil(maxWithPadding)];
  }, [weeklyChartData]);

  // Format X-axis labels for weekly view
  const formatWeekDayLabel = React.useCallback((label: string | number) => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const index = typeof label === 'number' ? label : parseInt(String(label), 10);
    return dayNames[index] || String(label);
  }, []);


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

  const isFetchingData = isLoadingHistoricalDay || isLoading || isLoadingWeekly || isLoadingMonthly;

  React.useEffect(() => {
    if (!isFetchingData) {
      setNavDirection(null);
    }
  }, [isFetchingData]);

  // Show skeleton only when we have a device and are loading. When no device, show "No data available".
  const isInitialLoading = 
    (selectedPeriod === 'Day' && activeDevice?.deviceId && (isTodaySelected ? (isLoading && respirationData.length === 0) : isLoadingHistoricalDay)) ||
    (selectedPeriod === 'Week' && isLoadingWeekly && weeklyRespirationData.length === 0) ||
    (selectedPeriod === 'Month' && isLoadingMonthly && monthlyRespirationData.length === 0);

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
        <Text style={styles.headerTitle} numberOfLines={1}>{activeDevice?.customName || activeDevice?.defaultName || 'Estimated Respiration Trends'}</Text>
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
          <TouchableOpacity 
            onPress={goToPrevious} 
            style={isFetchingData ? [styles.dateNavButton, styles.dateNavButtonDisabled] : styles.dateNavButton} 
            activeOpacity={0.8}
            disabled={isFetchingData}
          >
            {(isFetchingData && navDirection === 'prev') ? (
              <ActivityIndicator size="small" color="rgba(199,214,255,0.5)" />
            ) : (
              <Ionicons name="chevron-back" size={20} color={isFetchingData ? "rgba(199,214,255,0.3)" : "#C7D6FF"} />
            )}
          </TouchableOpacity>
          <Text style={styles.dateText}>{formattedDate}</Text>
          <TouchableOpacity 
            onPress={goToNext} 
            style={(canGoNext && !isFetchingData) ? styles.dateNavButton : [styles.dateNavButton, styles.dateNavButtonDisabled]} 
            activeOpacity={0.8}
            disabled={!canGoNext || isFetchingData}
          >
            {(isFetchingData && navDirection === 'next') ? (
              <ActivityIndicator size="small" color="rgba(199,214,255,0.5)" />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={(canGoNext && !isFetchingData) ? "#C7D6FF" : "rgba(199,214,255,0.3)"} />
            )}
          </TouchableOpacity>
        </View>

        {/* Show skeleton when loading, otherwise show content */}
        {isInitialLoading ? (
          <HeartRateSkeleton />
        ) : (
          <>
            {/* Key Respiration Metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Min Respiration</Text>
                <Text style={styles.metricValue}>{displayMetrics.min}</Text>
                <Text style={styles.metricUnit}>RPM</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Avg Respiration</Text>
                <Text style={styles.metricValue}>{displayMetrics.average}</Text>
                <Text style={styles.metricUnit}>RPM</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Max Respiration</Text>
                <Text style={styles.metricValue}>{displayMetrics.max}</Text>
                <Text style={styles.metricUnit}>RPM</Text>
              </View>
            </View>

            {/* Last Sync Time */}
            <View style={styles.lastSyncContainer}>
              <Text style={styles.lastSyncText}>
                Last sync: {(() => {
                  // Use latestPoint which already finds the last valid point
                  if (latestPoint && latestPoint.timestamp) {
                    const lastTimestamp = latestPoint.timestamp;
                    const now = Date.now();
                    const displayTime = lastTimestamp > now ? now : lastTimestamp;
                    return new Date(displayTime).toLocaleTimeString('en-US', { 
                      hour: '2-digit', 
                      minute: '2-digit',
                      hour12: false 
                    });
                  }
                  return 'No data';
                })()}
              </Text>
            </View>

            {/* Respiration Graph with Victory Native */}
            {selectedPeriod === 'Month' ? (
              // Monthly Bar Chart View
              monthlyError && monthlyRespirationData.length === 0 ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.errorText}>{monthlyError}</Text>
                  <TouchableOpacity onPress={fetchMonthlyRespirationData} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : monthlyChartData.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>No monthly respiration data available</Text>
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
                          tickCount: 4,
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
                            color="#FFD700"
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
                                color="rgba(255, 215, 0, 0.6)"
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

              {/* Disclaimer for 12 PM - 12 PM cycle */}
              <View style={styles.disclaimerContainer}>
                <Text style={styles.disclaimerText}>
                  Disclaimer: Our day cycle is 12 noon to 12 noon. For example, Monday data counts from Sunday 12 noon to Monday 12 noon.
                </Text>
              </View>

                </View>
              )
            ) : selectedPeriod === 'Week' ? (
              // Weekly Bar Chart View
              weeklyError && weeklyRespirationData.length === 0 ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.errorText}>{weeklyError}</Text>
                  <TouchableOpacity onPress={fetchWeeklyRespirationData} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              ) : weeklyChartData.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>No weekly respiration data available</Text>
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
                        x: [-0.5, 6.5],
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
                          tickCount: 4,
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
                        if (!points || !points.y || !chartBounds || !Array.isArray(points.y)) {
                          return null;
                        }
                        
                        const chartData = weeklyChartData;
                        if (!chartData || chartData.length === 0) {
                          return null;
                        }
                        
                        const pointsWithData = points.y.filter((p: any, index: number) => {
                          if (!p || index >= chartData.length) return false;
                          const dayData = chartData[index];
                          return dayData && dayData.hasData === true && dayData.y > 0;
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
                            color="#FFD700"
                            roundedCorners={{ topLeft: 8, topRight: 8 }}
                            innerPadding={0.5}
                            barCount={7}
                          />
                        );

                        if (todayPoint) {
                          return (
                            <>
                              {allBars}
                              <Bar
                                points={[todayPoint]}
                                chartBounds={chartBounds}
                                color="rgba(255, 215, 0, 0.6)"
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

              {/* Disclaimer for 12 PM - 12 PM cycle */}
              <View style={styles.disclaimerContainer}>
                <Text style={styles.disclaimerText}>
                  Disclaimer: Our day cycle is 12 noon to 12 noon. For example, Monday data counts from Sunday 12 noon to Monday 12 noon.
                </Text>
              </View>

                </View>
              )
            ) : (
              // Day Line Chart View — when no device show "No data available" (no stuck skeleton)
              !activeDevice?.deviceId ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>No data available</Text>
                  <Text style={styles.emptySubtext}>Data will appear here when available</Text>
                </View>
              ) : !respirationGraphReady ? (
                <HeartRateSkeleton />
              ) : !graphData || graphData.points.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>No data available</Text>
                  <Text style={styles.emptySubtext}>Data will appear here when available</Text>
                </View>
              ) : (
                <View style={styles.chartContainer}>
                  {/* Healthy Range Legend with Zoom Controls and Top Tooltip */}
                  <View style={styles.legendContainer}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendRectangle, { backgroundColor: 'rgba(126,166,255,0.3)' }]} />
                      <Text style={styles.legendText}>Your healthy range</Text>
                    </View>
                    
                    {/* Top Tooltip - Shows value and time above the graph */}
                    {selectedPeriod === 'Day' && topTooltipData && respirationGraphReady && (
                      <View style={styles.topTooltipInline} pointerEvents="none">
                        <View style={styles.topTooltipBoxInline}>
                          {/* Value - First line */}
                          <Text style={[styles.topTooltipValueInline, { color: '#FFD700' }]}>
                            {topTooltipData.respiration !== null ? Math.round(topTooltipData.respiration) : '--'}
                          </Text>
                          {/* Time - Second line */}
                          <Text style={styles.topTooltipTimeInline}>
                            {formatTime(topTooltipData.timestamp)}
                          </Text>
                        </View>
                      </View>
                    )}
                    
                    {/* Zoom Controls - Only for Day view */}
                    {selectedPeriod === 'Day' && (
                      <View style={styles.zoomButtonsInline}>
                        <TouchableOpacity
                          style={[styles.zoomButtonSmall, zoomIndex === 0 && styles.zoomButtonDisabled]}
                          onPress={() => {
                            const newIndex = Math.max(0, zoomIndex - 1);
                            setZoomIndex(newIndex);
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
                  <View style={styles.chartWrapper}>
                    {chartData && chartData.length > 0 && resolvedXDomain ? (
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
                          
                          const pathAnimate = { type: 'timing' as const, duration: 250 };
                          
                          return (
                            <>
                              {/* Yellow shadow/area under respiration line - render for each segment */}
                              {segments.map((segment, segmentIndex) => (
                                <Area
                                  key={`area-segment-${segmentIndex}-${zoomIndex}-${chartData.length}`}
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
                                  key={`line-segment-${segmentIndex}-${zoomIndex}-${chartData.length}`}
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
                            </>
                          );
                        }}
                      </CartesianChart>
                    ) : (
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                        <ActivityIndicator size="small" color="#FFD700" />
                        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                          Preparing chart...
                        </Text>
                      </View>
                    )}
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
    opacity: 0.5,
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
  loadingContainer: {
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    marginTop: 10,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
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
  chartWrapper: {
    width: '100%',
    height: 320,
    marginTop: 8,
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
  zoomButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
    opacity: 0.5,
  },
  zoomLabelSmall: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '600',
    minWidth: 32,
    textAlign: 'center',
  },
  topTooltipInline: {
    alignItems: 'center',
    justifyContent: 'center',
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
  topTooltipTimeInline: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 8,
    fontWeight: '600',
    marginTop: 1,
    textAlign: 'center',
  },
  bedStatusContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 4,
    marginTop: 8,
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
  disclaimerContainer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    marginTop: 8,
    width: '100%',
  },
  disclaimerText: {
    color: 'rgba(199,214,255,0.5)',
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
