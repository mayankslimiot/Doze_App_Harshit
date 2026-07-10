/**
 * Heart-rate-based refinement of sleep onset and wake-up within the in-bed window.
 * Does not change bed boundaries (TIB); only refines sleepStart and wakeTime using
 * an adaptive baseline HR approach. Consumes already processed data (AS/HV filtered).
 *
 * Adaptive Baseline Approach:
 * - Initial baseline: 1-minute average of first in-bed data points (for sleep onset)
 * - Sliding window: 10 points, dropping first point each step
 * - Adaptive baseline: max(previous baseline, current window average)
 * - Sleep threshold = 91% of current max baseline
 * - Sleep onset: first time window average < threshold (forward)
 * - Wake baseline: 1-minute average of last in-bed data points (for wake-up)
 * - Wake threshold = 91% of current max baseline
 * - Wake-up: first time window average ≥ threshold (backward)
 */

const HR_THRESHOLD_RATIO = 0.91;
const BASELINE_WINDOW_MS = 60 * 1000; // ~1 minute for initial baseline HR
const SLIDING_WINDOW_SIZE = 10; // Number of points in sliding window
const MIN_VALID_POINTS = 10;
const WAKE_BASELINE_INDEX_FROM_END = 10; // 10th record from end

/**
 * Refine sleep onset and wake-up timestamps using heart rate dynamics.
 *
 * @param {Array<{timestamp: number, AS: number|null, HV: number|null, heartRate: number|null}>} dataPoints - Processed points (timestamp in ms)
 * @param {number} tibStartMs - Time in bed start (ms)
 * @param {number} tibEndMs - Time in bed end (ms)
 * @param {number} sleepOnsetTimeMs - Current sleep onset (ms)
 * @param {number} sleepEndTimeMs - Current sleep end (ms)
 * @returns {{ refinedSleepOnsetTime: number, refinedSleepEndTime: number } | null} Refined timestamps in ms, or null if refinement not applicable
 */
function refineSleepTimestampsByHeartRate(
  dataPoints,
  tibStartMs,
  tibEndMs,
  sleepOnsetTimeMs,
  sleepEndTimeMs
) {
  if (
    !Array.isArray(dataPoints) ||
    dataPoints.length === 0 ||
    typeof tibStartMs !== "number" ||
    !Number.isFinite(tibStartMs) ||
    typeof tibEndMs !== "number" ||
    !Number.isFinite(tibEndMs) ||
    typeof sleepOnsetTimeMs !== "number" ||
    !Number.isFinite(sleepOnsetTimeMs) ||
    typeof sleepEndTimeMs !== "number" ||
    !Number.isFinite(sleepEndTimeMs)
  ) {
    return null;
  }

  if (tibEndMs <= tibStartMs || sleepEndTimeMs <= sleepOnsetTimeMs) {
    return null;
  }

  // Restrict to in-bed window with valid heart rate (AS=1, HV=1, heartRate valid)
  const inBedWithHR = dataPoints
    .filter((p) => {
      const t = p && typeof p.timestamp === "number" && Number.isFinite(p.timestamp) ? p.timestamp : null;
      const as = p && (p.AS === 1 || p.AS === "1");
      const hv = true;
      const hr = p && typeof p.heartRate === "number" && Number.isFinite(p.heartRate) && p.heartRate > 0;
      return t !== null && t >= tibStartMs && t <= tibEndMs && as && hv && hr;
    })
    .map((p) => ({ timestamp: p.timestamp, heartRate: Number(p.heartRate) }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (inBedWithHR.length < MIN_VALID_POINTS) {
    return null;
  }

  // --- Initial baseline wake HR (from start of dataset, ~1 min or one block) ---
  const baselineEndMs = inBedWithHR[0].timestamp + BASELINE_WINDOW_MS;
  const baselinePoints = inBedWithHR.filter((p) => p.timestamp < baselineEndMs);
  const initialBaselinePoints = baselinePoints.length >= 3 ? baselinePoints : inBedWithHR.slice(0, Math.min(12, inBedWithHR.length));
  let adaptiveBaselineHR =
    initialBaselinePoints.reduce((sum, p) => sum + p.heartRate, 0) / initialBaselinePoints.length;

  if (!Number.isFinite(adaptiveBaselineHR) || adaptiveBaselineHR <= 0) {
    return null;
  }

  // --- Sleep onset: Adaptive baseline sliding window approach ---
  // Start with initial baseline, then slide through data with 10-point windows
  // Update baseline to max(previous baseline, current window avg)
  // Sleep detected when window avg < (91% of max baseline)
  let refinedSleepOnsetTime = null;
  
  // Need at least SLIDING_WINDOW_SIZE points to start sliding window
  if (inBedWithHR.length >= SLIDING_WINDOW_SIZE) {
    // Slide window through data: points [i, i+SLIDING_WINDOW_SIZE-1]
    // Each step drops first point and adds next point
    for (let i = 0; i <= inBedWithHR.length - SLIDING_WINDOW_SIZE; i++) {
      // Get current window: points from index i to i+SLIDING_WINDOW_SIZE-1
      const windowPoints = inBedWithHR.slice(i, i + SLIDING_WINDOW_SIZE);
      
      if (windowPoints.length < SLIDING_WINDOW_SIZE) {
        continue;
      }
      
      // Calculate average of current window
      const windowAvgHR = windowPoints.reduce((sum, p) => sum + p.heartRate, 0) / windowPoints.length;
      
      if (!Number.isFinite(windowAvgHR) || windowAvgHR <= 0) {
        continue;
      }
      
      // Update adaptive baseline: max(previous baseline, current window avg)
      adaptiveBaselineHR = Math.max(adaptiveBaselineHR, windowAvgHR);
      
      // Calculate target threshold (9% drop = 91% of max baseline)
      const sleepThreshold = HR_THRESHOLD_RATIO * adaptiveBaselineHR;
      
      // Check if current window average is below threshold (sleep detected)
      if (windowAvgHR < sleepThreshold) {
        // Use the timestamp of the first point in the window as sleep onset
        refinedSleepOnsetTime = windowPoints[0].timestamp;
        break;
      }
    }
  }

  if (refinedSleepOnsetTime === null) {
    return null;
  }

  refinedSleepOnsetTime = Math.max(tibStartMs, Math.min(sleepEndTimeMs, refinedSleepOnsetTime));

  // --- Wake-up: Adaptive baseline sliding window approach (backward) ---
  // Start with initial baseline from end, then slide backward through data with 10-point windows
  // Update baseline to max(previous baseline, current window avg)
  // Wake-up detected when window avg >= (91% of max baseline)
  let refinedSleepEndTime = null;
  
  // Need at least SLIDING_WINDOW_SIZE points to start sliding window
  if (inBedWithHR.length >= SLIDING_WINDOW_SIZE) {
    // Initial wake baseline: from end of dataset (~1 min or last few points)
    const baselineStartMs = inBedWithHR[inBedWithHR.length - 1].timestamp - BASELINE_WINDOW_MS;
    const baselinePointsEnd = inBedWithHR.filter((p) => p.timestamp > baselineStartMs);
    const initialWakeBaselinePoints = baselinePointsEnd.length >= 3 
      ? baselinePointsEnd 
      : inBedWithHR.slice(Math.max(0, inBedWithHR.length - 12), inBedWithHR.length);
    
    let adaptiveWakeBaselineHR = initialWakeBaselinePoints.reduce((sum, p) => sum + p.heartRate, 0) / initialWakeBaselinePoints.length;
    
    if (!Number.isFinite(adaptiveWakeBaselineHR) || adaptiveWakeBaselineHR <= 0) {
      return null;
    }
    
    // Slide window backward through data
    // Start from end and slide backward: window [i-SLIDING_WINDOW_SIZE+1, i]
    // Each step moves window backward by one point
    // Stop when we reach sleep onset time
    const minIndex = SLIDING_WINDOW_SIZE - 1;
    
    for (let i = inBedWithHR.length - 1; i >= minIndex; i--) {
      // Get current window: points from index (i - SLIDING_WINDOW_SIZE + 1) to i
      const windowStartIdx = i - SLIDING_WINDOW_SIZE + 1;
      const windowPoints = inBedWithHR.slice(windowStartIdx, i + 1);
      
      if (windowPoints.length < SLIDING_WINDOW_SIZE) {
        continue;
      }
      
      // Skip if window is before sleep onset
      if (windowPoints[0].timestamp < refinedSleepOnsetTime) {
        break; // Stop if we've gone past sleep onset
      }
      
      // Calculate average of current window
      const windowAvgHR = windowPoints.reduce((sum, p) => sum + p.heartRate, 0) / windowPoints.length;
      
      if (!Number.isFinite(windowAvgHR) || windowAvgHR <= 0) {
        continue;
      }
      
      // Update adaptive baseline: max(previous baseline, current window avg)
      adaptiveWakeBaselineHR = Math.max(adaptiveWakeBaselineHR, windowAvgHR);
      
      // Calculate target threshold (9% drop = 91% of max baseline)
      const wakeThreshold = HR_THRESHOLD_RATIO * adaptiveWakeBaselineHR;
      
      // Check if current window average is above threshold (wake-up detected)
      if (windowAvgHR >= wakeThreshold) {
        // Find the chronologically FIRST point in this window that crosses threshold
        // Window points are sorted chronologically: [oldest ... newest]
        // Iterate forward to find the first point >= threshold
        let wakeUpPointFound = null;
        for (let j = 0; j < windowPoints.length; j++) {
          if (windowPoints[j].heartRate >= wakeThreshold) {
            wakeUpPointFound = windowPoints[j];
            // Found the first point that crossed threshold - this is wake-up time
            break;
          }
        }
        
        // If we found a point that crossed threshold, use it
        // Otherwise, use the first point of the window (oldest point in window)
        // This fallback ensures we don't return null unnecessarily
        if (wakeUpPointFound !== null) {
          refinedSleepEndTime = wakeUpPointFound.timestamp;
        } else {
          // Fallback: use first point of window (shouldn't happen if window avg >= threshold)
          refinedSleepEndTime = windowPoints[0].timestamp;
        }
        break;
      }
    }
  }

  if (refinedSleepEndTime === null) {
    return null;
  }

  refinedSleepEndTime = Math.max(
    refinedSleepOnsetTime,
    Math.min(tibEndMs, refinedSleepEndTime)
  );

  if (refinedSleepEndTime <= refinedSleepOnsetTime) {
    return null;
  }

  return {
    refinedSleepOnsetTime,
    refinedSleepEndTime,
  };
}

module.exports = {
  refineSleepTimestampsByHeartRate,
  HR_THRESHOLD_RATIO,
  BASELINE_WINDOW_MS,
  SLIDING_WINDOW_SIZE,
  MIN_VALID_POINTS,
  WAKE_BASELINE_INDEX_FROM_END,
};
