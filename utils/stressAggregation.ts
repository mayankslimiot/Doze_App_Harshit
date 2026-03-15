/**
 * Stress aggregation utilities
 * Aggregates raw stress points based on zoom level
 */

import { ZOOM_LEVELS, type ZoomLevel } from './zoomLevels';

interface RawPoint {
  timestamp: number;
  value: number;
}

interface AggregatedPoint {
  x: number; // Timestamp in milliseconds
  y: number; // Aggregated stress value (0-100)
}

/**
 * Aggregate raw stress points based on zoom level
 * Groups points into buckets based on intervalSec and computes average
 * 
 * @param rawPoints - Array of raw stress points
 * @param zoomIndex - Zoom level index (0-7)
 * @param viewportStart - Optional: start of viewport window (for live mode)
 * @param viewportEnd - Optional: end of viewport window (for live mode)
 * @returns Aggregated points ready for graph rendering
 */
export function aggregateStress(
  rawPoints: RawPoint[],
  zoomIndex: number,
  viewportStart?: number | null,
  viewportEnd?: number | null
): {
  points: AggregatedPoint[];
  xDomain: [number, number];
  yDomain: [number, number];
} {
  if (rawPoints.length === 0) {
    const now = Date.now();
    const defaultRange = ZOOM_LEVELS[zoomIndex]?.rangeSec || 600;
    return {
      points: [],
      xDomain: [now - defaultRange * 1000, now],
      yDomain: [0, 100],
    };
  }

  const zoomLevel = ZOOM_LEVELS[zoomIndex] || ZOOM_LEVELS[0];
  const intervalMs = zoomLevel.intervalSec * 1000;
  const rangeMs = zoomLevel.rangeSec * 1000;
  
  // 24 hours in milliseconds - this is the maximum data retention window
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  // Determine time window
  const now = Date.now();
  let viewportStartTime: number;
  let viewportEndTime: number;
  let dataStartTime: number; // For filtering points (24h window)
  let dataEndTime: number; // Latest point timestamp

  if (viewportStart && viewportEnd) {
    // Use provided viewport
    viewportStartTime = viewportStart;
    viewportEndTime = viewportEnd;
    dataEndTime = rawPoints[rawPoints.length - 1].timestamp;
    dataStartTime = dataEndTime - TWENTY_FOUR_HOURS_MS; // 24h filter window
  } else {
    // Live mode: 
    // - Filter: Keep all points from last 24 hours
    // - Viewport: Show last N seconds (zoom level range) ending at latest point
    const latestTimestamp = rawPoints[rawPoints.length - 1].timestamp;
    dataEndTime = latestTimestamp;
    dataStartTime = dataEndTime - TWENTY_FOUR_HOURS_MS; // 24h filter window
    viewportEndTime = latestTimestamp;
    viewportStartTime = viewportEndTime - rangeMs; // Zoom level viewport
  }

  // Filter points: Keep ALL points within 24-hour window (not zoom level window)
  // Points older than 24 hours are filtered out
  const windowPoints = rawPoints.filter(
    (p) => p.timestamp >= dataStartTime && p.timestamp <= dataEndTime
  );

  if (windowPoints.length === 0) {
    // Ensure valid domain even when no points (viewportEndTime must be > viewportStartTime)
    // Use latest timestamp from raw points if available, otherwise use current time
    const latestTimestamp = rawPoints.length > 0 ? rawPoints[rawPoints.length - 1].timestamp : Date.now();
    const safeEndTime = Math.max(viewportEndTime, latestTimestamp);
    const safeStartTime = safeEndTime - rangeMs;
    
    return {
      points: [],
      xDomain: [safeStartTime, safeEndTime] as [number, number],
      yDomain: [0, 100] as [number, number],
    };
  }

  // Group points into buckets
  const buckets = new Map<number, number[]>(); // bucketStartTime -> [values]

  for (const point of windowPoints) {
    // Calculate which bucket this point belongs to
    const bucketStart = Math.floor(point.timestamp / intervalMs) * intervalMs;
    
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, []);
    }
    buckets.get(bucketStart)!.push(point.value);
  }

  // Aggregate each bucket (compute average)
  const aggregatedPoints: AggregatedPoint[] = [];
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  // Values ≤5 are plotted but excluded from avg (per product requirement)
  for (const [bucketStart, values] of sortedBuckets) {
    const valuesForAvg = values.filter((v) => v > 5);
    if (valuesForAvg.length > 0) {
      const avg = valuesForAvg.reduce((sum, v) => sum + v, 0) / valuesForAvg.length;
      aggregatedPoints.push({
        x: bucketStart + intervalMs / 2, // Use bucket center as timestamp
        y: Math.round(avg),
      });
    }
  }

  // Calculate Y domain (with padding)
  const allValues = aggregatedPoints.map((p) => p.y).filter((v) => v >= 0 && v <= 100);
  let yMin = 0;
  let yMax = 100;

  if (allValues.length > 0) {
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max(5, (max - min) * 0.1);
    yMin = Math.max(0, Math.floor(min - padding));
    yMax = Math.min(100, Math.ceil(max + padding));
  }

  return {
    points: aggregatedPoints, // All points within 24h (not filtered by zoom level)
    xDomain: [viewportStartTime, viewportEndTime], // Viewport shows zoom level range
    yDomain: [yMin, yMax],
  };
}
