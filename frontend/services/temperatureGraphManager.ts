/**
 * Temperature Graph Manager Service
 * Manages Temperature graph data preparation and readiness
 */

import { getRawPoints, addTemperaturePoint, clearBuffer } from './temperatureBuffer';
import { aggregateTemperature } from '@/utils/temperatureAggregation';
import { getTemperatureGraph } from './deviceData';
import { ZOOM_LEVELS } from '@/utils/zoomLevels';

export interface TemperatureGraphData {
  points: Array<{ x: number; y: number | null }>;
  xDomain: [number, number];
  yDomain: [number, number];
  zoomLevel: { index: number; label: string; rangeSec: number };
}

interface DeviceGraphState {
  isHydrated: boolean;
  isPreparing: boolean;
  graphData: TemperatureGraphData | null;
  lastUpdateTime: number;
  currentZoomIndex: number;
}

const deviceStates = new Map<string, DeviceGraphState>();
const subscribers = new Map<string, Set<(data: TemperatureGraphData | null) => void>>();
const DEFAULT_ZOOM_INDEX = 0;

function getState(deviceId: string): DeviceGraphState {
  if (!deviceStates.has(deviceId)) {
    deviceStates.set(deviceId, {
      isHydrated: false,
      isPreparing: false,
      graphData: null,
      lastUpdateTime: 0,
      currentZoomIndex: DEFAULT_ZOOM_INDEX,
    });
  }
  return deviceStates.get(deviceId)!;
}

export function isTemperatureGraphReady(deviceId: string): boolean {
  const state = getState(deviceId);
  return state.isHydrated && state.graphData !== null;
}

export function getTemperatureGraphData(deviceId: string): TemperatureGraphData | null {
  const state = getState(deviceId);
  return state.graphData;
}

export async function prepareTemperatureGraph(deviceId: string): Promise<void> {
  if (!deviceId) return;
  const state = getState(deviceId);
  if (state.isHydrated && state.graphData !== null) return;
  if (state.isPreparing) return;

  state.isPreparing = true;
  try {
    clearBuffer(deviceId);
    const result = await getTemperatureGraph(deviceId, 0, true);
    
    if (result.success && result.data && result.data.points && result.data.points.length > 0) {
      for (const point of result.data.points) {
        addTemperaturePoint(deviceId, point.x, point.y);
      }
    } else {
      state.isHydrated = true;
      state.graphData = null;
      notifySubscribers(deviceId, null);
      state.isPreparing = false;
      return;
    }

    state.isHydrated = true;
    await updateTemperatureGraphData(deviceId, DEFAULT_ZOOM_INDEX);
  } catch (error) {
    console.error('[TemperatureGraphManager] Failed to prepare graph:', error);
    state.isHydrated = true;
  } finally {
    state.isPreparing = false;
  }
}

export async function updateTemperatureGraphData(deviceId: string, zoomIndex: number = DEFAULT_ZOOM_INDEX): Promise<void> {
  const state = getState(deviceId);
  const rawPoints = getRawPoints(deviceId);
  
  if (rawPoints.length === 0) {
    state.graphData = null;
    notifySubscribers(deviceId, null);
    return;
  }

  const aggregated = aggregateTemperature(rawPoints, zoomIndex);
  const hasValidPoints = aggregated.points.some(p => p.y !== null);
  
  if (!hasValidPoints) {
    state.graphData = null;
    notifySubscribers(deviceId, null);
    return;
  }
  
  let latestTimestamp;
  for (let i = rawPoints.length - 1; i >= 0; i--) {
    if (rawPoints[i].value !== null) {
      latestTimestamp = rawPoints[i].timestamp;
      break;
    }
  }
  if (!latestTimestamp) latestTimestamp = rawPoints[rawPoints.length - 1].timestamp;

  const zoomLevel = ZOOM_LEVELS[zoomIndex] || ZOOM_LEVELS[0];
  const rangeMs = zoomLevel.rangeSec * 1000;
  const computedXDomain: [number, number] = [latestTimestamp - rangeMs, latestTimestamp];
  
  const graphData: TemperatureGraphData = {
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
  state.currentZoomIndex = zoomIndex;
  state.lastUpdateTime = Date.now();
  
  notifySubscribers(deviceId, graphData);
}

export function subscribe(
  deviceId: string,
  callback: (data: TemperatureGraphData | null) => void
): () => void {
  if (!subscribers.has(deviceId)) {
    subscribers.set(deviceId, new Set());
  }
  subscribers.get(deviceId)!.add(callback);
  callback(getTemperatureGraphData(deviceId));

  // Also subscribe to buffer updates to trigger aggregation
  let lastAggregationTime = 0;
  const AGGREGATION_THROTTLE_MS = 300;
  
  const unsubscribeBuffer = require('./temperatureBuffer').subscribeToBuffer(deviceId, (points: any[]) => {
    const now = Date.now();
    const timeSinceLastAggregation = now - lastAggregationTime;
    
    if (timeSinceLastAggregation < AGGREGATION_THROTTLE_MS) {
      return;
    }
    
    if (points.length > 0) {
      lastAggregationTime = now;
      const state = getState(deviceId);
      const currentZoom = state.currentZoomIndex;
      updateTemperatureGraphData(deviceId, currentZoom).catch((error: any) => {
        console.error('[TemperatureGraphManager] Error updating graph data:', error);
      });
    }
  });

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

function notifySubscribers(deviceId: string, data: TemperatureGraphData | null): void {
  const deviceSubscribers = subscribers.get(deviceId);
  if (deviceSubscribers) {
    deviceSubscribers.forEach((callback) => callback(data));
  }
}

export async function updateZoomLevel(deviceId: string, zoomIndex: number): Promise<void> {
  await updateTemperatureGraphData(deviceId, zoomIndex);
}
