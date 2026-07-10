import { DataPoint } from './RingBuffer';

/**
 * Down-sample data by averaging values within time intervals
 * @param data Array of data points
 * @param intervalSec Aggregation interval in seconds
 * @returns Down-sampled data points
 */
export function downSampleData(
  data: DataPoint[],
  intervalSec: number
): DataPoint[] {
  if (data.length === 0) return [];

  const intervalMs = intervalSec * 1000;
  const buckets = new Map<number, number[]>();

  // Group data points into time buckets
  data.forEach((point) => {
    const bucketKey = Math.floor(point.timestamp / intervalMs) * intervalMs;
    
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    
    buckets.get(bucketKey)!.push(point.value);
  });

  // Calculate average for each bucket
  const downsampled: DataPoint[] = Array.from(buckets.entries())
    .map(([timestamp, values]) => ({
      timestamp: timestamp + intervalMs / 2, // Center of the bucket
      value: values.reduce((sum, val) => sum + val, 0) / values.length, // Average
    }))
    .sort((a, b) => a.timestamp - b.timestamp); // Sort by timestamp

  return downsampled;
}

