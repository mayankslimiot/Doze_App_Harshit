import { apiUrl } from './api';
import { getAuthHeaders } from './deviceData';
import { pairMotionEvents, sortMotionDataChronologically, type MotionDataPoint } from '@/utils/motionPairing';

/**
 * Sleep Session Interface
 */
export interface SleepSession {
  _id?: string;
  deviceId: string;
  userId?: string;
  
  // Sleep timing
  tibStart: string; // ISO date string
  sleepOnsetTime: string; // ISO date string
  sleepEndTime: string; // ISO date string
  finalWakeUpTime: string; // ISO date string
  tibEnd: string; // ISO date string
  
  // Sleep metrics
  sleepLatency: number; // Minutes
  totalSleepTime: number; // Minutes (TST)
  timeInBed: number; // Minutes (TIB)
  sleepEfficiency: number; // Percentage
  awakenings: number;
  wakeTime: number; // Milliseconds (total awake duration)
  outOfBedTime: number; // Minutes
  
  // Heart rate metrics
  restingHeartRate?: number | null;
  minHeartRate?: number | null;
  
  // Data quality
  dataQuality: number; // Percentage
  validDataPoints: number;
  expectedDataPoints: number;
  
  // Sleep score
  sleepScore?: number | null;
  
  // Session date
  sessionDate: string; // YYYY-MM-DD format
  
  // Metadata
  createdAt?: string;
  updatedAt?: string;
  
  // Enriched Snore Data
  snoreDetail?: SnoreDetail | null;
}

export interface SnoreDetail {
  totalEvents: number;
  totalRawSeconds: number;
  avgDuration: number;
  totalSnoreDurationSec: number;
  freqBreakdown: {
    freq: number;
    eventCount: number;
    share: number;
    totalTimeSec: number;
    avgMaxScore: number;
    avgSnoreCount: number;
  }[];
  snoreTimeline: {
    start: number;
    duration: number;
    freq: number;
  }[];
  freqCounts: {
    fc1: number;
    fc2: number;
    fc3: number;
  };
  freqPct: {
    freq1Pct: number;
    freq2Pct: number;
    freq3Pct: number;
  };
}

export interface SleepMotionEvent {
  // Server timestamp for plotting on x-axis
  timestamp: number;
  // Raw unix values from payload (in seconds)
  motionStart: number;
  motionEndReason: number;
  // Difference between motionEndReason and motionStart (in SECONDS, not milliseconds)
  durationSeconds: number;
  // Duration in milliseconds for display (converted from seconds)
  durationMs: number;
}

function toUnixMs(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(value) < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }

  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return Math.abs(numericValue) < 1e12 ? Math.round(numericValue * 1000) : Math.round(numericValue);
    }

    const parsedDate = new Date(value).getTime();
    return Number.isFinite(parsedDate) ? parsedDate : null;
  }

  if (value instanceof Date) {
    const parsedDate = value.getTime();
    return Number.isFinite(parsedDate) ? parsedDate : null;
  }

  return null;
}

type SleepSessionResponse = {
  success: boolean;
  data?: SleepSession | null;
  message?: string;
};

type SleepMotionTimelineResponse = {
  success: boolean;
  data?: SleepMotionEvent[];
  sessionStartMs?: number;
  sessionEndMs?: number;
  message?: string;
};

const inFlightSleepSessionRequests = new Map<string, Promise<SleepSessionResponse>>();
const inFlightSleepMotionRequests = new Map<string, Promise<SleepMotionTimelineResponse>>();

/**
 * Get sleep session for a specific device and date
 * @param deviceId - Device ID
 * @param date - Date string in YYYY-MM-DD format (optional, defaults to today)
 * @returns Sleep session or null if not found
 */
export async function getSleepSession(
  deviceId: string,
  date?: string
): Promise<SleepSessionResponse> {
  const normalizedId = deviceId.trim().toUpperCase();
  const requestKey = `${normalizedId}_${date || 'today'}`;
  const existingRequest = inFlightSleepSessionRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise: Promise<SleepSessionResponse> = (async () => {
    try {
      const headers = await getAuthHeaders();

      const params = new URLSearchParams();
      if (date) {
        params.append('date', date);
      }

      const queryString = params.toString();
      const url = apiUrl(`/api/sleep/session/${normalizedId}${queryString ? `?${queryString}` : ''}`);

      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: result.message || 'Failed to fetch sleep session',
        };
      }

      return {
        success: true,
        data: result.data || null,
        message: result.message,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Network error',
      };
    }
  })();

  inFlightSleepSessionRequests.set(requestKey, requestPromise);
  return requestPromise.finally(() => {
    if (inFlightSleepSessionRequests.get(requestKey) === requestPromise) {
      inFlightSleepSessionRequests.delete(requestKey);
    }
  });
}

/**
 * Get motion timeline inside a sleep session window.
 * Y-axis value is derived from unix difference: motionEndReason - motionStart.
 */
export async function getSleepMotionTimeline(
  deviceId: string,
  sleepStartISO: string,
  sleepEndISO: string
): Promise<SleepMotionTimelineResponse> {
  const normalizedId = deviceId.trim().toUpperCase();
  const requestKey = `${normalizedId}_${sleepStartISO}_${sleepEndISO}`;
  const existingRequest = inFlightSleepMotionRequests.get(requestKey);
  if (existingRequest) {
    return existingRequest;
  }

  const requestPromise: Promise<SleepMotionTimelineResponse> = (async () => {
    try {
      const headers = await getAuthHeaders();

      const sessionStartMs = new Date(sleepStartISO).getTime();
      const sessionEndMs = new Date(sleepEndISO).getTime();

      if (!Number.isFinite(sessionStartMs) || !Number.isFinite(sessionEndMs) || sessionEndMs <= sessionStartMs) {
        return {
          success: false,
          message: 'Invalid sleep session range',
        };
      }

      const params = new URLSearchParams({
        start: new Date(sessionStartMs).toISOString(),
        end: new Date(sessionEndMs).toISOString(),
        limit: '5000',
        fields: 'motion',
        order: 'asc', // Request chronological order for proper pairing
      });

      const url = apiUrl(`/api/data/health/${normalizedId}?${params.toString()}`);
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      const result = await response.json().catch(() => []);

      if (!response.ok) {
        return {
          success: false,
          message: result?.message || 'Failed to fetch sleep motion timeline',
        };
      }

      const points = Array.isArray(result) ? result : [];

      // Convert to MotionDataPoint format
      const motionDataPoints: MotionDataPoint[] = points
        .map((point: any) => {
          const timestamp = toUnixMs(point?.timestamp ?? point?.time);
          const motionStart = point?.motionStart !== null && point?.motionStart !== undefined
            ? Number(point.motionStart)
            : null;
          const motionEndReason = point?.motionEndReason !== null && point?.motionEndReason !== undefined
            ? Number(point.motionEndReason)
            : null;

          if (timestamp === null) {
            return null;
          }

          return {
            timestamp,
            createdAt: point?.createdAt || undefined, // Optional field
            motionStart: motionStart !== null && Number.isFinite(motionStart) ? motionStart : null,
            motionEndReason: motionEndReason !== null && Number.isFinite(motionEndReason) ? motionEndReason : null,
          };
        })
        .filter((point): point is MotionDataPoint => point !== null);

      // Sort chronologically (oldest first) for proper pairing
      const sortedPoints = sortMotionDataChronologically(motionDataPoints);

      // Pair motion events using hybrid approach (same-row first, then cross-row)
      const pairingResult = pairMotionEvents(
        sortedPoints,
        sessionStartMs,
        sessionEndMs
      );

      // Convert paired events to SleepMotionEvent format
      const events: SleepMotionEvent[] = pairingResult.events.map((event) => ({
        timestamp: event.timestamp, // Use motionStart timestamp for graph display (already in ms)
        motionStart: event.motionStart,
        motionEndReason: event.motionEndReason,
        durationSeconds: event.durationSeconds, // Duration in seconds
        durationMs: event.durationSeconds * 1000, // Convert to milliseconds for display
      }));

      // Sort by timestamp for consistent display
      events.sort((a, b) => a.timestamp - b.timestamp);

      return {
        success: true,
        data: events,
        sessionStartMs,
        sessionEndMs,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Network error',
      };
    }
  })();

  inFlightSleepMotionRequests.set(requestKey, requestPromise);
  return requestPromise.finally(() => {
    if (inFlightSleepMotionRequests.get(requestKey) === requestPromise) {
      inFlightSleepMotionRequests.delete(requestKey);
    }
  });
}

/**
 * Get sleep sessions for a date range
 * @param deviceId - Device ID
 * @param startDate - Start date (ISO string or Date)
 * @param endDate - End date (ISO string or Date)
 * @returns Array of sleep sessions
 */
export async function getSleepSessions(
  deviceId: string,
  startDate?: Date | string,
  endDate?: Date | string
): Promise<{
  success: boolean;
  data?: SleepSession[];
  count?: number;
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const params = new URLSearchParams();
    if (startDate) {
      const start = typeof startDate === 'string' ? startDate : startDate.toISOString();
      params.append('start', start);
    }
    if (endDate) {
      const end = typeof endDate === 'string' ? endDate : endDate.toISOString();
      params.append('end', end);
    }

    const queryString = params.toString();
    const url = apiUrl(`/api/sleep/sessions/${normalizedId}${queryString ? `?${queryString}` : ''}`);

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.message || 'Failed to fetch sleep sessions',
      };
    }

    return {
      success: true,
      data: result.data || [],
      count: result.count || 0,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

/**
 * Calculate and store sleep session for a specific date
 * @param deviceId - Device ID
 * @param date - Date string in YYYY-MM-DD format (optional, defaults to today)
 * @returns Calculated sleep session
 */
export async function calculateSleepSession(
  deviceId: string,
  date?: string
): Promise<{
  success: boolean;
  data?: SleepSession;
  message?: string;
}> {
  try {
    const normalizedId = deviceId.trim().toUpperCase();
    const headers = await getAuthHeaders();
    
    const body: any = {};
    if (date) {
      body.date = date;
    }

    const url = apiUrl(`/api/sleep/calculate/${normalizedId}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.message || 'Failed to calculate sleep session',
      };
    }

    return {
      success: true,
      data: result.data,
      message: result.message,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

/**
 * Format sleep duration in hours and minutes
 * @param minutes - Total minutes
 * @returns Formatted string (e.g., "7h 30m")
 */
export function formatSleepDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  
  if (hours === 0) {
    return `${mins}m`;
  }
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

/**
 * Format time from ISO string
 * @param isoString - ISO date string
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted time string
 */
export function formatSleepTime(
  isoString: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = new Date(isoString);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  
  return new Intl.DateTimeFormat('en-US', { ...defaultOptions, ...options }).format(date);
}

/**
 * Get sleep quality label from score
 * @param score - Sleep score (0-100)
 * @returns Quality label
 */
export function getSleepQualityLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return 'N/A';
  }
  
  if (score >= 80) {
    return 'Excellent';
  } else if (score >= 60) {
    return 'Good';
  } else if (score >= 40) {
    return 'Fair';
  } else {
    return 'Poor';
  }
}

/**
 * Get sleep quality color from score
 * @param score - Sleep score (0-100)
 * @returns Color hex code
 */
export function getSleepQualityColor(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return '#9CA3AF'; // Gray
  }
  
  if (score >= 80) {
    return '#10B981'; // Green
  } else if (score >= 60) {
    return '#3B82F6'; // Blue
  } else if (score >= 40) {
    return '#F59E0B'; // Orange
  } else {
    return '#EF4444'; // Red
  }
}
