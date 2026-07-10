import { useMemo } from 'react';
import {
  VictoryChart,
  VictoryLine,
  VictoryArea,
  VictoryAxis,
  VictoryZoomContainer,
  VictoryTooltip,
  VictoryVoronoiContainer,
  VictoryGroup,
} from 'victory';

// ---------------------------------------------------------------------------
// Zoom levels — mirrors frontend/utils/zoomLevels.ts
// ---------------------------------------------------------------------------
export interface ZoomLevel {
  label: string;
  rangeSec: number;
  intervalSec: number;
}

export const ZOOM_LEVELS: ZoomLevel[] = [
  { label: '10m', rangeSec: 600, intervalSec: 6 },
  { label: '30m', rangeSec: 1800, intervalSec: 18 },
  { label: '1h', rangeSec: 3600, intervalSec: 36 },
  { label: '2h', rangeSec: 7200, intervalSec: 72 },
  { label: '4h', rangeSec: 14400, intervalSec: 144 },
  { label: '8h', rangeSec: 28800, intervalSec: 288 },
  { label: '12h', rangeSec: 43200, intervalSec: 432 },
  { label: '24h', rangeSec: 86400, intervalSec: 864 },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface DataPoint {
  x: number; // timestamp (ms)
  y: number | null; // value (BPM, RPM, …), null indicates gap
}

export interface VitalsGraphProps {
  /** Array of {x: timestampMs, y: value} */
  data: DataPoint[];
  /** Current zoom level index (into ZOOM_LEVELS) */
  zoomIndex?: number;
  /** Called when user changes zoom via buttons */
  onZoomChange?: (index: number) => void;
  /** Called when user pans or zooms inside the graph */
  onDomainChange?: (domain: [number, number]) => void;
  /** Show zoom selector buttons */
  showZoomSelector?: boolean;
  /** Line colour */
  lineColor?: string;
  /** Area fill (gradient bottom) */
  areaColor?: string;
  /** Y-axis label (e.g. "BPM") */
  yAxisLabel?: string;
  /** Fixed Y domain — auto-computed from data if omitted */
  yDomain?: [number, number];
  /** Chart height in px */
  height?: number;
  /** Compact mode for the grid cards (smaller fonts, no zoom bar) */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers — mirrors frontend/utils/heartRateAggregation.ts
// ---------------------------------------------------------------------------

/**
 * Aggregate raw data points into time buckets, then fill gaps with null buckets.
 * This is the same algorithm as the React Native app's aggregateHeartRate().
 *
 * 1. Group all points into buckets of `intervalMs` width
 * 2. For each bucket: if it has valid values → average them; if only nulls → y=null
 * 3. Fill gaps between consecutive buckets: if gap > intervalMs*2, insert null buckets
 * 4. Return the result
 */
function aggregateAndFillGaps(
  data: DataPoint[],
  intervalMs: number,
): DataPoint[] {
  if (data.length === 0) return [];

  // Step 1: Group points into buckets
  const buckets = new Map<number, (number | null)[]>();

  for (const pt of data) {
    const bucketStart = Math.floor(pt.x / intervalMs) * intervalMs;
    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, []);
    }
    buckets.get(bucketStart)!.push(pt.y);
  }

  // Step 2: Aggregate each bucket
  const aggregatedPoints: DataPoint[] = [];
  const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

  for (const [bucketStart, values] of sortedBuckets) {
    const validValues = values.filter((v): v is number => v !== null && v > 0);

    if (validValues.length > 0) {
      // Bucket has valid data → compute average
      const avg = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
      aggregatedPoints.push({
        x: bucketStart + intervalMs / 2,
        y: Math.round(avg * 10) / 10,
      });
    } else {
      // Bucket contains only null/invalid values → gap bucket
      aggregatedPoints.push({
        x: bucketStart + intervalMs / 2,
        y: null,
      });
    }
  }

  // Step 3: Fill gaps between consecutive buckets
  // To avoid out-of-memory and infinite loops on large gaps (e.g. clock mismatch),
  // we only insert a single null point to break the line segment.
  const gapThreshold = intervalMs * 2;
  const filledPoints: DataPoint[] = [];

  for (let i = 0; i < aggregatedPoints.length; i++) {
    filledPoints.push(aggregatedPoints[i]);

    if (i < aggregatedPoints.length - 1) {
      const current = aggregatedPoints[i];
      const next = aggregatedPoints[i + 1];
      const gap = next.x - current.x;

      if (gap > gapThreshold) {
        // Just insert one null point to break the segment
        filledPoints.push({ x: current.x + intervalMs, y: null });
      }
    }
  }

  filledPoints.sort((a, b) => a.x - b.x);
  return filledPoints;
}

/**
 * Split a data array into continuous segments at null y values.
 * Web Victory doesn't have connectMissingData={false} like victory-native,
 * so we render each segment as a separate VictoryLine/VictoryArea.
 */
function splitIntoSegments(data: DataPoint[]): DataPoint[][] {
  const segments: DataPoint[][] = [];
  let current: DataPoint[] = [];

  for (const pt of data) {
    if (pt.y === null) {
      // End current segment if it has points
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    } else {
      current.push(pt);
    }
  }

  // Push last segment
  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function VitalsGraph({
  data,
  zoomIndex = 0,
  onZoomChange,
  onDomainChange,
  showZoomSelector = false,
  lineColor = '#ef4444',
  areaColor = 'rgba(239,68,68,0.12)',
  yAxisLabel = 'BPM',
  yDomain,
  height = 200,
  compact = false,
}: VitalsGraphProps) {
  const zoom = ZOOM_LEVELS[zoomIndex] ?? ZOOM_LEVELS[0];

  // Step 1: Aggregate ALL data into buckets and fill gaps (like mobile app)
  const aggregatedData = useMemo(() => {
    if (data.length === 0) return [];
    const intervalMs = zoom.intervalSec * 1000;
    return aggregateAndFillGaps(data, intervalMs);
  }, [data, zoom]);

  // Step 2: Filter aggregated data to the current zoom window for rendering
  const windowData = useMemo(() => {
    if (aggregatedData.length === 0) return [];

    // Find latest valid (non-null) timestamp
    let latest = 0;
    for (let i = aggregatedData.length - 1; i >= 0; i--) {
      if (aggregatedData[i].y !== null) {
        latest = aggregatedData[i].x;
        break;
      }
    }
    if (latest === 0) {
      latest = aggregatedData[aggregatedData.length - 1].x;
    }

    const rangeMs = zoom.rangeSec * 1000;
    const intervalMs = zoom.intervalSec * 1000;
    const windowStart = latest - rangeMs - intervalMs; // one interval padding

    return aggregatedData.filter((p) => p.x >= windowStart && p.x <= latest);
  }, [aggregatedData, zoom]);

  // Step 3: Split into continuous segments for rendering (web Victory gap handling)
  const segments = useMemo(() => {
    return splitIntoSegments(windowData);
  }, [windowData]);

  // All valid (non-null) points for tooltips
  const validPoints = useMemo(() => {
    return windowData.filter((p): p is DataPoint & { y: number } => p.y !== null);
  }, [windowData]);

  // X domain: latest rangeSec window based on valid points
  const xDomain = useMemo<[number, number]>(() => {
    const now = Date.now();
    if (validPoints.length === 0) return [now - zoom.rangeSec * 1000, now];
    const latest = Math.max(...validPoints.map((p) => p.x));
    return [latest - zoom.rangeSec * 1000, latest];
  }, [validPoints, zoom]);

  // Y domain: auto or fixed
  const computedYDomain = useMemo<[number, number]>(() => {
    if (yDomain) return yDomain;
    if (validPoints.length === 0) return [40, 120];
    const vals = validPoints.map((p) => p.y);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.15, 5);
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  }, [validPoints, yDomain]);

  const fontSize = compact ? 8 : 10;

  if (validPoints.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-gray-400 text-xs font-semibold"
        style={{ height }}
      >
        No Data Recorded
      </div>
    );
  }

  return (
    <div className="w-full" style={{ position: 'relative' }}>
      {/* Zoom selector */}
      {showZoomSelector && (
        <div className="flex items-center justify-center gap-1 mb-1">
          {ZOOM_LEVELS.map((zl, idx) => (
            <button
              key={zl.label}
              onClick={() => onZoomChange?.(idx)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                idx === zoomIndex
                  ? 'bg-[#0097b2] text-white shadow'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {zl.label}
            </button>
          ))}
        </div>
      )}

      <VictoryChart
        height={height}
        padding={
          compact
            ? { top: 8, bottom: 28, left: 36, right: 12 }
            : { top: 16, bottom: 36, left: 48, right: 16 }
        }
        domain={{ x: xDomain, y: computedYDomain }}
        containerComponent={
          compact ? (
            <VictoryVoronoiContainer
              voronoiDimension="x"
              labels={({ datum }: { datum: DataPoint }) =>
                datum.y !== null
                  ? `${Math.round(datum.y)} ${yAxisLabel}\n${formatTime(datum.x)}`
                  : ''
              }
              labelComponent={
                <VictoryTooltip
                  cornerRadius={4}
                  flyoutStyle={{
                    fill: 'rgba(0,0,0,0.85)',
                    stroke: lineColor,
                    strokeWidth: 1,
                  }}
                  style={{ fill: '#fff', fontSize: 9, fontFamily: 'monospace' }}
                  flyoutPadding={{ top: 4, bottom: 4, left: 8, right: 8 }}
                />
              }
            />
          ) : (
            <VictoryZoomContainer
              zoomDimension="x"
              zoomDomain={{ x: xDomain }}
              onZoomDomainChange={(domain) => {
                if (onDomainChange && domain.x) {
                  onDomainChange(domain.x as [number, number]);
                }
              }}
              allowPan
              allowZoom
            />
          )
        }
      >
        {/* X axis */}
        <VictoryAxis
          tickFormat={(t: number) => formatTime(t)}
          tickCount={compact ? 3 : 6}
          style={{
            axis: { stroke: '#e5e7eb' },
            tickLabels: {
              fontSize,
              fill: '#9ca3af',
              fontFamily: 'monospace',
            },
            grid: { stroke: '#f3f4f6', strokeDasharray: '4,4' },
          }}
        />

        {/* Y axis */}
        <VictoryAxis
          dependentAxis
          label={compact ? undefined : yAxisLabel}
          tickCount={compact ? 3 : 5}
          style={{
            axis: { stroke: '#e5e7eb' },
            tickLabels: {
              fontSize,
              fill: '#9ca3af',
              fontFamily: 'monospace',
            },
            axisLabel: {
              fontSize: 11,
              fill: '#6b7280',
              padding: 36,
            },
            grid: { stroke: '#f3f4f6', strokeDasharray: '4,4' },
          }}
        />

        {/* Render each continuous segment as a separate Area + Line */}
        {segments.map((segment, idx) => (
          <VictoryGroup key={`segment-${idx}`}>
            <VictoryArea
              data={segment}
              interpolation="monotoneX"
              style={{
                data: {
                  fill: areaColor,
                  stroke: 'none',
                },
              }}
            />
            <VictoryLine
              data={segment}
              interpolation="monotoneX"
              style={{
                data: {
                  stroke: lineColor,
                  strokeWidth: compact ? 1.5 : 2,
                  strokeLinecap: 'round',
                },
              }}
            />
          </VictoryGroup>
        ))}
      </VictoryChart>
    </div>
  );
}
