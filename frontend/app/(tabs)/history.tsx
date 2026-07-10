import React from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView, Dimensions, TouchableOpacity, Modal, Pressable, Animated, Easing, ActivityIndicator, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBluetooth } from '@/contexts/BluetoothProvider';
import { useDevice } from '@/contexts/DeviceContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getHistoricalData, getStressGraph } from '@/services/deviceData';
import { getSleepSessions } from '@/services/sleepAnalytics';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RNSvg = require('react-native-svg');
const { Path } = RNSvg as { Path: any };

const { width } = Dimensions.get('window');

// small util: generate sample sparkline points
function genSparklinePoints(widthPx = 120, heightPx = 28, count = 12, min = 0, max = 100) {
  const values = Array.from({ length: count }, () => Math.random() * (max - min) + min);
  const stepX = widthPx / (count - 1);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = heightPx - ((v - minVal) / range) * heightPx;
    return `${x},${y}`;
  });
  return { svgPoints: points.join(' '), raw: values } as const;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { connectedDevice } = useBluetooth();
  const { activeDevice } = useDevice();
  const router = useRouter();

  const { isLightTheme } = useTheme();

  const [isLoadingData, setIsLoadingData] = React.useState(false);
  const [availableMetrics, setAvailableMetrics] = React.useState<string[]>([]);

  // Filter state
  const [isFilterOpen, setFilterOpen] = React.useState(false);
  // Committed state used by the screen
  const [selectedMetrics, setSelectedMetrics] = React.useState<string[]>([]);
  const [period, setPeriod] = React.useState<'24h' | '2d' | '3d' | '7d' | '30d'>('24h');
  // Pending state while filter sheet is open (applied only on Apply)
  const [pendingSelectedMetrics, setPendingSelectedMetrics] = React.useState<string[]>([]);
  const [pendingPeriod, setPendingPeriod] = React.useState<'24h' | '2d' | '3d' | '7d' | '30d'>('24h');
  // Active badge/outline only when metrics are selected (never for time period)
  const isFilterActive = selectedMetrics.length > 0;

  const periodLabel = React.useMemo(() => {
    switch (period) {
      case '24h': return 'Last 24 Hours';
      case '2d': return 'Last 2 Days';
      case '3d': return 'Last 3 Days';
      case '7d': return 'Last 7 Days';
      default: return 'Last 30 Days';
    }
  }, [period]);

  // Glow pulse for filter button when filters are applied
  const glowAnim = React.useRef(new Animated.Value(0)).current;
  const triggerGlowPulse = React.useCallback(() => {
    Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0, duration: 500, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [glowAnim]);

  // Glow when: metrics selection transitions from empty to non-empty
  const prevHasMetricsRef = React.useRef<boolean>(selectedMetrics.length > 0);
  React.useEffect(() => {
    const hasMetrics = selectedMetrics.length > 0;
    if (!prevHasMetricsRef.current && hasMetrics) {
      triggerGlowPulse();
    }
    prevHasMetricsRef.current = hasMetrics;
  }, [selectedMetrics, triggerGlowPulse]);

  // No glow for time-period changes; only metric selection triggers glow

  // Fetch logic for available metrics
  React.useEffect(() => {
    const deviceId = activeDevice?.deviceId || connectedDevice?.id;
    if (!deviceId) return;

    let isMounted = true;
    setIsLoadingData(true);

    const apiPeriod = period === '2d' ? '48h' : period === '3d' ? '72h' : period;
    
    // Calculate date bounds for sleep sessions API
    const now = new Date();
    const startDate = new Date(now);
    if (period === '24h') startDate.setDate(now.getDate() - 1);
    else if (period === '2d') startDate.setDate(now.getDate() - 2);
    else if (period === '3d') startDate.setDate(now.getDate() - 3);
    else if (period === '7d') startDate.setDate(now.getDate() - 7);
    else startDate.setDate(now.getDate() - 30);

    Promise.all([
      getHistoricalData(deviceId, apiPeriod),
      getSleepSessions(deviceId, startDate, now),
      getStressGraph(deviceId, startDate, now)
    ])
      .then(([res, sleepRes, stressRes]) => {
        if (!isMounted) return;
        const foundKeys = new Set<string>();
        
        // Process historical data variables
        if (res.success && res.data && res.data.length > 0) {
          const keysToCheck = [
            'temperature', 'humidity', 'iaq', 'eco2', 'tvoc', 'etoh', 'hrv',
            'heartRate', 'respiration', 'sdnn', 'rmssd', 'lfPower', 'hfPower', 'lfHfRatio',
            'skinTemp', 'envTemp'
          ];
          const keyMap: Record<string, string[]> = {
            'heartRate': ['heartRate', 'hr'],
            'respiration': ['respiration', 'resp'],
            'temperature': ['temperature', 'temp'],
          };

          for (const item of res.data) {
            for (const key of keysToCheck) {
              if (foundKeys.has(key)) continue;
              const aliases = keyMap[key] || [key];
              for (const alias of aliases) {
                if (item[alias] !== undefined && item[alias] !== null && item[alias] !== 0 && item[alias] !== '') {
                  foundKeys.add(key);
                  break;
                }
              }
            }
          }
        }
        
        // Process sleep data
        if (sleepRes.success && sleepRes.data && sleepRes.data.length > 0) {
          foundKeys.add('sleep');
        }

        // Process stress data
        if (stressRes.success && stressRes.data && stressRes.data.points && stressRes.data.points.length > 0) {
          foundKeys.add('stress');
        }

        if (foundKeys.size > 0) {
          setAvailableMetrics(Array.from(foundKeys));
        } else {
          setAvailableMetrics([]);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (isMounted) setIsLoadingData(false);
      });

    return () => { isMounted = false; };
  }, [activeDevice?.deviceId, connectedDevice?.id, period]);

  // Metric tiles (same style as Home's Environment Data)
  const baseMetrics = React.useMemo(
    () => [
      { key: 'hr', name: 'Estimated HR', value: '68', unit: 'BPM', icon: '❤️', colors: ['#2B2E57', '#1B1E3D'] as const },
      { key: 'resp', name: 'Estimated Respiration', value: '14', unit: 'RPM', icon: '🌬️', colors: ['#24425F', '#18253A'] as const },
      { key: 'temp', name: 'Temperature', value: '36.5', unit: '°C', icon: '🌡️', colors: ['#2B3E56', '#172235'] as const },
      { key: 'hum', name: 'Humidity', value: '45', unit: '%', icon: '💧', colors: ['#2A4A3E', '#153127'] as const },
    ],
    []
  );

  const envMetrics = React.useMemo(
    () => [
      { key: 'iaq', name: 'IAQ', value: 'Good', unit: '', icon: '🧪', colors: ['#3A2C59', '#1D1430'] as const },
      { key: 'tvoc', name: 'TVOC', value: '180', unit: 'ppb', icon: '☁️', colors: ['#2B3054', '#161A33'] as const },
      { key: 'eco2', name: 'eCO₂', value: '650', unit: 'ppm', icon: '🫧', colors: ['#29334D', '#121A2A'] as const },
      { key: 'skin', name: 'Skin Temp', value: '33.2', unit: '°C', icon: '🧍', colors: ['#2F2E4A', '#17162A'] as const },
    ],
    []
  );

  // Available filter metrics list (matches the web filters)
  const AVAILABLE_METRICS = React.useMemo(
    () => [
      { key: 'temperature', label: 'Temperature' },
      { key: 'humidity', label: 'Humidity' },
      { key: 'iaq', label: 'IAQ' },
      { key: 'eco2', label: 'eCO2' },
      { key: 'tvoc', label: 'TVOC' },
      { key: 'etoh', label: 'ETOH' },
      { key: 'hrv', label: 'HRV' },
      { key: 'stress', label: 'Stress' },
      { key: 'sleep', label: 'Sleep' },
      { key: 'heartRate', label: 'Estimated HR' },
      { key: 'respiration', label: 'Estimated Respiration' },
      { key: 'sdnn', label: 'SDNN' },
      { key: 'rmssd', label: 'RMSSD' },
      { key: 'lfPower', label: 'LF Power' },
      { key: 'hfPower', label: 'HF Power' },
      { key: 'lfHfRatio', label: 'LF/HF Ratio' },
      { key: 'skinTemp', label: 'Skin Temp' },
      { key: 'envTemp', label: 'Env Temp' },
    ],
    []
  );

  // Map filter metrics to tile definitions for display
  const metricTiles = React.useMemo(
    () => ({
      temperature: { key: 'temperature', name: 'Temperature', value: '22.5', unit: '°C', icon: '🌡️', colors: ['#2B3E56', '#172235'] as const },
      humidity: { key: 'humidity', name: 'Humidity', value: '48', unit: '%', icon: '💧', colors: ['#24425F', '#18253A'] as const },
      iaq: { key: 'iaq', name: 'IAQ', value: 'Good', unit: '', icon: '🌬️', colors: ['#3A2C59', '#1D1430'] as const },
      eco2: { key: 'eco2', name: 'eCO₂', value: '650', unit: 'ppm', icon: '🫧', colors: ['#29334D', '#121A2A'] as const },
      tvoc: { key: 'tvoc', name: 'TVOC', value: '180', unit: 'ppb', icon: '☁️', colors: ['#2F2E4A', '#17162A'] as const },
      etoh: { key: 'etoh', name: 'ETOH', value: '--', unit: 'ppb', icon: '🍷', colors: ['#2B2F3F', '#161925'] as const },
      hrv: { key: 'hrv', name: 'HRV', value: '65', unit: 'ms', icon: '💓', colors: ['#2B2E57', '#1B1E3D'] as const },
      stress: { key: 'stress', name: 'Stress', value: 'Moderate', unit: '', icon: '😮‍💨', colors: ['#4A2B2B', '#1E1414'] as const },
      sleep: { key: 'sleep', name: 'Sleep', value: '0', unit: 'h', icon: '😴', colors: ['#1C1B33', '#111122'] as const },
      heartRate: { key: 'heartRate', name: 'Estimated HR', value: '68', unit: 'BPM', icon: '❤️', colors: ['#2B2E57', '#1B1E3D'] as const },
      respiration: { key: 'respiration', name: 'Estimated Respiration', value: '14', unit: 'RPM', icon: '🌬️', colors: ['#24425F', '#18253A'] as const },
      sdnn: { key: 'sdnn', name: 'SDNN', value: '42', unit: 'ms', icon: '📈', colors: ['#2B3054', '#161A33'] as const },
      rmssd: { key: 'rmssd', name: 'RMSSD', value: '35', unit: 'ms', icon: '📊', colors: ['#2B3054', '#161A33'] as const },
      lfPower: { key: 'lfPower', name: 'LF Power', value: '1200', unit: 'ms²', icon: '🔵', colors: ['#1C2E4A', '#0E1625'] as const },
      hfPower: { key: 'hfPower', name: 'HF Power', value: '900', unit: 'ms²', icon: '🟢', colors: ['#1C4A2E', '#0E2516'] as const },
      lfHfRatio: { key: 'lfHfRatio', name: 'LF/HF Ratio', value: '1.3', unit: '', icon: '⚖️', colors: ['#2E2E2E', '#151515'] as const },
      skinTemp: { key: 'skinTemp', name: 'Skin Temp', value: '33.2', unit: '°C', icon: '🧍', colors: ['#2F2E4A', '#17162A'] as const },
      envTemp: { key: 'envTemp', name: 'Env Temp', value: '22.0', unit: '°C', icon: '🌡️', colors: ['#2B3E56', '#172235'] as const },
    }),
    []
  );

  const allMetrics = React.useMemo(() => [
    metricTiles.heartRate,
    metricTiles.respiration,
    metricTiles.temperature,
    metricTiles.humidity,
    metricTiles.iaq,
    metricTiles.tvoc,
    metricTiles.eco2,
    metricTiles.skinTemp,
    metricTiles.envTemp,
    metricTiles.hrv,
    metricTiles.stress,
    metricTiles.sleep,
    metricTiles.sdnn,
    metricTiles.rmssd,
    metricTiles.lfPower,
    metricTiles.hfPower,
    metricTiles.lfHfRatio,
    metricTiles.etoh,
  ], [metricTiles]);

  const sparklines = React.useMemo(() => {
    const map: Record<string, { svgPoints: string; raw: number[] }> = {};
    allMetrics.forEach((m) => {
      map[m.key] = genSparklinePoints(120, 28, 12, 0, 100) as unknown as { svgPoints: string; raw: number[] };
    });
    return map;
  }, [allMetrics]);

  const deviceLabel = activeDevice?.customName || activeDevice?.defaultName || connectedDevice?.name || activeDevice?.deviceId || connectedDevice?.id || 'Device';

  // Derived: tiles to render based on selected metrics and available data
  const tilesToRender = React.useMemo(() => {
    let baseList = allMetrics;
    
    if (availableMetrics.length > 0) {
      baseList = baseList.filter(m => availableMetrics.includes(m.key));
    } else {
      baseList = [];
    }
    
    if (selectedMetrics.length > 0) {
      return selectedMetrics
        .map((k) => (metricTiles as any)[k])
        .filter(Boolean)
        .filter(m => availableMetrics.includes(m.key));
    }
    
    return baseList;
  }, [selectedMetrics, metricTiles, allMetrics, availableMetrics]);

  const onOpenFilter = () => {
    // initialize pending values from committed values
    setPendingSelectedMetrics(selectedMetrics);
    setPendingPeriod(period);
    setFilterOpen(true);
  };
  const onCloseFilter = () => setFilterOpen(false);
  const onToggleMetric = (key: string) => {
    // Toggle in PENDING selection only
    setPendingSelectedMetrics((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  };
  const onApplyFilter = () => {
    // Commit pending selections
    setSelectedMetrics(pendingSelectedMetrics);
    setPeriod(pendingPeriod);
    setFilterOpen(false);
  };
  const onRefresh = () => {
    setSelectedMetrics([]);
    setPeriod('24h');
    // In real impl: refetch latest data
  };

  return (
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar 
        barStyle={isLightTheme ? 'dark-content' : 'light-content'} 
        backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} 
      />
      {isLightTheme ? null : (
        <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}> 
        <Text style={[styles.headerTitle, isLightTheme && { color: '#111111' }]}>History</Text>
        <View style={styles.headerActions}>

          <TouchableOpacity style={[styles.headerIconBtn, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)' }]} activeOpacity={0.8} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color={isLightTheme ? '#0061A4' : '#C7B9FF'} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Control row */}
        <View style={styles.controlsRow}>
          <View style={[styles.pill, isLightTheme && { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.06)' }]}><Text style={[styles.pillText, isLightTheme && { color: '#666666' }]}>Device: {deviceLabel}</Text></View>
        </View>

        {/* Quick chips */}
        <View style={styles.chipsRow}>
          {(['24h', '2d', '3d', '7d', '30d'] as const).map((p) => (
            <Pressable 
              key={p} 
              onPress={() => setPeriod(p)} 
              style={[
                styles.chip, 
                period === p && styles.chipActive,
                isLightTheme && { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0, 0, 0, 0.06)' },
                period === p && isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.12)', borderColor: '#0061A4', borderWidth: 1 }
              ]}
            >
              <Text style={[styles.chipText, isLightTheme && { color: period === p ? '#0061A4' : '#666666' }]}>{p.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>


        {/* Metric cards grid (same style as Home Environment Data) */}
        <View style={[styles.envCard, isLoadingData && { minHeight: 200, justifyContent: 'center' }]}>
          {isLoadingData ? (
             <ActivityIndicator color={isLightTheme ? '#0061A4' : '#7EA6FF'} size="large" />
          ) : tilesToRender.length === 0 ? (
             <View style={{ padding: 20, alignItems: 'center' }}>
               <Text style={{ color: isLightTheme ? '#666666' : 'rgba(255,255,255,0.6)', fontSize: 16 }}>No data recorded for this period.</Text>
             </View>
          ) : (
          <View style={styles.envGrid}>
            {(() => {
              const items = tilesToRender;
              const rows: typeof allMetrics[] = [] as any;
              for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
              return rows.map((pair, rowIndex) => (
                <View key={`hist-row-${rowIndex}`} style={styles.envRow}>
                  {pair.map((m) => {
                    const spark = sparklines[m.key] || genSparklinePoints(120, 28, 12);
                    const pts = spark.svgPoints.split(' ');
                    const d = pts.length ? `M ${pts[0]} L ${pts.slice(1).join(' L ')}` : '';
                    return (
                      <TouchableOpacity 
                        key={m.key} 
                        style={[
                          styles.envTile,
                          { backgroundColor: 'transparent' }, // Override default glass background
                          isLightTheme && {
                            borderColor: 'rgba(0, 0, 0, 0.1)', // Slightly darker border for visibility
                          }
                        ]}
                        activeOpacity={0.8}
                        onPress={() => {
                          const routeParam = m.key === 'hr' ? 'heartRate' : (m.key === 'resp' ? 'respiration' : m.key);
                          router.push(`/charts/history-insights?metric=${routeParam}` as any);
                        }}
                      >
                        <View style={styles.envTileInner}>
                          <View style={styles.envTopRow}>
                            <View style={[styles.envIconWrap, { marginRight: 4 }, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)' }]}>
                              <Text style={styles.envIcon}>{m.icon}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.envName, isLightTheme && { color: '#666666' }]} numberOfLines={1} ellipsizeMode="tail">{m.name}</Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {pair.length === 1 ? <View style={[styles.envTile, styles.emptyTile]} /> : null}
                </View>
              ));
            })()}
          </View>
          )}
        </View>
      </ScrollView>

      {/* Filter Bottom Sheet */}
      <Modal visible={isFilterOpen} animationType="slide" transparent onRequestClose={onCloseFilter}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.backdropTouch} onPress={onCloseFilter} />
          <View style={[styles.sheet, isLightTheme && { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)' }]}>
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, isLightTheme && { color: '#111111' }]}>Data Filters</Text>
              <TouchableOpacity onPress={onCloseFilter} style={[styles.closeBtn, isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.08)' }]}>
                <Ionicons name="close" size={20} color={isLightTheme ? '#0061A4' : '#C7B9FF'} />
              </TouchableOpacity>
            </View>

            {/* Time period (pending) */}
            <Text style={[styles.sheetSectionLabel, isLightTheme && { color: '#666666' }]}>Time Period</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 8 }}
              contentContainerStyle={styles.sheetChipsRow}
            >
              {(['24h', '2d', '3d', '7d', '30d'] as const).map((p) => (
                <Pressable 
                  key={p} 
                  onPress={() => setPendingPeriod(p)} 
                  style={[
                    styles.chip, 
                    pendingPeriod === p && styles.chipActive,
                    isLightTheme && { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
                    pendingPeriod === p && isLightTheme && { backgroundColor: 'rgba(0, 97, 164, 0.12)', borderColor: '#0061A4', borderWidth: 1 }
                  ]}
                >
                  <Text style={[styles.chipText, isLightTheme && { color: pendingPeriod === p ? '#0061A4' : '#666666' }]}>
                    {p === '24h' ? 'Last 24 Hours' : p === '2d' ? 'Last 2 Days' : p === '3d' ? 'Last 3 Days' : p === '7d' ? 'Last 7 Days' : 'Last 30 Days'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Metrics multi-select (pending) */}
            <Text style={[styles.sheetSectionLabel, { marginTop: 12 }, isLightTheme && { color: '#666666' }]}>Select Metrics</Text>
            <View style={styles.metricsList}>
              {AVAILABLE_METRICS.map((m) => {
                const checked = pendingSelectedMetrics.includes(m.key);
                return (
                  <Pressable key={m.key} onPress={() => onToggleMetric(m.key)} style={styles.metricRow}>
                    <Ionicons 
                      name={checked ? 'checkbox-outline' : 'square-outline'} 
                      size={20} 
                      color={checked ? (isLightTheme ? '#0061A4' : '#7EA6FF') : (isLightTheme ? '#888888' : 'rgba(255,255,255,0.8)')} 
                    />
                    <Text style={[styles.metricLabelText, isLightTheme && { color: '#111111' }]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sheetButtonsRow}>
              <TouchableOpacity onPress={() => { setPendingSelectedMetrics([]); }} style={[styles.sheetBtn, { backgroundColor: isLightTheme ? '#F0F2F5' : 'rgba(255,255,255,0.08)' }]}>
                <Text style={[styles.sheetBtnText, isLightTheme && { color: '#666666' }]}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onApplyFilter} style={[styles.sheetBtn, { backgroundColor: isLightTheme ? '#0061A4' : '#7EA6FF' }]}>
                <Text style={[styles.sheetBtnText, { color: isLightTheme ? '#FFFFFF' : '#0F112B' }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  headerActions: { flexDirection: 'row' },
  headerIconBtn: { marginLeft: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  headerIconActive: { borderWidth: 1, borderColor: 'rgba(126,166,255,0.6)' },
  activeDot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#7EA6FF' },
  glowWrap: { position: 'absolute', right: 52, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(126,166,255,0.45)', zIndex: -1 },
  scrollContent: { paddingTop: 12, paddingHorizontal: 16 },

  controlsRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  pillText: { color: '#C7D6FF', fontWeight: '700' },

  chipsRow: { marginTop: 12, flexDirection: 'row' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 8 },
  chipText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },

  summaryRow: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' },
  summaryTile: { flex: 1, marginHorizontal: 4, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  summaryTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  summaryValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 4 },

  envCard: { marginTop: 16 },
  envGrid: { width: '100%' },
  envRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  envTile: { flex: 1, minHeight: 60, borderRadius: 14, overflow: 'hidden', marginHorizontal: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  emptyTile: { backgroundColor: 'transparent', borderWidth: 0, opacity: 0 },
  envTileBg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.22 },
  envTileInner: { flex: 1, paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center' },
  envTopRow: { flexDirection: 'row', alignItems: 'center' },
  envIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  envIcon: { fontSize: 16 },
  envName: { color: 'rgba(255,255,255,0.95)', fontSize: 13, fontWeight: '700', marginLeft: 4, flexShrink: 1 },
  envValueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  envValueNum: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  envUnit: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '700', marginLeft: 6, marginBottom: 2 },
  sparklineWrap: { marginTop: 8, alignItems: 'flex-start' },
  statusDot: { width: 10, height: 10, borderRadius: 6, marginLeft: 8 },

  // Bottom sheet styles
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  backdropTouch: { flex: 1 },
  sheet: { backgroundColor: '#0F112B', padding: 16, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  sheetSectionLabel: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginTop: 6 },
  sheetChipsRow: { flexDirection: 'row', marginTop: 8 },
  metricsList: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap' },
  metricRow: { width: (width - 16 * 2 - 12) / 2, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  metricLabelText: { color: '#FFFFFF', fontWeight: '700', marginLeft: 8 },
  sheetButtonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  sheetBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginHorizontal: 6 },
  sheetBtnText: { color: '#FFFFFF', fontWeight: '800' },

  chipActive: { backgroundColor: 'rgba(126,166,255,0.22)', borderWidth: 1, borderColor: 'rgba(126,166,255,0.55)' },
});

