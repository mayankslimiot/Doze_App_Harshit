/**
 * Motion Pairing Utility
 * 
 * Handles pairing of motionStart and motionEndReason values:
 * 1. First tries same-row pairing (both values in same row)
 * 2. Then handles cross-row pairing (values in different rows)
 * 
 * Processes data chronologically (oldest first) to correctly match events.
 */

export interface MotionDataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  createdAt?: Date | string; // Database createdAt timestamp
  motionStart: number | null; // BIGINT, can be 0
  motionEndReason: number | null; // BIGINT, can be 0 (note: field name is motionEndReason, not motionEndTime)
}

export interface PairedMotionEvent {
  timestamp: number; // Timestamp for graph display (uses motionStart timestamp)
  motionStart: number; // Unix timestamp when movement started (in seconds)
  motionEndReason: number; // Unix timestamp when movement ended (in seconds)
  durationSeconds: number; // Duration in SECONDS (difference is in seconds, not milliseconds)
  rowTimestamp: number; // Original row timestamp
}

export interface MotionPairingResult {
  events: PairedMotionEvent[];
  totalMovementCount: number;
  totalMovementSeconds: number;
  totalMovementMinutes: number;
}

/**
 * Pair motion events from raw data points
 * @param dataPoints - Array of motion data points (should be sorted chronologically ASC)
 * @param sessionStartMs - Optional: filter events within sleep session start
 * @param sessionEndMs - Optional: filter events within sleep session end
 * @returns Paired motion events with statistics
 */
export function pairMotionEvents(
  dataPoints: MotionDataPoint[],
  sessionStartMs?: number,
  sessionEndMs?: number
): MotionPairingResult {
  const events: PairedMotionEvent[] = [];
  let openMovementStart: number | null = null;
  let openMovementStartTimestamp: number | null = null;

  // Process rows in chronological order (oldest first)
  for (const point of dataPoints) {
    const rowTimestamp = point.timestamp;
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
          openMovementStart = null;
          openMovementStartTimestamp = null;
        }
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
export function sortMotionDataChronologically(
  dataPoints: MotionDataPoint[]
): MotionDataPoint[] {
  return [...dataPoints].sort((a, b) => {
    // Prefer createdAt for ordering if available, otherwise use timestamp
    let timeA: number;
    let timeB: number;
    
    if (a.createdAt) {
      timeA = typeof a.createdAt === 'string' 
        ? new Date(a.createdAt).getTime() 
        : a.createdAt instanceof Date 
          ? a.createdAt.getTime()
          : a.timestamp;
    } else {
      timeA = typeof a.timestamp === 'string' 
        ? new Date(a.timestamp).getTime() 
        : a.timestamp instanceof Date 
          ? a.timestamp.getTime()
          : a.timestamp;
    }
    
    if (b.createdAt) {
      timeB = typeof b.createdAt === 'string' 
        ? new Date(b.createdAt).getTime() 
        : b.createdAt instanceof Date 
          ? b.createdAt.getTime()
          : b.timestamp;
    } else {
      timeB = typeof b.timestamp === 'string' 
        ? new Date(b.timestamp).getTime() 
        : b.timestamp instanceof Date 
          ? b.timestamp.getTime()
          : b.timestamp;
    }
    
    return timeA - timeB; // ASC order (oldest first)
  });
}
