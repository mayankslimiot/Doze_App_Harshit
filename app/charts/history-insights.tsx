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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFont } from '@shopify/react-native-skia';
import { CartesianChart, Bar } from 'victory-native';
import { useDevice } from '@/contexts/DeviceContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getWeeklyHeartRateData, getMonthlyHeartRateData, getWeeklyRespirationData, getMonthlyRespirationData, getWeeklyStressData, getMonthlyStressData } from '@/services/deviceData';

const { width } = Dimensions.get('window');

// Data interfaces
interface WeeklyDataPoint {
  day: string;
  dayIndex: number;
  date: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  isPartial: boolean;
  count: number;
}

interface MonthlyDataPoint {
  day: number;
  dayIndex: number;
  date: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  isPartial: boolean;
  count: number;
}

export default function HistoryInsightsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activeDevice } = useDevice();
  const { auth } = useAuth();
  const { isLightTheme } = useTheme();
  
  // Get metric from params
  const params = useLocalSearchParams();
  const metric = typeof params.metric === 'string' ? params.metric : 'respiration';

  const [selectedPeriod, setSelectedPeriod] = React.useState<'Week' | 'Month'>('Week');
  const [selectedDate, setSelectedDate] = React.useState(new Date());
  
  const [weeklyData, setWeeklyData] = React.useState<WeeklyDataPoint[]>([]);
  const [isLoadingWeekly, setIsLoadingWeekly] = React.useState(false);
  const [weeklyError, setWeeklyError] = React.useState<string | null>(null);
  
  const [monthlyData, setMonthlyData] = React.useState<MonthlyDataPoint[]>([]);
  const [isLoadingMonthly, setIsLoadingMonthly] = React.useState(false);
  const [monthlyError, setMonthlyError] = React.useState<string | null>(null);

  // Font for charts
  const skiaFont = useFont(require('../../assets/fonts/SpaceMono-Regular.ttf'), 9);

  // Chart paddings
  const WEEKLY_CHART_PADDING = React.useMemo(() => ({ left: 40, right: 40, top: 18, bottom: 40 }), []);
  const MONTHLY_CHART_PADDING = React.useMemo(() => ({ left: 40, right: 40, top: 18, bottom: 40 }), []);

  // UI Config based on metric
  const metricConfig = React.useMemo(() => {
    switch(metric) {
      case 'heartRate':
        return { title: 'Heart Rate History', unit: 'BPM', icon: '❤️', yDomain: [40, 150] as [number, number], colors: { primary: '#FF4D4D', gradient: ['#3A1C2A', '#1A1D3E'], bar: 'rgba(255, 77, 77, 0.8)' } };
      case 'stress':
        return { title: 'Stress History', unit: '', icon: '😮‍💨', yDomain: [0, 100] as [number, number], colors: { primary: '#FF9F43', gradient: ['#3A2A1C', '#1A1D3E'], bar: 'rgba(255, 159, 67, 0.8)' } };
      case 'sleep':
        return { title: 'Sleep History', unit: 'h', icon: '😴', yDomain: [0, 12] as [number, number], colors: { primary: '#A78BFA', gradient: ['#2A1C3A', '#1A1D3E'], bar: 'rgba(167, 139, 250, 0.8)' } };
      case 'temperature':
        return { title: 'Temperature History', unit: '°C', icon: '🌡️', yDomain: [15, 40] as [number, number], colors: { primary: '#F97316', gradient: ['#3A2B1C', '#1A1D3E'], bar: 'rgba(249, 115, 22, 0.8)' } };
      case 'humidity':
        return { title: 'Humidity History', unit: '%', icon: '💧', yDomain: [20, 100] as [number, number], colors: { primary: '#38BDF8', gradient: ['#1C2D3A', '#1A1D3E'], bar: 'rgba(56, 189, 248, 0.8)' } };
      case 'iaq':
        return { title: 'IAQ History', unit: '', icon: '🧪', yDomain: [0, 500] as [number, number], colors: { primary: '#A78BFA', gradient: ['#2E1C3A', '#1A1D3E'], bar: 'rgba(167, 139, 250, 0.8)' } };
      case 'tvoc':
        return { title: 'TVOC History', unit: 'ppb', icon: '☁️', yDomain: [0, 1000] as [number, number], colors: { primary: '#818CF8', gradient: ['#2B1C3A', '#1A1D3E'], bar: 'rgba(129, 140, 248, 0.8)' } };
      case 'eco2':
        return { title: 'eCO₂ History', unit: 'ppm', icon: '🫧', yDomain: [400, 2000] as [number, number], colors: { primary: '#34D399', gradient: ['#1C3A2E', '#1A1D3E'], bar: 'rgba(52, 211, 153, 0.8)' } };
      case 'hrv':
        return { title: 'HRV History', unit: 'ms', icon: '💓', yDomain: [0, 200] as [number, number], colors: { primary: '#EC4899', gradient: ['#3A1C2E', '#1A1D3E'], bar: 'rgba(236, 72, 153, 0.8)' } };
      case 'skinTemp':
        return { title: 'Skin Temp History', unit: '°C', icon: '🧍', yDomain: [25, 40] as [number, number], colors: { primary: '#FB923C', gradient: ['#3A2B1C', '#1A1D3E'], bar: 'rgba(251, 146, 60, 0.8)' } };
      case 'envTemp':
        return { title: 'Env Temp History', unit: '°C', icon: '🌡️', yDomain: [10, 45] as [number, number], colors: { primary: '#FBBF24', gradient: ['#3A351C', '#1A1D3E'], bar: 'rgba(251, 191, 36, 0.8)' } };
      case 'sdnn':
        return { title: 'SDNN History', unit: 'ms', icon: '📈', yDomain: [0, 200] as [number, number], colors: { primary: '#60A5FA', gradient: ['#1C2A3A', '#1A1D3E'], bar: 'rgba(96, 165, 250, 0.8)' } };
      case 'rmssd':
        return { title: 'RMSSD History', unit: 'ms', icon: '📊', yDomain: [0, 200] as [number, number], colors: { primary: '#34D399', gradient: ['#1C3A2A', '#1A1D3E'], bar: 'rgba(52, 211, 153, 0.8)' } };
      case 'respiration':
      default:
        return { title: 'Respiration History', unit: 'RPM', icon: '🌬️', yDomain: [10, 30] as [number, number], colors: { primary: '#7EA6FF', gradient: ['#1C2D4A', '#1A1D3E'], bar: '#7EA6FF' } };
    }
  }, [metric]);

  // Date helpers
  const getWeekStartDate = React.useCallback((date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }, []);

  const getMonthStartDate = React.useCallback((date: Date): Date => {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    return monthStart;
  }, []);

  // Fetch Weekly Data
  const fetchWeeklyData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) return;
    
    setIsLoadingWeekly(true);
    setWeeklyError(null);
    const weekStart = getWeekStartDate(selectedDate);

    try {
      let result;
      if (metric === 'heartRate') {
        result = await getWeeklyHeartRateData(activeDevice.deviceId, weekStart);
      } else if (metric === 'stress') {
        result = await getWeeklyStressData(activeDevice.deviceId, weekStart);
      } else {
        result = await getWeeklyRespirationData(activeDevice.deviceId, weekStart);
      }

      if (result.success && result.data) {
        setWeeklyData(result.data);
      } else {
        setWeeklyData([]);
        setWeeklyError(result.message || 'No data available for this week');
      }
    } catch (err: any) {
      setWeeklyError(err.message || 'Failed to load weekly data');
      setWeeklyData([]);
    } finally {
      setIsLoadingWeekly(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate, getWeekStartDate, metric]);

  // Fetch Monthly Data
  const fetchMonthlyData = React.useCallback(async () => {
    if (!activeDevice?.deviceId || !auth.isLoggedIn) return;
    
    setIsLoadingMonthly(true);
    setMonthlyError(null);
    const monthStart = getMonthStartDate(selectedDate);

    try {
      let result;
      if (metric === 'heartRate') {
        result = await getMonthlyHeartRateData(activeDevice.deviceId, monthStart);
      } else if (metric === 'stress') {
        result = await getMonthlyStressData(activeDevice.deviceId, monthStart);
      } else {
        result = await getMonthlyRespirationData(activeDevice.deviceId, monthStart);
      }

      if (result.success && result.data) {
        setMonthlyData(result.data);
      } else {
        setMonthlyData([]);
        setMonthlyError(result.message || 'No data available for this month');
      }
    } catch (err: any) {
      setMonthlyError(err.message || 'Failed to load monthly data');
      setMonthlyData([]);
    } finally {
      setIsLoadingMonthly(false);
    }
  }, [activeDevice?.deviceId, auth.isLoggedIn, selectedDate, getMonthStartDate, metric]);

  // Effect to trigger fetches
  React.useEffect(() => {
    if (selectedPeriod === 'Week') {
      fetchWeeklyData();
    } else if (selectedPeriod === 'Month') {
      fetchMonthlyData();
    }
  }, [selectedPeriod, selectedDate, activeDevice?.deviceId, auth.isLoggedIn, metric]);

  const handlePrevPeriod = () => {
    const newDate = new Date(selectedDate);
    if (selectedPeriod === 'Week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (selectedPeriod === 'Month') {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    setSelectedDate(newDate);
  };

  const handleNextPeriod = () => {
    const newDate = new Date(selectedDate);
    if (selectedPeriod === 'Week') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (selectedPeriod === 'Month') {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    const today = new Date();
    if (newDate > today) return; // Prevent future dates
    setSelectedDate(newDate);
  };

  const isCurrentPeriodSelected = React.useMemo(() => {
    const today = new Date();
    if (selectedPeriod === 'Week') {
      const todayWeekStart = getWeekStartDate(today);
      const selectedWeekStart = getWeekStartDate(selectedDate);
      return todayWeekStart.getTime() === selectedWeekStart.getTime();
    } else if (selectedPeriod === 'Month') {
      return (
        selectedDate.getFullYear() === today.getFullYear() &&
        selectedDate.getMonth() === today.getMonth()
      );
    }
    return false;
  }, [selectedPeriod, selectedDate, getWeekStartDate]);

  // Date range formatter
  const formattedDateRange = React.useMemo(() => {
    if (selectedPeriod === 'Week') {
      const start = getWeekStartDate(selectedDate);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const startMonth = start.toLocaleString('default', { month: 'short' });
      const endMonth = end.toLocaleString('default', { month: 'short' });
      if (startMonth === endMonth) {
        return `${startMonth} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
    } else {
      return selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
  }, [selectedPeriod, selectedDate, getWeekStartDate]);

  // Prepare chart data
  const chartData = React.useMemo(() => {
    if (selectedPeriod === 'Week') {
      return weeklyData.map((d, i) => ({ x: i, label: d.day, y: d.avg ?? 0, hasData: d.avg !== null }));
    } else {
      return monthlyData.map((d, i) => ({ x: i, label: d.day.toString(), y: d.avg ?? 0, hasData: d.avg !== null }));
    }
  }, [selectedPeriod, weeklyData, monthlyData]);

  // Summary stats
  const { summaryAvg, summaryMin, summaryMax } = React.useMemo(() => {
    const data = selectedPeriod === 'Week' ? weeklyData : monthlyData;
    const validData = data.filter(d => d.avg !== null && d.avg > 0);
    
    if (validData.length === 0) return { summaryAvg: '--', summaryMin: '--', summaryMax: '--' };

    let sum = 0, min = Infinity, max = -Infinity;
    validData.forEach(d => {
      if (d.avg) sum += d.avg;
      if (d.min && d.min < min) min = d.min;
      if (d.max && d.max > max) max = d.max;
    });

    return {
      summaryAvg: Math.round(sum / validData.length).toString(),
      summaryMin: min === Infinity ? '--' : Math.round(min).toString(),
      summaryMax: max === -Infinity ? '--' : Math.round(max).toString(),
    };
  }, [selectedPeriod, weeklyData, monthlyData]);

  const yDomain = metricConfig.yDomain;

  return (
    <View style={[styles.container, isLightTheme && { backgroundColor: '#F8F9FA' }]}>
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} backgroundColor={isLightTheme ? '#F8F9FA' : '#02041A'} />
      {isLightTheme ? null : (
        <LinearGradient colors={metricConfig.colors.gradient as any} style={styles.gradientBackground} />
      )}

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={24} color={isLightTheme ? '#333333' : '#FFF'} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isLightTheme && { color: '#111111' }]}>{metricConfig.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Main Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        
        {/* Toggle Week / Month */}
        <View style={[styles.toggleContainer, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, selectedPeriod === 'Week' && [styles.toggleBtnActive, { backgroundColor: metricConfig.colors.primary }]]}
            onPress={() => { setSelectedPeriod('Week'); setSelectedDate(new Date()); }}
          >
            <Text style={[styles.toggleBtnText, isLightTheme && { color: 'rgba(0,0,0,0.5)' }, selectedPeriod === 'Week' && { color: '#FFFFFF', fontWeight: '700' }]}>Week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, selectedPeriod === 'Month' && [styles.toggleBtnActive, { backgroundColor: metricConfig.colors.primary }]]}
            onPress={() => { setSelectedPeriod('Month'); setSelectedDate(new Date()); }}
          >
            <Text style={[styles.toggleBtnText, isLightTheme && { color: 'rgba(0,0,0,0.5)' }, selectedPeriod === 'Month' && { color: '#FFFFFF', fontWeight: '700' }]}>Month</Text>
          </TouchableOpacity>
        </View>

        {/* Top Summary Card */}
        <View style={[
          styles.summaryCard, 
          isLightTheme && { 
            backgroundColor: '#FFFFFF', 
            borderColor: 'rgba(0,0,0,0.06)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 3,
            elevation: 1 
          }
        ]}>
          <View style={styles.summaryTopRow}>
            <View style={styles.iconTitleRow}>
              <Text style={styles.summaryIcon}>{metricConfig.icon}</Text>
              <Text style={[styles.summaryTitle, isLightTheme && { color: '#666666' }]}>Avg {metricConfig.title.split(' ')[0]}</Text>
            </View>
          </View>
          <View style={styles.summaryValueRow}>
            <Text style={[styles.summaryValue, isLightTheme && { color: '#111111' }]}>{summaryAvg}</Text>
            <Text style={[styles.summaryUnit, isLightTheme && { color: '#555555' }]}>{metricConfig.unit}</Text>
          </View>
          <View style={[styles.summaryStatsRow, isLightTheme && { borderTopColor: 'rgba(0,0,0,0.06)' }]}>
            <View style={styles.summaryStatItem}>
              <Text style={[styles.summaryStatLabel, isLightTheme && { color: '#666666' }]}>Min</Text>
              <Text style={[styles.summaryStatValue, isLightTheme && { color: '#111111' }]}>{summaryMin}</Text>
            </View>
            <View style={styles.summaryStatItem}>
              <Text style={[styles.summaryStatLabel, isLightTheme && { color: '#666666' }]}>Max</Text>
              <Text style={[styles.summaryStatValue, isLightTheme && { color: '#111111' }]}>{summaryMax}</Text>
            </View>
          </View>
        </View>

        {/* Chart Section */}
        <View style={[styles.chartSection, isLightTheme && { borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: 'transparent' }]}>
          <View style={styles.dateSelector}>
            <TouchableOpacity onPress={handlePrevPeriod} style={[styles.dateBtn, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }]}>
              <Ionicons name="chevron-back" size={20} color={isLightTheme ? '#0061A4' : '#7EA6FF'} />
            </TouchableOpacity>
            <Text style={[styles.dateText, isLightTheme && { color: '#111111' }]}>{formattedDateRange}</Text>
            <TouchableOpacity onPress={handleNextPeriod} style={[styles.dateBtn, isLightTheme && { backgroundColor: 'rgba(0,0,0,0.04)' }, isCurrentPeriodSelected && styles.dateBtnDisabled]} disabled={isCurrentPeriodSelected}>
              <Ionicons name="chevron-forward" size={20} color={isCurrentPeriodSelected ? (isLightTheme ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)') : (isLightTheme ? '#0061A4' : '#7EA6FF')} />
            </TouchableOpacity>
          </View>

          <View style={styles.chartContainer}>
            {((selectedPeriod === 'Week' && isLoadingWeekly) || (selectedPeriod === 'Month' && isLoadingMonthly)) ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={metricConfig.colors.primary} />
                <Text style={[styles.loadingText, isLightTheme && { color: '#666666' }]}>Loading data...</Text>
              </View>
            ) : chartData.length > 0 && chartData.some(d => d.hasData) ? (
              skiaFont ? (
                <CartesianChart
                  data={chartData}
                  xKey="x"
                  yKeys={['y']}
                  domain={{ x: [-0.5, chartData.length - 0.5], y: yDomain }}
                  padding={selectedPeriod === 'Week' ? WEEKLY_CHART_PADDING : MONTHLY_CHART_PADDING}
                  xAxis={{
                    font: skiaFont,
                    tickCount: selectedPeriod === 'Week' ? 7 : 7,
                    labelColor: isLightTheme ? '#666666' : 'rgba(199,214,255,0.75)',
                    lineColor: isLightTheme ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                    labelOffset: 4,
                    formatXLabel: (label: string | number) => {
                      if (selectedPeriod === 'Week') {
                        const idx = typeof label === 'number' ? Math.round(label) : parseInt(String(label), 10);
                        if (idx < 0 || idx >= chartData.length) return '';
                        return chartData[idx]?.label || '';
                      }
                      // Monthly: use the exact same logic as heart-rate-insights
                      const dayNum = typeof label === 'number' ? Math.round(label) : parseInt(String(label), 10);
                      if (dayNum % 5 === 0 || dayNum === 0) {
                        return String(dayNum + 1);
                      }
                      return '';
                    },
                  }}
                  yAxis={[{
                    font: skiaFont,
                    tickCount: 5,
                    labelColor: isLightTheme ? '#666666' : 'rgba(199,214,255,0.75)',
                    lineColor: isLightTheme ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                    labelOffset: 4,
                    formatYLabel: (v) => `${Math.round(Number(v))}`,
                  }]}
                  transformConfig={{
                    pinch: { enabled: false },
                    pan: { enabled: false },
                  }}
                >
                  {({ points, chartBounds }) => (
                    <Bar
                      points={points.y}
                      chartBounds={chartBounds}
                      color={metricConfig.colors.bar}
                      roundedCorners={{ topLeft: 4, topRight: 4 }}
                      innerPadding={selectedPeriod === 'Week' ? 0.4 : 0.5}
                      barCount={chartData.length}
                    />
                  )}
                </CartesianChart>
              ) : null
            ) : (
              <View style={styles.noDataContainer}>
                <Ionicons name="bar-chart-outline" size={48} color={isLightTheme ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.2)"} />
                <Text style={[styles.noDataText, isLightTheme && { color: '#666666' }]}>No {metricConfig.title} data available for this {selectedPeriod.toLowerCase()}</Text>
              </View>
            )}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  
  toggleContainer: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, marginHorizontal: 16, marginTop: 8, padding: 4 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  toggleBtnActive: {  },
  toggleBtnText: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 14 },
  toggleBtnTextActive: { color: '#FFF', fontWeight: '700' },

  summaryCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, marginHorizontal: 16, marginTop: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  summaryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  iconTitleRow: { flexDirection: 'row', alignItems: 'center' },
  summaryIcon: { fontSize: 18, marginRight: 8 },
  summaryTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  summaryValueRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
  summaryValue: { color: '#FFF', fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  summaryUnit: { color: 'rgba(255,255,255,0.6)', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  summaryStatsRow: { flexDirection: 'row', paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  summaryStatItem: { flex: 1 },
  summaryStatLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '500', marginBottom: 4 },
  summaryStatValue: { color: '#FFF', fontSize: 18, fontWeight: '700' },

  chartSection: { marginTop: 24, backgroundColor: 'rgba(255,255,255,0.02)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 16 },
  dateSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginBottom: 16 },
  dateBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12 },
  dateBtnDisabled: { opacity: 0.5 },
  dateText: { color: '#FFF', fontSize: 15, fontWeight: '600', marginHorizontal: 16 },
  
  chartContainer: { height: 260, width: '100%' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: 'rgba(255,255,255,0.6)', marginTop: 12, fontSize: 14 },
  noDataContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  noDataText: { color: 'rgba(255,255,255,0.5)', marginTop: 12, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
