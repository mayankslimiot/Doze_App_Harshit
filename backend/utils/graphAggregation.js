const { getZoomLevel, getTimeWindow } = require('../config/zoomLevels');

/**
 * Downsample data points by averaging values within time intervals
 * @param {Array} dataPoints - Array of { timestamp, value } objects
 * @param {number} intervalSec - Aggregation interval in seconds
 * @returns {Array} Downsampled data points
 */
function downsampleData(dataPoints, intervalSec) {
  if (!dataPoints || dataPoints.length === 0) {
    return [];
  }

  const intervalMs = intervalSec * 1000;
  const buckets = new Map();

  // Group data points into time buckets
  dataPoints.forEach((point) => {
    const bucketKey = Math.floor(point.timestamp / intervalMs) * intervalMs;
    
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, []);
    }
    
    buckets.get(bucketKey).push(point.value);
  });

  // ✅ CRITICAL: Aggregate each bucket with gap handling
  // Rule: If bucket contains at least one valid HR → return average
  //       If bucket contains only null values → return y = null (GAP bucket)
  const downsampled = Array.from(buckets.entries())
    .map(([timestamp, values]) => {
      // Filter out null values to get valid heart rate points
      const validValues = values.filter(v => v !== null && v > 0);
      
      if (validValues.length > 0) {
        // Bucket has at least one valid HR → compute average
        return {
          timestamp: timestamp + intervalMs / 2, // Center of the bucket
          value: validValues.reduce((sum, val) => sum + val, 0) / validValues.length, // Average
        };
      } else {
        // Bucket contains only null values → this is a gap bucket
        return {
          timestamp: timestamp + intervalMs / 2,
          value: null, // Explicit gap indicator
        };
      }
    })
    .sort((a, b) => a.timestamp - b.timestamp); // Sort by timestamp

  return downsampled;
}

/**
 * Limit data points to maximum number by evenly sampling
 * @param {Array} dataPoints - Array of data points
 * @param {number} maxPoints - Maximum number of points
 * @returns {Array} Sampled data points
 */
function limitPoints(dataPoints, maxPoints) {
  if (dataPoints.length <= maxPoints) {
    return dataPoints;
  }

  // Take evenly spaced points
  const step = Math.ceil(dataPoints.length / maxPoints);
  return dataPoints.filter((_, index) => index % step === 0);
}

/**
 * Calculate Y-axis domain from data points
 * @param {Array} dataPoints - Array of { timestamp, value } objects
 * @returns {Object} { yMin, yMax }
 */
function calculateYDomain(dataPoints) {
  if (!dataPoints || dataPoints.length === 0) {
    return { yMin: 40, yMax: 150 }; // Default heart rate range
  }

  // ✅ CRITICAL: Only consider non-null values for domain calculation
  const values = dataPoints
    .map((p) => p.value)
    .filter((v) => v !== null && !isNaN(v) && isFinite(v) && v > 0);

  if (values.length === 0) {
    return { yMin: 40, yMax: 150 };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  
  // Fixed domain for heart rate (40-150 BPM)
  // This prevents axis jumping during live updates
  return { yMin: 40, yMax: 150 };
}

/**
 * Calculate Y-axis domain for respiration data points
 * @param {Array} dataPoints - Array of { timestamp, value } objects
 * @returns {Object} { yMin, yMax }
 */
function calculateRespirationYDomain(dataPoints) {
  if (!dataPoints || dataPoints.length === 0) {
    return { yMin: 0, yMax: 20 }; // Default respiration range
  }

  const values = dataPoints
    .map((p) => p.value)
    .filter((v) => !isNaN(v) && isFinite(v) && v > 0);

  if (values.length === 0) {
    return { yMin: 0, yMax: 20 };
  }
  
  // Fixed domain for respiration (0-20 Resp/Min)
  // This prevents axis jumping during live updates
  return { yMin: 0, yMax: 20 };
}

/**
 * Aggregate heart rate data for graph display
 * 
 * This function is the BACKEND-OWNED aggregation logic.
 * It handles:
 * - Processing all provided raw data (typically 24h for initial load)
 * - Downsampling based on zoom interval
 * - Point limiting for performance
 * - Domain calculation (X and Y axes)
 * - Viewport window (what part of data is visible by default)
 * 
 * Frontend receives the result directly and renders it without modification.
 * 
 * @param {Array} rawData - Raw health data from database (should be 24h for initial load)
 * @param {number} zoomIndex - Zoom level index (controls aggregation interval and viewport)
 * @param {Date} endTime - End time (optional, defaults to now)
 * @param {Object} viewportWindow - Optional viewport window { startTime, endTime } in ms
 * @param {string} timezone - Timezone string for formatting xLabel
 * @returns {Object} Graph-ready payload with points[], xDomain, yDomain, zoomLevel
 */
function aggregateHeartRateGraph(rawData, zoomIndex, endTime = null, viewportWindow = null, timezone = 'UTC') {
  const zoomLevel = getZoomLevel(zoomIndex);
  const { formatGraphXLabel } = require('./timezoneHelper');
  
  // Use provided viewport window, or calculate from zoom level
  const timeWindow = viewportWindow || getTimeWindow(zoomIndex, endTime);

  // Process ALL raw data (not filtered to time window)
  // This allows showing 24h of historical data even when zoom level is 10m
  // ✅ CRITICAL: Include null values (gaps) - they are important for graph visualization
  const dataPoints = rawData
    .filter((item) => {
      const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : null;
      if (!timestamp) return false;
      
      const heartRate = item.heartRate !== undefined ? item.heartRate : (item.hr !== undefined ? item.hr : item.bpm);
      
      // Include valid heart rates (0 < value < 250) AND null values (gaps)
      // Exclude invalid values (0, negative, or >= 250)
      if (heartRate === null) return true; // Include null gaps
      if (heartRate === 0) return false; // Exclude 0 (invalid)
      return heartRate > 0 && heartRate < 250; // Include valid range
    })
    .map((item) => {
      const heartRate = item.heartRate !== undefined ? item.heartRate : (item.hr !== undefined ? item.hr : item.bpm);
      return {
        timestamp: new Date(item.timestamp).getTime(),
        value: heartRate === null ? null : Number(heartRate), // Preserve null, convert valid values to number
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  // Downsample based on zoom level interval
  let processedPoints = downsampleData(dataPoints, zoomLevel.intervalSec);

  // Limit to max points (prevents performance issues with large datasets)
  // Note: This may limit 24h data, but zoom level's maxPoints should handle it
  processedPoints = limitPoints(processedPoints, zoomLevel.maxPoints);

  // Calculate domains
  // xDomain uses viewport window (zoom level's time range) - controls what's visible by default
  // But all processed points are returned, so frontend can show full 24h if user pans/zooms
  const xDomain = [timeWindow.startTime, timeWindow.endTime];
  const yDomain = calculateYDomain(processedPoints);

  return {
    points: processedPoints.map((p) => ({
      x: p.timestamp,
      xLabel: formatGraphXLabel(p.timestamp, timezone),
      y: p.value, // Can be null for gap buckets
    })),
    xDomain,
    yDomain: [yDomain.yMin, yDomain.yMax],
    zoomLevel: {
      index: zoomIndex,
      label: zoomLevel.label,
      rangeSec: zoomLevel.rangeSec,
    },
  };
}

/**
 * Aggregate respiration data for graph display
 * 
 * This function is the BACKEND-OWNED aggregation logic for respiration.
 * It handles:
 * - Processing all provided raw data (typically 24h for initial load)
 * - Downsampling based on zoom interval
 * - Point limiting for performance
 * - Domain calculation (X and Y axes)
 * - Viewport window (what part of data is visible by default)
 * 
 * Frontend receives the result directly and renders it without modification.
 * 
 * @param {Array} rawData - Raw health data from database (should be 24h for initial load)
 * @param {number} zoomIndex - Zoom level index (controls aggregation interval and viewport)
 * @param {Date} endTime - End time (optional, defaults to now)
 * @param {Object} viewportWindow - Optional viewport window { startTime, endTime } in ms
 * @param {string} timezone - Timezone string for formatting xLabel
 * @returns {Object} Graph-ready payload with points[], xDomain, yDomain, zoomLevel
 */
function aggregateRespirationGraph(rawData, zoomIndex, endTime = null, viewportWindow = null, timezone = 'UTC') {
  const zoomLevel = getZoomLevel(zoomIndex);
  const { formatGraphXLabel } = require('./timezoneHelper');
  
  // Use provided viewport window, or calculate from zoom level
  const timeWindow = viewportWindow || getTimeWindow(zoomIndex, endTime);

  // Process ALL raw data (not filtered to time window)
  // This allows showing 24h of historical data even when zoom level is 10m
  const dataPoints = rawData
    .filter((item) => {
      const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : null;
      const respiration = item.respiration || item.resp || item.bpm;
      return (
        timestamp &&
        respiration != null &&
        respiration > 0 &&
        respiration < 50 // Respiration typically 0-50 breaths/min
      );
    })
    .map((item) => ({
      timestamp: new Date(item.timestamp).getTime(),
      value: Number(item.respiration || item.resp || item.bpm),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  // Downsample based on zoom level interval
  let processedPoints = downsampleData(dataPoints, zoomLevel.intervalSec);

  // Limit to max points (prevents performance issues with large datasets)
  // Note: This may limit 24h data, but zoom level's maxPoints should handle it
  processedPoints = limitPoints(processedPoints, zoomLevel.maxPoints);

  // Calculate domains
  // xDomain uses viewport window (zoom level's time range) - controls what's visible by default
  // But all processed points are returned, so frontend can show full 24h if user pans/zooms
  const xDomain = [timeWindow.startTime, timeWindow.endTime];
  const yDomain = calculateRespirationYDomain(processedPoints);

  return {
    points: processedPoints.map((p) => ({
      x: p.timestamp,
      xLabel: formatGraphXLabel(p.timestamp, timezone),
      y: Math.round(p.value * 10) / 10, // Round to 1 decimal place
    })),
    xDomain,
    yDomain: [yDomain.yMin, yDomain.yMax],
    zoomLevel: {
      index: zoomIndex,
      label: zoomLevel.label,
      rangeSec: zoomLevel.rangeSec,
    },
  };
}

/**
 * Calculate Y-axis domain for environmental data (temperature, humidity, VOC, etc.)
 * @param {string} metric - Metric name (temperature, humidity, voc, co2)
 * @param {Array} dataPoints - Array of { timestamp, value } objects
 * @returns {Object} { yMin, yMax }
 */
function calculateEnvironmentalYDomain(metric, dataPoints) {
  const defaults = {
    temperature: { yMin: 10, yMax: 45 },
    humidity: { yMin: 0, yMax: 100 },
    voc: { yMin: 0, yMax: 1200 },
    co2: { yMin: 0, yMax: 5000 },
  };

  const fallback = defaults[metric] || { yMin: 0, yMax: 100 };
  if (!dataPoints || dataPoints.length === 0) return fallback;

  const values = dataPoints
    .map((p) => p.value)
    .filter((v) => v !== null && !isNaN(v) && isFinite(v));

  if (values.length === 0) return fallback;

  // Use fixed ranges for stability (prevents axis jumping during live updates)
  return fallback;
}

/**
 * Aggregate environmental metric data for graph display.
 * Works for temperature, humidity, VOC, CO2, etc.
 *
 * @param {Array} rawData - Raw health data from database
 * @param {string} fieldName - DB field name (e.g. 'temperature', 'humidity', 'voc')
 * @param {number} zoomIndex - Zoom level index
 * @param {number} maxValid - Maximum plausible reading (filter outliers)
 * @param {Date} endTime - End time (optional)
 * @param {Object} viewportWindow - Optional { startTime, endTime } in ms
 * @param {string} timezone - Timezone string for formatting xLabel
 * @returns {Object} Graph-ready payload
 */
function aggregateEnvironmentalGraph(rawData, fieldName, zoomIndex, maxValid = 200, endTime = null, viewportWindow = null, timezone = 'UTC') {
  const zoomLevel = getZoomLevel(zoomIndex);
  const { formatGraphXLabel } = require('./timezoneHelper');
  const timeWindow = viewportWindow || getTimeWindow(zoomIndex, endTime);

  const dataPoints = rawData
    .filter((item) => {
      const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : null;
      if (!timestamp) return false;
      const val = item[fieldName];
      if (val === null || val === undefined) return false;
      return val >= 0 && val < maxValid;
    })
    .map((item) => ({
      timestamp: new Date(item.timestamp).getTime(),
      value: Number(item[fieldName]),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  let processedPoints = downsampleData(dataPoints, zoomLevel.intervalSec);
  processedPoints = limitPoints(processedPoints, zoomLevel.maxPoints);

  const xDomain = [timeWindow.startTime, timeWindow.endTime];
  const yDomain = calculateEnvironmentalYDomain(fieldName, processedPoints);

  return {
    points: processedPoints.map((p) => ({
      x: p.timestamp,
      xLabel: formatGraphXLabel(p.timestamp, timezone),
      y: p.value !== null ? Math.round(p.value * 100) / 100 : null, // 2 decimal places
    })),
    xDomain,
    yDomain: [yDomain.yMin, yDomain.yMax],
    zoomLevel: {
      index: zoomIndex,
      label: zoomLevel.label,
      rangeSec: zoomLevel.rangeSec,
    },
  };
}

module.exports = {
  downsampleData,
  limitPoints,
  calculateYDomain,
  calculateRespirationYDomain,
  calculateEnvironmentalYDomain,
  aggregateHeartRateGraph,
  aggregateRespirationGraph,
  aggregateEnvironmentalGraph,
};
