/**
 * Backend zoom level configuration
 * 
 * This is the SINGLE SOURCE OF TRUTH for zoom levels.
 * All aggregation, downsampling, and time window calculations use these values.
 * 
 * Frontend should import and use these same values to ensure consistency.
 * 
 * Architecture:
 * - Backend owns: time slicing, downsampling, axis domains
 * - Frontend owns: rendering only (receives graph-ready data from backend)
 */
const ZOOM_LEVELS = [
  { index: 0, label: '10m', rangeSec: 600, intervalSec: 6, maxPoints: 120 }, // 10 minutes, 6 sec intervals
  { index: 1, label: '30m', rangeSec: 1800, intervalSec: 18, maxPoints: 120 }, // 30 minutes, 18 sec intervals
  { index: 2, label: '1h', rangeSec: 3600, intervalSec: 36, maxPoints: 120 }, // 1 hour, 36 sec intervals
  { index: 3, label: '2h', rangeSec: 7200, intervalSec: 72, maxPoints: 120 }, // 2 hours, 72 sec intervals
  { index: 4, label: '4h', rangeSec: 14400, intervalSec: 144, maxPoints: 120 }, // 4 hours, 144 sec intervals
  { index: 5, label: '8h', rangeSec: 28800, intervalSec: 288, maxPoints: 120 }, // 8 hours, 288 sec intervals
  { index: 6, label: '12h', rangeSec: 43200, intervalSec: 432, maxPoints: 120 }, // 12 hours, 432 sec intervals
  { index: 7, label: '24h', rangeSec: 86400, intervalSec: 864, maxPoints: 120 }, // 24 hours, 864 sec intervals
];

/**
 * Get zoom level by index
 */
function getZoomLevel(index) {
  if (index < 0 || index >= ZOOM_LEVELS.length) {
    return ZOOM_LEVELS[0]; // Default to first level
  }
  return ZOOM_LEVELS[index];
}

/**
 * Calculate time window for a zoom level
 * @param {number} zoomIndex - Zoom level index
 * @param {Date} endTime - End time (defaults to now)
 * @returns {Object} { startTime, endTime } in milliseconds
 */
function getTimeWindow(zoomIndex, endTime = null) {
  const zoomLevel = getZoomLevel(zoomIndex);
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const start = end - (zoomLevel.rangeSec * 1000);
  
  return {
    startTime: start,
    endTime: end,
    rangeMs: zoomLevel.rangeSec * 1000,
  };
}

module.exports = {
  ZOOM_LEVELS,
  getZoomLevel,
  getTimeWindow,
};

