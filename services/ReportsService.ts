import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { Platform } from 'react-native';

const DOWNLOADS_DIRECTORY_KEY = 'exports_downloads_directory_uri';

import { apiUrl } from './api';

export type DateRange = { start: string; end: string }; // ISO yyyy-mm-dd

export type DailySummary = {
  date: string; // yyyy-mm-dd (local)
  totalMinutes: number;
  deepMinutes?: number;
  remMinutes?: number;
  sessionsCount?: number;
  avgHR?: number;
  hourlyBuckets?: { hour: number; minutes: number }[];
};

export type WeeklySummary = {
  weekStart: string; // yyyy-mm-dd
  weekEnd: string; // yyyy-mm-dd
  days: DailySummary[]; // length up to 7
  totalMinutes: number;
  avgHR?: number;
};

const CACHE_PREFIX = 'reports:daily:'; // per-user key prefix

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function lastNDates(n: number, fromDate = new Date()): string[] {
  const arr: string[] = [];
  const base = new Date(fromDate);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    arr.push(toISODate(d));
  }
  return arr.reverse();
}

export function ensureRangeLimit(range: DateRange, maxDays = 15) {
  const start = new Date(range.start);
  const end = new Date(range.end);
  const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (diff > maxDays) throw new Error(`Range exceeds ${maxDays} days`);
}

async function getUserId(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem('user_id'));
  } catch {
    return null;
  }
}

async function getAuthToken(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem('auth_token'));
  } catch {
    return null;
  }
}

export async function fetchHistory(range: DateRange): Promise<any[]> {
  const token = await getAuthToken();
  try {
    const url = apiUrl(`/api/history?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`);
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json().catch(() => []);
    return Array.isArray(json) ? json : [];
  } catch (e) {
    console.warn('[ReportsService] fetchHistory failed, will rely on cache:', e);
    return [];
  }
}

// Normalize raw items into DailySummary per day (example shape; adapt when real API available)
export function normalizeToDaily(raw: any[]): Record<string, DailySummary> {
  const byDate: Record<string, DailySummary> = {};
  for (const item of raw) {
    // Attempt to read timestamp & metrics from a few possible shapes
    const t = Number(item?.timestamp ?? item?.time ?? Date.now());
    const d = new Date(isNaN(t) ? Date.now() : (t < 1e12 ? t * 1000 : t));
    const key = toISODate(d);

    const duration = Number(item?.durationMinutes ?? item?.duration ?? 0);
    const deep = Number(item?.deepMinutes ?? item?.deep ?? 0);
    const rem = Number(item?.remMinutes ?? item?.rem ?? 0);
    const hr = Number(item?.avgHR ?? item?.hr ?? NaN);

    if (!byDate[key]) byDate[key] = { date: key, totalMinutes: 0, deepMinutes: 0, remMinutes: 0, sessionsCount: 0, avgHR: 0, hourlyBuckets: [] };
    const s = byDate[key];
    s.totalMinutes += isNaN(duration) ? 0 : duration;
    s.deepMinutes = (s.deepMinutes ?? 0) + (isNaN(deep) ? 0 : deep);
    s.remMinutes = (s.remMinutes ?? 0) + (isNaN(rem) ? 0 : rem);
    s.sessionsCount = (s.sessionsCount ?? 0) + 1;
    if (!isNaN(hr)) {
      // simple running average
      const count = (s as any)._hrCount || 0;
      s.avgHR = ((s.avgHR || 0) * count + hr) / (count + 1);
      (s as any)._hrCount = count + 1;
    }
    // hourly bucket (best-effort)
    const hour = d.getHours();
    const bucket = s.hourlyBuckets?.find(b => b.hour === hour);
    if (bucket) bucket.minutes += isNaN(duration) ? 0 : duration;
    else s.hourlyBuckets?.push({ hour, minutes: isNaN(duration) ? 0 : duration });
  }

  // cleanup helper counters
  Object.values(byDate).forEach((v: any) => { if (typeof v._hrCount !== 'undefined') delete v._hrCount; });
  return byDate;
}

export async function upsertDailyCache(map: Record<string, DailySummary>): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const key = `${CACHE_PREFIX}${userId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const prev = raw ? JSON.parse(raw) as Record<string, DailySummary> : {};
    const next = { ...prev, ...map } as Record<string, DailySummary>;
    await AsyncStorage.setItem(key, JSON.stringify(next));
  } catch (e) {
    console.warn('[ReportsService] upsertDailyCache failed', e);
  }
}

export async function readDailyCache(dates: string[]): Promise<Record<string, DailySummary>> {
  const userId = await getUserId();
  if (!userId) return {};
  const key = `${CACHE_PREFIX}${userId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    const all = raw ? JSON.parse(raw) as Record<string, DailySummary> : {};
    const picked: Record<string, DailySummary> = {};
    dates.forEach(d => { if (all[d]) picked[d] = all[d]; });
    return picked;
  } catch {
    return {};
  }
}

export function computeWeeklySummary(dailies: DailySummary[], weekStart: string, weekEnd: string): WeeklySummary {
  const totalMinutes = dailies.reduce((acc, d) => acc += d.totalMinutes, 0);
  const hrVals = dailies.map(d => d.avgHR).filter(v => typeof v === 'number' && !isNaN(Number(v))) as number[];
  const avgHR = hrVals.length ? hrVals.reduce((a, b) => a + b, 0) / hrVals.length : undefined;
  return { weekStart, weekEnd, days: dailies, totalMinutes, avgHR };
}

export async function fetchAndCacheRange(range: DateRange): Promise<Record<string, DailySummary>> {
  const raw = await fetchHistory(range);
  const normalized = normalizeToDaily(raw);
  await upsertDailyCache(normalized);
  return normalized;
}

export async function getLast7Days(): Promise<Record<string, DailySummary>> {
  const days = lastNDates(7);
  const range: DateRange = { start: days[0], end: days[days.length - 1] };
  const fromCache = await readDailyCache(days);
  // Try network refresh in background; ignore errors
  fetchAndCacheRange(range).catch(() => {});
  return fromCache;
}

export function buildCsv(rows: DailySummary[]): string {
  const headers = ['Date', 'TotalMinutes', 'DeepMinutes', 'RemMinutes', 'Sessions', 'AvgHR'];
  const lines = [headers.join(',')];
  rows.forEach(r => {
    lines.push([
      r.date,
      Math.round(r.totalMinutes),
      Math.round(r.deepMinutes || 0),
      Math.round(r.remMinutes || 0),
      r.sessionsCount ?? 0,
      r.avgHR ? Math.round(r.avgHR) : ''
    ].join(','));
  });
  return lines.join('\n');
}

// Convert timestamp to IST (Indian Standard Time) format
function formatIST(timestamp: number | string | Date): string {
  let date: Date;
  if (typeof timestamp === 'number') {
    date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  } else if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }
  
  // IST is UTC+5:30, so add 5.5 hours to UTC time
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const utcTime = date.getTime();
  const istTime = utcTime + istOffset;
  const istDate = new Date(istTime);
  
  // Format as: YYYY-MM-DD HH:MM:SS
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Format date only (YYYY-MM-DD) in IST
function formatISTDate(timestamp: number | string | Date): string {
  let date: Date;
  if (typeof timestamp === 'number') {
    date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  } else if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }
  
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcTime = date.getTime();
  const istTime = utcTime + istOffset;
  const istDate = new Date(istTime);
  
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

// Format time only (HH:MM:SS) in IST
function formatISTTime(timestamp: number | string | Date): string {
  let date: Date;
  if (typeof timestamp === 'number') {
    date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
  } else if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    date = timestamp;
  }
  
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcTime = date.getTime();
  const istTime = utcTime + istOffset;
  const istDate = new Date(istTime);
  
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');
  
  return `${hours}:${minutes}:${seconds}`;
}

export function buildRawDataCsv(rawData: any[]): string {
  if (rawData.length === 0) return '';
  
  // Define all possible columns - time column renamed to show IST
  const allColumns = [
    'deviceId',
    'time (IST)',
    'timestamp',
    'heartRate',
    'respiration',
    'temperature',
    'humidity',
    'motionStart',
    'motionEndReason',
    'absenceStart',
    'absenceEnd',
    'snoringStart',
    'snoringStop',
    'snoringFrequency',
    'respirationStop',
    'respirationStart',
    'pm10',
    'co2',
    'voc',
    'etoh',
    'voltage',
    'level',
    'status',
    'stressIndex',
    'sleepStage',
    'sleepQuality',
    'meanHR',
    'HRrest',
    'HRmax',
    'temperatureSkin',
    'temperatureEnv',
    'temperatureCore',
    'steps',
    'calories',
    'distance',
    'bloodPressureSys',
    'bloodPressureDia',
    'sdnn',
    'rmssd',
    'pnn50',
    'lf',
    'hf',
    'lfHfRatio',
    'motion',
    'presence',
    'activity',
    'battery'
  ];
  
  // Build CSV header
  const headers = allColumns.join(',');
  const lines = [headers];
  
  // Build CSV rows
  rawData.forEach(item => {
    const row = allColumns.map(col => {
      if (col === 'time (IST)') {
        // Convert time to IST format
        const timestamp = item.timestamp || (item.time ? new Date(item.time).getTime() : Date.now());
        return formatIST(timestamp);
      }
      
      const value = item[col];
      if (value === null || value === undefined) return '';
      // Escape commas and quotes in CSV
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    lines.push(row.join(','));
  });
  
  return lines.join('\n');
}

export async function exportCsv(range: DateRange, rows: DailySummary[]): Promise<string> {
  const csv = buildCsv(rows);
  const name = range.start === range.end ? `report_${range.start}.csv` : `report_${range.start}_to_${range.end}.csv`;
  const path = FileSystem.documentDirectory! + name;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
  return path;
}

export async function exportRawDataCsv(range: DateRange, rawData: any[]): Promise<string> {
  const csv = buildRawDataCsv(rawData);
  const name = range.start === range.end 
    ? `export_${range.start}_${Date.now()}.csv` 
    : `export_${range.start}_to_${range.end}_${Date.now()}.csv`;
  const path = FileSystem.documentDirectory! + name;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path);
  return path;
}

export async function exportPdf(range: DateRange, rows: DailySummary[]): Promise<string> {
  const title = range.start === range.end ? `Report for ${range.start}` : `Report: ${range.start} → ${range.end}`;
  const tableRows = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${Math.round(r.totalMinutes)}</td>
      <td>${Math.round(r.deepMinutes || 0)}</td>
      <td>${Math.round(r.remMinutes || 0)}</td>
      <td>${r.sessionsCount ?? 0}</td>
      <td>${r.avgHR ? Math.round(r.avgHR) : ''}</td>
    </tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8" /><style>
    body { font-family: -apple-system, Roboto, Arial, sans-serif; padding: 16px; }
    h1 { font-size: 18px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
    th { background: #f4f4f4; text-align: left; }
  </style></head><body>
    <h1>${title}</h1>
    <table>
      <thead><tr><th>Date</th><th>Total Minutes</th><th>Deep</th><th>REM</th><th>Sessions</th><th>Avg HR</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
  return uri;
}

// Merge export data from different sources (history and stress)
export function mergeExportData(
  historyData: any[],
  stressData: any[],
  deviceId: string,
  selectedDataFields: string[]
): any[] {
  // Create a map to merge data by timestamp
  const dataMap = new Map<number, any>();
  const isAllSelected = selectedDataFields.includes('ALL');

  // Process history data (heart rate, respiration, temperature, humidity, CO2, VOC, ETOH)
  historyData.forEach((item: any) => {
    const timestamp = item.timestamp 
      ? (typeof item.timestamp === 'string' ? new Date(item.timestamp).getTime() : item.timestamp)
      : (item.time ? new Date(item.time).getTime() : Date.now());
    
    // Round timestamp to nearest second for matching
    const roundedTimestamp = Math.floor(timestamp / 1000) * 1000;
    
    if (!dataMap.has(roundedTimestamp)) {
      dataMap.set(roundedTimestamp, {
        timestamp: roundedTimestamp,
        deviceId: deviceId,
        serialNumber: deviceId, // Using deviceId as SerialNumber
      });
    }
    
    const entry = dataMap.get(roundedTimestamp)!;
    
    // Extract heart rate
    if (isAllSelected || selectedDataFields.includes('heartRate')) {
      const hr = item.heartRate || item.hr || item.bpm || null;
      if (hr != null) {
        entry.heartRate = Number(hr);
      }
    }
    
    // Extract respiration
    if (isAllSelected || selectedDataFields.includes('respiration')) {
      const resp = item.respiration || item.resp || null;
      if (resp != null) {
        entry.respiration = Number(resp);
      }
    }
    
    // Extract temperature
    if (isAllSelected || selectedDataFields.includes('temperature')) {
      const temp = item.temperature || item.temp || null;
      if (temp != null) {
        entry.temperature = Number(temp);
      }
    }
    
    // Extract humidity
    if (isAllSelected || selectedDataFields.includes('humidity')) {
      const hum = item.humidity || null;
      if (hum != null) {
        entry.humidity = Number(hum);
      }
    }
    
    // Extract CO2 (can be co2 or eco2)
    if (isAllSelected || selectedDataFields.includes('co2')) {
      const co2 = item.co2 || item.eco2 || null;
      if (co2 != null) {
        entry.co2 = Number(co2);
      }
    }
    
    // Extract VOC (can be voc or tvoc)
    if (isAllSelected || selectedDataFields.includes('voc')) {
      const voc = item.voc || item.tvoc || null;
      if (voc != null) {
        entry.voc = Number(voc);
      }
    }
    
    // Extract ETOH
    if (isAllSelected || selectedDataFields.includes('etoh')) {
      const etoh = item.etoh || null;
      if (etoh != null) {
        entry.etoh = Number(etoh);
      }
    }
  });

  // Process stress data
  stressData.forEach((item: any) => {
    const timestamp = item.timestamp 
      ? (typeof item.timestamp === 'string' ? new Date(item.timestamp).getTime() : item.timestamp)
      : Date.now();
    
    const roundedTimestamp = Math.floor(timestamp / 1000) * 1000;
    
    if (!dataMap.has(roundedTimestamp)) {
      dataMap.set(roundedTimestamp, {
        timestamp: roundedTimestamp,
        deviceId: deviceId,
        serialNumber: deviceId,
      });
    }
    
    const entry = dataMap.get(roundedTimestamp)!;
    
    // Extract stress level
    if (isAllSelected || selectedDataFields.includes('stressLevel')) {
      const stress = item.stress_level || item.stressLevel || null;
      if (stress != null) {
        entry.stressLevel = Number(stress);
      }
    }
  });

  // Convert map to array and sort by timestamp
  const mergedArray = Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  
  return mergedArray;
}

// Build CSV with selected data columns
export function buildSelectedDataCsv(
  data: any[],
  selectedDataFields: string[],
  deviceId: string
): string {
  if (data.length === 0) return '';

  const isAllSelected = selectedDataFields.includes('ALL');
  
  // Field mapping: key -> CSV header name
  const fieldMapping: Record<string, string> = {
    heartRate: 'Heart Rate',
    respiration: 'Respiration',
    stressLevel: 'Stress Level',
    temperature: 'Temperature',
    humidity: 'Humidity',
    co2: 'CO2',
    voc: 'VOC',
    etoh: 'ETOH',
  };

  // Determine which columns to include
  const fieldsToInclude = isAllSelected 
    ? Object.keys(fieldMapping)
    : selectedDataFields.filter(f => f !== 'ALL');

  // Build header row
  const headers = ['S.No', 'DeviceID', 'Date', 'Time'];
  fieldsToInclude.forEach(field => {
    if (fieldMapping[field]) {
      headers.push(fieldMapping[field]);
    }
  });

  const lines = [headers.join(',')];

  // Build data rows with S.No (1, 2, 3...)
  data.forEach((item, index) => {
    const timestamp = item.timestamp || Date.now();
    const date = formatISTDate(timestamp);
    const time = formatISTTime(timestamp);
    
    const row = [
      String(index + 1), // S.No starting from 1
      item.deviceId || deviceId,
      date,
      time,
    ];

    // Add selected fields in order - show 0 if no data
    fieldsToInclude.forEach(field => {
      let value: any = null;
      switch (field) {
        case 'heartRate':
          value = item.heartRate;
          break;
        case 'respiration':
          value = item.respiration;
          break;
        case 'stressLevel':
          value = item.stressLevel;
          break;
        case 'temperature':
          value = item.temperature;
          break;
        case 'humidity':
          value = item.humidity;
          break;
        case 'co2':
          value = item.co2;
          break;
        case 'voc':
          value = item.voc;
          break;
        case 'etoh':
          value = item.etoh;
          break;
      }
      // Show 0 if value is null/undefined/empty, otherwise show the actual value
      row.push(value != null && value !== '' ? String(value) : '0');
    });

    // Escape commas and quotes in CSV
    const escapedRow = row.map(cell => {
      if (cell === null || cell === undefined) return '';
      const stringValue = String(cell);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });

    lines.push(escapedRow.join(','));
  });

  return lines.join('\n');
}

// Export selected data as CSV
export async function exportSelectedDataCsv(
  range: DateRange,
  data: any[],
  selectedDataFields: string[],
  deviceId: string
): Promise<string> {
  const csv = buildSelectedDataCsv(data, selectedDataFields, deviceId);
  const name = range.start === range.end 
    ? `export_${range.start}_${Date.now()}.csv` 
    : `export_${range.start}_to_${range.end}_${Date.now()}.csv`;
  
  let path: string;
  
  if (Platform.OS === 'android') {
    // Try to use saved Downloads directory URI first
    const savedDirectoryUri = await AsyncStorage.getItem(DOWNLOADS_DIRECTORY_KEY);
    
    if (savedDirectoryUri) {
      try {
        // Use saved directory (Downloads) - no dialog
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          savedDirectoryUri,
          name,
          'text/csv'
        );
        await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        path = fileUri;
      } catch (error) {
        // If saved directory doesn't work, request new one
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          // Save directory URI for future use
          await AsyncStorage.setItem(DOWNLOADS_DIRECTORY_KEY, permissions.directoryUri);
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            name,
            'text/csv'
          );
          await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
          path = fileUri;
        } else {
          // Fallback to document directory
          path = FileSystem.documentDirectory! + name;
          await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        }
      }
    } else {
      // First time - request Downloads folder (one-time dialog)
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        // Save directory URI for future use
        await AsyncStorage.setItem(DOWNLOADS_DIRECTORY_KEY, permissions.directoryUri);
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          name,
          'text/csv'
        );
        await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        path = fileUri;
      } else {
        // Fallback to document directory
        path = FileSystem.documentDirectory! + name;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      }
    }
  } else {
    // iOS - save to document directory (accessible via Files app)
    path = FileSystem.documentDirectory! + name;
    await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  }
  
  return path;
}


