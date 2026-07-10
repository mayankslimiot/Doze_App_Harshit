/**
 * Sparse Categorical Data Normalizer
 * Converts raw stress data points into sparse categorical format for Victory charts
 * Only includes timestamps where data actually exists (no interpolated times)
 */

export interface SparseCategoricalPoint {
  x: string; // Categorical label (e.g., "10:09 AM")
  y: number; // Stress value
  timestamp: number; // Original timestamp for tooltip
  index: number; // Position index (0, 1, 2, ...)
}

export interface SparseCategoricalDataset {
  points: SparseCategoricalPoint[];
  totalBars: number;
  barWidth: number;
  chartWidth: number;
}

const BAR_SLOT_WIDTH = 60; // Width per bar slot (bar + gap)
const VISIBLE_BARS = 10; // Number of bars visible at once
const VIEWPORT_WIDTH = VISIBLE_BARS * BAR_SLOT_WIDTH;

/**
 * Format timestamp as categorical label
 */
function formatCategoricalLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes.toString().padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

/**
 * Normalize raw stress data into sparse categorical dataset
 * Removes duplicates, sorts by timestamp, creates categorical labels
 */
export function normalizeSparseCategoricalData(
  rawPoints: Array<{ x: number; y: number }>
): SparseCategoricalDataset {
  if (rawPoints.length === 0) {
    return {
      points: [],
      totalBars: 0,
      barWidth: BAR_SLOT_WIDTH * 0.6, // 60% of slot width
      chartWidth: VIEWPORT_WIDTH,
    };
  }

  // Step 1: Remove duplicates (same timestamp) and invalid points
  const uniquePoints = new Map<number, number>();
  for (const point of rawPoints) {
    if (point.y > 0 && point.y <= 100 && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      const timestamp = Math.round(point.x); // Round to avoid floating point issues
      // Keep the latest value if duplicate timestamp exists
      if (!uniquePoints.has(timestamp) || uniquePoints.get(timestamp)! < point.y) {
        uniquePoints.set(timestamp, point.y);
      }
    }
  }

  // Step 2: Sort by timestamp ascending
  const sortedEntries = Array.from(uniquePoints.entries()).sort((a, b) => a[0] - b[0]);

  // Step 3: Create categorical points
  const points: SparseCategoricalPoint[] = sortedEntries.map(([timestamp, value], index) => ({
    x: formatCategoricalLabel(timestamp),
    y: value,
    timestamp,
    index,
  }));

  const totalBars = points.length;
  const barWidth = BAR_SLOT_WIDTH * 0.6; // 60% of slot width for bar, 40% for gap
  const chartWidth = Math.max(VIEWPORT_WIDTH, totalBars * BAR_SLOT_WIDTH);

  return {
    points,
    totalBars,
    barWidth,
    chartWidth,
  };
}

/**
 * Get visible slice of dataset based on scroll position
 */
export function getVisibleSlice(
  dataset: SparseCategoricalDataset,
  scrollOffset: number
): {
  visiblePoints: SparseCategoricalPoint[];
  startIndex: number;
  endIndex: number;
} {
  if (dataset.points.length === 0) {
    return { visiblePoints: [], startIndex: 0, endIndex: 0 };
  }

  // Calculate which bars are visible based on scroll offset
  const startBarIndex = Math.floor(scrollOffset / BAR_SLOT_WIDTH);
  const endBarIndex = Math.min(
    dataset.totalBars - 1,
    startBarIndex + VISIBLE_BARS - 1
  );

  const visiblePoints = dataset.points.slice(
    Math.max(0, startBarIndex),
    Math.min(dataset.totalBars, endBarIndex + 1)
  );

  return {
    visiblePoints,
    startIndex: Math.max(0, startBarIndex),
    endIndex: Math.min(dataset.totalBars - 1, endBarIndex),
  };
}

/**
 * Calculate scroll position to show latest N bars
 */
export function getScrollToLatestPosition(dataset: SparseCategoricalDataset): number {
  if (dataset.totalBars <= VISIBLE_BARS) {
    return 0; // All bars fit, no scroll needed
  }
  // Scroll to show last VISIBLE_BARS bars
  return (dataset.totalBars - VISIBLE_BARS) * BAR_SLOT_WIDTH;
}

/**
 * Check if user is at the latest position (within threshold)
 */
export function isAtLatestPosition(
  scrollOffset: number,
  dataset: SparseCategoricalDataset,
  threshold: number = 10
): boolean {
  const latestPosition = getScrollToLatestPosition(dataset);
  return Math.abs(scrollOffset - latestPosition) < threshold;
}
