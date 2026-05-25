const HealthData = require("../models/HealthData");
const SleepSession = require("../models/SleepSession");
const { logger } = require("../utils/logger");
const { pairMotionEvents, sortMotionDataChronologically } = require("../utils/motionPairing");
const { refineSleepTimestampsByHeartRate } = require("../utils/sleepHeartRateRefinement");

// Constants
const MIN_SLEEP_DURATION_MINUTES = 180; // 3 hours minimum
const SLEEP_START_CONFIRMATION_MINUTES = 180; // 3 hours to confirm sleep start
const SLEEP_END_CONFIRMATION_MINUTES = 30; // 30 minutes to confirm sleep end
const DEVICE_OFF_GAP_MINUTES = 30; // Gap >= this = device likely off; ignore sleep points after it for wake-up
const MAX_TIB_START_BEFORE_ONSET_MINUTES = 4 * 60; // 4 hours - if first AS=1 is older, it's a different in-bed period (e.g. afternoon nap)
const MAX_MISSING_DATA_PERCENT = 10; // 10% missing data allowed
const MIN_DATA_QUALITY_PERCENT = 90; // 90% valid data required
const MIN_DATA_GAP_MINUTES = 2; // Minimum data gap to subtract from TST (gaps >= 2 min are unknown time)

/**
 * Split data points into contiguous segments separated by long gaps (e.g. device off).
 * Used to pick the "latest" segment in the query window (main overnight sleep) when
 * there are multiple blocks (e.g. afternoon nap then gap then night sleep).
 * @param {Array} dataPoints - Array of { timestamp, AS, HV, ... }
 * @param {number} gapMinutes - Gap >= this (minutes) starts a new segment
 * @returns {Array<{ startIndex: number, endIndex: number }>} Segments by start/end index (inclusive)
 */
function splitDataByLongGaps(dataPoints, gapMinutes) {
  if (!dataPoints || dataPoints.length === 0) return [];
  const gapMs = gapMinutes * 60 * 1000;
  const segments = [];
  let startIndex = 0;
  for (let i = 1; i < dataPoints.length; i++) {
    const gap = dataPoints[i].timestamp - dataPoints[i - 1].timestamp;
    if (gap >= gapMs) {
      segments.push({ startIndex, endIndex: i - 1 });
      startIndex = i;
    }
  }
  segments.push({ startIndex, endIndex: dataPoints.length - 1 });
  return segments;
}

/**
 * Calculate sleep session from HealthData
 * @param {string} deviceId - Device ID
 * @param {Date} startDate - Start date for data query
 * @param {Date} endDate - End date for data query
 * @param {string} queryDate - Query date in YYYY-MM-DD format (used as sessionDate - sleep end date)
 * @returns {Promise<Object|null>} Sleep session object or null if invalid
 */
async function calculateSleepSession(deviceId, startDate, endDate, queryDate) {
  try {
    // Log query range
    logger.info(`[SleepAnalytics] Querying sleep session for device ${deviceId}`, {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      startDateIST: new Date(startDate.getTime() + 5.5 * 60 * 60 * 1000).toISOString(),
      endDateIST: new Date(endDate.getTime() + 5.5 * 60 * 60 * 1000).toISOString()
    });

    // Fetch health data for the date range
    const { getTimeFilter, getSanitizedEpochSeconds } = require('../utils/timeFilterHelper');
    const timeFilter = getTimeFilter(startDate.getTime(), endDate.getTime());
    
    const healthData = await HealthData.find({
      deviceId: deviceId,
      ...timeFilter
    })
      .sort({ timestampSeconds: 1, timestamp: 1 }) // Oldest first
      .select("timestamp timestampSeconds absenceStart heartRate motionStart motionEndReason raw")
      .lean();

    if (!healthData || healthData.length === 0) {
      logger.info(`[SleepAnalytics] No health data found for device ${deviceId}`, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
      return null;
    }

    logger.info(`[SleepAnalytics] Found ${healthData.length} health data points for device ${deviceId}`, {
      firstTimestamp: healthData[0]?.timestamp,
      lastTimestamp: healthData[healthData.length - 1]?.timestamp
    });

    // Process data points
    const dataPoints = healthData.map(point => ({
      timestamp: getSanitizedEpochSeconds(point) * 1000,
      AS: point.absenceStart !== undefined ? Number(point.absenceStart) : null,
      HV: point.raw?.HV !== undefined ? Number(point.raw.HV) : null,
      heartRate: point.heartRate !== null && point.heartRate > 0 ? Number(point.heartRate) : null,
      motionStart: point.motionStart !== undefined && point.motionStart !== null ? Number(point.motionStart) : null,
      motionEndReason: point.motionEndReason !== undefined && point.motionEndReason !== null ? Number(point.motionEndReason) : null
    }));

    // Count data point types
    const as1Count = dataPoints.filter(p => p.AS === 1).length;
    const hv1Count = dataPoints.filter(p => p.HV === 1).length;
    const sleepCount = dataPoints.filter(p => p.AS === 1 && p.HV === 1).length;
    logger.info(`[SleepAnalytics] Data point analysis for device ${deviceId}`, {
      totalPoints: dataPoints.length,
      as1Count,
      hv1Count,
      sleepCount: sleepCount,
      sleepPercentage: ((sleepCount / dataPoints.length) * 100).toFixed(2) + '%'
    });

    // Split by long gaps (e.g. >= 30 min). If there are multiple segments within the window,
    // evaluate each in time order and always keep the most recent *valid* one:
    // - For each segment, run detection + validation on that segment only.
    // - If it yields a valid session, it becomes the current candidate.
    // - If it does not, keep whatever valid session we already had.
    // Final result: the latest segment that actually contains valid sleep is used.
    const segments = splitDataByLongGaps(dataPoints, DEVICE_OFF_GAP_MINUTES);
    let sleepSession = null;
    if (segments.length > 1) {
      segments.forEach((segment, index) => {
        const segDataPoints = dataPoints.slice(segment.startIndex, segment.endIndex + 1);
        const segHealthData = healthData.slice(segment.startIndex, segment.endIndex + 1);
        const segSession = detectSleepSession(segDataPoints, deviceId, segHealthData, queryDate);

        if (segSession && validateSleepSession(segSession)) {
          sleepSession = segSession;
          logger.info(
            `[SleepAnalytics] Multiple segments (${segments.length}); segment #${index} has valid sleep, selecting it for device ${deviceId}`,
            {
              segmentIndex: index,
              segmentPoints: segDataPoints.length,
              firstTimestamp: new Date(segDataPoints[0].timestamp).toISOString(),
              lastTimestamp: new Date(segDataPoints[segDataPoints.length - 1].timestamp).toISOString()
            }
          );
        }
      });
    } else {
      sleepSession = detectSleepSession(dataPoints, deviceId, healthData, queryDate);
    }

    if (!sleepSession) {
      logger.info(`[SleepAnalytics] No valid sleep session detected for device ${deviceId}`, {
        dataPointsCount: dataPoints.length,
        sleepPointsCount: sleepCount
      });
      return null;
    }

  // Validate sleep session
  if (!validateSleepSession(sleepSession)) {
    logger.info(`[SleepAnalytics] Sleep session failed validation for device ${deviceId}`, {
      totalSleepTime: sleepSession.totalSleepTime,
      minRequired: MIN_SLEEP_DURATION_MINUTES,
      dataQuality: sleepSession.dataQuality,
      minRequiredQuality: MIN_DATA_QUALITY_PERCENT
    });
    return null;
  }

  logger.info(`[SleepAnalytics] Sleep session successfully detected and validated for device ${deviceId}`, {
    sessionDate: sleepSession.sessionDate,
    totalSleepTime: sleepSession.totalSleepTime,
    sleepEfficiency: sleepSession.sleepEfficiency,
    dataQuality: sleepSession.dataQuality,
    sleepScore: sleepSession.sleepScore
  });

    return sleepSession;
  } catch (error) {
    logger.err(error, { where: "calculateSleepSession", deviceId });
    return null;
  }
}

/**
 * Detect sleep session from data points
 * @param {Array} dataPoints - Array of {timestamp, AS, HV, heartRate, motionStart, motionEndReason}
 * @param {string} deviceId - Device ID
 * @param {Array} healthData - Raw health data array for motion analysis
 * @param {string} queryDate - Query date in YYYY-MM-DD format (used as sessionDate - sleep end date)
 * @returns {Object|null} Sleep session object or null
 */
function detectSleepSession(dataPoints, deviceId, healthData, queryDate) {
  if (!dataPoints || dataPoints.length === 0) {
    logger.info(`[SleepAnalytics] detectSleepSession: No data points provided for device ${deviceId}`);
    return null;
  }

  logger.info(`[SleepAnalytics] detectSleepSession: Starting detection for device ${deviceId}`, {
    dataPointsCount: dataPoints.length,
    firstTimestamp: new Date(dataPoints[0].timestamp).toISOString(),
    lastTimestamp: new Date(dataPoints[dataPoints.length - 1].timestamp).toISOString()
  });

  let tibStart = null; // Time in Bed start
  let sleepOnsetTime = null; // Actual sleep start
  let sleepEndTime = null; // Last sleep point
  let finalWakeUpTime = null; // Confirmed wake-up
  let tibEnd = null; // Time in Bed end

  let lastSleepPoint = null;
  let lastDataPoint = null;

  const sleepPeriods = []; // Array of {start, end} periods where AS=1 AND HV=1
  const wakePeriods = []; // Array of {start, end} periods where AS=1 but HV=0
  const outOfBedPeriods = []; // Array of {start, end} periods where AS=0

  let currentSleepPeriod = null;
  let currentWakePeriod = null;
  let currentOutOfBedPeriod = null;

  // Calculate average data interval (for expected points calculation)
  const intervals = [];
  for (let i = 1; i < dataPoints.length; i++) {
    const interval = (dataPoints[i].timestamp - dataPoints[i - 1].timestamp) / (1000 * 60); // minutes
    if (interval > 0 && interval < 60) { // Valid interval (0-60 minutes)
      intervals.push(interval);
    }
  }
  const avgIntervalMinutes = intervals.length > 0
    ? intervals.reduce((sum, val) => sum + val, 0) / intervals.length
    : 1; // Default to 1 minute if no valid intervals

  // Process each data point
  for (let i = 0; i < dataPoints.length; i++) {
    const point = dataPoints[i];
    const isSleeping = point.AS === 1 && point.HV === 1;
    const isInBedNotSleeping = point.AS === 1 && point.HV !== 1;
    const isOutOfBed = point.AS === 0;

    // Track TIB start (first AS=1)
    if (tibStart === null && point.AS === 1) {
      tibStart = point.timestamp;
      logger.info(`[SleepAnalytics] TIB start detected for device ${deviceId}`, {
        tibStart: new Date(tibStart).toISOString(),
        pointIndex: i,
        as: point.AS,
        hv: point.HV
      });
    }

    // Track sleep periods (for TST calculation)
    if (isSleeping) {
      if (currentSleepPeriod === null) {
        currentSleepPeriod = { start: point.timestamp, end: point.timestamp };
        sleepPeriods.push(currentSleepPeriod);
      } else {
        currentSleepPeriod.end = point.timestamp;
      }
      lastSleepPoint = point;
    } else {
      // Not sleeping - check if we should end current sleep period
      if (currentSleepPeriod !== null) {
        const minutesSinceLastSleep = lastSleepPoint
          ? (point.timestamp - lastSleepPoint.timestamp) / (1000 * 60)
          : 0;

        // If gap > 30 minutes, end sleep period
        if (minutesSinceLastSleep >= SLEEP_END_CONFIRMATION_MINUTES) {
          sleepEndTime = lastSleepPoint.timestamp;
          logger.info(`[SleepAnalytics] Sleep end detected for device ${deviceId}`, {
            sleepEndTime: new Date(sleepEndTime).toISOString(),
            lastSleepPoint: new Date(lastSleepPoint.timestamp).toISOString(),
            gapMinutes: minutesSinceLastSleep.toFixed(2),
            requiredGapMinutes: SLEEP_END_CONFIRMATION_MINUTES
          });
          currentSleepPeriod = null;
        }
      }

      // Track wake periods (in bed but not sleeping)
      if (isInBedNotSleeping) {
        if (currentWakePeriod === null) {
          currentWakePeriod = { start: point.timestamp, end: point.timestamp };
          wakePeriods.push(currentWakePeriod);
        } else {
          currentWakePeriod.end = point.timestamp;
        }
      } else {
        currentWakePeriod = null;
      }

      // Track out-of-bed periods
      if (isOutOfBed) {
        if (currentOutOfBedPeriod === null) {
          currentOutOfBedPeriod = { start: point.timestamp, end: point.timestamp };
          outOfBedPeriods.push(currentOutOfBedPeriod);
        } else {
          currentOutOfBedPeriod.end = point.timestamp;
        }
      } else {
        currentOutOfBedPeriod = null;
      }
    }

    lastDataPoint = point;
  }

  // Sliding window approach: Find sleep onset by checking all possible 3-hour windows
  // This replaces the sequential checking approach with overlapping window checking
  if (sleepPeriods.length > 0 && tibStart !== null) {
    const windowDurationMs = SLEEP_START_CONFIRMATION_MINUTES * 60 * 1000; // 3 hours in milliseconds
    
    // Find the earliest sleep period start time (when actual sleep began)
    const earliestSleepStart = Math.min(...sleepPeriods.map(p => p.start));
    const latestSleepEnd = Math.max(...sleepPeriods.map(p => p.end));
    
    // Start checking from TIB start or earliest sleep, whichever is earlier
    // End checking when we've covered all sleep periods
    const searchStartTime = Math.min(tibStart, earliestSleepStart);
    const searchEndTime = latestSleepEnd;
    const stepSizeMs = 60 * 1000; // Check every 1 minute (can be adjusted for performance)
    
    logger.info(`[SleepAnalytics] Starting sliding window search for sleep onset for device ${deviceId}`, {
      sleepPeriodsCount: sleepPeriods.length,
      tibStart: new Date(tibStart).toISOString(),
      earliestSleepStart: new Date(earliestSleepStart).toISOString(),
      latestSleepEnd: new Date(latestSleepEnd).toISOString(),
      searchStartTime: new Date(searchStartTime).toISOString(),
      searchEndTime: new Date(searchEndTime).toISOString(),
      windowDurationMinutes: SLEEP_START_CONFIRMATION_MINUTES
    });

    let bestWindow = null;
    let bestSleepPercentage = 0;
    let windowsChecked = 0;
    
    // Slide window through the relevant range
    for (let windowStart = searchStartTime; windowStart <= searchEndTime - windowDurationMs; windowStart += stepSizeMs) {
      windowsChecked++;
      const windowEnd = windowStart + windowDurationMs;
      
      // Calculate total sleep time within this window
      let totalSleepTimeMs = 0;
      sleepPeriods.forEach(period => {
        // Check if period overlaps with window
        if (period.end >= windowStart && period.start <= windowEnd) {
          const periodStart = Math.max(period.start, windowStart);
          const periodEnd = Math.min(period.end, windowEnd);
          if (periodEnd > periodStart) {
            totalSleepTimeMs += (periodEnd - periodStart);
          }
        }
      });

      const sleepPercentage = (totalSleepTimeMs / windowDurationMs) * 100;
      
      // Track best window (first one with >= 85% sleep, or best overall)
      if (sleepPercentage >= 85) {
        // Found valid window - use this as sleep onset
        sleepOnsetTime = windowStart;
        logger.info(`[SleepAnalytics] Sleep onset confirmed via sliding window for device ${deviceId}`, {
          sleepOnsetTime: new Date(sleepOnsetTime).toISOString(),
          windowStart: new Date(windowStart).toISOString(),
          windowEnd: new Date(windowEnd).toISOString(),
          sleepPercentage: sleepPercentage.toFixed(2) + '%',
          totalSleepTimeMs: totalSleepTimeMs,
          windowDurationMs: windowDurationMs,
          windowsChecked: windowsChecked
        });
        break; // Found first valid window, stop searching
      }
      
      // Track best window even if < 85% (for logging/debugging)
      if (sleepPercentage > bestSleepPercentage) {
        bestSleepPercentage = sleepPercentage;
        bestWindow = {
          start: windowStart,
          end: windowEnd,
          sleepPercentage: sleepPercentage
        };
      }
    }

    // If no window with >= 85% found, log the best attempt
    if (sleepOnsetTime === null && bestWindow !== null) {
      logger.info(`[SleepAnalytics] No valid sleep onset window found (>=85%) for device ${deviceId}`, {
        bestWindowStart: new Date(bestWindow.start).toISOString(),
        bestWindowEnd: new Date(bestWindow.end).toISOString(),
        bestSleepPercentage: bestWindow.sleepPercentage.toFixed(2) + '%',
        requiredPercentage: '85%',
        windowsChecked: windowsChecked
      });
    } else if (sleepPeriods.length === 0) {
      logger.info(`[SleepAnalytics] No sleep periods found for sliding window search for device ${deviceId}`);
    }
  }

  // Wake-up fix: ignore sleep points after a long data gap (device likely off then turned on later)
  let lastSleepPointBeforeLongGap = null;
  if (sleepOnsetTime !== null && dataPoints.length >= 2) {
    const gapThresholdMs = DEVICE_OFF_GAP_MINUTES * 60 * 1000;
    for (let i = 1; i < dataPoints.length; i++) {
      const gapMs = dataPoints[i].timestamp - dataPoints[i - 1].timestamp;
      if (gapMs >= gapThresholdMs && dataPoints[i - 1].timestamp >= sleepOnsetTime) {
        const cutOffTime = dataPoints[i - 1].timestamp;
        const sleepPointsBeforeGap = dataPoints.filter(
          p => p.timestamp <= cutOffTime && p.AS === 1 && p.HV === 1
        );
        if (sleepPointsBeforeGap.length > 0) {
          lastSleepPointBeforeLongGap = Math.max(...sleepPointsBeforeGap.map(p => p.timestamp));
          logger.info(`[SleepAnalytics] Long data gap detected (device-off); capping wake-up for device ${deviceId}`, {
            gapMinutes: (gapMs / (60 * 1000)).toFixed(1),
            cutOffTime: new Date(cutOffTime).toISOString(),
            lastSleepPointBeforeLongGap: new Date(lastSleepPointBeforeLongGap).toISOString()
          });
        }
        break; // use first long gap after sleep onset only
      }
    }
  }

  // Fix: If sleepEndTime was set before sleepOnsetTime, reset it and recalculate
  // This can happen when gaps occur before the actual sleep onset is determined
  if (sleepOnsetTime !== null && sleepEndTime !== null && sleepEndTime < sleepOnsetTime) {
    logger.info(`[SleepAnalytics] Resetting sleepEndTime (was before sleepOnsetTime) for device ${deviceId}`, {
      oldSleepEndTime: new Date(sleepEndTime).toISOString(),
      sleepOnsetTime: new Date(sleepOnsetTime).toISOString()
    });
    sleepEndTime = null; // Reset to recalculate properly
  }

  // Recalculate sleepEndTime based on sleep periods after sleepOnsetTime
  if (sleepOnsetTime !== null && sleepEndTime === null) {
    // Find all sleep periods that occur after sleep onset
    const sleepPeriodsAfterOnset = sleepPeriods.filter(period => period.end >= sleepOnsetTime);
    
    if (sleepPeriodsAfterOnset.length > 0) {
      // Find the latest sleep point across all periods after onset
      const latestSleepPointAfterOnset = Math.max(...sleepPeriodsAfterOnset.map(p => p.end));
      
      // Check if there's a gap of 30+ minutes after the latest sleep point
      const dataAfterLatestSleep = dataPoints
        .filter(p => p.timestamp > latestSleepPointAfterOnset)
        .sort((a, b) => a.timestamp - b.timestamp);
      
      if (dataAfterLatestSleep.length > 0) {
        const firstDataAfterSleep = dataAfterLatestSleep[0];
        const gapMinutes = (firstDataAfterSleep.timestamp - latestSleepPointAfterOnset) / (1000 * 60);
        
        // If gap >= 30 minutes, sleep ended at latest sleep point
        if (gapMinutes >= SLEEP_END_CONFIRMATION_MINUTES) {
          sleepEndTime = latestSleepPointAfterOnset;
          logger.info(`[SleepAnalytics] Sleep end detected after sleep onset for device ${deviceId}`, {
            sleepEndTime: new Date(sleepEndTime).toISOString(),
            gapMinutes: gapMinutes.toFixed(2),
            requiredGapMinutes: SLEEP_END_CONFIRMATION_MINUTES
          });
        } else {
          // No gap yet, sleep is still ongoing - use latest sleep point
          sleepEndTime = latestSleepPointAfterOnset;
        }
      } else {
        // No data after latest sleep point, use it as sleep end
        sleepEndTime = latestSleepPointAfterOnset;
      }
    }
  }

  // If sleep session is still active, set sleep end to last sleep point
  if (sleepEndTime === null && lastSleepPoint !== null) {
    sleepEndTime = lastSleepPoint.timestamp;
  }

  // Calculate final wake-up time (sleep end + 30 minutes confirmation)
  if (sleepEndTime !== null) {
    finalWakeUpTime = sleepEndTime + (SLEEP_END_CONFIRMATION_MINUTES * 60 * 1000);
    
    // Check if user returned to bed within 30 minutes
    const confirmationWindowEnd = sleepEndTime + (SLEEP_END_CONFIRMATION_MINUTES * 60 * 1000);
    const dataAfterSleepEnd = dataPoints.filter(p => 
      p.timestamp > sleepEndTime && p.timestamp <= confirmationWindowEnd
    );
    
    const returnedToBed = dataAfterSleepEnd.some(p => p.AS === 1 && p.HV === 1);
    if (returnedToBed) {
      // User returned - continue sleep session
      // Find the latest sleep point after return
      const latestSleepPoint = dataAfterSleepEnd
        .filter(p => p.AS === 1 && p.HV === 1)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      
      if (latestSleepPoint) {
        sleepEndTime = latestSleepPoint.timestamp;
        finalWakeUpTime = sleepEndTime + (SLEEP_END_CONFIRMATION_MINUTES * 60 * 1000);
      }
    }
  }

  // Wake-up fix: cap to last sleep before long gap (avoid device-on-at-noon counting as wake-up)
  if (lastSleepPointBeforeLongGap !== null && sleepEndTime !== null && sleepEndTime > lastSleepPointBeforeLongGap) {
    sleepEndTime = lastSleepPointBeforeLongGap;
    finalWakeUpTime = sleepEndTime + (SLEEP_END_CONFIRMATION_MINUTES * 60 * 1000);
    logger.info(`[SleepAnalytics] Wake-up capped to last sleep before long gap for device ${deviceId}`, {
      sleepEndTime: new Date(sleepEndTime).toISOString(),
      finalWakeUpTime: new Date(finalWakeUpTime).toISOString()
    });
  }

  // Set TIB end (actual last time on bed - use sleepEndTime, not finalWakeUpTime)
  // TIB should only include time where we have actual data, not the 30-min confirmation window
  if (sleepEndTime !== null) {
    tibEnd = sleepEndTime; // Use actual last sleep point, not finalWakeUpTime (which adds 30 min)
  } else if (lastDataPoint && lastDataPoint.AS === 0) {
    tibEnd = lastDataPoint.timestamp;
  } else {
    tibEnd = lastDataPoint ? lastDataPoint.timestamp : null;
  }

  // Cap TIB start so it doesn't include an earlier in-bed period (e.g. afternoon nap on previous day).
  // Query window is (D-1) noon → D end, so first AS=1 can be from afternoon; that would inflate TIB.
  if (tibStart !== null && sleepOnsetTime !== null && tibStart < sleepOnsetTime) {
    const minutesBeforeOnset = (sleepOnsetTime - tibStart) / (1000 * 60);
    if (minutesBeforeOnset > MAX_TIB_START_BEFORE_ONSET_MINUTES) {
      logger.info(`[SleepAnalytics] Capping TIB start to sleep onset (was ${minutesBeforeOnset.toFixed(0)} min before onset) for device ${deviceId}`, {
        oldTibStart: new Date(tibStart).toISOString(),
        newTibStart: new Date(sleepOnsetTime).toISOString()
      });
      tibStart = sleepOnsetTime;
    }
  }

  // Heart-rate-based refinement: refine sleep onset and wake-up within the bed window (91% HR rule).
  // Does not change TIB boundaries; only overrides sleepOnsetTime and sleepEndTime for precision.
  const hrRefinement = refineSleepTimestampsByHeartRate(
    dataPoints,
    tibStart,
    tibEnd,
    sleepOnsetTime,
    sleepEndTime
  );
  if (hrRefinement !== null) {
    const oldOnset = sleepOnsetTime;
    const oldEnd = sleepEndTime;
    sleepOnsetTime = hrRefinement.refinedSleepOnsetTime;
    sleepEndTime = hrRefinement.refinedSleepEndTime;
    logger.info(`[SleepAnalytics] HR refinement applied for device ${deviceId}`, {
      sleepOnsetTime: new Date(sleepOnsetTime).toISOString(),
      sleepEndTime: new Date(sleepEndTime).toISOString(),
      previousOnset: new Date(oldOnset).toISOString(),
      previousEnd: new Date(oldEnd).toISOString()
    });
  }

  // Validate we have all required times
  if (!tibStart || !sleepOnsetTime || !sleepEndTime || !finalWakeUpTime || !tibEnd) {
    logger.info(`[SleepAnalytics] detectSleepSession: Missing required times for device ${deviceId}`, {
      tibStart: tibStart ? new Date(tibStart).toISOString() : null,
      sleepOnsetTime: sleepOnsetTime ? new Date(sleepOnsetTime).toISOString() : null,
      sleepEndTime: sleepEndTime ? new Date(sleepEndTime).toISOString() : null,
      finalWakeUpTime: finalWakeUpTime ? new Date(finalWakeUpTime).toISOString() : null,
      tibEnd: tibEnd ? new Date(tibEnd).toISOString() : null,
      sleepPeriodsCount: sleepPeriods.length,
      lastSleepPoint: lastSleepPoint ? new Date(lastSleepPoint.timestamp).toISOString() : null
    });
    return null;
  }

  // Calculate sleep metrics
  // TST: Sum of sleep periods only between sleepOnsetTime and sleepEndTime
  // Subtract data gaps >= 2 minutes (unknown time periods)
  let totalSleepTimeMs = sleepPeriods
    .filter(period => {
      // Only count periods that overlap with the sleep session (sleepOnsetTime to sleepEndTime)
      return period.end >= sleepOnsetTime && period.start <= sleepEndTime;
    })
    .reduce((sum, period) => {
      // Clamp period to sleep session boundaries
      const periodStart = Math.max(period.start, sleepOnsetTime);
      const periodEnd = Math.min(period.end, sleepEndTime);
      return sum + (periodEnd - periodStart);
    }, 0);
  
  // Subtract data gaps >= 2 minutes that occur WITHIN sleep periods
  // These gaps represent unknown time where we don't know if user was sleeping
  // (Gaps between sleep periods are already excluded from TST)
  const dataGapsMs = [];
  
  // Check each sleep period for internal data gaps
  sleepPeriods.forEach(period => {
    // Only check periods within sleep session
    if (period.end >= sleepOnsetTime && period.start <= sleepEndTime) {
      const periodStart = Math.max(period.start, sleepOnsetTime);
      const periodEnd = Math.min(period.end, sleepEndTime);
      
      // Get data points within this sleep period
      const periodDataPoints = dataPoints.filter(p => 
        p.timestamp >= periodStart && p.timestamp <= periodEnd
      ).sort((a, b) => a.timestamp - b.timestamp);
      
      // Check for gaps within this sleep period
      for (let i = 1; i < periodDataPoints.length; i++) {
        const gapMs = periodDataPoints[i].timestamp - periodDataPoints[i - 1].timestamp;
        const gapMinutes = gapMs / (1000 * 60);
        
        // If gap >= 2 minutes within a sleep period, subtract it (unknown time)
        if (gapMinutes >= MIN_DATA_GAP_MINUTES) {
          dataGapsMs.push(gapMs);
        }
      }
    }
  });
  
  // Subtract all data gaps from TST
  const totalGapsMs = dataGapsMs.reduce((sum, gap) => sum + gap, 0);
  totalSleepTimeMs = Math.max(0, totalSleepTimeMs - totalGapsMs);
  
  const totalSleepTimeMinutes = totalSleepTimeMs / (1000 * 60);

  const timeInBedMs = tibEnd - tibStart;
  const timeInBedMinutes = timeInBedMs / (1000 * 60);

  const sleepLatencyMs = sleepOnsetTime - tibStart;
  const sleepLatencyMinutes = sleepLatencyMs / (1000 * 60);

  const outOfBedTimeMs = outOfBedPeriods
    .filter(period => period.start >= sleepOnsetTime && period.end <= sleepEndTime)
    .reduce((sum, period) => {
      return sum + (period.end - period.start);
    }, 0);
  const outOfBedTimeMinutes = outOfBedTimeMs / (1000 * 60);

  const sleepEfficiency = timeInBedMinutes > 0
    ? (totalSleepTimeMinutes / timeInBedMinutes) * 100
    : 0;

  // Calculate data quality
  const sleepDurationMinutes = (sleepEndTime - sleepOnsetTime) / (1000 * 60);
  const expectedDataPoints = Math.ceil(sleepDurationMinutes / avgIntervalMinutes);
  const validDataPoints = sleepPeriods.reduce((count, period) => {
    const periodMinutes = (period.end - period.start) / (1000 * 60);
    return count + Math.ceil(periodMinutes / avgIntervalMinutes);
  }, 0);
  const dataQuality = expectedDataPoints > 0
    ? (validDataPoints / expectedDataPoints) * 100
    : 0;

  // Calculate heart rate metrics
  const sleepHeartRates = dataPoints
    .filter(p => p.timestamp >= sleepOnsetTime && p.timestamp <= sleepEndTime)
    .filter(p => p.AS === 1 && p.HV === 1 && p.heartRate !== null && p.heartRate > 0)
    .map(p => p.heartRate);

  const restingHeartRate = sleepHeartRates.length > 0
    ? sleepHeartRates.reduce((sum, hr) => sum + hr, 0) / sleepHeartRates.length
    : null;

  const minHeartRate = sleepHeartRates.length > 0
    ? Math.min(...sleepHeartRates)
    : null;

  // Calculate awakenings and awake duration using motion pairing logic
  // Uses hybrid approach: same-row pairing first, then cross-row pairing
  // This accurately captures actual user movement during sleep
  
  // Prepare motion data points for pairing
  const motionDataPoints = healthData.map(point => {
    const pointTimestamp = new Date(point.timestamp).getTime();
    const motionStart = point.motionStart !== undefined && point.motionStart !== null && point.motionStart > 0
      ? Number(point.motionStart)
      : null;
    const motionEndReason = point.motionEndReason !== undefined && point.motionEndReason !== null && point.motionEndReason > 0
      ? Number(point.motionEndReason)
      : null;

    return {
      timestamp: pointTimestamp,
      createdAt: point.createdAt || point.timestamp,
      motionStart,
      motionEndReason,
    };
  });

  // Sort chronologically (oldest first) for proper pairing
  const sortedMotionPoints = sortMotionDataChronologically(motionDataPoints);

  // Pair motion events using hybrid approach (same-row first, then cross-row)
  const pairingResult = pairMotionEvents(
    sortedMotionPoints,
    sleepOnsetTime,
    sleepEndTime
  );

  // Filter events that occurred during sleep session
  const motionAwakenings = pairingResult.events
    .filter(event => {
      const eventTimestamp = event.timestamp;
      return eventTimestamp >= sleepOnsetTime && eventTimestamp <= sleepEndTime;
    })
    .map(event => ({
      timestamp: event.timestamp,
      durationSeconds: event.durationSeconds, // Duration in seconds
      durationMs: event.durationSeconds * 1000, // Convert to milliseconds for DB storage
    }));

  // Calculate total awake duration from paired events (convert seconds to milliseconds)
  const totalMotionAwakeDurationMs = motionAwakenings.reduce(
    (sum, event) => sum + event.durationMs,
    0
  );

  // Log for debugging
  logger.info(`[SleepAnalytics] Motion analysis for device ${deviceId}:`, {
    totalMotionPoints: motionDataPoints.length,
    pairedEvents: pairingResult.totalMovementCount,
    awakeningsFound: motionAwakenings.length,
    totalMovementSeconds: pairingResult.totalMovementSeconds.toFixed(2),
    totalMovementMinutes: pairingResult.totalMovementMinutes.toFixed(2),
    sleepOnsetTime: new Date(sleepOnsetTime).toISOString(),
    sleepEndTime: new Date(sleepEndTime).toISOString()
  });

  const awakenings = motionAwakenings.length;
  // Store wakeTime in milliseconds (as per DB requirement)
  const wakeTimeMs = totalMotionAwakeDurationMs;

  // Calculate sleep score (only if TST >= 3 hours)
  let sleepScore = null;
  if (totalSleepTimeMinutes >= MIN_SLEEP_DURATION_MINUTES) {
    sleepScore = calculateSleepScore({
      duration: totalSleepTimeMinutes,
      efficiency: sleepEfficiency,
      awakenings: awakenings,
      dataQuality: dataQuality
    });
  }

  // Get session date - use queryDate (sleep end date) instead of sleepOnsetTime (sleep start date)
  // This ensures that sleep sessions are stored/looked up by the date they end, not when they start
  const { formatISTDate } = require("../utils/timezoneHelper");
  const sessionDate = queryDate || formatISTDate(new Date(sleepOnsetTime)); // Fallback to sleepOnsetTime if queryDate not provided

  logger.info(`[SleepAnalytics] detectSleepSession: Sleep session detected successfully for device ${deviceId}`, {
    sessionDate,
    tibStart: new Date(tibStart).toISOString(),
    sleepOnsetTime: new Date(sleepOnsetTime).toISOString(),
    sleepEndTime: new Date(sleepEndTime).toISOString(),
    finalWakeUpTime: new Date(finalWakeUpTime).toISOString(),
    tibEnd: new Date(tibEnd).toISOString(),
    totalSleepTimeMinutes: Math.round(totalSleepTimeMinutes),
    timeInBedMinutes: Math.round(timeInBedMinutes),
    sleepEfficiency: Math.round(sleepEfficiency * 10) / 10,
    dataQuality: Math.round(dataQuality * 10) / 10,
    awakenings,
    sleepPeriodsCount: sleepPeriods.length
  });

  return {
    deviceId: deviceId,
    tibStart: new Date(tibStart),
    sleepOnsetTime: new Date(sleepOnsetTime),
    sleepEndTime: new Date(sleepEndTime),
    finalWakeUpTime: new Date(finalWakeUpTime),
    tibEnd: new Date(tibEnd),
    sleepLatency: Math.round(sleepLatencyMinutes),
    totalSleepTime: Math.round(totalSleepTimeMinutes),
    timeInBed: Math.round(timeInBedMinutes),
    sleepEfficiency: Math.round(sleepEfficiency * 10) / 10, // Round to 1 decimal
    awakenings: awakenings,
    wakeTime: Math.round(wakeTimeMs), // Store in milliseconds (as per DB requirement)
    outOfBedTime: Math.round(outOfBedTimeMinutes),
    restingHeartRate: restingHeartRate ? Math.round(restingHeartRate) : null,
    minHeartRate: minHeartRate ? Math.round(minHeartRate) : null,
    dataQuality: Math.round(dataQuality * 10) / 10, // Round to 1 decimal
    validDataPoints: validDataPoints,
    expectedDataPoints: expectedDataPoints,
    sleepScore: sleepScore,
    sessionDate: sessionDate
  };
}

/**
 * Validate sleep session meets requirements
 * @param {Object} session - Sleep session object
 * @returns {boolean} True if valid
 */
function validateSleepSession(session) {
  // Check minimum sleep duration (3 hours)
  if (session.totalSleepTime < MIN_SLEEP_DURATION_MINUTES) {
    logger.info(`[SleepAnalytics] Sleep session too short: ${session.totalSleepTime} minutes`);
    return false;
  }

  // Check data quality (>= 90%)
  if (session.dataQuality < MIN_DATA_QUALITY_PERCENT) {
    logger.info(`[SleepAnalytics] Data quality too low: ${session.dataQuality}%`);
    return false;
  }

  return true;
}

/**
 * Calculate sleep score (0-100)
 * @param {Object} metrics - Sleep metrics
 * @returns {number} Sleep score (0-100)
 */
function calculateSleepScore(metrics) {
  const { duration, efficiency, awakenings, dataQuality } = metrics;

  // Duration score (0-100)
  let durationScore = 0;
  if (duration >= 7 && duration <= 9) {
    durationScore = 100;
  } else if ((duration >= 6 && duration < 7) || (duration > 9 && duration <= 10)) {
    durationScore = 80;
  } else if ((duration >= 5 && duration < 6) || (duration > 10 && duration <= 11)) {
    durationScore = 60;
  } else if ((duration >= 4 && duration < 5) || (duration > 11 && duration <= 12)) {
    durationScore = 40;
  } else {
    durationScore = 20;
  }

  // Efficiency score (0-100)
  let efficiencyScore = 0;
  if (efficiency >= 90) {
    efficiencyScore = 100;
  } else if (efficiency >= 85) {
    efficiencyScore = 80;
  } else if (efficiency >= 80) {
    efficiencyScore = 60;
  } else if (efficiency >= 75) {
    efficiencyScore = 40;
  } else {
    efficiencyScore = 20;
  }

  // Awakenings score (0-100)
  let awakeningsScore = 0;
  if (awakenings <= 1) {
    awakeningsScore = 100;
  } else if (awakenings <= 3) {
    awakeningsScore = 80;
  } else if (awakenings <= 5) {
    awakeningsScore = 60;
  } else if (awakenings <= 8) {
    awakeningsScore = 40;
  } else {
    awakeningsScore = 20;
  }

  // Data quality score (0-100)
  let dataQualityScore = 0;
  if (dataQuality >= 95) {
    dataQualityScore = 100;
  } else if (dataQuality >= 90) {
    dataQualityScore = 80;
  } else if (dataQuality >= 85) {
    dataQualityScore = 60;
  } else if (dataQuality >= 80) {
    dataQualityScore = 40;
  } else {
    dataQualityScore = 20;
  }

  // Weighted average
  const sleepScore = Math.round(
    durationScore * 0.30 +
    efficiencyScore * 0.30 +
    awakeningsScore * 0.20 +
    dataQualityScore * 0.20
  );

  return sleepScore;
}

/**
 * Store sleep session in database
 * @param {Object} session - Sleep session object
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Stored sleep session
 */
async function storeSleepSession(session, userId) {
  try {
    // Check if session already exists for this date
    const existingSession = await SleepSession.findOne({
      deviceId: session.deviceId,
      sessionDate: session.sessionDate
    });

    if (existingSession) {
      // Update existing session
      Object.assign(existingSession, session, { userId, updatedAt: new Date() });
      await existingSession.save();
      logger.info(`[SleepAnalytics] Updated sleep session for device ${session.deviceId}, date ${session.sessionDate}`);
      return existingSession;
    } else {
      // Create new session
      const newSession = new SleepSession({
        ...session,
        userId: userId
      });
      await newSession.save();
      logger.info(`[SleepAnalytics] Created sleep session for device ${session.deviceId}, date ${session.sessionDate}`);
      return newSession;
    }
  } catch (error) {
    logger.err(error, { where: "storeSleepSession", deviceId: session.deviceId });
    throw error;
  }
}

/**
 * Get sleep session for a specific date
 * @param {string} deviceId - Device ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<Object|null>} Sleep session or null
 */
async function getSleepSession(deviceId, date) {
  try {
    const session = await SleepSession.findOne({
      deviceId: deviceId,
      sessionDate: date
    }).lean();

    return session;
  } catch (error) {
    logger.err(error, { where: "getSleepSession", deviceId, date });
    return null;
  }
}

/**
 * Get sleep sessions for a date range
 * @param {string} deviceId - Device ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of sleep sessions
 */
async function getSleepSessions(deviceId, startDate, endDate) {
  try {
    const sessions = await SleepSession.find({
      deviceId: deviceId,
      tibStart: {
        $gte: startDate,
        $lte: endDate
      }
    })
      .sort({ tibStart: -1 })
      .lean();

    return sessions;
  } catch (error) {
    logger.err(error, { where: "getSleepSessions", deviceId });
    return [];
  }
}

module.exports = {
  calculateSleepSession,
  validateSleepSession,
  storeSleepSession,
  getSleepSession,
  getSleepSessions,
  calculateSleepScore
};
