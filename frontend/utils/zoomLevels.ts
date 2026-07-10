/**
 * Zoom level configuration for graph views
 * Each level defines the time range and aggregation interval
 */
export interface ZoomLevel {
  label: string; // Display label (e.g., '10m', '1h')
  rangeSec: number; // Time range in seconds
  intervalSec: number; // Aggregation interval in seconds
}

export const ZOOM_LEVELS: ZoomLevel[] = [
  { label: '10m', rangeSec: 600, intervalSec: 6 }, // 10 minutes, 6 sec intervals
  { label: '30m', rangeSec: 1800, intervalSec: 18 }, // 30 minutes, 18 sec intervals
  { label: '1h', rangeSec: 3600, intervalSec: 36 }, // 1 hour, 36 sec intervals
  { label: '2h', rangeSec: 7200, intervalSec: 72 }, // 2 hours, 72 sec intervals
  { label: '4h', rangeSec: 14400, intervalSec: 144 }, // 4 hours, 144 sec intervals
  { label: '8h', rangeSec: 28800, intervalSec: 288 }, // 8 hours, 288 sec intervals
  { label: '12h', rangeSec: 43200, intervalSec: 432 }, // 12 hours, 432 sec intervals
  { label: '24h', rangeSec: 86400, intervalSec: 864 }, // 24 hours, 864 sec intervals
];

