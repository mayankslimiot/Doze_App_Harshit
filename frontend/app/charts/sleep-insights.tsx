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
  Alert,
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
const { Rect, Text: SvgText, Svg, Circle } = RNSvg as any;

const { width } = Dimensions.get('window');

// ─── Stage colours ───────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  DEEP: '#0047AB',
  LIGHT: '#38BDF8',
  REM: '#A855F7',
  AWAKE: '#FBBF24',
};

// ─── Quality helpers ──────────────────────────────────────────────────────────
function getQualityLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'N/A';
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Poor';
}

function getScoreArcOffset(score: number | null | undefined): string {
  const CIRCUMFERENCE = 2 * Math.PI * 45; // r=45
  const pct = score != null ? Math.min(Math.max(score, 0), 100) / 100 : 0;
  return String(CIRCUMFERENCE * (1 - pct));
}

function formatHHMM(isoString: string | undefined | null): string {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = d.getHours() < 12 ? 'AM' : 'PM';
    const h12 = (d.getHours() % 12 || 12).toString();
    return `${h12}:${m} ${ampm}`;
  } catch { return '--'; }
}

function buildInsightText(session: SleepSession): string {
  const deep = session.deepSleepMinutes ?? 0;
  const rem = session.remMinutes ?? 0;
  const awake = session.awakeMinutes ?? 0;
  const score = session.sleepScore;

  if (!session.stageTimeline || session.stageTimeline.length === 0) {
    return 'Not enough 30-second epoch data to classify sleep stages for this night. Check that the device was transmitting HR_M and Res_M fields.';
  }
  if (score !== null && score !== undefined && score >= 80) {
    return `Great night! You got ${Math.round(deep)}m of deep recovery sleep and ${Math.round(rem)}m of REM-like sleep. You barely woke up (${Math.round(awake)}m awake).`;
  }
  if (awake > 30) {
    return `Your sleep was interrupted — ${Math.round(awake)} minutes awake during the night. This reduced your overall recovery.`;
  }
  if (deep < 20) {
    return `You had very little deep recovery sleep (${Math.round(deep)}m). Try going to bed earlier or reducing screen time before sleep.`;
  }
  return `You slept ${formatSleepDuration(session.totalSleepTime)} with ${Math.round(deep)}m deep and ${Math.round(rem)}m REM-like sleep.`;
}

// ─── Stage Y positions (0=top=Awake, 1=REM, 2=Light, 3=Deep) ───────────────
const STAGE_Y_IDX: Record<string, number> = {
  AWAKE: 0,
  REM:   1,
  LIGHT: 2,
  DEEP:  3,
};

// ─── Hypnogram + Summary side-by-side card ───────────────────────────────────
function HypnogramCard({ session, isLight }: { session: SleepSession; isLight: boolean }) {
  const timeline = session.stageTimeline;
  const CHART_H = 160; // SVG chart height in px (taller for better readability)
  const Y_STEP  = CHART_H / 4; // each stage band height

  const hasTimeline = timeline && timeline.length > 0;
  const [chartWidth, setChartWidth] = React.useState(0);
  const svgWidth = chartWidth > 32 ? chartWidth - 32 : 0;

  // ── Path builder ────────────────────────────────────────────────────────────
  const toY = React.useCallback((stage: string) => {
    const idx = STAGE_Y_IDX[stage] ?? 0;
    // Centre of each band — no top padding so labels align exactly
    return idx * Y_STEP + Y_STEP / 2;
  }, [Y_STEP]);

  const pathD = React.useMemo(() => {
    if (!hasTimeline || svgWidth === 0) return '';
    const startTs = timeline![0].ts;
    const endTs   = timeline![timeline!.length - 1].ts;
    const totalSec = (endTs - startTs) || 1;
    const toX = (ts: number) => ((ts - startTs) / totalSec) * svgWidth;

    let d = '';
    for (let i = 0; i < timeline!.length; i++) {
      const e = timeline![i];
      const x = toX(e.ts);
      const y = toY(e.stage);
      if (i === 0) {
        d += `M${x.toFixed(1)},${y.toFixed(1)}`;
      } else {
        // Step-function: vertical jump first, then horizontal run
        d += ` V${y.toFixed(1)} H${x.toFixed(1)}`;
      }
    }
    d += ` H${svgWidth.toFixed(1)}`; // extend to right edge
    return d;
  }, [hasTimeline, timeline, svgWidth, toY]);

  // ── X-axis labels (4 ticks) ─────────────────────────────────────────────────
  const xLabels = React.useMemo(() => {
    if (!hasTimeline) return [];
    const startTs = timeline![0].ts;
    const endTs   = timeline![timeline!.length - 1].ts;
    return Array.from({ length: 4 }, (_, i) => {
      const ts = startTs + ((endTs - startTs) * i) / 3;
      const d  = new Date(ts * 1000);
      const h12 = (d.getHours() % 12 || 12).toString();
      const mm  = d.getMinutes().toString().padStart(2, '0');
      const ap  = d.getHours() < 12 ? 'AM' : 'PM';
      return `${h12}:${mm}${ap}`;
    });
  }, [hasTimeline, timeline]);

  // ── Colors ──────────────────────────────────────────────────────────────────
  const lineColor  = isLight ? '#1a5fa8' : '#5BA3D9';
  const gridColor  = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const textColor  = isLight ? '#555' : '#AAA';
  const valueColor = isLight ? '#111' : '#FFF';

  // ── Right-side summary data (mirroring the reference image) ─────────────────
  const tst       = session.totalSleepTime ?? 0;          // minutes
  const deepMin   = session.deepSleepMinutes ?? 0;
  const remMin    = session.remMinutes ?? 0;
  const wasoMin   = session.awakeMinutes ?? 0;            // Wake After Sleep Onset
  const awakenings = session.awakenings ?? 0;

  const pct = (min: number) => tst > 0 ? ` (${Math.round((min / tst) * 100)}%)` : '';

  const summaryRows = [
    { label: 'Deep',        value: `${Math.round(deepMin)}m${pct(deepMin)}` },
    { label: 'REM',         value: `${Math.round(remMin)}m${pct(remMin)}` },
    { label: 'WASO',        value: `${Math.round(wasoMin)}m` },
    { label: 'Awake',       value: String(awakenings) },
  ];

  // ── SVG components (inline require to keep them local) ──────────────────────
  const SVG     = require('react-native-svg').Svg;
  const Path    = require('react-native-svg').Path;
  const SvgLine = require('react-native-svg').Line;

  // Y-axis stage labels and their exact pixel centre positions (matches SVG grid lines)
  const yAxisItems = ['Awake', 'REM', 'Light', 'Deep'].map((label, i) => ({
    label,
    centerY: i * Y_STEP + Y_STEP / 2, // same formula as toY()
  }));

  const showMetricExplanation = (metricLabel: string) => {
    let title = '';
    let explanation = '';
    if (metricLabel === 'Deep') {
      title = 'Deep Sleep';
      explanation = 'The most restorative sleep stage. Crucial for physical recovery, energy restoration, tissue repair, and immune health.';
    } else if (metricLabel === 'REM') {
      title = 'REM Sleep';
      explanation = 'Rapid Eye Movement sleep. Crucial for cognitive recovery, memory consolidation, learning, and brain health.';
    } else if (metricLabel === 'WASO') {
      title = 'WASO (Wake After Sleep Onset)';
      explanation = 'The total time spent awake in minutes after initially falling asleep. Lower WASO indicates more continuous, restful sleep.';
    } else if (metricLabel === 'Awake') {
      title = 'Awake';
      explanation = 'The total number of times you woke up during the night (for at least one 30-second epoch).';
    }
    Alert.alert(title, explanation, [{ text: 'Got it' }]);
  };

  return (
    <View style={{ marginTop: 8 }} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>

      {/* ── TOP: Hypnogram Chart ──────────────────────────────────── */}
      <View style={{ width: '100%' }}>
        {!hasTimeline ? (
          <View style={{ height: CHART_H + 28, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: textColor, fontSize: 11, fontStyle: 'italic', textAlign: 'center' }}>
              Stage data not available{'\n'}(30-sec epoch packets required)
            </Text>
          </View>
        ) : chartWidth > 0 ? (
          <>
            {/* Y-labels + SVG in a row */}
            <View style={{ flexDirection: 'row' }}>

              {/* Y-axis labels — absolutely positioned to match SVG grid lines */}
              <View style={{ width: 32, height: CHART_H, position: 'relative' }}>
                {yAxisItems.map(({ label, centerY }) => (
                  <Text
                    key={label}
                    style={{
                      position: 'absolute',
                      top: centerY - 5,   // 5 ≈ half of fontSize 10
                      right: 2,
                      fontSize: 9,
                      fontWeight: '600',
                      color: textColor,
                      textAlign: 'right',
                    }}
                  >
                    {label}
                  </Text>
                ))}
              </View>

              {/* SVG hypnogram */}
              <View style={{ flex: 1 }}>
                <SVG width="100%" height={CHART_H}>
                  {/* Horizontal grid lines ── */}
                  {yAxisItems.map(({ label, centerY }) => (
                    <SvgLine
                      key={label}
                      x1={0} y1={centerY}
                      x2={svgWidth} y2={centerY}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  ))}
                  {/* Bottom border */}
                  <SvgLine
                    x1={0} y1={CHART_H - 1}
                    x2={svgWidth} y2={CHART_H - 1}
                    stroke={isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}
                    strokeWidth={1}
                  />
                  {/* Step-function hypnogram line */}
                  {pathD ? (
                    <Path
                      d={pathD}
                      stroke={lineColor}
                      strokeWidth={1.8}
                      fill="none"
                      strokeLinejoin="miter"
                    />
                  ) : null}
                </SVG>
              </View>
            </View>

            {/* X-axis time labels */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 32, marginTop: 5 }}>
              {xLabels.map((l, i) => (
                <Text key={i} style={{ fontSize: 8.5, color: textColor, fontWeight: '500' }}>{l}</Text>
              ))}
            </View>
          </>
        ) : null}
      </View>

      {/* ── BOTTOM: Horizontal Summary (under the graph, full width) ── */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 18,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
      }}>
        {summaryRows.map(({ label, value }) => (
          <TouchableOpacity
            key={label}
            style={{ flex: 1, alignItems: 'center' }}
            activeOpacity={0.7}
            onPress={() => showMetricExplanation(label)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Text style={{ fontSize: 9.5, color: textColor, fontWeight: '500' }}>
                {label}
              </Text>
              <Ionicons name="information-circle-outline" size={11} color={isLight ? '#0061A4' : '#7EA6FF'} style={{ marginLeft: 3 }} />
            </View>
            <Text style={{ fontSize: 10.5, color: valueColor, fontWeight: '700' }} numberOfLines={1}>
              {value}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

    </View>
  );
}

export default function SleepInsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeDevice } = useDevice();
  const { auth } = useAuth();
  const { isLightTheme } = useTheme();
  const [selectedDate, setSelectedDate] = React.useState(() => {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // If past 12 PM, we are in the next cycle (D to D+1)
    if (now.getHours() >= 12) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return today;
  });

  const maxAllowedDate = React.useMemo(() => {
    const now = new Date();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (now.getHours() >= 12) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return today;
  }, []);

  const [navDirection, setNavDirection] = React.useState<'prev' | 'next' | null>(null);

  React.useEffect(() => {
    if (!isLoading) {
      setNavDirection(null);
    }
  }, [isLoading]);

  // Navigate dates
  const goToPrevious = () => {
    setNavDirection('prev');
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 1);
    setSelectedDate(newDate);
  };

  const goToNext = () => {
    setNavDirection('next');
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 1);
    if (newDate <= maxAllowedDate) {
      setSelectedDate(newDate);
    }
  };

  const canGoNext = React.useMemo(() => {
    const testDate = new Date(selectedDate);
    testDate.setDate(testDate.getDate() + 1);
    return testDate <= maxAllowedDate;
  }, [selectedDate, maxAllowedDate]);

  // Sleep data state
  const [sleepSession, setSleepSession] = React.useState<SleepSession | null>(null);
  const [sleepMotionTimeline, setSleepMotionTimeline] = React.useState<SleepMotionEvent[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dayRequestInFlightKeyRef = React.useRef<string | null>(null);

  // Format date to YYYY-MM-DD for API
  const formatDateForAPI = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Fetch sleep session
  const fetchSleepSession = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) return;

    const dateStr = formatDateForAPI(selectedDate);
    const requestKey = `${activeDevice.deviceId}_${dateStr}`;
    if (dayRequestInFlightKeyRef.current === requestKey) return;
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
        setError(result.message || 'No valid sleep session found for this date.');
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
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate]);

  React.useEffect(() => { fetchSleepSession(); }, [fetchSleepSession]);

  useFocusEffect(
    React.useCallback(() => { fetchSleepSession(); }, [fetchSleepSession])
  );

  // Navigate dates
  const isToday = selectedDate.toDateString() === new Date().toDateString();

  // Motion bars within session
  const motionBarsInSession = React.useMemo(() => {
    if (!sleepSession || sleepMotionTimeline.length === 0) return [];
    const sessionStartMs = new Date(sleepSession.sleepOnsetTime).getTime();
    const sessionEndMs = new Date(sleepSession.sleepEndTime).getTime();
    if (!Number.isFinite(sessionStartMs) || !Number.isFinite(sessionEndMs) || sessionEndMs <= sessionStartMs) return [];
    return sleepMotionTimeline.filter(
      p => p.timestamp >= sessionStartMs && p.timestamp <= sessionEndMs && p.durationSeconds > 0
    );
  }, [sleepSession, sleepMotionTimeline]);

  const awakeningsCount = motionBarsInSession.length;
  const totalAwakeSec = motionBarsInSession.reduce((s, p) => s + p.durationSeconds, 0);
  const awakeDurationFormatted = totalAwakeSec > 0 ? formatSleepDuration(Math.round(totalAwakeSec / 60)) : '0m';

  // Snore data
  const snoreDetail = sleepSession?.snoreDetail ?? null;
  const snoringMinutes = snoreDetail
    ? Math.round((snoreDetail.totalRawSeconds || 0) / 60)
    : 0;

  // ── Counts from stageTimeline ────────────────────────────────────────────
  const awakeEpochs = React.useMemo(() => {
    if (!sleepSession?.stageTimeline) return 0;
    return sleepSession.stageTimeline.filter(e => e.stage === 'AWAKE').length;
  }, [sleepSession]);

  // ── Dynamic insight text ─────────────────────────────────────────────────
  const insightText = React.useMemo(() => {
    if (!sleepSession) return '';
    return buildInsightText(sleepSession);
  }, [sleepSession]);

  const score = sleepSession?.sleepScore ?? null;
  const qualLabel = getQualityLabel(score);
  const CIRCUM = 2 * Math.PI * 45;

  // Recovery percent fallback
  const recoveryPct = sleepSession?.recoveryPercent ?? 0;

  // Format date to show the 12 Noon to 12 Noon cycle (e.g., 26 - 27 May 2026)
  const formattedDateText = React.useMemo(() => {
    const startCycle = new Date(selectedDate);
    startCycle.setDate(startCycle.getDate() - 1);

    const startDay = startCycle.getDate();
    const startMonth = startCycle.toLocaleDateString('en-US', { month: 'short' });
    const endDay = selectedDate.getDate();
    const endMonth = selectedDate.toLocaleDateString('en-US', { month: 'short' });
    const year = selectedDate.getFullYear();

    if (startMonth === endMonth) {
      return `${startDay} - ${endDay} ${startMonth} ${year}`;
    }
    return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
  }, [selectedDate]);

  return (
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar
        barStyle={isLightTheme ? 'dark-content' : 'light-content'}
        backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'}
      />
      <LinearGradient
        colors={isLightTheme ? ['#F8F9FA', '#F8F9FA'] : ['#1D244D', '#02041A', '#1A1D3E']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, isLightTheme && { backgroundColor: 'rgba(0,97,164,0.06)' }]}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color={isLightTheme ? '#0061A4' : '#FFFFFF'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isLightTheme && { color: '#111111' }]} numberOfLines={1}>
          {activeDevice?.customName || activeDevice?.defaultName || 'Sleep Insights'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Date Navigation */}
        <View style={styles.dateNavigation}>
          <TouchableOpacity 
            onPress={goToPrevious} 
            style={isLoading ? [styles.dateNavButton, styles.dateNavButtonDisabled, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.02)' }] : [styles.dateNavButton, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }]} 
            activeOpacity={0.8}
            disabled={isLoading}
          >
            {(isLoading && navDirection === 'prev') ? (
              <ActivityIndicator size="small" color={isLightTheme ? "#0061A4" : "rgba(199,214,255,0.5)"} />
            ) : (
              <Ionicons name="chevron-back" size={20} color={isLoading ? (isLightTheme ? "rgba(0,0,0,0.15)" : "rgba(199,214,255,0.3)") : (isLightTheme ? "#0061A4" : "#C7D6FF")} />
            )}
          </TouchableOpacity>
          <Text style={[styles.dateText, isLightTheme && { color: '#111111' }]}>{formattedDateText}</Text>
          <TouchableOpacity 
            onPress={goToNext} 
            style={(canGoNext && !isLoading) ? [styles.dateNavButton, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }] : [styles.dateNavButton, styles.dateNavButtonDisabled, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.02)' }]} 
            activeOpacity={0.8}
            disabled={!canGoNext || isLoading}
          >
            {(isLoading && navDirection === 'next') ? (
              <ActivityIndicator size="small" color={isLightTheme ? "#0061A4" : "rgba(199,214,255,0.5)"} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={(canGoNext && !isLoading) ? (isLightTheme ? "#0061A4" : "#C7D6FF") : (isLightTheme ? "rgba(0,0,0,0.15)" : "rgba(199,214,255,0.3)")} />
            )}
          </TouchableOpacity>
        </View>

        {/* ── Loading ───────────────────────────────────────────────── */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={isLightTheme ? '#0061A4' : '#7EA6FF'} />
            <Text style={[styles.loadingText, isLightTheme && { color: '#444' }]}>Loading sleep data…</Text>
          </View>
        )}

        {/* ── No session / error ────────────────────────────────────── */}
        {!isLoading && error && !sleepSession && (
          <View style={[styles.emptyState, { paddingTop: 60 }]}>
            <Ionicons name="moon-outline" size={56} color={isLightTheme ? '#CBD5E1' : 'rgba(255,255,255,0.2)'} />
            <Text style={[styles.emptyStateTitle, isLightTheme && { color: '#555' }]}>No Sleep Data</Text>
            <Text style={[styles.emptyStateSub, isLightTheme && { color: '#888' }]}>
              {error}
            </Text>
          </View>
        )}

        {/* ── Session content ───────────────────────────────────────── */}
        {!isLoading && sleepSession && (
          <>
            {/* Score Card */}
            <View style={[styles.scoreCard, isLightTheme && styles.cardLight]}>
              <View style={styles.scoreTopRow}>
                {/* Circle */}
                <View style={styles.scoreLeft}>
                  <View style={styles.scoreCircle}>
                    <Svg width={100} height={100} viewBox="0 0 100 100">
                      <Circle
                        cx="50" cy="50" r="45"
                        stroke={isLightTheme ? '#E6F0FA' : 'rgba(255,255,255,0.1)'}
                        strokeWidth="8" fill="none"
                      />
                      <Circle
                        cx="50" cy="50" r="45"
                        stroke={getSleepQualityColor(score)}
                        strokeWidth="8"
                        strokeDasharray={String(CIRCUM)}
                        strokeDashoffset={getScoreArcOffset(score)}
                        strokeLinecap="round"
                        fill="none"
                        transform="rotate(-90 50 50)"
                      />
                    </Svg>
                    <View style={styles.scoreTextContainer}>
                      <Text style={[styles.scoreValue, isLightTheme && { color: '#111' }]}>
                        {score != null ? String(score) : '--'}
                      </Text>
                      <Text style={[styles.scoreTotal, isLightTheme && { color: '#666' }]}>/100</Text>
                    </View>
                  </View>
                  <Text style={[styles.scoreLabel, { color: getSleepQualityColor(score) }]}>
                    {qualLabel} Sleep
                  </Text>
                </View>

                {/* Middle */}
                <View style={styles.scoreMiddle}>
                  <Text style={[styles.scoreDesc, isLightTheme && { color: '#444' }]}>
                    Your sleep was{' '}
                    <Text style={[styles.scoreDescBold, isLightTheme && { color: '#111' }]}>{qualLabel}</Text>
                    {(sleepSession.awakenings ?? 0) > 0 ? ` with ${sleepSession.awakenings} interruption${sleepSession.awakenings > 1 ? 's' : ''}.` : '.'}
                  </Text>
                  {recoveryPct > 0 && (
                    <View style={[styles.trendBadge, isLightTheme && { backgroundColor: '#F0F9FF' }]}>
                      <Ionicons name="flash" size={14} color="#0061A4" />
                      <Text style={styles.trendText}>{recoveryPct}% Recovery{'\n'}(Deep + REM)</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={[styles.scoreDivider, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.05)' }]} />

              {/* Bottom Stats */}
              <View style={styles.scoreBottomRow}>
                <View style={styles.bottomStat}>
                  <View style={[styles.statIconBox, { backgroundColor: isLightTheme ? '#F3E8FF' : 'rgba(124,58,237,0.2)' }]}>
                    <Ionicons name="moon" size={16} color={isLightTheme ? '#7C3AED' : '#A78BFA'} />
                  </View>
                  <View style={styles.statContentBox}>
                    <Text style={[styles.statTitle, isLightTheme && { color: '#666' }]}>Total Sleep</Text>
                    <Text style={[styles.statValue, isLightTheme && { color: '#111' }]}>
                      {formatSleepDuration(sleepSession.totalSleepTime)}
                    </Text>
                    <Text style={[styles.statSub, isLightTheme && { color: '#888' }]}>Time asleep</Text>
                  </View>
                </View>

                <View style={styles.bottomStat}>
                  <View style={[styles.statIconBox, { backgroundColor: isLightTheme ? '#E0F2FE' : 'rgba(2,132,199,0.2)' }]}>
                    <Ionicons name="bed" size={16} color={isLightTheme ? '#0284C7' : '#38BDF8'} />
                  </View>
                  <View style={styles.statContentBox}>
                    <Text style={[styles.statTitle, isLightTheme && { color: '#666' }]}>In Bed</Text>
                    <Text style={[styles.statValue, isLightTheme && { color: '#111' }]} numberOfLines={1}>
                      {formatHHMM(sleepSession.tibStart)} – {formatHHMM(sleepSession.tibEnd)}
                    </Text>
                    <Text style={[styles.statSub, isLightTheme && { color: '#888' }]}>
                      {formatSleepDuration(sleepSession.timeInBed)} in bed
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Sleep Timeline — Hypnogram */}
            <View style={[styles.timelineCard, isLightTheme && styles.cardLight]}>
              <View style={styles.timelineHeader}>
                <View style={styles.timelineTitleRow}>
                  <Text style={[styles.timelineTitle, isLightTheme && { color: '#111' }]}>Sleep Hypnogram</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      Alert.alert(
                        'Sleep Stages',
                        'Awake: Short awakenings or restless periods during the night.\n\nREM: Rapid Eye Movement sleep. Crucial for memory consolidation, learning, and mood regulation.\n\nLight: The transition stage. Most of your sleep is spent here.\n\nDeep: The most restorative sleep stage. Crucial for physical recovery and immune system health.',
                        [{ text: 'Got it' }]
                      );
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={16} color={isLightTheme ? '#999' : '#AAA'} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Hypnogram chart + summary side-by-side */}
              <HypnogramCard session={sleepSession} isLight={isLightTheme} />
            </View>

            {/* Key metrics row */}
            <View style={styles.metricsRow}>
              {[
                { label: 'Efficiency', value: `${sleepSession.sleepEfficiency.toFixed(1)}%`, icon: 'speedometer-outline', color: '#34D399' },
                { label: 'Movement During Sleep', value: awakeDurationFormatted, icon: 'walk-outline', color: '#FB923C' },
              ].map(m => (
                <View key={m.label} style={[styles.metricCard, isLightTheme && { backgroundColor: '#FFF', borderColor: 'rgba(0,0,0,0.06)' }]}>
                  <Ionicons name={m.icon as any} size={16} color={m.color} style={{ marginBottom: 6 }} />
                  <Text style={[styles.metricValue, isLightTheme && { color: '#111' }]}>{m.value}</Text>
                  <Text style={[styles.metricLabel, isLightTheme && { color: '#666' }]}>{m.label}</Text>
                </View>
              ))}
            </View>

            {/* Incidents */}
            <View style={styles.incidentsSection}>
              <Text style={[styles.incidentsTitle, isLightTheme && { color: '#111' }]}>Incidents Detected</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.incidentsScroll}>

                {/* Snoring */}
                <View style={[styles.incidentCard, isLightTheme ? { backgroundColor: '#F5F3FF' } : { backgroundColor: 'rgba(139,92,246,0.1)' }]}>
                  <View style={[styles.incidentIconBox, isLightTheme ? { backgroundColor: '#EDE9FE' } : { backgroundColor: 'rgba(139,92,246,0.2)' }]}>
                    <Ionicons name="options" size={24} color={isLightTheme ? '#8B5CF6' : '#A78BFA'} />
                  </View>
                  <Text style={[styles.incidentCardTitle, isLightTheme && { color: '#111' }]}>Snoring</Text>
                  <Text style={[styles.incidentCardMain, isLightTheme && { color: '#111' }]}>
                    <Text style={{ color: isLightTheme ? '#8B5CF6' : '#A78BFA' }}>
                      {snoreDetail ? `${snoringMinutes} min` : '--'}
                    </Text>
                  </Text>

                </View>





                {/* Restlessness from stage epochs */}
                <View style={[styles.incidentCard, isLightTheme ? { backgroundColor: '#FFF7ED' } : { backgroundColor: 'rgba(234,88,12,0.1)' }]}>
                  <View style={[styles.incidentIconBox, isLightTheme ? { backgroundColor: '#FFEDD5' } : { backgroundColor: 'rgba(234,88,12,0.2)' }]}>
                    <Ionicons name="water" size={24} color={isLightTheme ? '#EA580C' : '#FB923C'} />
                  </View>
                  <Text style={[styles.incidentCardTitle, isLightTheme && { color: '#111' }]}>Restlessness</Text>
                  <Text style={[styles.incidentCardMain, isLightTheme && { color: '#111' }]}>
                    <Text style={{ color: isLightTheme ? '#EA580C' : '#FB923C' }}>
                      {awakeEpochs > 0
                        ? awakeEpochs <= 4 ? 'Low' : awakeEpochs <= 12 ? 'Moderate' : 'High'
                        : '--'}
                    </Text>
                  </Text>

                </View>

                {/* Heart Rate */}
                {sleepSession.restingHeartRate != null && (
                  <View style={[styles.incidentCard, isLightTheme ? { backgroundColor: '#FFF5F5' } : { backgroundColor: 'rgba(225,29,72,0.1)' }]}>
                    <View style={[styles.incidentIconBox, isLightTheme ? { backgroundColor: '#FFE4E6' } : { backgroundColor: 'rgba(225,29,72,0.2)' }]}>
                      <Ionicons name="heart" size={24} color={isLightTheme ? '#E11D48' : '#FB7185'} />
                    </View>
                    <Text style={[styles.incidentCardTitle, isLightTheme && { color: '#111' }]}>Avg Heart Rate</Text>
                    <Text style={[styles.incidentCardMain, isLightTheme && { color: '#111' }]}>
                      <Text style={{ color: isLightTheme ? '#E11D48' : '#FB7185' }}>
                        {sleepSession.restingHeartRate} bpm
                      </Text>
                    </Text>

                  </View>
                )}
              </ScrollView>
            </View>

            {/* Key Insight */}
            <View style={[styles.insightCard, isLightTheme && { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
              <View style={styles.insightIconBox}>
                <Ionicons name="bulb-outline" size={20} color="#0284C7" />
              </View>
              <View style={styles.insightContent}>
                <Text style={[styles.insightTitle, isLightTheme && { color: '#0284C7' }]}>Key Insight</Text>
                <Text style={[styles.insightText, isLightTheme && { color: '#0F172A' }]}>{insightText}</Text>
              </View>
            </View>


          </>
        )}
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
  // Date label row
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
  dateNavButtonDisabled: {
    opacity: 0.4,
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  // Loading / empty
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptyStateSub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  // Cards
  cardLight: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(0,0,0,0.1)',
  },
  scoreCard: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  scoreTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreLeft: { alignItems: 'center', width: 100 },
  scoreCircle: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  scoreTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: { color: '#FFF', fontSize: 28, fontWeight: '800' },
  scoreTotal: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginTop: -4 },
  scoreLabel: { color: '#7EA6FF', fontSize: 13, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  scoreMiddle: { flex: 1, paddingLeft: 20, justifyContent: 'center' },
  scoreDesc: { color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  scoreDescBold: { color: '#FFF', fontWeight: '700' },
  trendBadge: {
    flexDirection: 'row',
    backgroundColor: 'rgba(126,166,255,0.15)',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  trendText: { color: '#0061A4', fontSize: 11, fontWeight: '600', marginLeft: 6, lineHeight: 14 },
  scoreDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 20,
  },
  scoreBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  bottomStat: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statIconBox: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  statContentBox: { justifyContent: 'center', flex: 1 },
  statTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },
  statValue: { color: '#FFF', fontSize: 13, fontWeight: '700', marginTop: 2 },
  statSub: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
  // Timeline
  timelineCard: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  timelineTitleRow: { flexDirection: 'row', alignItems: 'center' },
  timelineTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  timelineBarWrapper: { marginBottom: 8 },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeLabelText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '500' },
  sleepBarContainer: {
    height: 22,
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
  },
  sleepSegment: { height: '100%' },
  noStageText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItemNew: { flexDirection: 'row', alignItems: 'center' },
  legendDotNew: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendTextNew: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '500' },
  // Stage summary pills
  stageSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 8,
  },
  stagePill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  stagePillLight: { backgroundColor: 'rgba(0,0,0,0.04)' },
  stageDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  stageLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '600', marginBottom: 3 },
  stageMin: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  // Metrics row
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  // Incidents
  incidentsSection: { marginBottom: 20 },
  incidentsTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  incidentsScroll: { paddingHorizontal: 4, gap: 8 },
  incidentCard: {
    width: 140, borderRadius: 16, padding: 16,
  },
  incidentIconBox: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  incidentCardTitle: { color: '#FFF', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  incidentCardMain: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  incidentCardSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 16 },
  // Insight
  insightCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(2,132,199,0.08)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(2,132,199,0.2)',
    alignItems: 'flex-start',
  },
  insightIconBox: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(2,132,199,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  insightContent: { flex: 1 },
  insightTitle: { color: '#38BDF8', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  insightText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19 },
  // Data quality
  dataQualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
    gap: 8,
  },
  dataQualityText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
});
