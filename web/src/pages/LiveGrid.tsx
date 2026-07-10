import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import LiveMonitorCard from '@/components/dashboard/LiveMonitorCard';
import type { LiveMonitorData } from '@/components/dashboard/LiveMonitorCard';
import type { DataPoint } from '@/components/dashboard/VitalsGraph';
import { getDevices, getLatestHealthDataPoint, getHealthDataRange, getUserProfile } from '@/services/deviceService';
import type { HealthDataPoint } from '@/services/deviceService';
import {
  connectWebSocket,
  subscribeToDevice,
  addHealthDataHandler,
  removeHealthDataHandler,
  disconnectWebSocket,
} from '@/services/websocketService';
import type { HealthDataUpdate } from '@/services/websocketService';

/** Max rolling buffer size per device (~10 min at 1 pt/4 sec) */
const MAX_HISTORY = 150;

export default function LiveGrid() {
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [liveData, setLiveData] = useState<
    Record<string, { hr: number | null; resp: number | null; hrHistory: DataPoint[]; respHistory: DataPoint[]; lastDataTs: number | null }>
  >({});
  const handlerRef = useRef<((data: HealthDataUpdate) => void) | null>(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: profile } = useQuery({
    queryKey: ['user_profile'],
    queryFn: getUserProfile,
    staleTime: 60000 * 5,
  });

  const backLink = profile?.role === 'superadmin' ? '/admin' : '/dashboard';

  // Fetch devices using React Query for global caching
  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['dashboard_devices'],
    queryFn: getDevices,
    staleTime: 30000, // 30s cache
  });

  // Seed historical health data once devices are loaded
  useEffect(() => {
    if (devicesLoading) return;
    
    if (devices.length === 0) {
      setLoading(false);
      return;
    }
    
    // Only fetch history for devices we don't already have in liveData
    const unseededDevices = devices.filter((d) => !liveData[d.id]);
    
    if (unseededDevices.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function seedHistory() {
      const initial: typeof liveData = { ...liveData };
      await Promise.all(
        unseededDevices.map(async (d) => {
          try {
            // 1. Find the latest data point to anchor the window
            const latestPoint = await getLatestHealthDataPoint(d.id);
            if (!latestPoint) {
              initial[d.id] = { hr: null, resp: null, hrHistory: [], respHistory: [], lastDataTs: null };
              return;
            }

            // 2. Fetch a 10-minute window of data ending at the latest point
            const endMs = latestPoint.timestamp + 1000; // include the point itself
            const startMs = endMs - 10 * 60 * 1000;
            const history = await getHealthDataRange(
              d.id,
              new Date(startMs).toISOString(),
              new Date(endMs).toISOString(),
            );

            const hrHistory: DataPoint[] = [];
            const respHistory: DataPoint[] = [];
            let lastHr: number | null = null;
            let lastResp: number | null = null;

            // Sort ascending (backend returns newest first)
            const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
            sorted.forEach((pt: HealthDataPoint) => {
              if (pt.heartRate != null && pt.heartRate > 0) {
                hrHistory.push({ x: pt.timestamp, y: pt.heartRate });
                lastHr = pt.heartRate;
              }
              if (pt.respiration != null && pt.respiration > 0) {
                respHistory.push({ x: pt.timestamp, y: pt.respiration });
                lastResp = pt.respiration;
              }
            });

            initial[d.id] = {
              hr: lastHr,
              resp: lastResp,
              hrHistory: hrHistory.slice(-MAX_HISTORY),
              respHistory: respHistory.slice(-MAX_HISTORY),
              lastDataTs: latestPoint.timestamp,
            };
          } catch {
            initial[d.id] = { hr: null, resp: null, hrHistory: [], respHistory: [], lastDataTs: null };
          }
        }),
      );

      if (!cancelled) {
        setLiveData(initial);
        setLoading(false);
      }
    }

    seedHistory();
    return () => {
      cancelled = true;
    };
  }, [devices, devicesLoading, liveData]);

  // WebSocket: connect + subscribe after devices are loaded
  const handleHealthData = useCallback((data: HealthDataUpdate) => {
    const id = data.deviceId;
    if (!id) return;

    setLiveData((prev) => {
      const existing = prev[id] || { hr: null, resp: null, hrHistory: [], respHistory: [], lastDataTs: null };
      const ts = data.timestampSeconds
        ? (data.timestampSeconds as number) * 1000
        : data.timestamp
        ? new Date(data.timestamp as string).getTime()
        : Date.now();
      const newHrHistory = [...existing.hrHistory];
      const newRespHistory = [...existing.respHistory];

      if (data.heartRate != null && data.heartRate > 0) {
        newHrHistory.push({ x: ts, y: data.heartRate });
        if (newHrHistory.length > MAX_HISTORY) newHrHistory.shift();
      }
      if (data.respiration != null && data.respiration > 0) {
        newRespHistory.push({ x: ts, y: data.respiration });
        if (newRespHistory.length > MAX_HISTORY) newRespHistory.shift();
      }

      return {
        ...prev,
        [id]: {
          hr: data.heartRate ?? existing.hr,
          resp: data.respiration ?? existing.resp,
          hrHistory: newHrHistory,
          respHistory: newRespHistory,
          lastDataTs: ts,
        },
      };
    });
  }, []);

  useEffect(() => {
    if (devices.length === 0) return;

    connectWebSocket();
    devices.forEach((d) => subscribeToDevice(d.id));

    handlerRef.current = handleHealthData;
    addHealthDataHandler(handleHealthData);

    return () => {
      if (handlerRef.current) removeHealthDataHandler(handlerRef.current);
      disconnectWebSocket();
    };
  }, [devices, handleHealthData]);

  // Build monitor data from devices + live data
  const monitorData: LiveMonitorData[] = devices.map((d) => {
    const live = liveData[d.id] || { hr: null, resp: null, hrHistory: [], respHistory: [], lastDataTs: null };
    const hr = live.hr;
    const resp = live.resp;

    let status: 'normal' | 'warning' | 'alert' = 'normal';
    let statusText = 'Normal Sinus Rhythm';

    if (hr != null) {
      if (hr < 50) {
        status = 'alert';
        statusText = 'BRADYCARDIA ALERT';
      } else if (hr > 100) {
        status = 'warning';
        statusText = 'TACHYCARDIA WARNING';
      }
    }

    if (d.status === 'Offline') {
      status = 'alert';
      statusText = 'DEVICE OFFLINE';
    }

    // Compute the cycle date string for the last data point
    let lastCycleLabel = '';
    if (live.lastDataTs) {
      const dt = new Date(live.lastDataTs);
      const startD = new Date(dt);
      startD.setHours(0, 0, 0, 0);
      const endD = new Date(startD);
      if (dt.getHours() >= 12) {
        endD.setDate(endD.getDate() + 1);
      } else {
        startD.setDate(startD.getDate() - 1);
      }
      const startDay = startD.getDate();
      const endDay = endD.getDate();
      const month = endD.toLocaleDateString('en-US', { month: 'short' });
      const year = endD.getFullYear();
      lastCycleLabel = `${startDay}-${endDay} ${month} ${year}`;
    }

    return {
      id: d.id,
      deviceId: d.id,
      bed: (d as any).location || (d as any).bed || 'Unassigned',
      patientName: (d as any).bed || (d as any).serial || d.name || d.id,
      heartRate: hr,
      respiration: resp,
      status,
      statusText,
      hrHistory: live.hrHistory,
      respHistory: live.respHistory,
      lastCycleLabel,
    };
  });

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center space-x-6">
          <Link
            to={backLink}
            className="flex items-center px-4 py-2 border border-gray-200 text-gray-700 rounded-md text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>

          <div>
            <h1 className="text-2xl font-bold text-[#0097b2]">Live Monitoring</h1>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-sm font-mono text-gray-500 font-bold tracking-wider">
            {time.toLocaleTimeString('en-US', { hour12: false })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8 max-w-[1600px] mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="text-sm font-medium">Loading devices…</p>
          </div>
        ) : monitorData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-400">
            <WifiOff className="w-10 h-10 mb-4" />
            <p className="text-sm font-bold">No devices found</p>
            <p className="text-xs mt-1">Ensure your organization has provisioned devices.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {monitorData.map((d) => (
              <LiveMonitorCard key={d.id} data={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
