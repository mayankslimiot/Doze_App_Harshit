import { RingBuffer, DataPoint } from './RingBuffer';
import { getDeviceHistory } from '@/services/deviceData';

/**
 * Load historical data with pagination
 * Stops when buffer is full or no more data available
 */
export async function loadHistory(
  deviceId: string,
  ringBuffer: RingBuffer,
  maxPoints: number = 15000
): Promise<void> {
  if (ringBuffer.size() >= maxPoints) {
    console.log('[HistoryLoader] Buffer already full, skipping history load');
    return;
  }

  console.log('[HistoryLoader] Starting history load for device:', deviceId);

  let before = Date.now(); // Start from current time
  let totalLoaded = 0;
  const BATCH_SIZE = 2000; // API limit

  while (ringBuffer.size() < maxPoints) {
    try {
      // Calculate time range: fetch data from 24 hours ago to 'before' timestamp
      const to = new Date(before);
      const from = new Date(before - 24 * 60 * 60 * 1000); // 24 hours before

      const result = await getDeviceHistory(deviceId, {
        from,
        to,
        limit: BATCH_SIZE,
      });

      if (!result.success || !result.data || result.data.length === 0) {
        console.log('[HistoryLoader] No more data available');
        break;
      }

      // Convert API data to DataPoint format
      const dataPoints: DataPoint[] = result.data
        .filter((item: any) => {
          const value = item.heartRate || item.hr || item.bpm;
          return value != null && value > 0 && item.timestamp;
        })
        .map((item: any) => {
          const timestamp = new Date(item.timestamp).getTime();
          return {
            timestamp: isNaN(timestamp) ? Date.now() : timestamp,
            value: Number(item.heartRate || item.hr || item.bpm || 0),
          };
        })
        .filter((point: DataPoint) => point.value > 0 && point.value < 250)
        .sort((a: DataPoint, b: DataPoint) => a.timestamp - b.timestamp); // Oldest first

      if (dataPoints.length === 0) {
        console.log('[HistoryLoader] No valid data points in batch');
        break;
      }

      // Add points to ring buffer (oldest first)
      dataPoints.forEach((point) => {
        ringBuffer.push(point);
      });

      totalLoaded += dataPoints.length;
      console.log(
        `[HistoryLoader] Loaded ${dataPoints.length} points. Total: ${ringBuffer.size()}/${maxPoints}`
      );

      // Update 'before' to the oldest timestamp in this batch for next iteration
      const oldestTimestamp = dataPoints[0].timestamp;
      
      // If we got less than BATCH_SIZE, we've reached the end
      if (dataPoints.length < BATCH_SIZE) {
        console.log('[HistoryLoader] Reached end of available data');
        break;
      }

      // Move back in time for next batch
      before = oldestTimestamp - 1; // -1 to avoid overlap

      // Safety check: don't go too far back (more than 7 days)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (before < sevenDaysAgo) {
        console.log('[HistoryLoader] Reached 7-day limit');
        break;
      }
    } catch (error: any) {
      console.error('[HistoryLoader] Error loading history:', error);
      break;
    }
  }

  console.log(`[HistoryLoader] History load complete. Total points: ${totalLoaded}`);
}

