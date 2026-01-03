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
import { CartesianChart, Line, useChartTransformState } from 'victory-native';
import { useDevice } from '@/contexts/DeviceContext';
import { useAuth } from '@/contexts/AuthContext';
import { getRespirationLive, getDeviceHistory } from '@/services/deviceData';
import { connectWebSocket, removeWebSocketHandler } from '@/services/websocketService';

const { width } = Dimensions.get('window');

interface RespirationDataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  value: number; // Respiration rate in BPM (breaths per minute)
}

export default function RespirationInsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeDevice } = useDevice();
  const { auth } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = React.useState<'Day' | 'Week' | 'Month'>('Day');
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [respirationData, setRespirationData] = React.useState<RespirationDataPoint[]>([]);
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
    // Smaller left padding brings the Y-axis closer to the phone edge,
    // giving more room to the plot area while keeping labels readable.
    () => ({ left: 28, right: 8, top: 18, bottom: 40 }),
    [],
  );

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

  const respirationDataRef = React.useRef(respirationData);
  React.useEffect(() => {
    respirationDataRef.current = respirationData;
  }, [respirationData]);

  // Domain ref for continuous updates without re-renders
  const domainRef = React.useRef<[number, number] | null>(null);
  const lastPanX = React.useRef(0);
  const lastScale = React.useRef(1);

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
    // Reset tracking refs when returning to live
    lastPanX.current = 0;
    lastScale.current = 1;
    setIsLive(true);
  }, [clearInactivityTimer, resetTransform]);

  const computeLiveDomain = React.useCallback((): [number, number] | null => {
    const data = respirationDataRef.current;
    if (!data.length) return null;
    const latest = data[data.length - 1]!.timestamp;
    return [latest - DEFAULT_WINDOW_MS, latest];
  }, [DEFAULT_WINDOW_MS]);

  // Clamp ONLY to data bounds - allow window to grow/shrink freely
  const clampToData = React.useCallback(
    ([start, end]: [number, number]): [number, number] => {
      const data = respirationDataRef.current;
      if (!data.length) return [start, end];

      const dataMin = data[0]!.timestamp;
      const dataMax = data[data.length - 1]!.timestamp;

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return [dataMax - DEFAULT_WINDOW_MS, dataMax];
      }

      const span = end - start;

      // Only clamp to data bounds - don't restrict window size
      if (start < dataMin) {
        return [dataMin, dataMin + span];
      }
      if (end > dataMax) {
        return [dataMax - span, dataMax];
      }

      return [start, end];
    },
    [DEFAULT_WINDOW_MS],
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
    // Enter explore mode immediately (no auto-scroll while user is interacting)
    setIsLive(false);
    clearInactivityTimer();
    
    // Initialize domainRef with current domain
    const base = xDomain ?? computeLiveDomain();
    if (base) {
      domainRef.current = base;
      setXDomain(base);
    }
    
    // Reset tracking refs for new gesture
    lastPanX.current = 0;
    lastScale.current = 1;
  }, [clearInactivityTimer, xDomain, computeLiveDomain]);

  const onGestureEnd = React.useCallback(() => {
    clearInactivityTimer();
    // Reset tracking refs for next gesture (but don't reset transform)
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
        // Only update if there's meaningful movement
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
      // scaleX is at index 0 (m11) in 4x4 row-major matrix
      return matrix?.[0] ?? 1;
    },
    (scale) => {
      if (!scale || !domainRef.current) return;
      // Only update if scale changed meaningfully
      if (Math.abs(scale - lastScale.current) > 0.01) {
        runOnJS(zoomDomain)(scale);
      }
    },
    [isLive, zoomDomain],
  );

  // Track transform matrix changes to update tooltip position when panning
  // Also track offset separately for more accurate pan tracking
  useAnimatedReaction(
    () => {
      const matrix = transformState.matrix.value;
      const offset = transformState.offset.value;
      return { matrix, offset };
    },
    (transform) => {
      if (transform.matrix && Array.isArray(transform.matrix)) {
        // Combine matrix and offset for complete transform
        const combined = [...transform.matrix];
        if (transform.offset && Array.isArray(transform.offset) && transform.offset.length >= 16) {
          // Add offset to translation components
          combined[12] = (combined[12] || 0) + (transform.offset[12] || 0); // translateX
          combined[13] = (combined[13] || 0) + (transform.offset[13] || 0); // translateY
        }
        runOnJS(setTransformMatrix)(combined);
      }
    },
    [transformState.matrix, transformState.offset],
  );

  // Track built-in Victory transform gestures to implement "10s no gesture -> live".
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

  // Keep xDomain in sync with live auto-scroll
  React.useEffect(() => {
    if (!isLive) {
      // In explore mode, domain is controlled by gestures (pan/zoom)
      return;
    }
    
    // Live mode: auto-scroll to latest data
    const live = computeLiveDomain();
    if (!live) return;
    
    domainRef.current = live;
    setXDomain(live);
  }, [computeLiveDomain, isLive, respirationData]);

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => clearInactivityTimer();
  }, [clearInactivityTimer]);

  // Fetch respiration data (last 24 hours to show historical data in Victory Native chart)
  const fetchRespirationData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      setRespirationData([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

      // Use getDeviceHistory for last 24 hours (to match chart's MAX_WINDOW_MS)
      const result = await getDeviceHistory(activeDevice.deviceId, {
        from: twentyFourHoursAgo,
        to: now,
        limit: 2000, // Get enough points for 24 hours (every 6 seconds = ~14400 points, but limit to 2000 for performance)
      });

      if (result.success && result.data && Array.isArray(result.data)) {
        // Transform API data to RespirationDataPoint format (same pattern as heart rate)
        const dataPoints: RespirationDataPoint[] = result.data
          .filter((item: any) => {
            const value = item.respiration || item.resp || item.bpm;
            return value && value > 0 && item.timestamp;
          })
          .map((item: any) => {
            const timestamp = new Date(item.timestamp);
            return {
              timestamp: isNaN(timestamp.getTime()) ? Date.now() : timestamp.getTime(), // Convert to milliseconds
              value: item.respiration || item.resp || item.bpm || 0,
            };
          })
          .filter((point: RespirationDataPoint) => point.value > 0 && point.value < 50) // Filter invalid values
          .sort((a: RespirationDataPoint, b: RespirationDataPoint) => a.timestamp - b.timestamp); // Sort by timestamp

        // Merge with existing data instead of replacing (to preserve websocket updates)
        setRespirationData((prev) => {
          // Create a map of existing points by timestamp for quick lookup
          const existingMap = new Map<number, RespirationDataPoint>();
          prev.forEach((point) => {
            existingMap.set(point.timestamp, point);
          });

          // Add/update points from fetched data
          dataPoints.forEach((point) => {
            existingMap.set(point.timestamp, point);
          });

          // Convert back to array and sort
          const merged = Array.from(existingMap.values()).sort((a, b) => a.timestamp - b.timestamp);

          // Keep only last 24 hours
          const nowMs = Date.now();
          const twentyFourHoursAgo = nowMs - (24 * 60 * 60 * 1000);
          return merged.filter((point) => point.timestamp >= twentyFourHoursAgo);
        });
      } else {
        setRespirationData([]);
        setError('No respiration data available');
      }
    } catch (err: any) {
      console.error('Failed to fetch respiration data:', err);
      setError(err.message || 'Failed to load respiration data');
      setRespirationData([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn]);

  // Extract timestamp helper (moved outside to avoid recreation)
  const extractTimestampMs = React.useCallback((data: any): number => {
    // Prefer backend timestamp (matches DB) so the chart point aligns with stored data.
    // Model examples:
    // - timestamp: "2025-12-29T05:26:09.234Z"
    // - timestampSeconds: 1766985969
    if (typeof data?.timestampSeconds === 'number' && Number.isFinite(data.timestampSeconds)) {
      return data.timestampSeconds * 1000;
    }
    if (typeof data?.timestamp === 'number' && Number.isFinite(data.timestamp)) {
      // If backend ever sends ms or seconds, we assume ms when it's large enough.
      return data.timestamp < 10_000_000_000 ? data.timestamp * 1000 : data.timestamp;
    }
    if (typeof data?.timestamp === 'string' || data?.timestamp instanceof Date) {
      const ms = new Date(data.timestamp).getTime();
      if (Number.isFinite(ms)) return ms;
    }
    return Date.now();
  }, []);

  // Setup message handler for WebSocket (useCallback to keep reference stable)
  const messageHandler = React.useCallback((data: any) => {
    console.log('[RespirationInsights] ✅ WebSocket message received:', {
      deviceId: data.deviceId,
      respiration: data.respiration,
      timestamp: data.timestamp,
      timestampSeconds: data.timestampSeconds,
      allFields: Object.keys(data)
    });
    
    // Extract respiration value (handle multiple formats like home screen)
    const respirationValue = data.respiration ?? data.resp ?? data.bpm ?? data.breathing ?? null;
    
    console.log('[RespirationInsights] Extracted respiration value:', respirationValue);
    
    if (respirationValue != null && respirationValue > 0 && respirationValue < 50) {
      const updateTimestamp = extractTimestampMs(data);
      console.log('[RespirationInsights] Extracted timestamp (ms):', updateTimestamp, 'Date:', new Date(updateTimestamp).toISOString());
      
      const newDataPoint: RespirationDataPoint = {
        timestamp: updateTimestamp,
        value: Number(respirationValue),
      };

      console.log('[RespirationInsights] Adding new data point:', newDataPoint);

      // Add new data point to existing data (keep last 24 hours) - same pattern as home screen
      setRespirationData((prev) => {
        const nowMs = Date.now();
        const twentyFourHoursAgo = nowMs - (24 * 60 * 60 * 1000);
        
        // Filter out old data points
        const filteredData = prev.filter((point) => point.timestamp >= twentyFourHoursAgo);
        
        // Check if we already have a point at (approximately) this timestamp (avoid duplicates)
        const existingIndex = filteredData.findIndex(
          (point) => Math.abs(point.timestamp - updateTimestamp) < 1000 // within 1 second
        );
        
        let newData;
        if (existingIndex >= 0) {
          console.log('[RespirationInsights] Updating existing point at index:', existingIndex);
          // Update existing point
          newData = [...filteredData];
          newData[existingIndex] = newDataPoint;
        } else {
          console.log('[RespirationInsights] Adding new point. Previous count:', filteredData.length);
          // Add new point
          newData = [...filteredData, newDataPoint];
        }
        
        console.log('[RespirationInsights] New data count:', newData.length);
        // Sort by timestamp
        return newData.sort((a, b) => a.timestamp - b.timestamp);
      });
    } else {
      console.log('[RespirationInsights] Respiration value rejected:', {
        respirationValue,
        reason: respirationValue == null ? 'null/undefined' : 
                respirationValue <= 0 ? '<= 0' : 
                respirationValue >= 50 ? '>= 50' : 'unknown'
      });
    }
  }, [extractTimestampMs]);

  // Setup WebSocket connection for real-time updates
  React.useEffect(() => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) {
      console.log('[RespirationInsights] Skipping WebSocket setup - no device or not logged in');
      return;
    }

    // Connect to WebSocket server
    const currentDeviceId = activeDevice.deviceId;
    console.log('[RespirationInsights] 🔌 Connecting WebSocket for device:', currentDeviceId);
    
    connectWebSocket(currentDeviceId, messageHandler)
      .then((socket) => {
        console.log('[RespirationInsights] WebSocket connected:', socket ? '✅ success' : '❌ failed');
        // Check if device hasn't changed during connection
        if (activeDeviceIdRef.current !== currentDeviceId) {
          console.log('[RespirationInsights] Device changed during connection, cleaning up');
          if (socket) {
            removeWebSocketHandler(messageHandler);
          }
          return;
        }
        console.log('[RespirationInsights] ✅ WebSocket handler registered successfully');
      })
      .catch((error) => {
        console.error('[RespirationInsights] ❌ WebSocket connection error:', error);
      });

    // Cleanup on unmount or device change
    return () => {
      console.log('[RespirationInsights] 🧹 Cleaning up WebSocket handler');
      removeWebSocketHandler(messageHandler);
    };
  }, [activeDevice?.deviceId, auth.isLoggedIn, messageHandler]);

  // Fetch data on mount and when period/date changes (for historical data)
  // Using polling (6 seconds like heart rate) + websocket for real-time updates
  React.useEffect(() => {
    // Initial fetch
    fetchRespirationData();
    
    // Poll every 6 seconds to get latest data (same as heart rate graph)
    const interval = setInterval(() => {
      fetchRespirationData();
    }, 6000); // 6 seconds (same as heart rate)

    return () => clearInterval(interval);
  }, [fetchRespirationData, selectedPeriod, selectedDate]);

  // Calculate metrics from data
  const metrics = React.useMemo(() => {
    if (respirationData.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    const values = respirationData.map((d) => d.value).filter((v) => !isNaN(v) && isFinite(v) && v > 0);
    if (values.length === 0) {
      return { min: 0, average: 0, max: 0 };
    }
    return {
      min: Math.round(Math.min(...values)),
      max: Math.round(Math.max(...values)),
      average: Math.round(values.reduce((sum, val) => sum + val, 0) / values.length),
    };
  }, [respirationData]);

  // Format data for Victory Native chart
  const chartData = React.useMemo(() => {
    if (respirationData.length === 0) return [];
    
    const formatted = respirationData.map((point) => ({
      x: point.timestamp, // Time in milliseconds
      y: point.value, // BPM value
    }));
    
    console.log('[RespirationInsights] Chart data updated. Points:', formatted.length, 'Latest:', formatted[formatted.length - 1]);
    
    return formatted;
  }, [respirationData]);

  // Get latest point for tooltip
  const latestPoint = React.useMemo(() => {
    if (respirationData.length === 0) return null;
    return respirationData[respirationData.length - 1];
  }, [respirationData]);

  // Get start of week (Monday)
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  // Get end of week (Sunday)
  const getWeekEnd = (date: Date): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return weekEnd;
  };

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

  // Navigate to next period
  const goToNext = () => {
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

  // Reset to today when period changes
  React.useEffect(() => {
    setSelectedDate(new Date());
  }, [selectedPeriod]);

  // Format time for X-axis labels
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const resolvedXDomain = React.useMemo<[number, number] | null>(() => {
    // Always use xDomain if set (for pan/zoom), otherwise compute live domain
    if (xDomain) {
      return clampToData(xDomain);
    }
    const live = computeLiveDomain();
    return live ? clampToData(live) : null;
  }, [clampToData, computeLiveDomain, xDomain]);

  // Default Y-axis domain: 5-30 Resp/Min (can be panned up/down)
  const yDomain = React.useMemo<[number, number] | undefined>(() => {
    // Default range for respiration rate: 5-30 breaths per minute
    // User can pan Y-axis up/down to see different ranges
    return [5, 30];
  }, []);

  // Calculate tooltip position based on latest point (after resolvedXDomain and yDomain are computed)
  // Apply transform matrix to follow point when panning
  const tooltipPosition = React.useMemo(() => {
    if (!latestPoint || !resolvedXDomain || !yDomain) return null;
    
    const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const chartHeight = 280 - CHART_PADDING.top - CHART_PADDING.bottom;
    
    // Calculate base X position (time-based) - relative to domain
    const [xStart, xEnd] = resolvedXDomain;
    const xRange = xEnd - xStart;
    const baseXPosition = CHART_PADDING.left + ((latestPoint.timestamp - xStart) / xRange) * chartWidth;
    
    // Calculate base Y position (value-based)
    const [yMin, yMax] = yDomain;
    const yRange = yMax - yMin;
    const baseYPosition = CHART_PADDING.top + chartHeight - ((latestPoint.value - yMin) / yRange) * chartHeight;
    
    // Apply transform matrix if available (for pan/zoom)
    let xPosition = baseXPosition;
    let yPosition = baseYPosition;
    
    if (transformMatrix && Array.isArray(transformMatrix) && transformMatrix.length >= 16) {
      // Victory Native uses 4x4 transform matrix in row-major format
      // [m11, m12, m13, m14, m21, m22, m23, m24, m31, m32, m33, m34, m41, m42, m43, m44]
      // For 2D transforms: 
      // - translateX = m41 (index 12)
      // - translateY = m42 (index 13)  
      // - scaleX = m11 (index 0)
      // - scaleY = m22 (index 5)
      
      const translateX = transformMatrix[12] || 0;
      const translateY = transformMatrix[13] || 0;
      const scaleX = transformMatrix[0] || 1;
      const scaleY = transformMatrix[5] || 1;
      
      // Calculate chart center for transform origin
      const chartCenterX = CHART_PADDING.left + chartWidth / 2;
      const chartCenterY = CHART_PADDING.top + chartHeight / 2;
      
      // Apply transform: translate to origin, scale, translate back, then apply pan
      // This matches how Victory Native applies transforms
      const relativeX = baseXPosition - chartCenterX;
      const relativeY = baseYPosition - chartCenterY;
      
      xPosition = relativeX * scaleX + chartCenterX + translateX;
      yPosition = relativeY * scaleY + chartCenterY + translateY;
    }
    
    // Tooltip dimensions
    const tooltipWidth = 90;
    const tooltipHeight = 50;
    
    // Position tooltip above the point, centered horizontally
    let tooltipX = xPosition - tooltipWidth / 2;
    
    // Keep tooltip within chart bounds
    const minX = CHART_PADDING.left + 5;
    const maxX = width - CHART_PADDING.right - tooltipWidth - 5;
    tooltipX = Math.max(minX, Math.min(maxX, tooltipX));
    
    // Position above the point
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
        <Text style={styles.headerTitle}>More Insights</Text>
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
          <TouchableOpacity onPress={goToNext} style={styles.dateNavButton} activeOpacity={0.8}>
            <Ionicons name="chevron-forward" size={20} color="#C7D6FF" />
          </TouchableOpacity>
        </View>

        {/* Key Respiration Metrics */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Min</Text>
            <Text style={styles.metricValue}>{metrics.min || '--'}</Text>
            <Text style={styles.metricUnit}>Resp/Min</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Average</Text>
            <Text style={styles.metricValue}>{metrics.average || '--'}</Text>
            <Text style={styles.metricUnit}>Resp/Min</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Max</Text>
            <Text style={styles.metricValue}>{metrics.max || '--'}</Text>
            <Text style={styles.metricUnit}>Resp/Min</Text>
          </View>
        </View>

        {/* Healthy Range Information */}
        <View style={styles.healthyRangeContainer}>
          <View style={styles.healthyRangeRow}>
            <Text style={styles.healthyRangeText}>Out of your healthy range</Text>
            <TouchableOpacity activeOpacity={0.6}>
              <Ionicons name="help-circle-outline" size={16} color="#7EA6FF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.outOfRangeMinutes}>
            {respirationData.length > 0
              ? Math.round(
                  respirationData.filter(
                    (d) => d.value < 10 || d.value > 22
                  ).length * 1 // Each point represents ~1 minute
                )
              : 0}{' '}
            Minutes
          </Text>
        </View>

        {/* Last Sync Time */}
        <View style={styles.lastSyncContainer}>
          <Text style={styles.lastSyncText}>
            Last sync: {respirationData.length > 0 
              ? (() => {
                  const lastTimestamp = respirationData[respirationData.length - 1].timestamp;
                  const now = Date.now();
                  // Use current time if timestamp is in the future (timezone/server time issues)
                  const displayTime = lastTimestamp > now ? now : lastTimestamp;
                  return new Date(displayTime).toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit',
                    hour12: true 
                  });
                })()
              : 'No data'}
          </Text>
        </View>

        {/* Respiration Graph with Victory Native */}
        {isLoading && respirationData.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={styles.loadingText}>Loading respiration data...</Text>
          </View>
        ) : error && respirationData.length === 0 ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchRespirationData} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : respirationData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="pulse-outline" size={48} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>No respiration data available</Text>
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

            {/* Victory Native Chart */}
            <View style={styles.chartWrapper}>
              <CartesianChart
                data={chartData}
                xKey="x"
                yKeys={['y']}
                padding={CHART_PADDING}
                domain={
                  resolvedXDomain
                    ? {
                        x: resolvedXDomain,
                        y: yDomain,
                      }
                    : undefined
                }
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
                    points={points.y}
                    color="#FF0000"
                    strokeWidth={1.5}
                    strokeCap="round"
                    strokeJoin="round"
                    animate={{ type: 'timing', duration: 250 }}
                  />
                )}
              </CartesianChart>

              {/* Tooltip for latest point (similar to heart rate graph) */}
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
                    {/* Value text (e.g., "13 Resp/Min") */}
                    <Text style={styles.tooltipValue}>
                      {Math.round(latestPoint.value)} Resp/Min
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

            {/* Chart hint */}
            <View style={styles.hintContainer}>
              <Text style={styles.hintText}>
                👆 Pinch to zoom (X) • Long-press + drag to pan • Double-tap to return to Live (10s idle auto-live)
              </Text>
            </View>
          </View>
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
    marginBottom: 20,
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  metricUnit: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  healthyRangeContainer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  healthyRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  healthyRangeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
    marginRight: 6,
  },
  outOfRangeMinutes: {
    color: '#FFFFFF',
    fontSize: 16,
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
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FF0000',
    alignItems: 'center',
    minWidth: 90,
  },
  tooltipValue: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  tooltipTime: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
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
    borderTopColor: '#FF0000',
  },
});

