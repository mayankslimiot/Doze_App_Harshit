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
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import { CartesianChart, Bar, useChartTransformState } from 'victory-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { useDevice } from '@/contexts/DeviceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useBoot } from '@/contexts/BootContext';
import { getWeeklyStressData, getMonthlyStressData } from '@/services/deviceData';
import { useFocusEffect } from 'expo-router';
import { 
  getStressGraphData, 
  isStressGraphReady, 
  subscribe as subscribeToStressGraph,
  type StressGraphData
} from '@/services/stressGraphManager';
import HeartRateSkeleton from '@/components/HeartRateSkeleton';

const { width } = Dimensions.get('window');

// Constants for Day view bar chart - Dynamic sizing
const MIN_BAR_WIDTH = 3; // Minimum bar width to maintain usability (px)
const BAR_SPACING = 8; // Spacing between bars (px)

interface WeeklyStressDataPoint {
  day: string;
  dayIndex: number;
  date: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  isPartial: boolean;
  count: number;
}

interface MonthlyStressDataPoint {
  day: number;
  dayIndex: number;
  date: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  isPartial: boolean;
  count: number;
}

export default function StressInsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeDevice } = useDevice();
  const { auth } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = React.useState<'Day' | 'Week' | 'Month'>('Day');
  
  const { onboardingSeen } = useBoot();
  
  // Log screen focus
  useFocusEffect(
    React.useCallback(() => {
      const deviceBound = activeDevice?.deviceId ? true : false;
      
      console.log('[STRESS] Screen focus', {
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
  const [error, setError] = React.useState<string | null>(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = React.useState(false);
  
  // Day view: Use pre-built graph data from StressGraphManager
  const [graphData, setGraphData] = React.useState<StressGraphData | null>(null);
  const [stressGraphReady, setStressGraphReady] = React.useState(false);
  
  // Transform state for pan gestures (like Heart Rate)
  const { state: transformState } = useChartTransformState({ scaleX: 1, scaleY: 1 });
  
  // Domain management for panning
  const domainRef = React.useRef<[number, number] | null>(null);
  const [xDomain, setXDomain] = React.useState<[number, number] | null>(null);
  const lastPanX = React.useRef(0);
  const hasUserPannedRef = React.useRef(false); // Track if user has manually panned
  const lastLatestTimestampRef = React.useRef<number | null>(null); // Track latest timestamp to detect new data
  
  // Week/Month data
  const [weeklyStressData, setWeeklyStressData] = React.useState<WeeklyStressDataPoint[]>([]);
  const [isLoadingWeekly, setIsLoadingWeekly] = React.useState(false);
  const [weeklyError, setWeeklyError] = React.useState<string | null>(null);
  
  const [monthlyStressData, setMonthlyStressData] = React.useState<MonthlyStressDataPoint[]>([]);
  const [isLoadingMonthly, setIsLoadingMonthly] = React.useState(false);
  const [monthlyError, setMonthlyError] = React.useState<string | null>(null);
  
  // Cache for weekly/monthly data
  const weeklyDataCache = React.useRef<Map<string, WeeklyStressDataPoint[]>>(new Map());
  const monthlyDataCache = React.useRef<Map<string, MonthlyStressDataPoint[]>>(new Map());
  
  const prevDeviceIdForResetRef = React.useRef<string | null>(null);

  // Chart padding - standard padding for time-based labels
  const CHART_PADDING = React.useMemo(
    () => ({ left: 28, right: 8, top: 18, bottom: 40 }),
    [],
  );

  const WEEKLY_CHART_PADDING = React.useMemo(
    () => ({ left: 40, right: 40, top: 18, bottom: 40 }),
    [],
  );

  const MONTHLY_CHART_PADDING = React.useMemo(
    () => ({ left: 40, right: 40, top: 18, bottom: 40 }),
    [],
  );

  // Load font
  const skiaFont = useFont(require('../../assets/fonts/SpaceMono-Regular.ttf'), 9);

  // Get start of week (Monday)
  const getWeekStartDate = React.useCallback((date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }, []);

  // Get start of month
  const getMonthStartDate = React.useCallback((date: Date): Date => {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    return monthStart;
  }, []);

  // Subscribe to Stress graph data from StressGraphManager (Day view)
  React.useEffect(() => {
    if (!activeDevice?.deviceId || selectedPeriod !== 'Day') {
      return;
    }

    // Clear graph data immediately when date changes to avoid showing stale data
    setGraphData(null);
    setStressGraphReady(false);
    setIsLoading(true);
    // Reset pan tracking when date changes
    hasUserPannedRef.current = false;
    lastLatestTimestampRef.current = null;
    domainRef.current = null;
    setXDomain(null);

    console.log('[StressInsights] Subscribing to Stress graph updates for device:', activeDevice.deviceId, 'date:', selectedDate.toISOString().split('T')[0]);

    const unsubscribe = subscribeToStressGraph(activeDevice.deviceId, (data) => {
      console.log('[StressInsights] Graph data update received:', {
        hasData: !!data,
        pointsLength: data?.points?.length || 0,
      });
      
      if (data) {
        setGraphData(data);
        setStressGraphReady(true);
        setIsLoading(false);
        setError(null);
        
      } else {
        setGraphData(null);
        setStressGraphReady(true);
        setIsLoading(false);
      }
    });

    // Always prepare for the selected date (will skip if already hydrated for that date)
    console.log('[StressInsights] Preparing Stress graph for date:', selectedDate.toISOString().split('T')[0]);
    import('@/services/stressGraphManager').then(({ prepareStressGraph }) => {
      prepareStressGraph(activeDevice.deviceId, selectedDate).catch((error) => {
        console.error('[StressInsights] Failed to prepare Stress graph:', error);
        setError('Failed to load stress data');
        setIsLoading(false);
        setStressGraphReady(true);
      });
    });

    return unsubscribe;
  }, [activeDevice?.deviceId, selectedPeriod, selectedDate]);

  // Fetch weekly stress data
  const fetchWeeklyStressData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      setWeeklyStressData([]);
      return;
    }

    try {
      setIsLoadingWeekly(true);
      setWeeklyError(null);
      
      const weekStart = getWeekStartDate(selectedDate);
      
      const cacheKey = `${activeDevice.deviceId}_${weekStart.toISOString()}`;
      const cachedData = weeklyDataCache.current.get(cacheKey);
      
      if (cachedData) {
        console.log('[StressInsights] Using cached weekly data');
        setWeeklyStressData(cachedData);
        setIsLoadingWeekly(false);
        return;
      }

      const result = await getWeeklyStressData(activeDevice.deviceId, weekStart);

      if (result.success && result.data && Array.isArray(result.data)) {
        weeklyDataCache.current.set(cacheKey, result.data);
        setWeeklyStressData(result.data);
      } else {
        setWeeklyStressData([]);
        setWeeklyError(result.message || 'No weekly stress data available');
      }
    } catch (err: any) {
      console.error('Failed to fetch weekly stress data:', err);
      setWeeklyError(err.message || 'Failed to load weekly stress data');
      setWeeklyStressData([]);
    } finally {
      setIsLoadingWeekly(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate, getWeekStartDate]);

  // Fetch monthly stress data
  const fetchMonthlyStressData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      setMonthlyStressData([]);
      return;
    }

    try {
      setIsLoadingMonthly(true);
      setMonthlyError(null);
      
      const monthStart = getMonthStartDate(selectedDate);
      
      const cacheKey = `${activeDevice.deviceId}_${monthStart.toISOString()}`;
      const cachedData = monthlyDataCache.current.get(cacheKey);
      
      if (cachedData) {
        console.log('[StressInsights] Using cached monthly data');
        setMonthlyStressData(cachedData);
        setIsLoadingMonthly(false);
        return;
      }

      const result = await getMonthlyStressData(activeDevice.deviceId, monthStart);

      if (result.success && result.data && Array.isArray(result.data)) {
        monthlyDataCache.current.set(cacheKey, result.data);
        setMonthlyStressData(result.data);
      } else {
        setMonthlyStressData([]);
        setMonthlyError(result.message || 'No monthly stress data available');
      }
    } catch (err: any) {
      console.error('Failed to fetch monthly stress data:', err);
      setMonthlyError(err.message || 'Failed to load monthly stress data');
      setMonthlyStressData([]);
    } finally {
      setIsLoadingMonthly(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate, getMonthStartDate]);

  // Reset graph state when device changes
  React.useEffect(() => {
    const currentDeviceId = activeDevice?.deviceId || null;
    const prevDeviceId = prevDeviceIdForResetRef.current;
    
    if (prevDeviceId !== null && prevDeviceId !== currentDeviceId) {
      console.log('[StressInsights] 🔄 Device changed, resetting state:', { from: prevDeviceId, to: currentDeviceId });
      setGraphData(null);
      setStressGraphReady(false);
    }
    
    prevDeviceIdForResetRef.current = currentDeviceId;
  }, [activeDevice?.deviceId]);

  // Fetch data on mount and when period/date changes
  React.useEffect(() => {
    if (selectedPeriod === 'Week') {
      fetchWeeklyStressData();
    } else if (selectedPeriod === 'Month') {
      fetchMonthlyStressData();
    }
  }, [fetchWeeklyStressData, fetchMonthlyStressData, selectedPeriod, selectedDate]);

  // Clear caches when device changes
  React.useEffect(() => {
    weeklyDataCache.current.clear();
    monthlyDataCache.current.clear();
  }, [activeDevice?.deviceId]);

  // Calculate metrics from Day view data
  // Values <5 are excluded from graph and from min/average (per product requirement)
  const dayMetrics = React.useMemo(() => {
    if (!graphData || !graphData.points || graphData.points.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const values = graphData.points.map((p) => p.y).filter((v) => !isNaN(v) && isFinite(v) && v >= 0 && v <= 100);
    const valuesGte5 = values.filter((v) => v >= 5);
    if (valuesGte5.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const average = Math.round(valuesGte5.reduce((sum, val) => sum + val, 0) / valuesGte5.length);
    return {
      min: Math.round(Math.min(...valuesGte5)),
      max: Math.round(Math.max(...valuesGte5)),
      average,
    };
  }, [graphData]);

  // Day view chart data: only points with stress >= 5 (exclude values below 5 from graph)
  const dayChartData = React.useMemo(() => {
    if (!graphData?.points?.length) return [];
    return graphData.points.filter((p) => p.y >= 5);
  }, [graphData]);

  // Calculate metrics from weekly data (exclude values < 5 from graph and min metric)
  const weeklyMetrics = React.useMemo(() => {
    if (weeklyStressData.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const validDays = weeklyStressData.filter((d) => d.avg !== null && d.avg >= 5);
    if (validDays.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const averages = validDays.map((d) => d.avg!);
    const mins = validDays.map((d) => d.min).filter((v) => v !== null && v >= 5) as number[];
    const maxs = validDays.map((d) => d.max).filter((v) => v !== null && v >= 0) as number[];
    
    return {
      min: mins.length > 0 ? Math.round(Math.min(...mins)) : Math.round(Math.min(...averages)),
      max: maxs.length > 0 ? Math.round(Math.max(...maxs)) : Math.round(Math.max(...averages)),
      average: Math.round(averages.reduce((sum, val) => sum + val, 0) / averages.length),
    };
  }, [weeklyStressData]);

  // Calculate metrics from monthly data (exclude values < 5 from graph and min metric)
  const monthlyMetrics = React.useMemo(() => {
    if (monthlyStressData.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const validDays = monthlyStressData.filter((d) => d.avg !== null && d.avg >= 5);
    if (validDays.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const averages = validDays.map((d) => d.avg!);
    const mins = validDays.map((d) => d.min).filter((v) => v !== null && v >= 5) as number[];
    const maxs = validDays.map((d) => d.max).filter((v) => v !== null && v >= 0) as number[];
    
    return {
      min: mins.length > 0 ? Math.round(Math.min(...mins)) : Math.round(Math.min(...averages)),
      max: maxs.length > 0 ? Math.round(Math.max(...maxs)) : Math.round(Math.max(...averages)),
      average: Math.round(averages.reduce((sum, val) => sum + val, 0) / averages.length),
    };
  }, [monthlyStressData]);

  // Use appropriate metrics based on selected period
  const displayMetrics = selectedPeriod === 'Week' ? weeklyMetrics : 
                         selectedPeriod === 'Month' ? monthlyMetrics : dayMetrics;

  // Y-axis domain - always fixed at 0-100 for Day view (same as Heart Rate uses fixed 40-150)
  const yDomain = React.useMemo<[number, number] | undefined>(() => {
    if (selectedPeriod === 'Day') {
      // Always use fixed 0-100 for stress in Day view (never moves)
      return [0, 100];
    }
    // For Week/Month views, use calculated domains
    return undefined; // Will use weeklyYDomain or monthlyYDomain
  }, [selectedPeriod]);

  // Format time for X-axis labels - show only at 30-minute intervals
  // Format: "9:30", "10:00", "10:30", "11:00", "11:30", "12:00"
  // Always shows time labels at 30-minute intervals
  const formatTimeFor30MinIntervals = React.useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Victory Native will place ticks at intervals, we just format them
    // Check if minutes are close to 0 or 30 (within 1 minute tolerance for rounding)
    const roundedMinutes = Math.round(minutes / 30) * 30;
    
    if (roundedMinutes === 0 || roundedMinutes === 60) {
      const displayHours = roundedMinutes === 60 ? hours + 1 : hours;
      return `${displayHours}:00`; // Show hour:00 (e.g., "10:00", "11:00", "12:00")
    } else if (roundedMinutes === 30) {
      return `${hours}:30`; // Show hour:30 (e.g., "9:30", "10:30", "11:30")
    }
    
    // Return empty string for other times
    return '';
  }, []);

  // Compute viewport domain: 4 hours ending at latest point
  const computeViewportDomain = React.useCallback((): [number, number] | null => {
    if (selectedPeriod === 'Day' && graphData && graphData.points && graphData.points.length > 0) {
      // Get latest point timestamp - ensure we get the actual latest point
      // Sort by timestamp to ensure we have the true latest (in case points aren't sorted)
      const sortedPoints = [...graphData.points].sort((a, b) => a.x - b.x);
      const latestTimestamp = sortedPoints[sortedPoints.length - 1].x;
      
      // Log for debugging
      if (__DEV__) {
        const latestDate = new Date(latestTimestamp);
        console.log('[StressInsights] Latest point timestamp:', {
          timestamp: latestTimestamp,
          date: latestDate.toISOString(),
          localTime: latestDate.toLocaleString(),
          hour: latestDate.getHours(),
          minute: latestDate.getMinutes(),
        });
      }
      
      // Calculate 4 hours in milliseconds (4 * 60 * 60 * 1000)
      const VIEWPORT_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
      
      // Viewport: [latestTimestamp - 4 hours, latestTimestamp]
      const viewportStart = latestTimestamp - VIEWPORT_DURATION_MS;
      const viewportEnd = latestTimestamp;
      
      return [viewportStart, viewportEnd];
    }
    return null;
  }, [selectedPeriod, graphData]);

  // Compute full data domain from graphData (24-hour range for panning)
  const computeFullDomain = React.useCallback((): [number, number] | null => {
    if (selectedPeriod === 'Day' && graphData && graphData.xDomain) {
      return graphData.xDomain; // Full 24-hour range
    }
    return null;
  }, [selectedPeriod, graphData]);

  // Clamp domain to data bounds (allow panning through full 24-hour range)
  const clampToData = React.useCallback(
    ([start, end]: [number, number]): [number, number] => {
      if (selectedPeriod === 'Day') {
        if (!graphData || !graphData.xDomain) {
          return [start, end];
        }
        
        // Use full 24-hour domain from graphData for panning bounds
        const [dataMin, dataMax] = graphData.xDomain;
        const span = end - start;
        
        // Clamp to full data bounds (24-hour range)
        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          const viewportDomain = computeViewportDomain();
          return viewportDomain || [dataMin, dataMax];
        }

        // Allow panning through full range, but maintain viewport span
        if (start < dataMin) {
          return [dataMin, dataMin + span];
        }
        if (end > dataMax) {
          return [dataMax - span, dataMax];
        }

        return [start, end];
      }
      return [start, end];
    },
    [selectedPeriod, graphData, computeViewportDomain],
  );

  // Pan domain: convert translateX to domain shift (left-right panning only)
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
      hasUserPannedRef.current = true; // Mark that user has panned
    },
    [clampToData, width, CHART_PADDING],
  );

  // Update domain when graphData changes - always show latest point on the right
  React.useEffect(() => {
    if (selectedPeriod === 'Day' && graphData && graphData.points && graphData.points.length > 0) {
      // Ensure we get the actual latest point by sorting
      const sortedPoints = [...graphData.points].sort((a, b) => a.x - b.x);
      const latestTimestamp = sortedPoints[sortedPoints.length - 1].x;
      const viewportDomain = computeViewportDomain();
      
      if (viewportDomain) {
        // Check if this is new data (latest timestamp changed)
        const isNewData = lastLatestTimestampRef.current === null || 
                         lastLatestTimestampRef.current !== latestTimestamp;
        
        if (isNewData) {
          lastLatestTimestampRef.current = latestTimestamp;
        }
        
        // If no domain set yet, initialize with viewport (latest point on right)
        if (!xDomain || !domainRef.current) {
          domainRef.current = viewportDomain;
          setXDomain(viewportDomain);
          hasUserPannedRef.current = false; // Reset pan flag on initial load
          // Reset transform to ensure latest point is visible on right
          const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
          transformState.matrix.value = IDENTITY_MATRIX;
          transformState.offset.value = IDENTITY_MATRIX;
          lastPanX.current = 0;
        } else if (isNewData && !hasUserPannedRef.current) {
          // New data arrived and user hasn't panned - always update to show latest point on right
          domainRef.current = viewportDomain;
          setXDomain(viewportDomain);
          // Reset transform to ensure latest point is visible on right
          const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
          transformState.matrix.value = IDENTITY_MATRIX;
          transformState.offset.value = IDENTITY_MATRIX;
          lastPanX.current = 0;
        }
        // If user has panned, don't auto-update - preserve their view
      }
    }
  }, [selectedPeriod, graphData, computeViewportDomain, xDomain, transformState]);

  // PAN: Watch translateX and update domain continuously
  useAnimatedReaction(
    () => {
      const matrix = transformState.matrix.value;
      return matrix?.[12] ?? 0; // translateX
    },
    (translateX) => {
      const dx = translateX - lastPanX.current;
      lastPanX.current = translateX;

      if (Math.abs(dx) > 0.1) {
        runOnJS(panDomain)(dx);
      }
    },
    [panDomain],
  );

  // Reset transform when domain changes
  React.useEffect(() => {
    if (selectedPeriod === 'Day' && xDomain) {
      // Reset transform matrix when domain changes
      const IDENTITY_MATRIX = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      transformState.matrix.value = IDENTITY_MATRIX;
      transformState.offset.value = IDENTITY_MATRIX;
      lastPanX.current = 0;
    }
  }, [selectedPeriod, xDomain, transformState]);

  // Resolved X domain for chart (use xDomain if set, otherwise use graphData.xDomain)
  const resolvedXDomain = React.useMemo<[number, number] | null>(() => {
    if (selectedPeriod === 'Day') {
      if (xDomain) {
        return xDomain;
      }
      if (graphData && graphData.xDomain) {
        return graphData.xDomain;
      }
      return null;
    }
    return null;
  }, [selectedPeriod, xDomain, graphData]);


  // Format weekly data for Victory Bar chart (only show bars with stress >= 5)
  const weeklyChartData = React.useMemo(() => {
    if (weeklyStressData.length === 0) return [];
    
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const formatted = [];
    
    for (let i = 0; i < 7; i++) {
      const dayData = weeklyStressData.find((d) => d.dayIndex === i);
      if (dayData) {
        const showBar = dayData.avg !== null && dayData.avg >= 5;
        formatted.push({
          x: i,
          y: showBar ? dayData.avg! : 0,
          day: dayData.day,
          date: dayData.date,
          isPartial: dayData.isPartial,
          min: dayData.min,
          max: dayData.max,
          hasData: showBar,
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
    
    return formatted;
  }, [weeklyStressData]);

  // Format monthly data for Victory Bar chart (only show bars with stress >= 5)
  const monthlyChartData = React.useMemo(() => {
    if (monthlyStressData.length === 0) return [];
    
    const formatted = [];
    const daysInMonth = monthlyStressData.length;
    
    for (let i = 0; i < daysInMonth; i++) {
      const dayData = monthlyStressData.find((d) => d.dayIndex === i);
      if (dayData) {
        const showBar = dayData.avg !== null && dayData.avg >= 5;
        formatted.push({
          x: i,
          y: showBar ? dayData.avg! : 0,
          day: dayData.day,
          date: dayData.date,
          isPartial: dayData.isPartial,
          min: dayData.min,
          max: dayData.max,
          hasData: showBar,
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
    
    return formatted;
  }, [monthlyStressData]);

  // Y-axis domain for weekly/monthly views
  const weeklyYDomain = React.useMemo<[number, number] | undefined>(() => {
    if (weeklyChartData.length === 0) return [0, 100];
    
    const values = weeklyChartData.map((d) => d.y).filter((v) => v > 0);
    if (values.length === 0) return [0, 100];
    
    const max = Math.max(...values);
    const maxWithPadding = Math.max(max + 10, 100);
    
    return [0, Math.min(100, Math.ceil(maxWithPadding))];
  }, [weeklyChartData]);

  const monthlyYDomain = React.useMemo<[number, number] | undefined>(() => {
    if (monthlyChartData.length === 0) return [0, 100];
    
    const values = monthlyChartData.map((d) => d.y).filter((v) => v > 0);
    if (values.length === 0) return [0, 100];
    
    const max = Math.max(...values);
    const maxWithPadding = Math.max(max + 10, 100);
    
    return [0, Math.min(100, Math.ceil(maxWithPadding))];
  }, [monthlyChartData]);

  // Format X-axis labels
  const formatWeekDayLabel = React.useCallback((label: string | number) => {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const index = typeof label === 'number' ? label : parseInt(String(label), 10);
    return dayNames[index] || String(label);
  }, []);

  const formatMonthDayLabel = React.useCallback((label: string | number) => {
    const dayNum = typeof label === 'number' ? Math.round(label) : parseInt(String(label), 10);
    if (dayNum % 5 === 0 || dayNum === 0) {
      return String(dayNum + 1);
    }
    return '';
  }, []);

  // Format date for display
  const getWeekStart = React.useCallback((date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }, []);

  const getWeekEnd = React.useCallback((date: Date): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return weekEnd;
  }, [getWeekStart]);

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
  }, [selectedDate, selectedPeriod, getWeekStart, getWeekEnd]);

  // Navigate to previous/next period
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

  // Navigate to next period - prevent going to future dates (cycle-aware)
  const goToNext = () => {
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

  // Reset to today's cycle when period changes
  React.useEffect(() => {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (now.getHours() >= 12) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      setSelectedDate(tomorrow);
    } else {
      setSelectedDate(today);
    }
  }, [selectedPeriod]);

  // Loading state. When no device on Day view, show "No data available" instead of skeleton.
  const isInitialLoading = 
    (selectedPeriod === 'Day' && activeDevice?.deviceId && !stressGraphReady) ||
    (selectedPeriod === 'Week' && isLoadingWeekly && weeklyStressData.length === 0) ||
    (selectedPeriod === 'Month' && isLoadingMonthly && monthlyStressData.length === 0);

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
        <Text style={styles.headerTitle} numberOfLines={1}>{activeDevice?.customName || activeDevice?.defaultName || 'Stress Insights'}</Text>
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
          <TouchableOpacity onPress={() => setIsDatePickerVisible(true)} activeOpacity={0.8}>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goToNext} style={styles.dateNavButton} activeOpacity={0.8}>
            <Ionicons name="chevron-forward" size={20} color="#C7D6FF" />
          </TouchableOpacity>
        </View>

        {/* Show skeleton when loading */}
        {isInitialLoading ? (
          <HeartRateSkeleton />
        ) : (
          <>
            {/* Key Stress Metrics */}
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Min</Text>
                <Text style={styles.metricValue}>{displayMetrics.min}</Text>
                <Text style={styles.metricUnit}>Stress</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Average</Text>
                <Text style={styles.metricValue}>{displayMetrics.average}</Text>
                <Text style={styles.metricUnit}>Stress</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>Max</Text>
                <Text style={styles.metricValue}>{displayMetrics.max}</Text>
                <Text style={styles.metricUnit}>Stress</Text>
            </View>
          </View>

            {/* Last Sync Time */}
            <View style={styles.lastSyncContainer}>
              <Text style={styles.lastSyncText}>
                Last sync: {(() => {
                  if (selectedPeriod === 'Day' && graphData && graphData.points && graphData.points.length > 0) {
                    const lastPoint = graphData.points[graphData.points.length - 1];
                    const lastTimestamp = lastPoint.timestamp;
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

            {/* Stress Graph */}
            {selectedPeriod === 'Month' ? (
              // Monthly Bar Chart View
              monthlyError && monthlyStressData.length === 0 ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.errorText}>{monthlyError}</Text>
                  <TouchableOpacity onPress={fetchMonthlyStressData} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
                </View>
              ) : monthlyChartData.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>No monthly stress data available</Text>
                  <Text style={styles.emptySubtext}>Data will appear here when available</Text>
                </View>
              ) : (
                <View style={styles.chartContainer}>
                  <View style={styles.legendContainer}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendRectangle, { backgroundColor: 'rgba(126,166,255,0.3)' }]} />
                      <Text style={styles.legendText}>Your stress level</Text>
                    </View>
          </View>

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
                            color="#7EE3A1"
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
                                color="rgba(126, 227, 161, 0.6)"
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
              weeklyError && weeklyStressData.length === 0 ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.errorText}>{weeklyError}</Text>
                  <TouchableOpacity onPress={fetchWeeklyStressData} style={styles.retryButton}>
                    <Text style={styles.retryButtonText}>Retry</Text>
                  </TouchableOpacity>
        </View>
              ) : weeklyChartData.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>No weekly stress data available</Text>
                  <Text style={styles.emptySubtext}>Data will appear here when available</Text>
                </View>
              ) : (
        <View style={styles.chartContainer}>
                  <View style={styles.legendContainer}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendRectangle, { backgroundColor: 'rgba(126,166,255,0.3)' }]} />
                      <Text style={styles.legendText}>Your stress level</Text>
                    </View>
                  </View>

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
                            color="#7EE3A1"
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
                                color="rgba(126, 227, 161, 0.6)"
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
              // Day Bar Chart View — when no device show "No data available" (no stuck skeleton)
              !activeDevice?.deviceId ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>No data available</Text>
                  <Text style={styles.emptySubtext}>Data will appear here when available</Text>
                </View>
              ) : !stressGraphReady ? (
                <HeartRateSkeleton />
              ) : !graphData || graphData.points.length === 0 || dayChartData.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
                  <Text style={styles.emptyText}>No data available</Text>
                  <Text style={styles.emptySubtext}>
                    {graphData?.points?.length && dayChartData.length === 0
                      ? 'No stress values ≥ 5 in this period'
                      : 'Data will appear here when available'}
                  </Text>
                </View>
              ) : (
                <View style={styles.chartContainer}>
                  <View style={styles.legendContainer}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendRectangle, { backgroundColor: 'rgba(126,166,255,0.3)' }]} />
                      <Text style={styles.legendText}>Your stress level</Text>
                    </View>
                  </View>

                  {/* Day view chart - Time-based X-axis with 30-minute interval labels */}
                  {/* Uses Victory Native pan gesture (like Heart Rate) instead of ScrollView */}
                  {resolvedXDomain ? (
                    <View style={styles.chartWrapper}>
                      <CartesianChart
                        data={dayChartData}
                        xKey="x"
                        yKeys={['y']}
                        padding={CHART_PADDING}
                        domain={{
                          x: resolvedXDomain, // Time-based domain [startTimestamp, endTimestamp]
                          y: yDomain, // Fixed Y-domain [0, 100] - never moves
                        }}
                        xAxis={{
                          font: skiaFont,
                          tickCount: 9, // 9 ticks for 4 hours with 30-minute intervals (0, 30, 60, 90, 120, 150, 180, 210, 240 min)
                          labelColor: 'rgba(199,214,255,0.75)',
                          lineColor: 'rgba(255,255,255,0.08)', // Grid line color
                          labelOffset: 4,
                          enableRescaling: true,
                          // Always show time labels at 30-minute intervals
                          formatXLabel: (label) => {
                            const timeStr = formatTimeFor30MinIntervals(Number(label));
                            // Always return a label (even if empty, Victory will handle spacing)
                            return timeStr || '';
                          },
                        }}
                        yAxis={[
                          {
                            font: skiaFont,
                            tickCount: 10,
                            labelColor: 'rgba(199,214,255,0.75)',
                            lineColor: 'rgba(255,255,255,0.08)',
                            labelOffset: 4,
                            enableRescaling: false, // Disable Y-axis rescaling - keep it fixed
                            formatYLabel: (label) => `${Math.round(Number(label))}`,
                          },
                        ]}
                        transformState={transformState}
                        transformConfig={{
                          pinch: { enabled: false }, // No zoom, only pan
                          pan: { dimensions: ['x'], activateAfterLongPress: 100 }, // Only horizontal pan
                        }}
                      >
                        {({ points, chartBounds }) => {
                          if (!points?.y || !chartBounds || !Array.isArray(points.y)) {
                            return null;
                          }
                          
                          // Constant bar count for 4 hour viewport
                          // Use higher innerPadding to make bars thinner/smaller
                          const CONSTANT_BAR_COUNT = 30; // Show 30 bars in 4 hour viewport
                          const BAR_INNER_PADDING = 0.3; // Higher padding = thinner bars (40% padding, 60% bar)
                          
                          // Bar styling
                          // NOTE: Victory Native Bar component (v41.20.2) does NOT support stroke/strokeWidth props
                          // Supported paint properties: color, blendMode, opacity, antiAlias only
                          // See: https://nearform.com/open-source/victory-native/docs/cartesian/bar/
                          // Borders cannot be added using standard props - this is an API limitation
                          const BAR_FILL_COLOR = "#7EE3A1"; // Bar fill color (green)
                          
                          // Only bars with stress >= 5 (dayChartData already filtered)
                          return (
                            <Bar
                              points={points.y}
                              chartBounds={chartBounds}
                              color={BAR_FILL_COLOR}
                              roundedCorners={{ topLeft: 8, topRight: 8 }}
                              innerPadding={BAR_INNER_PADDING}
                              barCount={CONSTANT_BAR_COUNT}
                              opacity={1}
                            />
                          );
                        }}
                      </CartesianChart>
                    </View>
                  ) : null}
              </View>
              )
            )}
          </>
        )}
      </ScrollView>

      {/* Date Picker Modal - Allows selecting future dates */}
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        date={selectedDate}
        // No maximumDate restriction - allow future dates
        onConfirm={(date) => {
          setSelectedDate(date);
          setIsDatePickerVisible(false);
        }}
        onCancel={() => setIsDatePickerVisible(false)}
      />
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
  lastSyncContainer: {
    marginBottom: 20,
  },
  lastSyncText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
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
