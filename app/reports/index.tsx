import React from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg from 'react-native-svg';
import { useRouter } from 'expo-router';

import type { DailySummary, DateRange } from '@/types/Reports';
import { lastNDates, fetchAndCacheRange, readDailyCache, computeWeeklySummary, ensureRangeLimit, exportCsv, exportPdf } from '@/services/ReportsService';

// Simple segment control
function Segment({ value, current, onPress }: { value: string; current: string; onPress: (v: string) => void }) {
  const active = value === current;
  return (
    <TouchableOpacity onPress={() => onPress(value)} style={[styles.segment, active && styles.segmentActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{value}</Text>
    </TouchableOpacity>
  );
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [mode, setMode] = React.useState<'Daily' | 'Weekly' | 'Custom'>('Weekly');
  const [selectedDate, setSelectedDate] = React.useState<string>(lastNDates(1)[0]);
  const [days] = React.useState<string[]>(lastNDates(7));
  const [dailyMap, setDailyMap] = React.useState<Record<string, DailySummary>>({});
  const [isOffline, setOffline] = React.useState<boolean>(false);

  React.useEffect(() => {
    // Load cache immediately for the last 7 days, then refresh in background
    (async () => {
      const cached = await readDailyCache(days);
      if (Object.keys(cached).length > 0) setDailyMap(cached);
      try {
        const range: DateRange = { start: days[0], end: days[days.length - 1] };
        const fresh = await fetchAndCacheRange(range);
        setDailyMap((prev) => ({ ...prev, ...fresh }));
        setOffline(false);
      } catch {
        setOffline(true);
      }
    })();
  }, [days.join(',')]);

  const selectedSummary = dailyMap[selectedDate];
  const weekly = React.useMemo(() => computeWeeklySummary(
    days.map(d => dailyMap[d]).filter(Boolean) as DailySummary[],
    days[0], days[days.length - 1]
  ), [dailyMap, days]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#02041A" />
      <LinearGradient colors={['#1D244D', '#02041A', '#1A1D3E']} style={styles.gradientBackground} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}> 
        <Text style={styles.headerTitle}>Reports</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn}><Text style={styles.headerIconText}>Close</Text></TouchableOpacity>
        </View>
      </View>

      {/* Segments */}
      <View style={styles.segmentsRow}>
        {(['Daily','Weekly','Custom'] as const).map(v => (
          <Segment key={v} value={v} current={mode} onPress={(val) => setMode(val as any)} />
        ))}
      </View>

      {isOffline && (
        <View style={styles.offlineBanner}><Text style={styles.offlineText}>Offline — showing cached data</Text></View>
      )}

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }} showsVerticalScrollIndicator={false}>
        {mode === 'Daily' && (
          <View>
            {/* Last 7 days strip */}
            <View style={styles.daysRow}>
              {days.map((d) => {
                const has = !!dailyMap[d];
                const active = selectedDate === d;
                return (
                  <TouchableOpacity key={d} onPress={() => setSelectedDate(d)} style={[styles.dayChip, active && styles.dayChipActive, !has && styles.dayChipEmpty]}>
                    <Text style={styles.dayChipText}>{d.slice(5)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* KPIs */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}><Text style={styles.kpiTitle}>Total</Text><Text style={styles.kpiValue}>{selectedSummary ? Math.round(selectedSummary.totalMinutes) + 'm' : '—'}</Text></View>
              <View style={styles.kpiCard}><Text style={styles.kpiTitle}>Deep</Text><Text style={styles.kpiValue}>{selectedSummary?.deepMinutes ? Math.round(selectedSummary.deepMinutes) + 'm' : '—'}</Text></View>
              <View style={styles.kpiCard}><Text style={styles.kpiTitle}>REM</Text><Text style={styles.kpiValue}>{selectedSummary?.remMinutes ? Math.round(selectedSummary.remMinutes) + 'm' : '—'}</Text></View>
            </View>

            {/* Simple hourly chart using SVG polyline approximation */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>24h distribution</Text>
              {/* Placeholder sparkline (reuse approach similar to History) */}
              <Svg height={60} width={'100%'}>
                {/* intentionally simple; real data added when API is wired */}
              </Svg>
            </View>

            {/* Table */}
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}><Text style={styles.th}>Hour</Text><Text style={styles.th}>Minutes</Text></View>
              {(selectedSummary?.hourlyBuckets || []).sort((a,b)=>a.hour-b.hour).map(b => (
                <View key={`h-${b.hour}`} style={styles.tr}><Text style={styles.td}>{String(b.hour).padStart(2,'0')}:00</Text><Text style={styles.td}>{Math.round(b.minutes)}</Text></View>
              ))}
              {(!selectedSummary || !selectedSummary.hourlyBuckets || selectedSummary.hourlyBuckets.length === 0) && (
                <View style={styles.empty}><Text style={styles.emptyText}>No data for this day</Text></View>
              )}
            </View>
          </View>
        )}

        {mode === 'Weekly' && (
          <View>
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}><Text style={styles.kpiTitle}>Total (7d)</Text><Text style={styles.kpiValue}>{Math.round(weekly.totalMinutes)}m</Text></View>
              <View style={styles.kpiCard}><Text style={styles.kpiTitle}>Avg HR</Text><Text style={styles.kpiValue}>{weekly.avgHR ? Math.round(weekly.avgHR) : '—'}</Text></View>
            </View>
            <View style={styles.tableCard}>
              <View style={styles.tableHeader}><Text style={styles.th}>Date</Text><Text style={styles.th}>Total (m)</Text></View>
              {weekly.days.map(d => (
                <View key={d.date} style={styles.tr}><Text style={styles.td}>{d.date}</Text><Text style={styles.td}>{Math.round(d.totalMinutes)}</Text></View>
              ))}
            </View>
          </View>
        )}

        {mode === 'Custom' && (
          <View>
            <Text style={styles.helper}>Pick a date range from the Export screen to generate reports (limit 15 days).</Text>
            <TouchableOpacity onPress={() => router.push('/reports/export')} style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Open Export</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#02041A' },
  gradientBackground: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  header: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  headerActions: { flexDirection: 'row' },
  headerIconBtn: { marginLeft: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.10)' },
  headerIconText: { color: '#C7B9FF', fontWeight: '800' },
  segmentsRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 12 },
  segment: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginRight: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  segmentActive: { backgroundColor: 'rgba(126,166,255,0.22)', borderWidth: 1, borderColor: 'rgba(126,166,255,0.55)' },
  segmentText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  segmentTextActive: { color: '#FFFFFF' },
  offlineBanner: { marginTop: 10, marginHorizontal: 16, padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  offlineText: { color: '#C7D6FF', fontWeight: '700' },
  daysRow: { flexDirection: 'row', marginTop: 12 },
  dayChip: { marginRight: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  dayChipActive: { backgroundColor: 'rgba(126,166,255,0.22)', borderWidth: 1, borderColor: 'rgba(126,166,255,0.55)' },
  dayChipEmpty: { opacity: 0.6 },
  dayChipText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  kpiRow: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between' },
  kpiCard: { flex: 1, marginHorizontal: 4, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  kpiTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  kpiValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 4 },
  chartCard: { marginTop: 16, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  chartTitle: { color: '#FFFFFF', fontWeight: '700', marginBottom: 8 },
  tableCard: { marginTop: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  th: { color: '#FFFFFF', fontWeight: '800' },
  tr: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  td: { color: '#FFFFFF', fontWeight: '700' },
  empty: { padding: 16, alignItems: 'center' },
  emptyText: { color: 'rgba(255,255,255,0.7)' },
  helper: { color: 'rgba(255,255,255,0.8)', marginTop: 12 },
  primaryBtn: { marginTop: 12, alignItems: 'center', backgroundColor: '#7EA6FF', paddingVertical: 12, borderRadius: 12 },
  primaryBtnText: { color: '#0F112B', fontWeight: '900' },
});


