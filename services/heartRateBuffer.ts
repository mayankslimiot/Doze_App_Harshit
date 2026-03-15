/**
 * Shared raw heart rate data buffer service
 * Stores raw heart rate points with 24-hour sliding window
 * Used by both Home screen and Heart Rate Graph
 * 
 * Rules:
 * - No throttling on data reception
 * - No zoom filtering
 * - Append only (oldest points auto-dropped)
 * - Thread-safe operations
 */

interface RawHeartRatePoint {
  timestamp: number; // Unix timestamp in milliseconds
  value: number | null; // Heart rate in BPM, null indicates gap (HV=0 or AS=0)
}

// Per-device buffers: deviceId -> RawHeartRatePoint[]
const deviceBuffers = new Map<string, RawHeartRatePoint[]>();

// Subscribers: deviceId -> Set<callback>
const subscribers = new Map<string, Set<(points: RawHeartRatePoint[]) => void>>();

// 24 hours in milliseconds
const BUFFER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Get or create buffer for a device
 */
function getBuffer(deviceId: string): RawHeartRatePoint[] {
  if (!deviceBuffers.has(deviceId)) {
    deviceBuffers.set(deviceId, []);
  }
  return deviceBuffers.get(deviceId)!;
}

/**
 * Add a raw heart rate point to the buffer
 * Automatically removes points older than 24 hours
 * 
 * @param deviceId - Device ID
 * @param timestamp - Unix timestamp in milliseconds
 * @param value - Heart rate value in BPM, or null to indicate gap (HV=0 or AS=0)
 */
export function addRawPoint(deviceId: string, timestamp: number, value: number | null): void {
  if (!deviceId || !Number.isFinite(timestamp)) {
    return; // Invalid data, skip
  }
  
  // Validate value: null is valid (gap), or must be a valid heart rate (0 < value < 250)
  // Note: We explicitly allow null for gaps, but reject 0 as invalid
  if (value !== null && (!Number.isFinite(value) || value <= 0 || value >= 250)) {
    return; // Invalid data, skip
  }

  const buffer = getBuffer(deviceId);
  const now = Date.now();
  const cutoffTime = now - BUFFER_WINDOW_MS;

  // Remove old points (older than 24 hours)
  while (buffer.length > 0 && buffer[0].timestamp < cutoffTime) {
    buffer.shift();
  }

  // Dedupe: skip if last point has same timestamp and value (e.g. resume + Home both pushed)
  if (buffer.length > 0) {
    const last = buffer[buffer.length - 1];
    if (last.timestamp === timestamp && last.value === value) {
      return;
    }
  }

  // Add new point (maintain sorted order by timestamp)
  const newPoint: RawHeartRatePoint = { timestamp, value };
  
  // Insert in sorted order (most recent at end)
  if (buffer.length === 0 || buffer[buffer.length - 1].timestamp <= timestamp) {
    // Fast path: append if newer than last point
    buffer.push(newPoint);
  } else {
    // Binary search for insertion point
    let left = 0;
    let right = buffer.length;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (buffer[mid].timestamp < timestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    buffer.splice(left, 0, newPoint);
  }

  // Notify subscribers
  notifySubscribers(deviceId, buffer);
}

/**
 * Get all points in buffer for a device
 * Returns a copy to prevent external mutations
 */
export function getRawPoints(deviceId: string): RawHeartRatePoint[] {
  const buffer = getBuffer(deviceId);
  return [...buffer]; // Return copy
}

/**
 * Get latest point for a device
 */
export function getLatestPoint(deviceId: string): RawHeartRatePoint | null {
  const buffer = getBuffer(deviceId);
  return buffer.length > 0 ? buffer[buffer.length - 1] : null;
}

/**
 * Get points within a time range
 */
export function getPointsInRange(
  deviceId: string,
  startTime: number,
  endTime: number
): RawHeartRatePoint[] {
  const buffer = getBuffer(deviceId);
  
  // Binary search for start index
  let startIdx = 0;
  let left = 0;
  let right = buffer.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (buffer[mid].timestamp < startTime) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  startIdx = left;

  // Binary search for end index
  let endIdx = buffer.length;
  left = startIdx;
  right = buffer.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (buffer[mid].timestamp <= endTime) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  endIdx = left;

  return buffer.slice(startIdx, endIdx);
}

/**
 * Subscribe to buffer updates for a device
 * Returns unsubscribe function
 */
export function subscribe(
  deviceId: string,
  callback: (points: RawHeartRatePoint[]) => void
): () => void {
  if (!subscribers.has(deviceId)) {
    subscribers.set(deviceId, new Set());
  }
  subscribers.get(deviceId)!.add(callback);

  // Immediately call with current buffer
  const buffer = getBuffer(deviceId);
  callback([...buffer]);

  // Return unsubscribe function
  return () => {
    const deviceSubscribers = subscribers.get(deviceId);
    if (deviceSubscribers) {
      deviceSubscribers.delete(callback);
      if (deviceSubscribers.size === 0) {
        subscribers.delete(deviceId);
      }
    }
  };
}

/**
 * Notify all subscribers for a device
 */
function notifySubscribers(deviceId: string, buffer: RawHeartRatePoint[]): void {
  const deviceSubscribers = subscribers.get(deviceId);
  if (deviceSubscribers) {
    const bufferCopy = [...buffer]; // Send copy to prevent mutations
    deviceSubscribers.forEach((callback) => {
      try {
        callback(bufferCopy);
      } catch (error) {
        console.error('[heartRateBuffer] Error in subscriber callback:', error);
      }
    });
  }
}

/**
 * Clear buffer for a device (useful when device changes).
 * Removes buffer data and subscribers.
 */
export function clearBuffer(deviceId: string): void {
  deviceBuffers.delete(deviceId);
  subscribers.delete(deviceId);
}

/**
 * Clear only buffer data for a device; keep subscribers.
 * Use when refilling from API (e.g. backfill on resume) so live updates keep working.
 */
export function clearBufferData(deviceId: string): void {
  deviceBuffers.set(deviceId, []);
}

/**
 * Notify current buffer state to subscribers (e.g. after backfill so graph gets final update).
 */
export function notifyBufferState(deviceId: string): void {
  const buffer = getBuffer(deviceId);
  notifySubscribers(deviceId, buffer);
}

/**
 * Get buffer size for a device
 */
export function getBufferSize(deviceId: string): number {
  return getBuffer(deviceId).length;
}

