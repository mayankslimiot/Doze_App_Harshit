import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDevice } from '@/contexts/DeviceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  getSleepSession,
  getSleepSessions,
  getSleepMotionTimeline,
  formatSleepDuration,
  formatSleepTime,
  getSleepQualityColor,
  type SleepSession,
  type SleepMotionEvent,
} from '@/services/sleepAnalytics';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RNSvg = require('react-native-svg');
const { Rect, Text: SvgText } = RNSvg as { Rect: any; Text: any };

const { width } = Dimensions.get('window');

export default function SleepInsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeDevice } = useDevice();
  const { auth } = useAuth();
  const { isLightTheme } = useTheme();
  const [selectedPeriod, setSelectedPeriod] = React.useState<'Day' | 'Week' | 'Month'>('Day');
  const [selectedDate, setSelectedDate] = React.useState(new Date()); // Start with today's date
  
  // Sleep data state
  const [sleepSession, setSleepSession] = React.useState<SleepSession | null>(null);
  const [sleepMotionTimeline, setSleepMotionTimeline] = React.useState<SleepMotionEvent[]>([]);
  const [weeklySessions, setWeeklySessions] = React.useState<SleepSession[]>([]);
  const [monthlySessions, setMonthlySessions] = React.useState<SleepSession[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dayRequestInFlightKeyRef = React.useRef<string | null>(null);

  // Get start of week (Monday)
  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  };

  // Get end of week (Sunday)
  const getWeekEnd = (date: Date): Date => {
    const weekStart = getWeekStart(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    return weekEnd;
  };

  // Format date for display based on period
  const formattedDate = React.useMemo(() => {
    if (selectedPeriod === 'Day') {
      return selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } else if (selectedPeriod === 'Week') {
      const weekStart = getWeekStart(selectedDate);
      const weekEnd = getWeekEnd(selectedDate);
      const startStr = weekStart.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      const endStr = weekEnd.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
      return `${startStr} - ${endStr}`;
    } else {
      // Month
      return selectedDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    }
  }, [selectedDate, selectedPeriod]);

  // Navigate to previous period (Day/Week/Month)
  const goToPrevious = () => {
    const newDate = new Date(selectedDate);
    if (selectedPeriod === 'Day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (selectedPeriod === 'Week') {
      newDate.setDate(newDate.getDate() - 7);
    } else {
      // Month
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setSelectedDate(newDate);
  };

  // Navigate to next period (Day/Week/Month)
  const goToNext = () => {
    const newDate = new Date(selectedDate);
    if (selectedPeriod === 'Day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (selectedPeriod === 'Week') {
      newDate.setDate(newDate.getDate() + 7);
    } else {
      // Month
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setSelectedDate(newDate);
  };

  // Reset to today when period changes
  React.useEffect(() => {
    setSelectedDate(new Date());
  }, [selectedPeriod]);

  // Format date to YYYY-MM-DD for API
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch sleep session for Day view
  const fetchSleepSession = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn || selectedPeriod !== 'Day') {
      return;
    }

    const dateStr = formatDateForAPI(selectedDate);
    const requestKey = `${activeDevice.deviceId}_${dateStr}`;
    if (dayRequestInFlightKeyRef.current === requestKey) {
      return;
    }
    dayRequestInFlightKeyRef.current = requestKey;

    try {
      setIsLoading(true);
      setError(null);

      const result = await getSleepSession(activeDevice.deviceId, dateStr);

      if (result.success && result.data) {
        setSleepSession(result.data);
        const motionResult = await getSleepMotionTimeline(
          activeDevice.deviceId,
          result.data.sleepOnsetTime,
          result.data.sleepEndTime
        );
        setSleepMotionTimeline(motionResult.success && motionResult.data ? motionResult.data : []);
        setError(null);
      } else {
        setSleepSession(null);
        setSleepMotionTimeline([]);
        setError(result.message || 'No valid sleep session found for this date');
      }
    } catch (err: any) {
      console.error('Failed to fetch sleep session:', err);
      setError(err.message || 'Failed to load sleep data');
      setSleepSession(null);
      setSleepMotionTimeline([]);
    } finally {
      if (dayRequestInFlightKeyRef.current === requestKey) {
        dayRequestInFlightKeyRef.current = null;
      }
      setIsLoading(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedPeriod, selectedDate]);

  // Fetch weekly sleep sessions
  const fetchWeeklySessions = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn || selectedPeriod !== 'Week') {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const weekStart = getWeekStart(selectedDate);
      const weekEnd = getWeekEnd(selectedDate);
      
      const result = await getSleepSessions(activeDevice.deviceId, weekStart, weekEnd);

      if (result.success && result.data) {
        setWeeklySessions(result.data || []);
      } else {
        setWeeklySessions([]);
        setError(result.message || 'No weekly sleep data available');
      }
    } catch (err: any) {
      console.error('Failed to fetch weekly sessions:', err);
      setError(err.message || 'Failed to load weekly sleep data');
      setWeeklySessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedPeriod, selectedDate]);

  // Fetch monthly sleep sessions
  const fetchMonthlySessions = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn || selectedPeriod !== 'Month') {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      
      const result = await getSleepSessions(activeDevice.deviceId, monthStart, monthEnd);

      if (result.success && result.data) {
        setMonthlySessions(result.data || []);
      } else {
        setMonthlySessions([]);
        setError(result.message || 'No monthly sleep data available');
      }
    } catch (err: any) {
      console.error('Failed to fetch monthly sessions:', err);
      setError(err.message || 'Failed to load monthly sleep data');
      setMonthlySessions([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedPeriod, selectedDate]);

  // Fetch data when period or date changes
  React.useEffect(() => {
    if (selectedPeriod === 'Day') {
      fetchSleepSession();
    } else if (selectedPeriod === 'Week') {
      fetchWeeklySessions();
    } else if (selectedPeriod === 'Month') {
      fetchMonthlySessions();
    }
  }, [selectedPeriod, selectedDate, fetchSleepSession, fetchWeeklySessions, fetchMonthlySessions]);

  // Refetch when screen gains focus so we always get fresh data (e.g. today's session after wake-up)
  useFocusEffect(
    React.useCallback(() => {
      if (selectedPeriod === 'Day') {
        fetchSleepSession();
      } else if (selectedPeriod === 'Week') {
        fetchWeeklySessions();
      } else if (selectedPeriod === 'Month') {
        fetchMonthlySessions();
      }
    }, [selectedPeriod, fetchSleepSession, fetchWeeklySessions, fetchMonthlySessions])
  );

  // Snore detail is now pre-computed and attached to the sleep session by the backend
  const snoreCalc = React.useMemo(() => {
    if (selectedPeriod !== 'Day' || !sleepSession?.snoreDetail) return null;
    return sleepSession.snoreDetail;
  }, [sleepSession, selectedPeriod]);

  const snoreRates = React.useMemo(() => {
    if (!snoreCalc || !sleepSession) return null;
    const startMs = new Date(sleepSession.sleepOnsetTime).getTime();
    const endMs = new Date(sleepSession.sleepEndTime).getTime();
    const totalSleepHours = (endMs - startMs) / 3600000;
    
    if (totalSleepHours <= 0) return null;

    return {
      overallRate: Math.round((snoreCalc.totalEvents / totalSleepHours) * 10) / 10,
      f1Rate: Math.round(((snoreCalc.freqCounts?.fc1 || 0) / totalSleepHours) * 10) / 10,
      f2Rate: Math.round(((snoreCalc.freqCounts?.fc2 || 0) / totalSleepHours) * 10) / 10,
      f3Rate: Math.round(((snoreCalc.freqCounts?.fc3 || 0) / totalSleepHours) * 10) / 10,
    };
  }, [snoreCalc, sleepSession]);

  // Motion bars within sleep session (same filter as chart)
  const motionBarsInSession = React.useMemo(() => {
    if (!sleepSession || selectedPeriod !== 'Day' || sleepMotionTimeline.length === 0) {
      return [];
    }
    const sessionStartMs = new Date(sleepSession.sleepOnsetTime).getTime();
    const sessionEndMs = new Date(sleepSession.sleepEndTime).getTime();
    if (!Number.isFinite(sessionStartMs) || !Number.isFinite(sessionEndMs) || sessionEndMs <= sessionStartMs) {
      return [];
    }
    return sleepMotionTimeline.filter(
      (point) => point.timestamp >= sessionStartMs && point.timestamp <= sessionEndMs && point.durationSeconds > 0
    );
  }, [selectedPeriod, sleepSession, sleepMotionTimeline]);

  // Total time of motion bars (awake duration) = sum of all bar durations
  const totalBarDurationSeconds = React.useMemo(
    () => motionBarsInSession.reduce((sum, point) => sum + point.durationSeconds, 0),
    [motionBarsInSession]
  );

  // Prepare display data from sleep session
  const displayData = React.useMemo(() => {
    if (selectedPeriod === 'Day' && sleepSession) {
      // Awake duration = total time of the motion bars (sum of bar durations)
      const awakeMinutes = Math.round(totalBarDurationSeconds / 60);
      const awakeDurationFormatted = totalBarDurationSeconds > 0
        ? formatSleepDuration(awakeMinutes)
        : '0m';
      // Awakenings = total bar count in sleep duration
      const awakeningsCount = motionBarsInSession.length;

      return {
        sleepTime: formatSleepTime(sleepSession.sleepOnsetTime),
        duration: formatSleepDuration(sleepSession.totalSleepTime),
        wakeupTime: formatSleepTime(sleepSession.sleepEndTime),
        timeInBed: formatSleepDuration(sleepSession.timeInBed),
        timeToSleep: `${sleepSession.sleepLatency} min`,
        sleepEfficiency: `${sleepSession.sleepEfficiency.toFixed(1)}%`,
        sleepScore: sleepSession.sleepScore,
        awakenings: awakeningsCount,
        restingHeartRate: sleepSession.restingHeartRate,
        minHeartRate: sleepSession.minHeartRate,
        wakeTime: sleepSession.wakeTime,
        awakeDuration: awakeDurationFormatted,
        outOfBedTime: sleepSession.outOfBedTime,
        dataQuality: sleepSession.dataQuality,
      };
    }
    
    // Return default/empty data with "--" for display
    return {
      sleepTime: '--',
      duration: '--',
      wakeupTime: '--',
      timeInBed: '--',
      timeToSleep: '--',
      sleepEfficiency: '--',
      sleepScore: null,
      awakenings: 0,
      restingHeartRate: null,
      awakeDuration: '--',
      minHeartRate: null,
      wakeTime: 0,
      outOfBedTime: 0,
      dataQuality: 0,
    };
  }, [selectedPeriod, sleepSession, totalBarDurationSeconds, motionBarsInSession]);

  // Chart dimensions
  const chartWidth = width - 64;
  const chartHeight = 220;
  const chartPadding = 20;
  const yAxisLabelWidth = 44;
  const chartBottomLabelSpace = 20;
  const plotStartX = chartPadding + yAxisLabelWidth;
  const availableWidth = chartWidth - chartPadding * 2 - yAxisLabelWidth;
  const availableHeight = chartHeight - chartPadding * 2 - chartBottomLabelSpace;

  const formatAxisTime = React.useCallback((unixMs: number): string => {
    const date = new Date(unixMs);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }, []);

  const formatYAxisLabel = React.useCallback((durationSeconds: number): string => {
    // Duration is now in seconds (not milliseconds)
    if (durationSeconds >= 60) {
      const minutes = Math.floor(durationSeconds / 60);
      const remainingSeconds = Math.round(durationSeconds % 60);
      if (remainingSeconds === 0) {
        return `${minutes}m`;
      }
      return `${minutes}m ${remainingSeconds}s`;
    }
    // Show seconds with decimal if less than 1 second, otherwise whole seconds
    if (durationSeconds < 1) {
      return `${durationSeconds.toFixed(1)}s`;
    }
    return `${Math.round(durationSeconds)}s`;
  }, []);

  const motionChartData = React.useMemo(() => {
    if (!sleepSession) {
      return {
        bars: [] as Array<{ x: number; y: number; width: number; height: number }>,
        yAxisMaxSeconds: 0,
        yAxisTicks: [] as Array<{ y: number; value: number }>,
        xAxisTicks: [] as Array<{ x: number; label: string }>,
      };
    }

    const sessionStartMs = new Date(sleepSession.sleepOnsetTime).getTime();
    const sessionEndMs = new Date(sleepSession.sleepEndTime).getTime();
    if (!Number.isFinite(sessionStartMs) || !Number.isFinite(sessionEndMs) || sessionEndMs <= sessionStartMs) {
      return {
        bars: [] as Array<{ x: number; y: number; width: number; height: number }>,
        yAxisMaxSeconds: 0,
        yAxisTicks: [] as Array<{ y: number; value: number }>,
        xAxisTicks: [] as Array<{ x: number; label: string }>,
      };
    }

    const motionBars = sleepMotionTimeline
      .filter((point) => point.timestamp >= sessionStartMs && point.timestamp <= sessionEndMs && point.durationSeconds > 0)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Convert duration from seconds to milliseconds for graph calculations
    const maxDurationSeconds = motionBars.length > 0
      ? Math.max(...motionBars.map((point) => point.durationSeconds))
      : 0;
    const yAxisMaxSeconds = maxDurationSeconds > 0 ? Math.ceil(maxDurationSeconds * 1.1) : 1; // Default to 1 second

    const dynamicBarWidth = Math.min(12, Math.max(3, availableWidth / Math.max(motionBars.length * 1.8, 1)));
    const sessionDurationMs = sessionEndMs - sessionStartMs;
    const bars = motionBars.map((point) => {
      const positionRatio = (point.timestamp - sessionStartMs) / sessionDurationMs;
      const barCenterX = plotStartX + positionRatio * availableWidth;
      const x = Math.max(
        plotStartX,
        Math.min(plotStartX + availableWidth - dynamicBarWidth, barCenterX - dynamicBarWidth / 2)
      );
      // Use durationSeconds for height calculation
      const height = yAxisMaxSeconds > 0
        ? Math.max(2, (point.durationSeconds / yAxisMaxSeconds) * availableHeight)
        : 0;
      const y = chartPadding + availableHeight - height;

      return { x, y, width: dynamicBarWidth, height };
    });

    const yAxisTicks = Array.from({ length: 6 }, (_, index) => {
      const ratio = index / 5;
      const y = chartPadding + ratio * availableHeight;
      const value = yAxisMaxSeconds * (1 - ratio); // Value in seconds
      return { y, value };
    });

    const xTickCount = 5;
    const xAxisTicks = Array.from({ length: xTickCount }, (_, index) => {
      const ratio = index / (xTickCount - 1);
      const x = plotStartX + ratio * availableWidth;
      const tickTimestamp = sessionStartMs + ratio * sessionDurationMs;
      return {
        x,
        label: formatAxisTime(tickTimestamp),
      };
    });

    return {
      bars,
      yAxisMaxSeconds,
      yAxisTicks,
      xAxisTicks,
    };
  }, [sleepSession, sleepMotionTimeline, availableWidth, availableHeight, formatAxisTime, plotStartX]);

  return (
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar barStyle={isLightTheme ? "dark-content" : "light-content"} backgroundColor={isLightTheme ? "#F8F9FA" : "#02041A"} />
      <LinearGradient 
        colors={isLightTheme ? ['#F8F9FA', '#F8F9FA'] : ['#1D244D', '#02041A', '#1A1D3E']} 
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, isLightTheme && { backgroundColor: 'rgba(0,97,164,0.06)' }]} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={24} color={isLightTheme ? "#0061A4" : "#FFFFFF"} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isLightTheme && { color: '#111111' }]} numberOfLines={1}>{activeDevice?.customName || activeDevice?.deviceId || 'More Insights'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Period Selector Tabs */}
        <View style={[styles.periodContainer, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }]}>
          {(['Day', 'Week', 'Month'] as const).map((period) => (
            <TouchableOpacity
              key={period}
              style={[styles.periodTab, selectedPeriod === period && [styles.periodTabActive, isLightTheme && { backgroundColor: '#0061A4' }]]}
              onPress={() => setSelectedPeriod(period)}
              activeOpacity={0.8}
            >
              <Text style={[styles.periodTabText, isLightTheme && { color: '#666666' }, selectedPeriod === period && [styles.periodTabTextActive, isLightTheme && { color: '#FFFFFF' }]]}>
                {period}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Date Navigation */}
        <View style={styles.dateNavigation}>
          <TouchableOpacity onPress={goToPrevious} style={[styles.dateNavButton, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }]} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color={isLightTheme ? "#0061A4" : "#C7D6FF"} />
          </TouchableOpacity>
          <Text style={[styles.dateText, isLightTheme && { color: '#111111' }]}>{formattedDate}</Text>
          <TouchableOpacity onPress={goToNext} style={[styles.dateNavButton, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }]} activeOpacity={0.8}>
            <Ionicons name="chevron-forward" size={20} color={isLightTheme ? "#0061A4" : "#C7D6FF"} />
          </TouchableOpacity>
        </View>

        {/* Loading State */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#7EA6FF" />
            <Text style={[styles.loadingText, isLightTheme && { color: '#666666' }]}>Loading sleep data...</Text>
          </View>
        )}

        {/* Error State - Show message but keep UI visible */}
        {error && !isLoading && (
          <View style={[styles.errorContainer, isLightTheme && { backgroundColor: 'rgba(0,97,164,0.06)', borderColor: 'rgba(0,97,164,0.12)' }]}>
            <Ionicons name="information-circle-outline" size={24} color={isLightTheme ? "#0061A4" : "#7EA6FF"} />
            <Text style={[styles.errorText, isLightTheme && { color: '#0061A4' }]}>{error}</Text>
          </View>
        )}

        {/* Key Sleep Metrics Grid - Always show */}
        {!isLoading && (
          <View style={styles.metricsGrid}>
            {/* Row 1 - Sleep Time, Duration, Wakeup Time */}
            <View style={styles.metricsRow}>
              <View style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                <Text style={[styles.metricLabel, isLightTheme && { color: '#666666' }]}>Sleep Time</Text>
                <Text style={[styles.metricValue, isLightTheme && { color: '#111111' }]}>{displayData.sleepTime}</Text>
              </View>
              <View style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                <View style={styles.metricLabelRow}>
                  <Text style={[styles.metricLabel, isLightTheme && { color: '#666666' }]}>Duration</Text>
                  <TouchableOpacity activeOpacity={0.6}>
                    <Ionicons name="help-circle-outline" size={16} color={isLightTheme ? "#0061A4" : "#7EA6FF"} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.metricValue, isLightTheme && { color: '#111111' }]}>{displayData.duration}</Text>
              </View>
              <View style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                <Text style={[styles.metricLabel, isLightTheme && { color: '#666666' }]}>Wakeup Time</Text>
                <Text style={[styles.metricValue, isLightTheme && { color: '#111111' }]}>{displayData.wakeupTime}</Text>
              </View>
            </View>

            {/* Row 2 - Sleep Efficiency, Awakenings, Time in Bed */}
            <View style={styles.metricsRow}>
              <View style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                <Text style={[styles.metricLabel, isLightTheme && { color: '#666666' }]}>Sleep Efficiency</Text>
                <Text style={[styles.metricValue, isLightTheme && { color: '#111111' }]}>{displayData.sleepEfficiency}</Text>
              </View>
              <View style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                <Text style={[styles.metricLabel, isLightTheme && { color: '#666666' }]}>Awakenings</Text>
                <Text style={[styles.metricValue, isLightTheme && { color: '#111111' }]}>{displayData.awakenings}</Text>
              </View>
              <View style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                <Text style={[styles.metricLabel, isLightTheme && { color: '#666666' }]}>Time in Bed</Text>
                <Text style={[styles.metricValue, isLightTheme && { color: '#111111' }]}>{displayData.timeInBed}</Text>
              </View>
            </View>

            {/* Row 3 - Resting HR, Min HR, Awake Duration */}
            <View style={[styles.metricsRow, { marginBottom: 0 }]}>
              <View style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                <Text style={[styles.metricLabel, isLightTheme && { color: '#666666' }]}>Resting HR</Text>
                <Text style={[styles.metricValue, isLightTheme && { color: '#111111' }]}>
                  {displayData.restingHeartRate ? `${displayData.restingHeartRate} bpm` : 'N/A'}
                </Text>
              </View>
              <View style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                <Text style={[styles.metricLabel, isLightTheme && { color: '#666666' }]}>Min HR</Text>
                <Text style={[styles.metricValue, isLightTheme && { color: '#111111' }]}>
                  {displayData.minHeartRate ? `${displayData.minHeartRate} bpm` : 'N/A'}
                </Text>
              </View>
              <View style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                <Text style={[styles.metricLabel, isLightTheme && { color: '#666666' }]}>Awake Duration</Text>
                <Text style={[styles.metricValue, isLightTheme && { color: '#111111' }]}>{displayData.awakeDuration}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Movement during sleep bar graph (Day view) */}
        {!isLoading && selectedPeriod === 'Day' && (
          <>
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: isLightTheme ? '#0061A4' : '#7EA6FF' }]} />
                <Text style={[styles.legendText, isLightTheme && { color: '#666666' }]}>Movement during sleep</Text>
              </View>
            </View>

            <View style={[styles.chartContainer, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
              {sleepSession ? (
                <>
                  <RNSvg.Svg width={chartWidth} height={chartHeight}>
                    {motionChartData.yAxisTicks.map((tick, index) => {
                      return (
                        <Rect
                          key={`grid-${index}`}
                          x={plotStartX}
                          y={tick.y}
                          width={availableWidth}
                          height={1}
                          fill={isLightTheme ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)"}
                        />
                      );
                    })}

                    {motionChartData.yAxisTicks.map((tick, index) => (
                      <SvgText
                        key={`y-label-${index}`}
                        x={plotStartX - 8}
                        y={tick.y + 4}
                        fill={isLightTheme ? "#666666" : "rgba(255,255,255,0.65)"}
                        fontSize={10}
                        fontWeight="600"
                        textAnchor="end"
                      >
                        {formatYAxisLabel(tick.value)}
                      </SvgText>
                    ))}

                    <Rect
                      x={plotStartX}
                      y={chartPadding}
                      width={1}
                      height={availableHeight}
                      fill={isLightTheme ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.2)"}
                    />
                    <Rect
                      x={plotStartX + availableWidth}
                      y={chartPadding}
                      width={1}
                      height={availableHeight}
                      fill={isLightTheme ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.2)"}
                    />
                    <Rect
                      x={plotStartX}
                      y={chartPadding + availableHeight}
                      width={availableWidth}
                      height={1}
                      fill={isLightTheme ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.2)"}
                    />

                    {motionChartData.bars.map((bar, index) => (
                      <Rect
                        key={`motion-bar-${index}`}
                        x={bar.x}
                        y={bar.y}
                        width={bar.width}
                        height={bar.height}
                        fill={isLightTheme ? "#0061A4" : "#7EA6FF"}
                        rx={2}
                        ry={2}
                      />
                    ))}

                    {motionChartData.xAxisTicks.map((tick, index) => (
                      <React.Fragment key={`x-tick-${index}`}>
                        <Rect
                          x={tick.x - 0.5}
                          y={chartPadding + availableHeight}
                          width={1}
                          height={5}
                          fill={isLightTheme ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.45)"}
                        />
                        <SvgText
                          x={tick.x}
                          y={chartPadding + availableHeight + 16}
                          fill={isLightTheme ? "#666666" : "rgba(199,214,255,0.75)"}
                          fontSize={10}
                          fontWeight="600"
                          textAnchor="middle"
                        >
                          {tick.label}
                        </SvgText>
                      </React.Fragment>
                    ))}
                  </RNSvg.Svg>

                </>
              ) : (
                <View style={styles.emptyChartContainer}>
                  <Ionicons name="moon-outline" size={48} color={isLightTheme ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.2)"} />
                  <Text style={[styles.emptyChartText, isLightTheme && { color: '#666666' }]}>No sleep data available</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Week/Month View - List of Sessions */}
        {!isLoading && !error && selectedPeriod !== 'Day' && (
          <View style={styles.sessionsList}>
            {(selectedPeriod === 'Week' ? weeklySessions : monthlySessions).length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="moon-outline" size={48} color={isLightTheme ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.3)"} />
                <Text style={[styles.emptyStateText, isLightTheme && { color: '#666666' }]}>No sleep data available</Text>
              </View>
            ) : (
              (selectedPeriod === 'Week' ? weeklySessions : monthlySessions).map((session, index) => (
                <View key={session._id || index} style={[styles.sessionCard, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 }]}>
                  <View style={styles.sessionHeader}>
                    <Text style={[styles.sessionDate, isLightTheme && { color: '#111111' }]}>{session.sessionDate}</Text>
                    {session.sleepScore !== null && (
                      <View style={[styles.scoreBadge, { backgroundColor: getSleepQualityColor(session.sleepScore) + '20' }]}>
                        <Text style={[styles.scoreText, { color: getSleepQualityColor(session.sleepScore) }]}>
                          {session.sleepScore}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.sessionMetrics}>
                    <View style={styles.sessionMetric}>
                      <Text style={[styles.sessionMetricLabel, isLightTheme && { color: '#666666' }]}>Duration</Text>
                      <Text style={[styles.sessionMetricValue, isLightTheme && { color: '#111111' }]}>{formatSleepDuration(session.totalSleepTime)}</Text>
                    </View>
                    <View style={styles.sessionMetric}>
                      <Text style={[styles.sessionMetricLabel, isLightTheme && { color: '#666666' }]}>Efficiency</Text>
                      <Text style={[styles.sessionMetricValue, isLightTheme && { color: '#111111' }]}>{session.sleepEfficiency.toFixed(1)}%</Text>
                    </View>
                    <View style={styles.sessionMetric}>
                      <Text style={[styles.sessionMetricLabel, isLightTheme && { color: '#666666' }]}>Awakenings</Text>
                      <Text style={[styles.sessionMetricValue, isLightTheme && { color: '#111111' }]}>{session.awakenings}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ─── SNORE DETAIL SECTION ─────────────────────────────────────────
            Only shown when: Day view + sleep detected + at least one snore event */}
        {!isLoading && selectedPeriod === 'Day' && sleepSession && snoreCalc && snoreRates && (() => {
          const sc = snoreCalc;
          const sr = snoreRates;

          const getSeverity = (r: number) => {
            if (r < 15) return { label: 'Normal to mild', color: '#F5C763' };
            if (r <= 30) return { label: 'Moderate', color: '#F59338' };
            return { label: 'Severe', color: '#E24B4A' };
          };

          const cardWidth = (width - 40 - 12) / 2;

          const renderRateCard = (title: string, rate: number) => {
            const sev = getSeverity(rate);
            const markerPct = Math.min((rate / 45) * 100, 100);
            const isYellow = sev.color === '#F5C763';

            return (
              <View style={[styles.snoreRateCard, { width: cardWidth }, isLightTheme && styles.snoreRateCardLight]} key={title}>
                <Text style={[styles.snoreRateTitle, isLightTheme && { color: '#111111' }]} numberOfLines={1} adjustsFontSizeToFit>{title}</Text>
                
                <View style={[styles.snoreRateCircle, { backgroundColor: sev.color }]}>
                  <Text style={[styles.snoreRateSeverityText, isYellow && { color: '#111111' }]}>{sev.label}</Text>
                  <Text style={[styles.snoreRateSubText, isYellow && { color: 'rgba(0,0,0,0.6)' }]}>Snore rate</Text>
                </View>

                <Text style={[styles.snoreRateValue, isLightTheme && { color: '#111111' }]}>
                  {rate.toFixed(1)}/hour
                </Text>

                <View style={styles.snoreScaleContainer}>
                  {/* Marker */}
                  <View style={[styles.snoreMarkerWrap, { left: `${markerPct}%` }]}>
                    <View style={[styles.snoreMarker, { borderTopColor: isLightTheme ? '#333333' : '#FFFFFF' }]} />
                  </View>

                  {/* Bar segments */}
                  <View style={styles.snoreScaleBar}>
                    <View style={[styles.snoreScaleSegment, { backgroundColor: '#F5C763', borderTopLeftRadius: 4, borderBottomLeftRadius: 4 }]} />
                    <View style={[styles.snoreScaleSegment, { backgroundColor: '#F59338' }]} />
                    <View style={[styles.snoreScaleSegment, { backgroundColor: '#E24B4A', borderTopRightRadius: 4, borderBottomRightRadius: 4 }]} />
                  </View>

                  {/* Boundaries and Labels */}
                  <View style={styles.snoreScaleLabelsWrap}>
                    <Text style={[styles.snoreScaleBoundary, { left: '33.3%', color: isLightTheme ? '#999' : 'rgba(255,255,255,0.5)' }]}>15</Text>
                    <Text style={[styles.snoreScaleBoundary, { left: '66.6%', color: isLightTheme ? '#999' : 'rgba(255,255,255,0.5)' }]}>30</Text>
                  </View>
                  <View style={styles.snoreScaleZonesRow}>
                    <Text style={[styles.snoreScaleZoneText, isLightTheme && { color: '#999' }]}>Normal to mild</Text>
                    <Text style={[styles.snoreScaleZoneText, isLightTheme && { color: '#999' }]}>Moderate</Text>
                    <Text style={[styles.snoreScaleZoneText, isLightTheme && { color: '#999' }]}>Severe</Text>
                  </View>
                </View>
              </View>
            );
          };

          // ── Timeline chart geometry ──────────────────────────────────────────
          const snoreChartWidth  = width - 40;
          const snoreChartH      = 140; 
          const snorePadding     = 16;
          const snoreBottomSpace = 28;
          const snoreAvailW      = snoreChartWidth - snorePadding * 2;
          const snoreAvailH      = snoreChartH - snorePadding - snoreBottomSpace;

          const sessionStartSec = new Date(sleepSession.sleepOnsetTime).getTime() / 1000;
          const sessionEndSec   = new Date(sleepSession.sleepEndTime).getTime() / 1000;
          const totalSleepSec   = sessionEndSec - sessionStartSec;

          const timelineEvents = sc.snoreTimeline || [];

          const formatTimeLabel = (epochSec: number) => {
            const d = new Date(epochSec * 1000);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          };

          const freqColor = (f: number, light: boolean) =>
            f === 1
              ? (light ? '#0061A4' : '#7EA6FF')
              : f === 2
              ? (light ? '#D97706' : '#F59E0B')
              : (light ? '#DC2626' : '#EF4444');

          return (
            <View style={styles.snoreSection}>
              {/* Section heading */}
              <View style={styles.snoreSectionHeader}>
                <Text style={[styles.snoreSectionTitle, isLightTheme && { color: '#111111' }]}>
                  Snore Detail
                </Text>
              </View>

              {/* 2x2 Grid for Charts 1-4 */}
              <View style={styles.snoreRateGrid}>
                {renderRateCard('Overall snore rate', sr.overallRate)}
                {renderRateCard('Low frequency (F1)', sr.f1Rate)}
                {renderRateCard('Medium frequency (F2)', sr.f2Rate)}
                {renderRateCard('High frequency (F3)', sr.f3Rate)}
              </View>

            </View>
          );
        })()}

      </ScrollView>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02041A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  periodContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodTabActive: {
    backgroundColor: '#7EA6FF',
  },
  periodTabText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '700',
  },
  periodTabTextActive: {
    color: '#FFFFFF',
  },
  dateNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  dateNavButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  metricsGrid: {
    marginBottom: 32,
    gap: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    justifyContent: 'flex-start',
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    marginTop: 8,
    marginBottom: 20,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
  },
  chartContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  chartLabelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  chartLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    width: 64,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 12,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(126,166,255,0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(126,166,255,0.2)',
  },
  errorText: {
    color: '#7EA6FF',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
    fontWeight: '600',
  },
  sessionsList: {
    marginTop: 20,
  },
  sessionCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionDate: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  scoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '800',
  },
  sessionMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sessionMetric: {
    flex: 1,
  },
  sessionMetricLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  sessionMetricValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyChartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    minHeight: 220,
  },
  emptyChartText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },

  // ─── Snore Detail Section ──────────────────────────────────────────────────
  snoreSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  snoreSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  snoreSectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  snoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  snoreBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  snoreSubheading: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 20,
  },

  snoreRateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  snoreRateCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  snoreRateCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.06)',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  snoreRateTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  snoreRateCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  snoreRateSeverityText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  snoreRateSubText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  snoreRateValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
  },
  snoreScaleContainer: {
    width: '100%',
    position: 'relative',
    marginTop: 4,
  },
  snoreMarkerWrap: {
    position: 'absolute',
    top: -9,
    marginLeft: -6, // Center the 12px wide triangle
    zIndex: 10,
  },
  snoreMarker: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  snoreScaleBar: {
    flexDirection: 'row',
    height: 6,
    width: '100%',
    marginBottom: 4,
  },
  snoreScaleSegment: {
    flex: 1,
    height: '100%',
  },
  snoreScaleLabelsWrap: {
    position: 'relative',
    height: 12,
    width: '100%',
  },
  snoreScaleBoundary: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: '700',
    transform: [{ translateX: -6 }],
  },
  snoreScaleZonesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 2,
  },
  snoreScaleZoneText: {
    flex: 1,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontSize: 7,
    fontWeight: '700',
  },

  snoreChartContainer: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  snoreEmptyChart: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoreEmptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '600',
  },

  snoreDonutContainer: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  snoreDonutLegend: {
    flex: 1,
    gap: 12,
  },
  snoreDonutLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  snoreDonutDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  snoreDonutLabelText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  snoreDonutCountText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
});
