/**
 * Stress Graph Manager Service
 * Manages Day view graph data preparation and readiness
 * Owns: buffer hydration, aggregation, graph data state
 * Scoped per device
 * 
 * This service ensures Day graph data is prepared BEFORE the Insight screen opens,
 * eliminating initialization race conditions.
 */

import { getRawPoints, addRawPoint, subscribe as subscribeToBuffer, clearBuffer, setSelectedDate as setBufferSelectedDate } from './stressBuffer';
import { getStressGraph } from './deviceData';

export interface StressGraphData {
  points: Array<{ 
    x: number; // Timestamp in milliseconds (time-based X-axis)
    y: number; // Stress value (0-100)
    timestamp: number; // Original timestamp in ms (same as x)
    label: string; // Formatted time label (e.g., "9:09 PM")
  }>;
  xDomain: [number, number]; // Time-based domain [startTimestamp, endTimestamp] for 24-hour range
  totalBars: number;
  barWidth: number;
  chartWidth: number;
}

interface DeviceGraphState {
  isHydrated: boolean;
  isPreparing: boolean;
  graphData: StressGraphData | null;
  lastUpdateTime: number;
  selectedDate: string | null; // ISO date string (YYYY-MM-DD) to track which day is loaded
}

// Per-device state: deviceId -> DeviceGraphState
const deviceStates = new Map<string, DeviceGraphState>();

// Subscribers: deviceId -> Set<callback>
const subscribers = new Map<string, Set<(data: StressGraphData | null) => void>>();

// Bar chart constants
const DEFAULT_BAR_WIDTH = 50; // Default width of each bar in pixels (decreased from 60)
const MIN_BAR_WIDTH = 3; // Minimum bar width to maintain usability
const BAR_SPACING = 8; // Spacing between bars

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
      selectedDate: null,
    });
  }
  return deviceStates.get(deviceId)!;
}

/**
 * Get date string in YYYY-MM-DD format for comparison
 */
function getDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format timestamp to time label in 24-hour format (e.g., "21:09")
 */
function formatTimeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Check if Stress graph is ready for a device
 */
export function isStressGraphReady(deviceId: string): boolean {
  const state = getState(deviceId);
  return state.isHydrated && state.graphData !== null;
}

/**
 * Get prepared Stress graph data for a device
 */
export function getStressGraphData(deviceId: string): StressGraphData | null {
  const state = getState(deviceId);
  return state.graphData;
}

/**
 * Get selected date for a device (for buffer to check if viewing today)
 */
export function getSelectedDate(deviceId: string): string | null {
  const state = getState(deviceId);
  return state.selectedDate;
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
 * This should be called from Home screen on mount or when selectedDate changes
 * 
 * @param deviceId - Device ID
 * @param selectedDate - Date to fetch data for (defaults to today)
 * @param authToken - Auth token for API calls (optional, getStressGraph handles auth internally)
 */
export async function prepareStressGraph(
  deviceId: string, 
  selectedDate?: Date,
  authToken?: string | null
): Promise<void> {
  if (!deviceId) {
    console.warn('[StressGraphManager] prepareStressGraph: deviceId is required');
    return;
  }

  const state = getState(deviceId);
  const targetDate = selectedDate || new Date();
  const targetDateString = getDateString(targetDate);

  // Check if we already have data for this date
  if (state.isHydrated && state.graphData !== null && state.selectedDate === targetDateString) {
    console.log('[StressGraphManager] Already hydrated for date:', targetDateString);
    return;
  }

  // If already preparing for the same date, skip
  if (state.isPreparing && state.selectedDate === targetDateString) {
    return;
  }

  state.isPreparing = true;

  try {
    // Step 1: Always fetch fresh data from API to ensure buffer matches DB state
    // This ensures that if DB is cleared, buffer is also cleared and refreshed
    console.log('[StressGraphManager] Fetching fresh data from API for device:', deviceId, 'date:', targetDateString);
    
    // Step 2: Clear existing buffer data first to ensure fresh start
    clearBuffer(deviceId);
    
    // Step 3: Calculate day range from selectedDate (00:00:00.000 to 23:59:59.999)
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);
    
    const result = await getStressGraph(deviceId, dayStart, dayEnd);
    
    if (result.success && result.data && result.data.points && result.data.points.length > 0) {
      // Step 4: Populate buffer atomically with fresh data
      // Skip 24-hour filter when loading historical data to preserve all points for the selected date
      const pointsBeforeAdd = getRawPoints(deviceId).length;
      for (const point of result.data.points) {
        addRawPoint(deviceId, point.x, point.y, true); // true = skip 24-hour filter
      }
      const pointsAfterAdd = getRawPoints(deviceId).length;
      console.log('[StressGraphManager] Buffer hydrated with', result.data.points.length, 'fresh points from API', {
        pointsBefore: pointsBeforeAdd,
        pointsAfter: pointsAfterAdd,
        expected: result.data.points.length,
      });
    } else {
      console.log('[StressGraphManager] No historical data available from API for device:', deviceId);
      // Buffer is already cleared, so it will be empty
      // Mark as hydrated even if empty so we don't retry
      state.isHydrated = true;
      state.selectedDate = targetDateString; // Store date even if no data
      // Set graphData to null to indicate no data (not empty array)
      state.graphData = null;
      // Notify subscribers that there's no data
      notifySubscribers(deviceId, null);
      state.isPreparing = false;
      return;
    }

    // Step 4: Mark buffer as hydrated and store selected date
    state.isHydrated = true;
    state.selectedDate = targetDateString;
    // Also update buffer's selected date so it knows whether to filter live data
    setBufferSelectedDate(deviceId, targetDateString);

    // Step 5: Build graph data (no aggregation, raw points)
    await updateStressGraphData(deviceId);

    console.log('[StressGraphManager] Stress graph prepared for device:', deviceId, 'date:', targetDateString);
  } catch (error) {
    console.error('[StressGraphManager] Failed to prepare Stress graph:', error);
    state.isHydrated = true; // Mark as hydrated even on error to prevent retry loops
    state.selectedDate = targetDateString; // Store date even on error
  } finally {
    state.isPreparing = false;
  }
}

/**
 * Update Stress graph data from current buffer
 * Day view: NO aggregation, returns raw points with time-based X-axis
 * This is called:
 * - After initial hydration
 * - When live updates arrive (via buffer subscription)
 * 
 * @param deviceId - Device ID
 */
export async function updateStressGraphData(deviceId: string): Promise<void> {
  const state = getState(deviceId);
  
  // Get raw points from buffer
  const rawPoints = getRawPoints(deviceId);
  
  if (rawPoints.length === 0) {
    // No data - clear graph data but keep hydrated state
    state.graphData = null;
    notifySubscribers(deviceId, null);
    return;
  }

  // Sort by timestamp (should already be sorted, but ensure)
  const sortedPoints = [...rawPoints].sort((a, b) => a.timestamp - b.timestamp);
  
  // Log latest point for debugging
  if (sortedPoints.length > 0 && __DEV__) {
    const latestPoint = sortedPoints[sortedPoints.length - 1];
    const latestDate = new Date(latestPoint.timestamp);
    console.log('[StressGraphManager] Latest point:', {
      timestamp: latestPoint.timestamp,
      value: latestPoint.value,
      dateISO: latestDate.toISOString(),
      dateLocal: latestDate.toLocaleString(),
      hour: latestDate.getHours(),
      minute: latestDate.getMinutes(),
      second: latestDate.getSeconds(),
      totalPoints: sortedPoints.length,
    });
  }
  
  // Calculate 24-hour time domain based on selected date
  // Use the selected date from state to determine the day range
  const selectedDateStr = state.selectedDate;
  let dayStart: number;
  let dayEnd: number;
  
  if (selectedDateStr) {
    // Parse the date string (YYYY-MM-DD) and create date at midnight UTC to avoid timezone issues
    const [year, month, day] = selectedDateStr.split('-').map(Number);
    // Use UTC to avoid timezone conversion issues
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    dayStart = date.getTime();
    dayEnd = dayStart + (24 * 60 * 60 * 1000) - 1; // End of day (23:59:59.999)
  } else {
    // Fallback: use first and last point timestamps, or today's range
    if (sortedPoints.length > 0) {
      const firstTimestamp = sortedPoints[0].timestamp;
      const lastTimestamp = sortedPoints[sortedPoints.length - 1].timestamp;
      // Use UTC to set hours to avoid timezone issues
      const firstDate = new Date(firstTimestamp);
      const utcDate = new Date(Date.UTC(
        firstDate.getUTCFullYear(),
        firstDate.getUTCMonth(),
        firstDate.getUTCDate(),
        0, 0, 0, 0
      ));
      dayStart = utcDate.getTime();
      dayEnd = dayStart + (24 * 60 * 60 * 1000) - 1;
    } else {
      // No points - use today's range
      const now = new Date();
      const todayUTC = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
      ));
      dayStart = todayUTC.getTime();
      dayEnd = dayStart + (24 * 60 * 60 * 1000) - 1;
    }
  }
  
  // Build time-based chart data (timestamp-based X-axis)
  // Show ALL points - no filtering or skipping
  const chartPoints = sortedPoints.map((point) => ({
    x: point.timestamp, // Timestamp in milliseconds (time-based X-axis)
    y: point.value, // Stress value (0-100)
    timestamp: point.timestamp, // Original timestamp (same as x)
    label: formatTimeLabel(point.timestamp), // Formatted label
  }));

  const totalBars = chartPoints.length;
  // Chart width will be calculated dynamically in component based on 24-hour time range
  // Using default for now, component will override based on viewport width
  const chartWidth = totalBars * (DEFAULT_BAR_WIDTH + BAR_SPACING);

  // Create graph data with time-based domain
  const graphData: StressGraphData = {
    points: chartPoints,
    xDomain: [dayStart, dayEnd], // 24-hour time range
    totalBars,
    barWidth: DEFAULT_BAR_WIDTH, // Will be recalculated in component
    chartWidth, // Will be recalculated in component
  };

  state.graphData = graphData;
  state.lastUpdateTime = Date.now();
  
  console.log('[StressGraphManager] Graph data updated:', {
    deviceId,
    pointsCount: graphData.points.length,
    totalBars: graphData.totalBars,
    xDomain: graphData.xDomain,
    chartWidth: graphData.chartWidth,
    subscriberCount: subscribers.get(deviceId)?.size || 0,
  });
  
  // Notify subscribers
  notifySubscribers(deviceId, graphData);
}

/**
 * Subscribe to Stress graph data updates for a device
 * Returns unsubscribe function
 * 
 * @param deviceId - Device ID
 * @param callback - Callback function that receives graph data
 */
export function subscribe(
  deviceId: string,
  callback: (data: StressGraphData | null) => void
): () => void {
  console.log('[StressGraphManager] Subscribing to Stress graph updates for device:', deviceId);
  
  if (!subscribers.has(deviceId)) {
    subscribers.set(deviceId, new Set());
  }
  subscribers.get(deviceId)!.add(callback);

  // Immediately call with current data
  const currentData = getStressGraphData(deviceId);
  console.log('[StressGraphManager] Initial subscription callback with data:', {
    hasData: !!currentData,
    pointsLength: currentData?.points?.length || 0,
  });
  callback(currentData);

  // Also subscribe to buffer updates to trigger graph data update
  // Throttle updates to prevent infinite loops
  let lastUpdateTime = 0;
  const UPDATE_THROTTLE_MS = 300; // Throttle to max once per 300ms
  
  const unsubscribeBuffer = subscribeToBuffer(deviceId, (points) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;
    
    // Throttle updates to prevent too frequent refreshes
    if (timeSinceLastUpdate < UPDATE_THROTTLE_MS) {
      return; // Skip this update, too soon since last update
    }
    
    console.log('[StressGraphManager] Buffer updated, triggering graph data update:', {
      pointsCount: points.length,
      timeSinceLastUpdate,
    });
    
    // Buffer updated - trigger graph data update if we have points
    if (points.length > 0) {
      lastUpdateTime = now;
      updateStressGraphData(deviceId).catch((error) => {
        console.error('[StressGraphManager] Error updating graph data:', error);
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
function notifySubscribers(deviceId: string, data: StressGraphData | null): void {
  const deviceSubscribers = subscribers.get(deviceId);
  if (deviceSubscribers) {
    deviceSubscribers.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error('[StressGraphManager] Error in subscriber callback:', error);
      }
    });
  }
}

/**
 * Clear state for a device (useful when device changes)
 */
export function clearStressGraphState(deviceId: string): void {
  deviceStates.delete(deviceId);
  subscribers.delete(deviceId);
  // Also clear the buffer to ensure fresh data on next prepare
  clearBuffer(deviceId);
  // Clear selected date in buffer
  setBufferSelectedDate(deviceId, null);
}

/**
 * Clear all Stress graph state and buffers (useful when DB is cleared)
 */
export function clearAllStressGraphState(): void {
  // Clear all device states
  deviceStates.clear();
  subscribers.clear();
  // Clear all buffers
  // Note: clearBuffer requires deviceId, so we can't clear all at once
  // But this will clear the state tracking
}

// Note: Stress Day view doesn't use zoom levels (no aggregation)
// This function is kept for API compatibility but does nothing
export async function updateZoomLevel(deviceId: string, zoomIndex: number): Promise<void> {
  // No-op: Stress Day view doesn't support zoom
  return Promise.resolve();
}
