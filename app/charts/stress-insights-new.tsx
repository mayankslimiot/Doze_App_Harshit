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
import { useFont } from '@shopify/react-native-skia';
import { runOnJS, useAnimatedReaction, useDerivedValue } from 'react-native-reanimated';
import { CartesianChart, Line, Bar, useChartTransformState } from 'victory-native';
import { useDevice } from '@/contexts/DeviceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBoot } from '@/contexts/BootContext';
import { getDeviceHistory, getWeeklyHeartRateData, getMonthlyHeartRateData, getHealthData } from '@/services/deviceData';
import { useFocusEffect } from 'expo-router';
import { ZOOM_LEVELS } from '@/utils/zoomLevels';
import { 
  getDayGraphData, 
  isDayGraphReady, 
  subscribe as subscribeToDayGraph, 
  updateZoomLevel 
} from '@/services/dayGraphManager';
import { getRawPoints } from '@/services/heartRateBuffer';
import { connectWebSocket, removeWebSocketHandler, type WebSocketMessageHandler } from '@/services/websocketService';
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
  const [isLoading, setIsLoading] = React.useState(false);
  const [navDirection, setNavDirection] = React.useState<'prev' | 'next' | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [heartRateData, setHeartRateData] = React.useState<HeartRateDataPoint[]>([]);
  
  // Day view: Use pre-built graph data from DayGraphManager (prepared on Home screen)
  const [zoomIndex, setZoomIndex] = React.useState(4); // Start with 4h zoom
  const [graphData, setGraphData] = React.useState<{
    points: Array<{ x: number; y: number }>;
    xDomain: [number, number];
    yDomain: [number, number];
    zoomLevel: { index: number; label: string; rangeSec: number };
  } | null>(null);
  const [dayGraphReady, setDayGraphReady] = React.useState(false);
  const [weeklyHeartRateData, setWeeklyHeartRateData] = React.useState<WeeklyHeartRateDataPoint[]>([]);
  const [isLoadingWeekly, setIsLoadingWeekly] = React.useState(false);
  const [weeklyError, setWeeklyError] = React.useState<string | null>(null);
  
  const [monthlyHeartRateData, setMonthlyHeartRateData] = React.useState<MonthlyHeartRateDataPoint[]>([]);
  const [isLoadingMonthly, setIsLoadingMonthly] = React.useState(false);
  const [monthlyError, setMonthlyError] = React.useState<string | null>(null);
  
  // Bed status tracking
  const [bedStatus, setBedStatus] = React.useState<'Occupied' | 'Vacant'>('Vacant');
  const [isLoadingBedStatus, setIsLoadingBedStatus] = React.useState<boolean>(true);
  const lastDataTimeRef = React.useRef<number>(0);
  const statusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  
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

  // PHASE 3: Day tab is now a pure consumer - subscribe to pre-built graph data
  // DayGraphManager handles all initialization, aggregation, and live updates
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day') {
      return;
    }

    console.log('[HeartRateInsights] Setting up Day graph subscription for device:', activeDevice.deviceId);
    
    // Subscribe to Day graph data updates
    const unsubscribe = subscribeToDayGraph(activeDevice.deviceId, (data) => {
      console.log('[HeartRateInsights] Day graph subscription callback fired:', {
        hasData: !!data,
        pointsLength: data?.points?.length || 0,
        xDomain: data?.xDomain,
        yDomain: data?.yDomain,
      });
      
      if (data) {
        setGraphData(data);
        setDayGraphReady(true); // Has data, ready to render
      } else {
        // data === null means preparation completed but no data available
        setGraphData(null);
        // Still mark as ready so we show "No data" instead of loading
        setDayGraphReady(true);
      }
    });

    // Check initial readiness
    const initialData = getDayGraphData(activeDevice.deviceId);
    const ready = isDayGraphReady(activeDevice.deviceId);
    
    console.log('[HeartRateInsights] Initial Day graph check:', {
      hasInitialData: !!initialData,
      isReady: ready,
      pointsLength: initialData?.points?.length || 0,
    });
    
    if (initialData) {
      setGraphData(initialData);
      setDayGraphReady(true);
    } else if (ready) {
      // Ready means preparation completed (even if no data)
      // Set graphData to null and mark as ready to show "No data"
      setGraphData(null);
      setDayGraphReady(true);
    } else {
      // Not ready - trigger preparation (fallback - should already be done on Home)
      console.log('[HeartRateInsights] Day graph not ready, triggering preparation...');
      import('@/services/dayGraphManager').then(({ prepareDayGraph }) => {
        prepareDayGraph(activeDevice.deviceId).catch((error) => {
          console.error('[HeartRateInsights] Failed to prepare Day graph:', error);
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
    } catch (err: any) {
      console.error('Failed to fetch monthly heart rate data:', err);
      setMonthlyError(err.message || 'Failed to load monthly heart rate data');
      setMonthlyHeartRateData([]);
    } finally {
      setIsLoadingMonthly(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate, getMonthStartDate]);

  // Fetch weekly heart rate data (7 days aggregated)
  const fetchWeeklyHeartRateData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      setWeeklyHeartRateData([]);
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
    } catch (err: any) {
      console.error('Failed to fetch weekly heart rate data:', err);
      setWeeklyError(err.message || 'Failed to load weekly heart rate data');
      setWeeklyHeartRateData([]);
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

    // Fetch latest health data to get current absenceStart value
    const fetchInitialBedStatus = async () => {
      setIsLoadingBedStatus(true);
      try {
        const result = await getHealthData(deviceId, { limit: 1 });
        
        if (result.success && result.data && result.data.length > 0) {
          const latestData = result.data[0];
          const absenceStart = latestData.absenceStart ?? latestData.signals?.absenceStart ?? latestData.metrics?.absenceStart;
          
          console.log('[StressInsights] Initial bed status check:', {
            absenceStart,
            hasAbsenceStart: absenceStart !== undefined && absenceStart !== null,
            timestamp: latestData.timestamp
          });

          // Set initial bed status based on latest data
          if (absenceStart === 1 || absenceStart === '1') {
            console.log('[StressInsights] Setting initial bed status to Occupied');
            setBedStatus('Occupied');
            lastDataTimeRef.current = Date.now();
          } else if (absenceStart === 0 || absenceStart === '0') {
            console.log('[StressInsights] Setting initial bed status to Vacant');
            setBedStatus('Vacant');
            lastDataTimeRef.current = Date.now();
          }
        }
      } catch (error) {
        console.error('[StressInsights] Failed to fetch initial bed status:', error);
      } finally {
        setIsLoadingBedStatus(false);
      }
    };

    fetchInitialBedStatus();
  }, [activeDevice?.deviceId, auth.isLoggedIn]);

  // WebSocket connection for bed status tracking
  React.useEffect(() => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      return;
    }

    const deviceId = activeDevice.deviceId;
    let isMounted = true;

    // Clear existing status timer
    const clearStatusTimer = () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };

    // Set bed status to Vacant after 8 seconds of no data
    const resetToVacant = () => {
      if (isMounted) {
        setBedStatus('Vacant');
      }
    };

    // WebSocket message handler for status tracking
    const statusHandler: WebSocketMessageHandler = (data) => {
      if (!isMounted || data.deviceId !== deviceId) {
        return;
      }

      // Check if absenceStart field indicates occupied (absenceStart: 1) or vacant (absenceStart: 0)
      // Try multiple possible locations: top level, signals, or metrics
      const absenceStart = data.absenceStart ?? data.signals?.absenceStart ?? data.metrics?.absenceStart;
      
      console.log('[StressInsights] Bed status check:', {
        absenceStart,
        hasAbsenceStart: absenceStart !== undefined && absenceStart !== null
      });

      const isOccupied = absenceStart === 1 || absenceStart === '1';
      const isVacant = absenceStart === 0 || absenceStart === '0';

      if (isOccupied) {
        // absenceStart: 1 received - set to Occupied
        console.log('[StressInsights] Setting bed to Occupied');
        clearStatusTimer();
        setBedStatus('Occupied');
        lastDataTimeRef.current = Date.now();

        // Set timer to reset to Vacant after 8 seconds of no data (device offline)
        statusTimerRef.current = setTimeout(() => {
          resetToVacant();
        }, 8000);
      } else if (isVacant) {
        // absenceStart: 0 received - set to Vacant
        console.log('[StressInsights] Setting bed to Vacant');
        clearStatusTimer();
        setBedStatus('Vacant');
        lastDataTimeRef.current = Date.now();
      }
    };

    // Connect to WebSocket for status tracking
    connectWebSocket(deviceId, statusHandler).catch((error) => {
      console.error('[HeartRateInsights] Failed to connect WebSocket for status:', error);
    });

    // Cleanup on unmount or device change
    return () => {
      isMounted = false;
      clearStatusTimer();
      removeWebSocketHandler(statusHandler);
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

  // Calculate metrics from data (Day view) - use RAW points from buffer
  // Min/Max/Avg are calculated based on zoom level and last active timestamp only
  // IMPORTANT: Uses raw points instead of aggregated bucket averages for accurate min/max/avg
  const metrics = React.useMemo(() => {
    let dataToUse: HeartRateDataPoint[];
    
    if (selectedPeriod === 'Day') {
      // Use RAW points from buffer instead of aggregated graph data
      if (graphData && graphData.xDomain && activeDevice?.deviceId) {
        const [windowStart, windowEnd] = graphData.xDomain;
        
        // Get raw points from buffer
        const rawPoints = getRawPoints(activeDevice.deviceId);
        
        // Filter raw points to only include those within the zoom-based time window
        // This ensures metrics only change when zoom level changes, not when user pans/zooms
        const filteredRawPoints = rawPoints.filter(
          (p) => p.timestamp >= windowStart && p.timestamp <= windowEnd && p.value !== null
        );
        
        // Convert to HeartRateDataPoint format
        dataToUse = filteredRawPoints.map((p) => ({
          timestamp: p.timestamp,
          value: p.value!,
        }));
      } else {
        dataToUse = [];
      }
    } else {
      // Use existing heartRateData for Week/Month views
      dataToUse = heartRateData;
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
  }, [selectedPeriod, graphData, heartRateData, activeDevice?.deviceId]);

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

  // Chart-ready gate: Check if graphData is valid for rendering
  const isChartReady = React.useMemo(() => {
    if (selectedPeriod !== 'Day') {
      return chartData.length > 0;
    }
    
    // Day view: Check if graphData is valid
    if (!graphData) {
      console.log('[HeartRateInsights] isChartReady: graphData is null');
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
    });
    return true;
  }, [selectedPeriod, graphData, chartData]);


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
    if (monthlyChartData.length === 0) return [40, 150];
    
    const values = monthlyChartData.map((d) => d.y).filter((v) => v > 0);
    if (values.length === 0) return [40, 150];
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.2 || 10;
    
    return [Math.max(40, Math.floor(min - padding)), Math.min(150, Math.ceil(max + padding))];
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
      // Use backend graph data
      if (graphData && graphData.points && graphData.points.length > 0) {
        const last = graphData.points[graphData.points.length - 1];
        if (!last) return null;
        return { timestamp: last.x, value: last.y };
      }
      return null;
    }
    if (heartRateData.length === 0) return null;
    return heartRateData[heartRateData.length - 1];
  }, [selectedPeriod, graphData, heartRateData]);

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

  // Navigate to next period
  const goToNext = () => {
    setNavDirection('next');
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const newDate = new Date(selectedDate);
    if (selectedPeriod === 'Day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (selectedPeriod === 'Week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedDate(newDate);
  };



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
    if (graphData && isChartReady) return false;
    return !dayGraphReady && graphData === null;
  }, [selectedPeriod, graphData, isChartReady, dayGraphReady, activeDevice?.deviceId]);

  // Y-axis domain - always fixed to 40-150 for Day view (default, can be dragged but resets to this)
  const yDomain = React.useMemo<[number, number] | undefined>(() => {
    // Always use fixed domain for heart rate (40-150 BPM) - prevents axis jumping
    // This is the default, even though users can drag/zoom the Y axis
    return [40, 150];
  }, [selectedPeriod]);

  // Chart domain object - uses backend-provided domains
  const chartDomain = React.useMemo(() => {
    if (!resolvedXDomain || !yDomain) return undefined;
    return {
      x: [...resolvedXDomain] as [number, number],
      y: [...yDomain] as [number, number],
    };
  }, [resolvedXDomain, yDomain]);

  // Y-axis domain for weekly view (calculated from data with padding)
  const weeklyYDomain = React.useMemo<[number, number] | undefined>(() => {
    if (weeklyChartData.length === 0) return [40, 150];
    
    const values = weeklyChartData.map((d) => d.y).filter((v) => v > 0);
    if (values.length === 0) return [40, 150];
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.2 || 10; // 20% padding or minimum 10
    
    return [Math.max(40, Math.floor(min - padding)), Math.min(150, Math.ceil(max + padding))];
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
    const chartHeight = 280 - CHART_PADDING.top - CHART_PADDING.bottom;
    
    const [xStart, xEnd] = resolvedXDomain;
    const xRange = xEnd - xStart;
    const baseXPosition = CHART_PADDING.left + ((latestPoint.timestamp - xStart) / xRange) * chartWidth;
    
    const [yMin, yMax] = yDomain;
    const yRange = yMax - yMin;
    const baseYPosition = CHART_PADDING.top + chartHeight - ((latestPoint.value - yMin) / yRange) * chartHeight;
    
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
  }, [latestPoint, resolvedXDomain, yDomain, width, transformMatrix]);

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

  const isFetchingData = isLoading || isLoadingWeekly || isLoadingMonthly;

  React.useEffect(() => {
    if (!isFetchingData) {
      setNavDirection(null);
    }
  }, [isFetchingData]);

  // Show skeleton immediately while data is loading
  const isInitialLoading = shouldShowDayLoading || 
    (selectedPeriod === 'Week' && isLoadingWeekly && weeklyHeartRateData.length === 0) ||
    (selectedPeriod === 'Month' && isLoadingMonthly && monthlyHeartRateData.length === 0) ||
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
        <Text style={styles.headerTitle} numberOfLines={1}>{activeDevice?.customName || activeDevice?.deviceId || 'More Insights'}</Text>
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
            {/* Key Heart Rate Metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Min</Text>
                <Text style={styles.metricValue}>{displayMetrics.min}</Text>
                <Text style={styles.metricUnit}>BPM</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Average</Text>
                <Text style={styles.metricValue}>{displayMetrics.average}</Text>
                <Text style={styles.metricUnit}>BPM</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Max</Text>
                <Text style={styles.metricValue}>{displayMetrics.max}</Text>
                <Text style={styles.metricUnit}>BPM</Text>
              </View>
            </View>

            {/* Last Sync Time */}
            <View style={styles.lastSyncContainer}>
              <Text style={styles.lastSyncText}>
                Last sync: {(() => {
                  // Day view: Use graphData.points (backend-aggregated data)
                  if (selectedPeriod === 'Day' && graphData && graphData.points && graphData.points.length > 0) {
                    const lastPoint = graphData.points[graphData.points.length - 1];
                    const lastTimestamp = lastPoint.x; // x is timestamp in milliseconds
                    const now = Date.now();
                    const displayTime = lastTimestamp > now ? now : lastTimestamp;
                    return new Date(displayTime).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true 
                    });
                  }
                  // Week/Month views: Use heartRateData
                  if (selectedPeriod !== 'Day' && heartRateData.length > 0) {
                    const lastTimestamp = heartRateData[heartRateData.length - 1].timestamp;
                    const now = Date.now();
                    const displayTime = lastTimestamp > now ? now : lastTimestamp;
                    return new Date(displayTime).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit',
                      hour12: true 
                    });
                  }
                  return 'No data';
                })()}
              </Text>
            </View>

                {/* Heart Rate Graph with Victory Native */}
            {selectedPeriod === 'Month' ? (
              // Monthly Bar Chart View
              monthlyError && monthlyHeartRateData.length === 0 ? (
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
                  <Text style={styles.legendText}>Your typical range</Text>
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
              weeklyError && weeklyHeartRateData.length === 0 ? (
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
                  <Text style={styles.legendText}>Your typical range</Text>
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
            {/* Healthy Range Legend with Zoom Controls */}
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendRectangle, { backgroundColor: 'rgba(126,166,255,0.3)' }]} />
                <Text style={styles.legendText}>Your typical range</Text>
              </View>
              
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
                  });
                }
                return canRender;
              })() ? (
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
                    tickCount: 4,
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
                {({ points }) => (
                  <Line
                    key={`line-${zoomIndex}-${chartData.length}`}
                    points={points.y}
                    color="#FF6B6B"
                    strokeWidth={2.5}
                    strokeCap="round"
                    strokeJoin="round"
                    animate={{ type: 'timing', duration: 250 }}
                  />
                )}
              </CartesianChart>
              ) : !isChartReady ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                  <ActivityIndicator size="small" color="#FF6B6B" />
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                    {!graphData ? 'Preparing graph data...' : 'Preparing chart...'}
                  </Text>
                </View>
              ) : null}

              {/* Tooltip for latest point */}
              {latestPoint && tooltipPosition !== null && (
                <View
                  style={[
                    styles.tooltipContainer,
                    {
                      left: tooltipPosition?.x ?? 0,
                      top: tooltipPosition?.y ?? 0,
                    },
                  ]}
                  pointerEvents="none"
                >
                  {/* Tooltip box */}
                  <View style={styles.tooltipBox}>
                    {/* Value text */}
                    <Text style={styles.tooltipValue}>
                      {Math.round(latestPoint.value)}
                    </Text>
                    {/* Time text */}
                    <Text style={styles.tooltipTime}>
                      {formatTime(latestPoint.timestamp)}
                    </Text>
                  </View>
                  {/* Tooltip arrow pointing to point */}
                  {tooltipPosition && (
                    <View
                      style={[
                        styles.tooltipArrow,
                        {
                          left: (tooltipPosition.pointX - tooltipPosition.x - 5),
                        },
                      ]}
                    />
                  )}
                </View>
              )}
            </View>

            {/* Bed Status Indicator - Only show after API call completes */}
            {!isLoadingBedStatus && (
              <View style={styles.bedStatusContainer}>
                <View style={[styles.bedStatusIndicator, bedStatus === 'Occupied' && styles.bedStatusOccupied]}>
                  <View style={[styles.bedStatusDot, bedStatus === 'Occupied' && styles.bedStatusDotOccupied]} />
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
  tooltipContainer: {
    position: 'absolute',
    zIndex: 10,
  },
  tooltipBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FF6B6B',
    alignItems: 'center',
    minWidth: 70,
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
  bedStatusText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

