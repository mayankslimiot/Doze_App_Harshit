import React, { useMemo, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Text, TouchableOpacity } from 'react-native';
import Svg, { Path, Line, Circle, G, Text as SvgText, Rect } from 'react-native-svg';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// Zoom level configurations
export type ZoomLevel = {
  name: string;
  durationMs: number; // Total time window in milliseconds
  sampleWindowMs: number; // Sampling window for averaging in milliseconds
};

export const ZOOM_LEVELS: ZoomLevel[] = [
  { name: '10min', durationMs: 10 * 60 * 1000, sampleWindowMs: 4 * 1000 }, // 4 sec average for 10 min view
  { name: '1hour', durationMs: 60 * 60 * 1000, sampleWindowMs: 24 * 1000 }, // 24 sec average
  { name: '2hours', durationMs: 2 * 60 * 60 * 1000, sampleWindowMs: 48 * 1000 }, // 48 sec average
  { name: '4hours', durationMs: 4 * 60 * 60 * 1000, sampleWindowMs: 96 * 1000 }, // 96 sec average
  { name: '8hours', durationMs: 8 * 60 * 60 * 1000, sampleWindowMs: 192 * 1000 }, // 192 sec average
  { name: '12hours', durationMs: 12 * 60 * 60 * 1000, sampleWindowMs: 288 * 1000 }, // 288 sec average
  { name: '24hours', durationMs: 24 * 60 * 60 * 1000, sampleWindowMs: 376 * 1000 }, // 376 sec average
];

export interface HealthDataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  value: number; // Heart rate value (BPM)
}

export interface HealthGraphProps {
  rawData: HealthDataPoint[]; // Array of {timestamp, value} points
  initialZoomLevel?: number; // Index into ZOOM_LEVELS array (default: last = 24 hours)
  onZoomChange?: (zoomLevel: ZoomLevel, domain: { x: [number, number] }) => void;
  height?: number;
  yAxisLabel?: string;
  lineColor?: string;
  areaColor?: string;
  minY?: number;
  maxY?: number;
}

/**
 * Downsample data by averaging values within time windows
 */
function downsampleData(
  data: HealthDataPoint[],
  startTime: number,
  endTime: number,
  sampleWindowMs: number
): HealthDataPoint[] {
  if (data.length === 0) return [];

  // Filter data to visible range
  const visibleData = data.filter(
    (point) => point.timestamp >= startTime && point.timestamp <= endTime
  );

  if (visibleData.length === 0) return [];

  // Create time buckets
  const buckets: Map<number, number[]> = new Map();
  const startBucket = Math.floor(startTime / sampleWindowMs) * sampleWindowMs;

  visibleData.forEach((point) => {
    const bucketTime = Math.floor(point.timestamp / sampleWindowMs) * sampleWindowMs;
    if (!buckets.has(bucketTime)) {
      buckets.set(bucketTime, []);
    }
    buckets.get(bucketTime)!.push(point.value);
  });

  // Average values in each bucket
  const downsampled: HealthDataPoint[] = [];
  buckets.forEach((values, bucketTime) => {
    const avgValue = values.reduce((sum, val) => sum + val, 0) / values.length;
    downsampled.push({
      timestamp: bucketTime + sampleWindowMs / 2, // Center of the bucket
      value: avgValue,
    });
  });

  // Sort by timestamp
  downsampled.sort((a, b) => a.timestamp - b.timestamp);

  return downsampled;
}

export const HealthGraph: React.FC<HealthGraphProps> = ({
  rawData,
  initialZoomLevel = 0, // Default to 10 minutes
  onZoomChange,
  height = 450,
  yAxisLabel = 'BPM',
  lineColor = '#FF6B6B',
  areaColor = 'rgba(255, 107, 107, 0.2)',
  minY,
  maxY,
}) => {
  // Zoom and pan state
  const [currentZoomLevel, setCurrentZoomLevel] = useState(initialZoomLevel);
  const [panOffset, setPanOffset] = useState(0); // Time offset in milliseconds (X-axis)
  const [yPanOffset, setYPanOffset] = useState(0); // Y-axis pan offset (value offset)
  const [scale, setScale] = useState(1); // Current zoom scale (1 = default)
  const [yScale, setYScale] = useState(1); // Y-axis zoom scale
  
  // Animated values
  const scaleValue = useSharedValue(1);
  const translateX = useSharedValue(0);
  const focalX = useSharedValue(0);
  
  // Refs for gesture handling
  const savedScale = useRef(1);
  const savedTranslateX = useRef(0);
  const lastPinchScale = useRef(1);
  
  // Sort raw data by timestamp
  const sortedData = useMemo(() => {
    return [...rawData]
      .filter((d) => !isNaN(d.timestamp) && !isNaN(d.value) && isFinite(d.value) && d.value > 0)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [rawData]);

  // Calculate current time window based on zoom and pan
  const getCurrentTimeWindow = useCallback(() => {
    if (sortedData.length === 0) {
      const now = Date.now();
      const baseDuration = ZOOM_LEVELS[currentZoomLevel].durationMs;
      const actualDuration = baseDuration / scale;
      return [now - actualDuration, now] as [number, number];
    }
    
    const lastTimestamp = sortedData[sortedData.length - 1].timestamp;
    const baseDuration = ZOOM_LEVELS[currentZoomLevel].durationMs;
    const actualDuration = baseDuration / scale;
    const baseEndTime = lastTimestamp - panOffset;
    const baseStartTime = baseEndTime - actualDuration;
    
    return [baseStartTime, baseEndTime] as [number, number];
  }, [sortedData, currentZoomLevel, panOffset, scale]);

  // Calculate current domain
  const currentDomain = useMemo(() => {
    const [startTime, endTime] = getCurrentTimeWindow();
    
    if (sortedData.length === 0) {
      return {
        x: [startTime, endTime] as [number, number],
        y: [minY !== undefined ? minY : 40, maxY !== undefined ? maxY : 100] as [number, number],
      };
    }

    // Calculate Y domain from visible data
    const visibleData = sortedData.filter(
      (d) => d.timestamp >= startTime && d.timestamp <= endTime && !isNaN(d.value) && isFinite(d.value)
    );
    const values = visibleData.map((d) => d.value).filter((v) => !isNaN(v) && isFinite(v));
    const dataMinY = values.length > 0 ? Math.min(...values) : 0;
    const dataMaxY = values.length > 0 ? Math.max(...values) : 100;
    const yMin = minY !== undefined ? minY : Math.max(0, dataMinY - 10);
    const yMax = maxY !== undefined ? maxY : (dataMaxY + 10);

    return {
      x: [startTime, endTime] as [number, number],
      y: [yMin, yMax] as [number, number],
    };
  }, [sortedData, minY, maxY, getCurrentTimeWindow]);

  // Downsample data for current view
  const chartData = useMemo(() => {
    if (sortedData.length === 0) return [];

    try {
      const [startTime, endTime] = currentDomain.x;
      
      // Validate domain
      if (!isFinite(startTime) || !isFinite(endTime) || startTime >= endTime) {
        return [];
      }

      // Filter data to visible range and sort by timestamp
      const visibleData = sortedData.filter(
        (point) => point.timestamp >= startTime && point.timestamp <= endTime
      ).sort((a, b) => a.timestamp - b.timestamp);

      // Determine if we need to downsample based on zoom level and data density
      const timeRange = endTime - startTime;
      const sampleWindow = ZOOM_LEVELS[currentZoomLevel].sampleWindowMs;
      const maxPoints = Math.ceil(timeRange / sampleWindow) * 2; // Allow 2x for smoothness

      // If we have reasonable number of points, use them directly
      if (visibleData.length <= maxPoints) {
        return visibleData.filter((point) => isFinite(point.timestamp) && isFinite(point.value) && point.value > 0);
      }

      // Downsample if we have too many points
      const downsampled = downsampleData(
        visibleData,
        startTime,
        endTime,
        sampleWindow
      );

      return downsampled.filter((point) => isFinite(point.timestamp) && isFinite(point.value) && point.value > 0);
    } catch (error) {
      console.error('[HealthGraph] Error processing chart data:', error);
      return [];
    }
  }, [sortedData, currentDomain, currentZoomLevel]);

  // Calculate Y domain with padding and pan/zoom
  const yDomain = useMemo(() => {
    if (chartData.length === 0) {
      const baseMin = minY !== undefined ? minY : 40;
      const baseMax = maxY !== undefined ? maxY : 100;
      const baseRange = baseMax - baseMin;
      const actualRange = baseRange / yScale;
      const center = (baseMin + baseMax) / 2 + yPanOffset;
      return [center - actualRange / 2, center + actualRange / 2] as [number, number];
    }

    const values = chartData.map((d) => d.value).filter((v) => !isNaN(v) && isFinite(v));
    if (values.length === 0) {
      const baseMin = minY !== undefined ? minY : 40;
      const baseMax = maxY !== undefined ? maxY : 100;
      const baseRange = baseMax - baseMin;
      const actualRange = baseRange / yScale;
      const center = (baseMin + baseMax) / 2 + yPanOffset;
      return [center - actualRange / 2, center + actualRange / 2] as [number, number];
    }

    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const padding = (dataMax - dataMin) * 0.1 || 10;
    
    const baseMin = minY !== undefined ? minY : Math.max(0, dataMin - padding);
    const baseMax = maxY !== undefined ? maxY : dataMax + padding;
    const baseRange = baseMax - baseMin;
    const actualRange = baseRange / yScale;
    const center = (baseMin + baseMax) / 2 + yPanOffset;

    return [center - actualRange / 2, center + actualRange / 2] as [number, number];
  }, [chartData, minY, maxY, yScale, yPanOffset]);

  // Chart dimensions - Full width, edge to edge like professional apps
  const screenWidth = Dimensions.get('window').width;
  const chartPadding = 55;
  const chartWidth = screenWidth; // Full screen width
  const chartHeight = height; // Full height
  const availableWidth = chartWidth - chartPadding * 2;
  const availableHeight = chartHeight - chartPadding * 2;

  // Format time for X-axis labels - 24 hour format (HH:MM)
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hours = date.getHours(); // 0-23
    const minutes = date.getMinutes(); // 0-59
    // Return 24-hour format: HH:MM (no AM/PM)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Calculate chart points - extract safely with defaults
  const startTime = currentDomain.x[0] ?? Date.now();
  const endTime = currentDomain.x[1] ?? Date.now();
  const yMin = yDomain[0] ?? 40;
  const yMax = yDomain[1] ?? 100;
  const timeRange = Math.max(1, endTime - startTime);
  const valueRange = Math.max(1, yMax - yMin);

  // Store values that need to be accessed in worklets
  const timeRangeRef = useRef(0);
  const availableWidthRef = useRef(availableWidth);
  const valueRangeRef = useRef(0);
  const availableHeightRef = useRef(availableHeight);
  
  // Update refs when values change
  React.useEffect(() => {
    timeRangeRef.current = currentDomain.x[1] - currentDomain.x[0];
    availableWidthRef.current = availableWidth;
    valueRangeRef.current = yDomain[1] - yDomain[0];
    availableHeightRef.current = availableHeight;
  }, [currentDomain, availableWidth, yDomain, availableHeight]);

  // Update zoom from scale (simplified version) - MUST be defined before gestures
  const updateZoomFromScale = useCallback((newScale: number) => {
    try {
      setScale(newScale);
      
      // Snap to zoom levels if close
      const baseDuration = ZOOM_LEVELS[currentZoomLevel].durationMs;
      const newDuration = baseDuration / newScale;
      
      // Find closest zoom level
      let closestLevel = currentZoomLevel;
      let minDiff = Infinity;
      
      ZOOM_LEVELS.forEach((level, index) => {
        const diff = Math.abs(level.durationMs - newDuration);
        if (diff < minDiff) {
          minDiff = diff;
          closestLevel = index;
        }
      });
      
      // Only snap if very close to a zoom level
      if (closestLevel !== currentZoomLevel && minDiff < baseDuration * 0.3) {
        setCurrentZoomLevel(closestLevel);
        setScale(1); // Reset scale when changing zoom level
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        if (onZoomChange) {
          const [startTime, endTime] = getCurrentTimeWindow();
          onZoomChange(ZOOM_LEVELS[closestLevel], { x: [startTime, endTime] });
        }
      }
    } catch (error) {
      console.error('[HealthGraph] Error in updateZoomFromScale:', error);
    }
  }, [currentZoomLevel, onZoomChange, getCurrentTimeWindow]);

  // Update pan offset (X-axis) - MUST be defined before gestures
  const updatePanOffset = useCallback((timeOffset: number) => {
    try {
      setPanOffset((prev) => {
        const newOffset = prev - timeOffset;
        // Prevent panning beyond available data
        if (sortedData.length > 0) {
          const oldestTime = sortedData[0].timestamp;
          const newestTime = sortedData[sortedData.length - 1].timestamp;
          const [startTime] = getCurrentTimeWindow();
          const minOffset = 0; // Can't go into future
          const maxOffset = newestTime - oldestTime; // Can't go before oldest data
          return Math.max(minOffset, Math.min(maxOffset, newOffset));
        }
        return Math.max(0, newOffset); // Can't go into future
      });
    } catch (error) {
      console.error('[HealthGraph] Error in updatePanOffset:', error);
    }
  }, [sortedData, getCurrentTimeWindow]);

  // Update Y-axis pan offset - MUST be defined before gestures
  const updateYPanOffset = useCallback((valueOffset: number) => {
    try {
      setYPanOffset((prev) => {
        // Calculate reasonable bounds based on current Y domain
        const [yMin, yMax] = yDomain;
        const range = yMax - yMin;
        const maxOffset = range * 2; // Allow panning up to 2x the current range
        const newOffset = prev + valueOffset;
        return Math.max(-maxOffset, Math.min(maxOffset, newOffset));
      });
    } catch (error) {
      console.error('[HealthGraph] Error in updateYPanOffset:', error);
    }
  }, [yDomain]);

  // Animated values for Y-axis
  const translateY = useSharedValue(0);
  const savedTranslateY = useRef(0);

  // Gesture handlers - defined AFTER the callback functions
  // Pinch gesture for X-axis zoom (time domain)
  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.current = scale;
      lastPinchScale.current = 1;
    })
    .onUpdate((e) => {
      'worklet';
      const newScale = savedScale.current * e.scale;
      // Limit zoom between 0.5x and 5x
      const clampedScale = Math.max(0.5, Math.min(5, newScale));
      scaleValue.value = clampedScale;
      focalX.value = e.focalX;
    })
    .onEnd(() => {
      'worklet';
      const finalScale = scaleValue.value;
      savedScale.current = finalScale;
      // Reset visual scale immediately (no spring animation)
      scaleValue.value = 1;
      
      // Update zoom level based on scale (only affects data domain, not visual movement)
      runOnJS(updateZoomFromScale)(finalScale);
    });

  // Pan gesture - separate X and Y axis handling with real-time updates
  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      savedTranslateX.current = 0;
      savedTranslateY.current = 0;
    })
    .onUpdate((e) => {
      'worklet';
      const currentTranslateX = e.translationX;
      const currentTranslateY = e.translationY;
      
      // Calculate incremental changes
      const deltaX = currentTranslateX - savedTranslateX.current;
      const deltaY = currentTranslateY - savedTranslateY.current;
      
      // Handle X-axis pan (time domain) - update incrementally
      if (Math.abs(deltaX) > 2) { // Minimum 2px movement
        const timeRange = timeRangeRef.current;
        const width = availableWidthRef.current;
        const timeOffset = (deltaX / width) * timeRange;
        runOnJS(updatePanOffset)(timeOffset);
        savedTranslateX.current = currentTranslateX;
      }
      
      // Handle Y-axis pan (value domain) - update incrementally
      if (Math.abs(deltaY) > 2) { // Minimum 2px movement
        const valueRange = valueRangeRef.current;
        const height = availableHeightRef.current;
        const valueOffset = -(deltaY / height) * valueRange; // Negative for natural scrolling
        runOnJS(updateYPanOffset)(valueOffset);
        savedTranslateY.current = currentTranslateY;
      }
    })
    .onEnd(() => {
      'worklet';
      // Reset saved translations
      savedTranslateX.current = 0;
      savedTranslateY.current = 0;
    });

  // Combined gesture (pinch and pan can work together)
  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  // Double tap to zoom (X-axis only)
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale === 1) {
        // Zoom in to 2x (only affects X-axis data domain, not visual)
        const newScale = 2;
        setScale(newScale);
        scaleValue.value = 1; // No visual animation
        savedScale.current = newScale;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        // Reset zoom (only affects data domain, not visual)
        setScale(1);
        setYScale(1);
        scaleValue.value = 1; // No visual animation
        savedScale.current = 1;
        setPanOffset(0);
        setYPanOffset(0);
        savedTranslateX.current = 0;
        savedTranslateY.current = 0;
        translateX.value = 0;
        translateY.value = 0;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    });

  // Reset zoom handler
  const handleResetZoom = useCallback(() => {
    setScale(1);
    setYScale(1);
    setPanOffset(0);
    setYPanOffset(0);
    setCurrentZoomLevel(initialZoomLevel);
    // No spring animations - immediate reset
    scaleValue.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedScale.current = 1;
    savedTranslateX.current = 0;
    savedTranslateY.current = 0;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [initialZoomLevel]);

  // Combined gesture with double tap
  const finalGesture = Gesture.Race(doubleTapGesture, composedGesture);

  // Format time range for display
  const formatTimeRange = () => {
    const [start, end] = currentDomain.x;
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  // Generate X-axis time labels (dynamic based on time range)
  const timeLabels = useMemo(() => {
    const labels = [];
    const minutes = timeRange / (60 * 1000);
    let labelCount = 5;
    
    // Adjust label count based on time range
    if (minutes <= 5) labelCount = 5; // Every minute for 5 min view
    else if (minutes <= 10) labelCount = 5; // Every 2 minutes for 10 min view
    else if (minutes <= 30) labelCount = 6; // Every 5 minutes
    else if (minutes <= 60) labelCount = 6; // Every 10 minutes
    else labelCount = 6; // Every hour for longer views
    
    for (let i = 0; i <= labelCount; i++) {
      const time = startTime + (timeRange * i) / labelCount;
      labels.push({
        time,
        x: chartPadding + (availableWidth * i) / labelCount,
        label: formatTime(time),
      });
    }
    return labels;
  }, [startTime, timeRange, chartPadding, availableWidth]);

  // Generate Y-axis labels
  const yLabels = useMemo(() => {
    const labels = [];
    const labelCount = 5;
    for (let i = 0; i <= labelCount; i++) {
      const value = yMax - (valueRange * i) / labelCount;
      const y = chartPadding + (availableHeight * i) / labelCount;
      labels.push({ value: Math.round(value), y });
    }
    return labels;
  }, [yMin, yMax, valueRange, chartPadding, availableHeight]);

  // Generate path for line and area - ensure smooth connections between all points
  const linePath = useMemo(() => {
    if (chartData.length === 0) return { linePath: '', areaPath: '' };
    if (chartData.length === 1) {
      // Single point - draw a small horizontal line
      const x = chartPadding + ((chartData[0].timestamp - startTime) / timeRange) * availableWidth;
      const y = chartPadding + availableHeight - ((chartData[0].value - yMin) / valueRange) * availableHeight;
      const path = `M ${x - 2} ${y} L ${x + 2} ${y}`;
      const areaPath = `M ${x - 2} ${chartPadding + availableHeight} L ${x - 2} ${y} L ${x + 2} ${y} L ${x + 2} ${chartPadding + availableHeight} Z`;
      return { linePath: path, areaPath };
    }

    // Convert chart data to coordinates
    const points = chartData.map((point) => ({
      x: chartPadding + ((point.timestamp - startTime) / timeRange) * availableWidth,
      y: chartPadding + availableHeight - ((point.value - yMin) / valueRange) * availableHeight,
    }));

    let path = '';
    let areaPath = '';

    // Helper function to calculate control points for smooth curves using Catmull-Rom spline
    const getControlPoints = (p0: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }, t: number = 0.3) => {
      // Calculate distances
      const d01 = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));
      const d12 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
      const d23 = Math.sqrt(Math.pow(p3.x - p2.x, 2) + Math.pow(p3.y - p2.y, 2));
      
      // Avoid division by zero
      const d01Safe = d01 || 1;
      const d12Safe = d12 || 1;
      const d23Safe = d23 || 1;
      
      // Calculate control points
      const fa = t * d12Safe / (d01Safe + d12Safe);
      const fb = t * d12Safe / (d12Safe + d23Safe);
      
      const cp1x = p1.x + fa * (p2.x - p0.x);
      const cp1y = p1.y + fa * (p2.y - p0.y);
      const cp2x = p2.x - fb * (p3.x - p1.x);
      const cp2y = p2.y - fb * (p3.y - p1.y);
      
      return { cp1x, cp1y, cp2x, cp2y };
    };

    // Build smooth curve path
    if (points.length === 2) {
      // Only two points - use quadratic curve
      const p0 = points[0];
      const p1 = points[1];
      const midX = (p0.x + p1.x) / 2;
      const midY = (p0.y + p1.y) / 2;
      path = `M ${p0.x} ${p0.y} Q ${midX} ${midY} ${p1.x} ${p1.y}`;
      areaPath = `M ${p0.x} ${chartPadding + availableHeight} L ${p0.x} ${p0.y} Q ${midX} ${midY} ${p1.x} ${p1.y} L ${p1.x} ${chartPadding + availableHeight} Z`;
    } else {
      // Three or more points - use cubic bezier curves
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        
        if (i === 0) {
          // Move to first point
          path = `M ${point.x} ${point.y}`;
          areaPath = `M ${point.x} ${chartPadding + availableHeight} L ${point.x} ${point.y}`;
        } else if (i === points.length - 1) {
          // Last point - draw line to it
          const prevPoint = points[i - 1];
          if (i === 1) {
            // Only two points case already handled
            path += ` L ${point.x} ${point.y}`;
            areaPath += ` L ${point.x} ${point.y}`;
          } else {
            // Use smooth curve to last point
            const p0 = points[i - 2];
            const p1 = prevPoint;
            const p2 = point;
            const p3 = point; // Use same point for p3
            const { cp1x, cp1y } = getControlPoints(p0, p1, p2, p3);
            path += ` C ${cp1x} ${cp1y} ${point.x} ${point.y} ${point.x} ${point.y}`;
            areaPath += ` C ${cp1x} ${cp1y} ${point.x} ${point.y} ${point.x} ${point.y}`;
          }
        } else {
          // Middle points - use cubic bezier
          const p0 = i > 0 ? points[i - 1] : point;
          const p1 = point;
          const p2 = points[i + 1];
          const p3 = i + 2 < points.length ? points[i + 2] : p2;
          
          if (i === 1) {
            // Second point - smooth curve from first
            const prevPoint = points[i - 1];
            const nextPoint = points[i + 1];
            const { cp1x, cp1y, cp2x, cp2y } = getControlPoints(prevPoint, p1, p2, p3);
            path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p1.x} ${p1.y}`;
            areaPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p1.x} ${p1.y}`;
          } else {
            // Use cubic bezier with control points
            const { cp1x, cp1y, cp2x, cp2y } = getControlPoints(p0, p1, p2, p3);
            path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p1.x} ${p1.y}`;
            areaPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p1.x} ${p1.y}`;
          }
        }
      }
    }

    // Close area path
    if (points.length > 0) {
      const lastPoint = points[points.length - 1];
      areaPath += ` L ${lastPoint.x} ${chartPadding + availableHeight} Z`;
    }

    return { linePath: path, areaPath };
  }, [chartData, startTime, timeRange, yMin, valueRange, chartPadding, availableWidth, availableHeight]);

  // Early returns after all hooks are defined
  if (sortedData.length === 0 || chartData.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>No data available</Text>
          <Text style={styles.emptyStateSubtext}>Connect your device to see heart rate data</Text>
        </View>
      </View>
    );
  }

  // Validate domain before rendering
  if (!isFinite(currentDomain.x[0]) || !isFinite(currentDomain.x[1]) || !isFinite(yDomain[0]) || !isFinite(yDomain[1])) {
    return (
      <View style={[styles.container, { height }]}>
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>Invalid data</Text>
          <Text style={styles.emptyStateSubtext}>Please refresh the screen</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      {/* Zoom indicator and controls */}
      <View style={styles.zoomControls}>
        <View style={styles.zoomInfo}>
          <Text style={styles.zoomTimeRange}>{formatTimeRange()}</Text>
          <Text style={styles.zoomLevelBadge}>{ZOOM_LEVELS[currentZoomLevel].name}</Text>
        </View>
        {scale !== 1 || panOffset !== 0 || yScale !== 1 || yPanOffset !== 0 ? (
          <TouchableOpacity onPress={handleResetZoom} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Gesture detector wrapper - no visual transforms, only data domain changes */}
      <GestureDetector gesture={finalGesture}>
        <View>
          <Svg width={chartWidth} height={chartHeight}>
        {/* Y-axis label */}
        <SvgText
          x={10}
          y={chartHeight / 2}
          fill="rgba(255,255,255,0.6)"
          fontSize="11"
          fontWeight="600"
          transform={`rotate(-90, 10, ${chartHeight / 2})`}
          textAnchor="middle"
        >
          {yAxisLabel}
        </SvgText>

        {/* Y-axis labels */}
        {yLabels.map((label, index) => (
          <React.Fragment key={`y-label-${index}`}>
            <SvgText
              x={chartPadding - 10}
              y={label.y + 4}
              fill="rgba(255,255,255,0.7)"
              fontSize="10"
              textAnchor="end"
            >
              {label.value}
            </SvgText>
            <Line
              x1={chartPadding}
              y1={label.y}
              x2={chartPadding + availableWidth}
              y2={label.y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
          </React.Fragment>
        ))}

        {/* X-axis grid lines */}
        {timeLabels.map((label, index) => (
          <Line
            key={`x-grid-${index}`}
            x1={label.x}
            y1={chartPadding}
            x2={label.x}
            y2={chartPadding + availableHeight}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* Area under curve */}
        {linePath.areaPath && (
          <Path
            d={linePath.areaPath}
            fill={areaColor}
            fillOpacity={0.25}
          />
        )}

        {/* Main line */}
        {linePath.linePath && (
          <Path
            d={linePath.linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points */}
        {chartData.map((point, index) => {
          const x = chartPadding + ((point.timestamp - startTime) / timeRange) * availableWidth;
          const y = chartPadding + availableHeight - ((point.value - yMin) / valueRange) * availableHeight;
          const isLatestPoint = index === chartData.length - 1;
          
          return (
            <G key={`point-${index}`}>
              {/* Tooltip for latest point only */}
              {isLatestPoint && (
                <>
                  {/* Tooltip positioning - ensure it stays within bounds */}
                  {(() => {
                    const tooltipWidth = 90;
                    const tooltipHeight = 28;
                    const tooltipX = Math.max(
                      chartPadding + 5,
                      Math.min(x - tooltipWidth / 2, chartPadding + availableWidth - tooltipWidth - 5)
                    );
                    const tooltipY = y - 35;
                    const tooltipCenterX = tooltipX + tooltipWidth / 2;
                    
                    return (
                      <>
                        {/* Tooltip background */}
                        <Rect
                          x={tooltipX}
                          y={tooltipY}
                          width={tooltipWidth}
                          height={tooltipHeight}
                          rx={6}
                          fill="rgba(0, 0, 0, 0.85)"
                          stroke={lineColor}
                          strokeWidth={1}
                        />
                        
                        {/* Value text */}
                        <SvgText
                          x={tooltipCenterX}
                          y={tooltipY + 15}
                          fill="#FFFFFF"
                          fontSize="11"
                          fontWeight="700"
                          textAnchor="middle"
                        >
                          {`${Math.round(point.value)} ${yAxisLabel || ''}`.trim()}
                        </SvgText>
                        
                        {/* Time text */}
                        <SvgText
                          x={tooltipCenterX}
                          y={tooltipY + 25}
                          fill="rgba(255,255,255,0.7)"
                          fontSize="9"
                          textAnchor="middle"
                        >
                          {formatTime(point.timestamp)}
                        </SvgText>
                      </>
                    );
                  })()}
                </>
              )}
            </G>
          );
        })}

        {/* X-axis labels */}
        {timeLabels.map((label, index) => (
          <SvgText
            key={`x-label-${index}`}
            x={label.x}
            y={chartPadding + availableHeight + 20}
            fill="rgba(255,255,255,0.6)"
            fontSize="10"
            textAnchor="middle"
          >
            {label.label}
          </SvgText>
        ))}

        {/* Axes */}
        <Line
          x1={chartPadding}
          y1={chartPadding}
          x2={chartPadding}
          y2={chartPadding + availableHeight}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
        />
        <Line
          x1={chartPadding}
          y1={chartPadding + availableHeight}
          x2={chartPadding + availableWidth}
          y2={chartPadding + availableHeight}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
        />
          </Svg>
        </View>
      </GestureDetector>
      
      {/* Hint text */}
      <View style={styles.hintContainer}>
        <Text style={styles.hintText}>👆 Pinch to zoom • Drag to pan • Double-tap to reset</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    padding: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'visible',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  emptyStateText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'center',
  },
  zoomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 8,
    marginBottom: 8,
  },
  zoomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoomTimeRange: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '600',
  },
  zoomLevelBadge: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontWeight: '500',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resetButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  hintContainer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  hintText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontStyle: 'italic',
  },
});
