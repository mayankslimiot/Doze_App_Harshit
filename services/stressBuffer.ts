/**
 * Shared raw stress data buffer service
 * Stores raw stress points with 24-hour sliding window
 * Used by both Home screen and Stress Graph
 * 
 * Rules:
 * - No throttling on data reception
 * - No zoom filtering
 * - Append only (oldest points auto-dropped)
 * - Thread-safe operations
 */

interface RawStressPoint {
  timestamp: number; // Unix timestamp in milliseconds
  value: number; // Stress level (0-100)
}

// Per-device buffers: deviceId -> RawStressPoint[]
const deviceBuffers = new Map<string, RawStressPoint[]>();

// Subscribers: deviceId -> Set<callback>
const subscribers = new Map<string, Set<(points: RawStressPoint[]) => void>>();

// 24 hours in milliseconds
const BUFFER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Get or create buffer for a device
 */
function getBuffer(deviceId: string): RawStressPoint[] {
  if (!deviceBuffers.has(deviceId)) {
    deviceBuffers.set(deviceId, []);
  }
  return deviceBuffers.get(deviceId)!;
}

// Store selected date per device to check if viewing today
// This is set by stressGraphManager when preparing graph
const selectedDates = new Map<string, string | null>();

/**
 * Set selected date for a device (called by stressGraphManager)
 * This allows buffer to know if we're viewing today or historical data
 */
export function setSelectedDate(deviceId: string, dateString: string | null): void {
  selectedDates.set(deviceId, dateString);
}

/**
 * Check if we're currently viewing today's data (not historical)
 * This determines whether to apply 24-hour filter for live data
 */
function isViewingToday(deviceId: string): boolean {
  const selectedDate = selectedDates.get(deviceId);
  
  // If no selected date stored, default to today (apply filter)
  if (!selectedDate) {
    return true;
  }
  
  // Check if selected date matches today
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  return selectedDate === todayString;
}

/**
 * Add a raw stress point to the buffer
 * Automatically removes points older than 24 hours (only when viewing today's data)
 * 
 * @param deviceId - Device ID
 * @param timestamp - Unix timestamp in milliseconds
 * @param value - Stress value (0-100)
 * @param skip24HourFilter - If true, skip 24-hour filtering (for historical data loading)
 */
export function addRawPoint(deviceId: string, timestamp: number, value: number, skip24HourFilter: boolean = false): void {
  if (!deviceId || !Number.isFinite(timestamp) || !Number.isFinite(value) || value < 0 || value > 100) {
    return; // Invalid data, skip
  }

  const buffer = getBuffer(deviceId);
  
  // Only apply 24-hour filter if:
  // 1. Not explicitly skipped (skip24HourFilter = false)
  // 2. AND we're viewing today's data (not historical)
  // This prevents live data from filtering out historical points when viewing past dates
  if (!skip24HourFilter && isViewingToday(deviceId)) {
    const now = Date.now();
    const cutoffTime = now - BUFFER_WINDOW_MS;

    // Remove old points (older than 24 hours)
    while (buffer.length > 0 && buffer[0].timestamp < cutoffTime) {
      buffer.shift();
    }
  }

  // Check for duplicate timestamp (deduplicate)
  // Allow 1 second tolerance for WebSocket replay scenarios
  const DEDUP_TOLERANCE_MS = 1000;
  const duplicateIndex = buffer.findIndex(
    (p) => Math.abs(p.timestamp - timestamp) < DEDUP_TOLERANCE_MS
  );
  
  if (duplicateIndex >= 0) {
    // Update existing point with new value (in case value changed)
    buffer[duplicateIndex].value = value;
    // Notify subscribers even on update
    notifySubscribers(deviceId, buffer);
    return;
  }

  // Add new point (maintain sorted order by timestamp)
  const newPoint: RawStressPoint = { timestamp, value };
  
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
export function getRawPoints(deviceId: string): RawStressPoint[] {
  const buffer = getBuffer(deviceId);
  return [...buffer]; // Return copy
}

/**
 * Get latest point for a device
 */
export function getLatestPoint(deviceId: string): RawStressPoint | null {
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
): RawStressPoint[] {
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
  callback: (points: RawStressPoint[]) => void
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
function notifySubscribers(deviceId: string, buffer: RawStressPoint[]): void {
  const deviceSubscribers = subscribers.get(deviceId);
  if (deviceSubscribers) {
    const bufferCopy = [...buffer]; // Send copy to prevent mutations
    deviceSubscribers.forEach((callback) => {
      try {
        callback(bufferCopy);
      } catch (error) {
        console.error('[stressBuffer] Error in subscriber callback:', error);
      }
    });
  }
}

/**
 * Clear buffer for a device (useful when device changes)
 */
export function clearBuffer(deviceId: string): void {
  deviceBuffers.delete(deviceId);
  subscribers.delete(deviceId);
}

/**
 * Get buffer size for a device
 */
export function getBufferSize(deviceId: string): number {
  return getBuffer(deviceId).length;
}
