/**
 * Motion Pairing Utility (Backend JavaScript Version)
 * 
 * Handles pairing of motionStart and motionEndReason values:
 * 1. First tries same-row pairing (both values in same row)
 * 2. Then handles cross-row pairing (values in different rows)
 * 
 * Processes data chronologically (oldest first) to correctly match events.
 */

/**
 * Pair motion events from raw data points
 * @param {Array} dataPoints - Array of motion data points (should be sorted chronologically ASC)
 * @param {number} sessionStartMs - Optional: filter events within sleep session start
 * @param {number} sessionEndMs - Optional: filter events within sleep session end
 * @returns {Object} Paired motion events with statistics
 */
function pairMotionEvents(dataPoints, sessionStartMs, sessionEndMs) {
  const events = [];
  let openMovementStart = null;
  let openMovementStartTimestamp = null;

  // Process rows in chronological order (oldest first)
  for (const point of dataPoints) {
    const rowTimestamp = point.timestamp instanceof Date 
      ? point.timestamp.getTime() 
      : typeof point.timestamp === 'string' 
        ? new Date(point.timestamp).getTime() 
        : point.timestamp;
    
    const motionStart = point.motionStart !== null && point.motionStart !== undefined && point.motionStart > 0 
      ? Number(point.motionStart) 
      : null;
    const motionEndReason = point.motionEndReason !== null && point.motionEndReason !== undefined && point.motionEndReason > 0
      ? Number(point.motionEndReason)
      : null;

    // Filter by session window if provided
    if (sessionStartMs !== undefined && sessionEndMs !== undefined) {
      if (rowTimestamp < sessionStartMs || rowTimestamp > sessionEndMs) {
        // Still process to close any open movements that might be relevant
        if (motionEndReason !== null && openMovementStart !== null) {
          // Convert session times to seconds for comparison with motionStart/motionEndReason
          const sessionStartSeconds = sessionStartMs / 1000;
          if (motionEndReason > openMovementStart && openMovementStart >= sessionStartSeconds) {
            const durationSeconds = motionEndReason - openMovementStart; // Difference is in SECONDS
            if (durationSeconds > 0) {
              events.push({
                timestamp: openMovementStartTimestamp || (openMovementStart * 1000), // Convert to ms for display
                motionStart: openMovementStart,
                motionEndReason: motionEndReason,
                durationSeconds,
                rowTimestamp,
              });
            }
          }
        }
        openMovementStart = null;
        openMovementStartTimestamp = null;
        continue;
      }
    }

    // Strategy 1: Same-row pairing (both values in same row)
    if (motionStart !== null && motionEndReason !== null) {
      // Close any open movement first if exists
      // If there's an open movement, it should end when this new movement starts
      if (openMovementStart !== null) {
        // Previous movement ends when new one starts (motionStart is the end of previous)
        if (motionStart > openMovementStart) {
          const durationSeconds = motionStart - openMovementStart; // Difference is in SECONDS
          if (durationSeconds > 0) {
            events.push({
              timestamp: openMovementStartTimestamp || (openMovementStart * 1000), // Convert to ms for display
              motionStart: openMovementStart,
              motionEndReason: motionStart, // Previous movement ends when new one starts
              durationSeconds,
              rowTimestamp,
            });
          }
        }
        openMovementStart = null;
        openMovementStartTimestamp = null;
      }

      // Process same-row pair
      if (motionEndReason > motionStart) {
        const durationSeconds = motionEndReason - motionStart; // Difference is in SECONDS
        if (durationSeconds > 0) {
          events.push({
            timestamp: rowTimestamp, // Use row timestamp for graph display
            motionStart,
            motionEndReason,
            durationSeconds,
            rowTimestamp,
          });
        }
      }
      // If motionStart > motionEndReason, it's invalid - skip
      continue;
    }

    // Strategy 2: Cross-row pairing
    // Handle motionStart (new movement begins)
    if (motionStart !== null) {
      // If there's an open movement, check if we should close it
      if (openMovementStart !== null) {
        // If new start is after previous start, close previous one
        // Use current row timestamp as end time estimate
        if (motionStart > openMovementStart) {
          // Previous movement ends when new one starts (approximation)
          const estimatedEnd = motionStart;
          const durationSeconds = estimatedEnd - openMovementStart; // Difference is in SECONDS
          if (durationSeconds > 0) {
            events.push({
              timestamp: openMovementStartTimestamp || (openMovementStart * 1000), // Convert to ms for display
              motionStart: openMovementStart,
              motionEndReason: estimatedEnd,
              durationSeconds,
              rowTimestamp,
            });
          }
        }
      }
      // Start new movement
      openMovementStart = motionStart;
      openMovementStartTimestamp = rowTimestamp;
    }

    // Handle motionEndReason (movement ends)
    if (motionEndReason !== null) {
      if (openMovementStart !== null) {
        // Validate: end must be after start
        if (motionEndReason > openMovementStart) {
          const durationSeconds = motionEndReason - openMovementStart; // Difference is in SECONDS
          if (durationSeconds > 0) {
            events.push({
              timestamp: openMovementStartTimestamp || (openMovementStart * 1000), // Convert to ms for display
              motionStart: openMovementStart,
              motionEndReason,
              durationSeconds,
              rowTimestamp,
            });
          }
        }
        // Reset open movement
        openMovementStart = null;
        openMovementStartTimestamp = null;
      }
      // If no open movement, ignore orphaned end (as per requirements)
    }
  }

  // Calculate statistics
  const totalMovementCount = events.length;
  const totalMovementSeconds = events.reduce((sum, event) => sum + event.durationSeconds, 0); // Already in seconds
  const totalMovementMinutes = totalMovementSeconds / 60;

  return {
    events,
    totalMovementCount,
    totalMovementSeconds,
    totalMovementMinutes,
  };
}

/**
 * Sort data points chronologically (oldest first)
 * Uses createdAt if available, otherwise uses timestamp
 */
function sortMotionDataChronologically(dataPoints) {
  return [...dataPoints].sort((a, b) => {
    // Prefer createdAt for ordering if available, otherwise use timestamp
    let timeA;
    let timeB;
    
    if (a.createdAt) {
      timeA = a.createdAt instanceof Date 
        ? a.createdAt.getTime() 
        : new Date(a.createdAt).getTime();
    } else {
      timeA = a.timestamp instanceof Date 
        ? a.timestamp.getTime() 
        : typeof a.timestamp === 'string' 
          ? new Date(a.timestamp).getTime() 
          : a.timestamp;
    }
    
    if (b.createdAt) {
      timeB = b.createdAt instanceof Date 
        ? b.createdAt.getTime() 
        : new Date(b.createdAt).getTime();
    } else {
      timeB = b.timestamp instanceof Date 
        ? b.timestamp.getTime() 
        : typeof b.timestamp === 'string' 
          ? new Date(b.timestamp).getTime() 
          : b.timestamp;
    }
    
    return timeA - timeB; // ASC order (oldest first)
  });
}

module.exports = {
  pairMotionEvents,
  sortMotionDataChronologically,
};
