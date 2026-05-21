/**
 * Tvoc Graph Manager Service
 * Manages Tvoc graph data preparation and readiness
 */

import { getRawPoints, addTvocPoint, clearBuffer } from './tvocBuffer';
import { aggregateTvoc } from '@/utils/tvocAggregation';
import { getTvocGraph } from './deviceData';
import { ZOOM_LEVELS } from '@/utils/zoomLevels';

export interface TvocGraphData {
  points: Array<{ x: number; y: number | null }>;
  xDomain: [number, number];
  yDomain: [number, number];
  zoomLevel: { index: number; label: string; rangeSec: number };
}

interface DeviceGraphState {
  isHydrated: boolean;
  isPreparing: boolean;
  graphData: TvocGraphData | null;
  lastUpdateTime: number;
  currentZoomIndex: number;
}

const deviceStates = new Map<string, DeviceGraphState>();
const subscribers = new Map<string, Set<(data: TvocGraphData | null) => void>>();
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

export function isTvocGraphReady(deviceId: string): boolean {
  const state = getState(deviceId);
  return state.isHydrated && state.graphData !== null;
}

export function getTvocGraphData(deviceId: string): TvocGraphData | null {
  const state = getState(deviceId);
  return state.graphData;
}

export async function prepareTvocGraph(deviceId: string): Promise<void> {
  if (!deviceId) return;
  const state = getState(deviceId);
  if (state.isHydrated && state.graphData !== null) return;
  if (state.isPreparing) return;

  state.isPreparing = true;
  try {
    clearBuffer(deviceId);
    const result = await getTvocGraph(deviceId, 0, true);
    
    if (result.success && result.data && result.data.points && result.data.points.length > 0) {
      for (const point of result.data.points) {
        addTvocPoint(deviceId, point.x, point.y);
      }
    } else {
      state.isHydrated = true;
      state.graphData = null;
      notifySubscribers(deviceId, null);
      state.isPreparing = false;
      return;
    }

    state.isHydrated = true;
    await updateTvocGraphData(deviceId, DEFAULT_ZOOM_INDEX);
  } catch (error) {
    console.error('[TvocGraphManager] Failed to prepare graph:', error);
    state.isHydrated = true;
  } finally {
    state.isPreparing = false;
  }
}

export async function updateTvocGraphData(deviceId: string, zoomIndex: number = DEFAULT_ZOOM_INDEX): Promise<void> {
  const state = getState(deviceId);
  const rawPoints = getRawPoints(deviceId);
  
  if (rawPoints.length === 0) {
    state.graphData = null;
    notifySubscribers(deviceId, null);
    return;
  }

  const aggregated = aggregateTvoc(rawPoints, zoomIndex);
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
  
  const graphData: TvocGraphData = {
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
  callback: (data: TvocGraphData | null) => void
): () => void {
  if (!subscribers.has(deviceId)) {
    subscribers.set(deviceId, new Set());
  }
  subscribers.get(deviceId)!.add(callback);
  callback(getTvocGraphData(deviceId));

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

function notifySubscribers(deviceId: string, data: TvocGraphData | null): void {
  const deviceSubscribers = subscribers.get(deviceId);
  if (deviceSubscribers) {
    deviceSubscribers.forEach((callback) => callback(data));
  }
}

export async function updateZoomLevel(deviceId: string, zoomIndex: number): Promise<void> {
  await updateTvocGraphData(deviceId, zoomIndex);
}
