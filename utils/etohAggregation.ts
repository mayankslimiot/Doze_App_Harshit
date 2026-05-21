/**
 * ETOH aggregation utilities
 * Aggregates raw etoh points based on zoom level
 */

import { ZOOM_LEVELS } from './zoomLevels';

interface RawPoint {
  timestamp: number;
  value: number | null;
}

interface AggregatedPoint {
  x: number; // Timestamp in milliseconds
  y: number | null; // Aggregated etoh value, null indicates gap
}

/**
 * Aggregate raw etoh points based on zoom level
 * Groups points into buckets based on intervalSec and computes average
 * 
 * @param rawPoints - Array of raw etoh points
 * @param zoomIndex - Zoom level index (0-7)
 * @param viewportStart - Optional: start of viewport window (for live mode)
 * @param viewportEnd - Optional: end of viewport window (for live mode)
 * @returns Aggregated points ready for graph rendering
 */
export function aggregateEtoh(
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
      yDomain: [20, 40],
    };
  }

  const zoomLevel = ZOOM_LEVELS[zoomIndex] || ZOOM_LEVELS[0];
  const intervalMs = zoomLevel.intervalSec * 1000;
  const rangeMs = zoomLevel.rangeSec * 1000;
  
  // 24 hours in milliseconds
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  // Determine time window
  const now = Date.now();
  let viewportStartTime: number;
  let viewportEndTime: number;
  let dataStartTime: number; 
  let dataEndTime: number; 

  if (viewportStart && viewportEnd) {
    viewportStartTime = viewportStart;
    viewportEndTime = viewportEnd;
    dataEndTime = rawPoints[rawPoints.length - 1].timestamp;
    dataStartTime = dataEndTime - TWENTY_FOUR_HOURS_MS;
  } else {
    const latestTimestamp = rawPoints[rawPoints.length - 1].timestamp;
    dataEndTime = latestTimestamp;
    dataStartTime = dataEndTime - TWENTY_FOUR_HOURS_MS;
    viewportEndTime = latestTimestamp;
    viewportStartTime = viewportEndTime - rangeMs;
  }

  const windowPoints = rawPoints.filter(
    (p) => p.timestamp >= dataStartTime && p.timestamp <= dataEndTime
  );

  if (windowPoints.length === 0) {
    const latestTimestamp = rawPoints.length > 0 ? rawPoints[rawPoints.length - 1].timestamp : Date.now();
    const safeEndTime = Math.max(viewportEndTime, latestTimestamp);
    const safeStartTime = safeEndTime - rangeMs;
    
    return {
      points: [],
      xDomain: [safeStartTime, safeEndTime] as [number, number],
      yDomain: [20, 40] as [number, number],
    };
  }

  // Group points into buckets
  const buckets = new Map<number, (number | null)[]>();

  for (const point of windowPoints) {
    const bucketStart = Math.floor(point.timestamp / intervalMs) * intervalMs;
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, []);
    }
    buckets.get(bucketStart)!.push(point.value);
  }

  const aggregatedPoints: AggregatedPoint[] = [];
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  for (const [bucketStart, values] of sortedBuckets) {
    if (values.length > 0) {
      const validPoints = values.filter((v): v is number => v !== null);
      if (validPoints.length > 0) {
        const avg = validPoints.reduce((sum, v) => sum + v, 0) / validPoints.length;
        aggregatedPoints.push({
          x: bucketStart + intervalMs / 2,
          y: parseFloat(avg.toFixed(2)),
        });
      } else {
        aggregatedPoints.push({
          x: bucketStart + intervalMs / 2,
          y: null,
        });
      }
    }
  }

  // Fill gaps
  const gapThreshold = intervalMs * 2;
  const filledPoints: AggregatedPoint[] = [];
  
  if (aggregatedPoints.length > 0) {
    const sortedPoints = [...aggregatedPoints].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sortedPoints.length; i++) {
      const currentPoint = sortedPoints[i];
      filledPoints.push(currentPoint);
      if (i < sortedPoints.length - 1) {
        const nextPoint = sortedPoints[i + 1];
        const gap = nextPoint.x - currentPoint.x;
        if (gap > gapThreshold) {
          const bucketsToFill = Math.floor(gap / intervalMs) - 1;
          if (bucketsToFill > 0) {
            for (let j = 1; j <= bucketsToFill; j++) {
              const nullBucketX = currentPoint.x + (j * intervalMs);
              if (nullBucketX < nextPoint.x) {
                filledPoints.push({ x: nullBucketX, y: null });
              }
            }
          }
        }
      }
    }
    filledPoints.sort((a, b) => a.x - b.x);
  }

  // Calculate Y domain
  const allValues = filledPoints.map((p) => p.y).filter((v): v is number => v !== null);
  let yMin = 20;
  let yMax = 40;

  if (allValues.length > 0) {
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = Math.max(1, (max - min) * 0.1);
    yMin = Math.floor(min - padding);
    yMax = Math.ceil(max + padding);
    
    // Ensure reasonable min range
    if (yMax - yMin < 5) {
      const center = (yMax + yMin) / 2;
      yMin = Math.floor(center - 2.5);
      yMax = Math.ceil(center + 2.5);
    }
  }

  return {
    points: filledPoints,
    xDomain: [viewportStartTime, viewportEndTime],
    yDomain: [yMin, yMax],
  };
}
