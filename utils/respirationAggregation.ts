/**
 * Respiration aggregation utilities
 * Aggregates raw respiration points based on zoom level
 */

import { ZOOM_LEVELS, type ZoomLevel } from './zoomLevels';

interface RawPoint {
  timestamp: number;
  value: number | null; // null indicates gap (no human detected)
}

interface AggregatedPoint {
  x: number; // Timestamp in milliseconds
  y: number | null; // Aggregated respiration value, null indicates gap bucket
}

/**
 * Aggregate raw respiration points based on zoom level
 * Groups points into buckets based on intervalSec and computes average
 * 
 * @param rawPoints - Array of raw respiration points
 * @param zoomIndex - Zoom level index (0-7)
 * @param viewportStart - Optional: start of viewport window (for live mode)
 * @param viewportEnd - Optional: end of viewport window (for live mode)
 * @returns Aggregated points ready for graph rendering
 */
export function aggregateRespiration(
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
      yDomain: [0, 20], // Fixed Y-axis range for respiration: 0-20
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
      yDomain: [0, 20] as [number, number], // Fixed Y-axis range for respiration: 0-20
    };
  }

  // Group points into buckets
  const buckets = new Map<number, (number | null)[]>(); // bucketStartTime -> [values]

  for (const point of windowPoints) {
    // Calculate which bucket this point belongs to
    const bucketStart = Math.floor(point.timestamp / intervalMs) * intervalMs;
    
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, []);
    }
    buckets.get(bucketStart)!.push(point.value);
  }

  // Aggregate each bucket (compute average)
  // Rule: If bucket contains at least one valid respiration → return average
  //       If bucket contains only null values → return y = null (GAP bucket)
  const aggregatedPoints: AggregatedPoint[] = [];
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  for (const [bucketStart, values] of sortedBuckets) {
    if (values.length > 0) {
      // Filter out null values to get valid respiration points
      const validPoints = values.filter((v): v is number => v !== null);
      
      if (validPoints.length > 0) {
        // Bucket has at least one valid respiration → compute average
        const avg = validPoints.reduce((sum, v) => sum + v, 0) / validPoints.length;
        aggregatedPoints.push({
          x: bucketStart + intervalMs / 2, // Use bucket center as timestamp
          y: Math.round(avg * 10) / 10, // Round to 1 decimal place
        });
      } else {
        // Bucket contains only null values → this is a gap bucket
        aggregatedPoints.push({
          x: bucketStart + intervalMs / 2,
          y: null, // Explicit gap indicator
        });
      }
    }
  }

  // Fill gaps between consecutive buckets
  // Check every bucket pair: if gap > (bucket interval * 2), fill with null buckets
  const gapThreshold = intervalMs * 2; // Threshold = bucket interval * 2
  const filledPoints: AggregatedPoint[] = [];
  
  if (aggregatedPoints.length > 0) {
    // Sort points by timestamp to ensure correct order
    const sortedPoints = [...aggregatedPoints].sort((a, b) => a.x - b.x);
    
    for (let i = 0; i < sortedPoints.length; i++) {
      const currentPoint = sortedPoints[i];
      
      // Add current point
      filledPoints.push(currentPoint);
      
      // Check gap to next point (if exists)
      if (i < sortedPoints.length - 1) {
        const nextPoint = sortedPoints[i + 1];
        const gap = nextPoint.x - currentPoint.x;
        
        // If gap > threshold, fill with null buckets
        if (gap > gapThreshold) {
          // Calculate how many buckets fit in the gap
          const bucketsToFill = Math.floor(gap / intervalMs) - 1; // -1 because we already have start and end buckets
          
          if (bucketsToFill > 0) {
            // Insert null buckets at regular intervals
            for (let j = 1; j <= bucketsToFill; j++) {
              const nullBucketX = currentPoint.x + (j * intervalMs);
              
              // Only insert if null bucket is before next point
              if (nullBucketX < nextPoint.x) {
                filledPoints.push({
                  x: nullBucketX,
                  y: null, // Gap bucket
                });
              }
            }
          }
        }
      }
    }
    
    // Sort filled points by timestamp to maintain chronological order after gap filling
    filledPoints.sort((a, b) => a.x - b.x);
  } else {
    // No points, return empty array
    filledPoints.length = 0;
  }

  // Fixed Y domain for respiration: 0-20
  // Only consider non-null values for domain calculation (though domain is fixed)
  const yMin = 0;
  const yMax = 20;

  return {
    points: filledPoints, // All points with gaps filled (not filtered by zoom level)
    xDomain: [viewportStartTime, viewportEndTime], // Viewport shows zoom level range
    yDomain: [yMin, yMax],
  };
}
