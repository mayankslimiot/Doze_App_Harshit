import { DataPoint } from './RingBuffer';

/**
 * Check if a new data point is a duplicate of the last point
 * Points within 5 seconds are considered duplicates
 */
export function isDuplicate(
  lastPoint: DataPoint | undefined,
  nextPoint: DataPoint
): boolean {
  if (!lastPoint) return false;
  
  const timeDiff = Math.abs(nextPoint.timestamp - lastPoint.timestamp);
  return timeDiff < 5000; // 5 seconds threshold
}

