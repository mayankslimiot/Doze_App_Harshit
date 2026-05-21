/**
 * TVOC Buffer Service
 * Stores raw tvoc points received via WebSocket for smooth graph updates.
 */

interface RawPoint {
  timestamp: number;
  value: number | null;
}

// In-memory storage for raw points (last 24 hours)
const tvocBuffers = new Map<string, RawPoint[]>();

// Retention period: 24 hours
const RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Add a new tvoc point to the device's buffer
 */
export function addTvocPoint(deviceId: string, timestamp: number, value: number | null) {
  if (!tvocBuffers.has(deviceId)) {
    tvocBuffers.set(deviceId, []);
  }

  const buffer = tvocBuffers.get(deviceId)!;
  buffer.push({ timestamp, value });

  // Filter out points older than 24 hours
  const cutoff = timestamp - RETENTION_MS;
  if (buffer.length > 0 && buffer[0].timestamp < cutoff) {
    const newBuffer = buffer.filter(p => p.timestamp >= cutoff);
    tvocBuffers.set(deviceId, newBuffer);
  }
}

/**
 * Get all raw points for a device
 */
export function getRawPoints(deviceId: string): RawPoint[] {
  return tvocBuffers.get(deviceId) || [];
}

/**
 * Clear buffer for a device
 */
export function clearBuffer(deviceId: string) {
  tvocBuffers.set(deviceId, []);
}

/**
 * Re-hydrate buffer from historical data (e.g., on app start)
 */
export function hydrateBuffer(deviceId: string, points: RawPoint[]) {
  const existing = tvocBuffers.get(deviceId) || [];
  const combined = [...existing, ...points];
  
  // Sort and remove duplicates
  const unique = combined.sort((a, b) => a.timestamp - b.timestamp)
    .filter((p, i, self) => i === 0 || p.timestamp !== self[i - 1].timestamp);
    
  tvocBuffers.set(deviceId, unique);
}
