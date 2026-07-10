/**
 * Day Graph Manager Service
 * Manages Day view graph data preparation and readiness
 * Owns: buffer hydration, aggregation, graph data state
 * Scoped per device
 * 
 * This service ensures Day graph data is prepared BEFORE the Insight screen opens,
 * eliminating initialization race conditions.
 */

import { getRawPoints, addRawPoint, subscribe as subscribeToBuffer, clearBuffer, clearBufferData, notifyBufferState } from './heartRateBuffer';
import { aggregateHeartRate } from '@/utils/heartRateAggregation';
import { getHeartRateGraph } from './deviceData';
import { ZOOM_LEVELS } from '@/utils/zoomLevels';

export interface DayGraphData {
  points: Array<{ x: number; y: number | null }>;
  xDomain: [number, number];
  yDomain: [number, number];
  zoomLevel: { index: number; label: string; rangeSec: number };
}

interface DeviceGraphState {
  isHydrated: boolean;
  isPreparing: boolean;
  graphData: DayGraphData | null;
  lastUpdateTime: number;
  currentZoomIndex: number; // Track current zoom level per device
}

// Per-device state: deviceId -> DeviceGraphState
const deviceStates = new Map<string, DeviceGraphState>();

// Subscribers: deviceId -> Set<callback>
const subscribers = new Map<string, Set<(data: DayGraphData | null) => void>>();

// Default zoom index (10 minutes)
const DEFAULT_ZOOM_INDEX = 0;

/**
 * Get or create state for a device
 */
function getState(deviceId: string): DeviceGraphState {
  if (!deviceStates.has(deviceId)) {
    deviceStates.set(deviceId, {
      isHydrated: false,
      isPreparing: false,
      graphData: null,
      lastUpdateTime: 0,
      currentZoomIndex: DEFAULT_ZOOM_INDEX, // Initialize with default zoom
    });
  }
  return deviceStates.get(deviceId)!;
}

/**
 * Check if Day graph is ready for a device
 */
export function isDayGraphReady(deviceId: string): boolean {
  const state = getState(deviceId);
  return state.isHydrated && state.graphData !== null;
}

/**
 * Get prepared Day graph data for a device
 */
export function getDayGraphData(deviceId: string): DayGraphData | null {
  const state = getState(deviceId);
  return state.graphData;
}

/**
 * Check if buffer is hydrated for a device
 */
export function isBufferHydrated(deviceId: string): boolean {
  const state = getState(deviceId);
  return state.isHydrated;
}

/**
 * Check if graph is currently being prepared
 */
export function isPreparing(deviceId: string): boolean {
  const state = getState(deviceId);
  return state.isPreparing;
}

/**
 * Hydrate buffer from API and prepare Day graph data
 * This should be called from Home screen on mount
 * 
 * @param deviceId - Device ID
 * @param authToken - Auth token for API calls (optional, getHeartRateGraph handles auth internally)
 */
export async function prepareDayGraph(deviceId: string, authToken?: string | null): Promise<void> {
  if (!deviceId) {
    console.warn('[DayGraphManager] prepareDayGraph: deviceId is required');
    return;
  }

  const state = getState(deviceId);

  // If already hydrated and has data, skip
  if (state.isHydrated && state.graphData !== null) {
    return;
  }

  // If already preparing, skip
  if (state.isPreparing) {
    return;
  }

  state.isPreparing = true;

  try {
    // Step 1: Always fetch fresh data from API to ensure buffer matches DB state
    // This ensures that if DB is cleared, buffer is also cleared and refreshed
    console.log('[DayGraphManager] Fetching fresh data from API for device:', deviceId);
    
    // Step 2: Clear existing buffer data first to ensure fresh start
    clearBuffer(deviceId);
    
    // Step 3: Fetch last 24 hours from API (raw data for buffer hydration)
    const result = await getHeartRateGraph(deviceId, 0, true); // true = raw data
    
    if (result.success && result.data && result.data.points && result.data.points.length > 0) {
      // Step 4: Populate buffer atomically with fresh raw data (no aggregation)
      for (const point of result.data.points) {
        addRawPoint(deviceId, point.x, point.y);
      }
      console.log('[DayGraphManager] Buffer hydrated with', result.data.points.length, 'raw points from API');
    } else {
      console.log('[DayGraphManager] No historical data available from API for device:', deviceId);
      // Buffer is already cleared, so it will be empty
      // Mark as hydrated even if empty so we don't retry
      state.isHydrated = true;
      // Set graphData to null to indicate no data (not empty array)
      state.graphData = null;
      // Notify subscribers that there's no data
      notifySubscribers(deviceId, null);
      state.isPreparing = false;
      return;
    }

    // Step 4: Mark buffer as hydrated
    state.isHydrated = true;

    // Step 5: Run initial aggregation
    await updateDayGraphData(deviceId, DEFAULT_ZOOM_INDEX);

    console.log('[DayGraphManager] Day graph prepared for device:', deviceId);
  } catch (error) {
    console.error('[DayGraphManager] Failed to prepare Day graph:', error);
    state.isHydrated = true; // Mark as hydrated even on error to prevent retry loops
  } finally {
    state.isPreparing = false;
  }
}

/**
 * Update Day graph data from current buffer
 * This is called:
 * - After initial hydration
 * - When live updates arrive (via buffer subscription)
 * - When zoom level changes
 * 
 * @param deviceId - Device ID
 * @param zoomIndex - Zoom level index (0-7)
 */
export async function updateDayGraphData(deviceId: string, zoomIndex: number = DEFAULT_ZOOM_INDEX): Promise<void> {
  const state = getState(deviceId);
  
  // Get raw points from buffer
  const rawPoints = getRawPoints(deviceId);
  
  if (rawPoints.length === 0) {
    // No data - clear graph data but keep hydrated state
    state.graphData = null;
    notifySubscribers(deviceId, null);
    return;
  }

  // Aggregate based on zoom level
  const aggregated = aggregateHeartRate(rawPoints, zoomIndex);
  
  // Check if there are any valid (non-null) points in aggregated data
  // If only NULL values exist, don't form the graph - return null
  const hasValidPoints = aggregated.points.some(p => p.y !== null && p.y !== undefined);
  
  if (!hasValidPoints) {
    // Only NULL values exist - don't form the graph
    console.log('[DayGraphManager] Only NULL values found, not forming graph');
    state.graphData = null;
    notifySubscribers(deviceId, null);
    return;
  }
  
  // Compute xDomain from buffer data
  // Use latest VALID (non-null) heart rate timestamp to prevent graph from moving on NULL values
  // Find the latest point with a valid (non-null) value
  let latestTimestamp = rawPoints[rawPoints.length - 1]?.timestamp ?? Date.now();
  for (let i = rawPoints.length - 1; i >= 0; i--) {
    if (rawPoints[i].value !== null && rawPoints[i].value !== undefined) {
      latestTimestamp = rawPoints[i].timestamp;
      break;
    }
  }
  const zoomLevel = ZOOM_LEVELS[zoomIndex] || ZOOM_LEVELS[0];
  const rangeMs = zoomLevel.rangeSec * 1000;
  const windowStart = latestTimestamp - rangeMs;
  const computedXDomain: [number, number] = [windowStart, latestTimestamp];
  
  // Create graph data (includes both valid points and gap buckets)
  const graphData: DayGraphData = {
    points: aggregated.points,
    xDomain: computedXDomain,
    yDomain: aggregated.yDomain,
    zoomLevel: {
      index: zoomIndex,
      label: zoomLevel.label,
      rangeSec: zoomLevel.rangeSec,
    },
  };

  state.graphData = graphData;
  state.currentZoomIndex = zoomIndex; // Store current zoom index
  state.lastUpdateTime = Date.now();
  
  console.log('[DayGraphManager] Graph data updated:', {
    deviceId,
    pointsCount: graphData.points.length,
    xDomain: graphData.xDomain,
    yDomain: graphData.yDomain,
    zoomIndex: zoomIndex,
    subscriberCount: subscribers.get(deviceId)?.size || 0,
  });
  
  // Notify subscribers
  notifySubscribers(deviceId, graphData);
}

/**
 * Subscribe to Day graph data updates for a device
 * Returns unsubscribe function
 * 
 * @param deviceId - Device ID
 * @param callback - Callback function that receives graph data
 */
export function subscribe(
  deviceId: string,
  callback: (data: DayGraphData | null) => void
): () => void {
  console.log('[DayGraphManager] Subscribing to Day graph updates for device:', deviceId);
  
  if (!subscribers.has(deviceId)) {
    subscribers.set(deviceId, new Set());
  }
  subscribers.get(deviceId)!.add(callback);

  // Immediately call with current data
  const currentData = getDayGraphData(deviceId);
  console.log('[DayGraphManager] Initial subscription callback with data:', {
    hasData: !!currentData,
    pointsLength: currentData?.points?.length || 0,
  });
  callback(currentData);

  // Also subscribe to buffer updates to trigger aggregation
  // Throttle aggregation to prevent infinite loops
  let lastAggregationTime = 0;
  const AGGREGATION_THROTTLE_MS = 300; // Throttle to max once per 300ms
  
  const unsubscribeBuffer = subscribeToBuffer(deviceId, (points) => {
    const now = Date.now();
    const timeSinceLastAggregation = now - lastAggregationTime;
    
    // Throttle aggregation to prevent too frequent updates
    if (timeSinceLastAggregation < AGGREGATION_THROTTLE_MS) {
      return; // Skip this update, too soon since last aggregation
    }
    
    console.log('[DayGraphManager] Buffer updated, triggering aggregation:', {
      pointsCount: points.length,
      timeSinceLastAggregation,
    });
    
    // Buffer updated - trigger aggregation if we have points
    // Use the current zoom index for this device (not DEFAULT_ZOOM_INDEX)
    // This ensures live updates respect the user's selected zoom level
    if (points.length > 0) {
      lastAggregationTime = now;
      const state = getState(deviceId);
      const currentZoom = state.currentZoomIndex; // Use stored zoom index
      updateDayGraphData(deviceId, currentZoom).catch((error: any) => {
        console.error('[DayGraphManager] Error updating graph data:', error);
      });
    }
  });

  // Return unsubscribe function
  return () => {
    const deviceSubscribers = subscribers.get(deviceId);
    if (deviceSubscribers) {
      deviceSubscribers.delete(callback);
      if (deviceSubscribers.size === 0) {
        subscribers.delete(deviceId);
      }
    }
    unsubscribeBuffer();
  };
}

/**
 * Notify all subscribers for a device
 */
function notifySubscribers(deviceId: string, data: DayGraphData | null): void {
  const deviceSubscribers = subscribers.get(deviceId);
  if (deviceSubscribers) {
    deviceSubscribers.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error('[DayGraphManager] Error in subscriber callback:', error);
      }
    });
  }
}

/**
 * Clear state for a device (useful when device changes)
 */
export function clearDayGraphState(deviceId: string): void {
  deviceStates.delete(deviceId);
  subscribers.delete(deviceId);
  // Also clear the buffer to ensure fresh data on next prepare
  clearBuffer(deviceId);
}

/**
 * Clear all Day graph state and buffers (useful when DB is cleared)
 */
export function clearAllDayGraphState(): void {
  // Clear all device states
  deviceStates.clear();
  subscribers.clear();
  // Clear all buffers
  // Note: clearBuffer requires deviceId, so we can't clear all at once
  // But this will clear the state tracking
}

/**
 * Update zoom level for a device
 * This triggers re-aggregation with new zoom level
 */
export async function updateZoomLevel(deviceId: string, zoomIndex: number): Promise<void> {
  await updateDayGraphData(deviceId, zoomIndex);
}

/**
 * Backfill buffer from API (e.g. when app resumes from background).
 * Fetches last 24h from server and refreshes buffer + graph so gaps from
 * missed WebSocket messages while app was in background are filled.
 * Safe to call even when already hydrated.
 */
export async function backfillFromApi(deviceId: string): Promise<void> {
  if (!deviceId) {
    return;
  }

  const state = getState(deviceId);
  if (state.isPreparing) {
    return;
  }

  state.isPreparing = true;
  try {
    console.log('[DayGraphManager] Backfill from API on resume for device:', deviceId);
    clearBufferData(deviceId);
    const result = await getHeartRateGraph(deviceId, 0, true);

    if (result.success && result.data?.points?.length) {
      for (const point of result.data.points) {
        const y = point.y;
        addRawPoint(deviceId, point.x, typeof y === 'number' ? y : null);
      }
      notifyBufferState(deviceId);
      state.isHydrated = true;
      const zoomIndex = state.currentZoomIndex ?? DEFAULT_ZOOM_INDEX;
      await updateDayGraphData(deviceId, zoomIndex);
      console.log('[DayGraphManager] Backfill complete, points:', result.data.points.length);
    } else {
      state.isHydrated = true;
      state.graphData = null;
      notifySubscribers(deviceId, null);
    }
  } catch (error) {
    console.error('[DayGraphManager] Backfill failed:', error);
  } finally {
    state.isPreparing = false;
  }
}

